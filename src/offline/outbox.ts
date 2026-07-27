import { z } from "zod";
import { transportSafeFieldVersion } from "@/domain/field-version";
import { syncIntentFingerprint } from "@/domain/sync-decoder";
import {
  canonicalJson,
  persistedSyncMutationEnvelopeSchema,
  syncMutationSchema,
  type SyncMutation,
} from "@/domain/sync";
import {
  planMutationBatch,
  toIntentMutation,
  type SequencedSyncMutation,
} from "./queue-planner";
import {
  accountDatabaseName,
  isMarkedLoggedOut,
  openDatabase,
  requestResult,
  transactionDone,
  withAccountLock,
  withIntentLock,
} from "./database-core";

const persistedSyncMutationSchema = persistedSyncMutationEnvelopeSchema
  .extend({
    localSequence: z.int().positive().optional(),
    deliveryUpdatedAt: z.iso.datetime().optional(),
    deliveryOrderAssigned: z.boolean().optional(),
  })
  .transform((mutation) => {
    const baseVersion = transportSafeFieldVersion(mutation.baseVersion);
    return baseVersion === undefined ? mutation : { ...mutation, baseVersion };
  });
const persistedSyncMutationsSchema = z.array(persistedSyncMutationSchema);

export async function enqueueMutations(
  userId: string,
  mutations: SyncMutation[],
): Promise<void> {
  if (mutations.length === 0) return;
  return withIntentLock(userId, () =>
    withAccountLock(userId, async () => {
      if (await isMarkedLoggedOut(userId))
        throw new Error("This account was logged out in another tab.");
      const db = await openDatabase(accountDatabaseName(userId), [
        "plans",
        "outbox",
      ]);
      try {
        const transaction = db.transaction("outbox", "readwrite");
        try {
          const store = transaction.objectStore("outbox");
          const existing = await sequencedMutations(store);
          addPreparedMutations(store, prepareMutations(existing, mutations));
          await transactionDone(transaction);
        } catch (error) {
          transaction.abort();
          throw error;
        }
      } finally {
        db.close();
      }
    }),
  );
}

function compareLegacyMutationOrder(
  left: SyncMutation,
  right: SyncMutation,
): number {
  return (
    Date.parse(left.updatedAt) - Date.parse(right.updatedAt) ||
    left.mutationId.localeCompare(right.mutationId)
  );
}

export async function sequencedMutations(
  store: IDBObjectStore,
): Promise<SequencedSyncMutation[]> {
  const persisted = await requestResult(store.getAll());
  const parsed = persistedSyncMutationsSchema.parse(persisted);
  const byCanonicalId = new Map<string, (typeof parsed)[number]>();
  for (const mutation of parsed) {
    const prior = byCanonicalId.get(mutation.mutationId);
    if (
      prior &&
      syncIntentFingerprint(toIntentMutation(prior)) !==
        syncIntentFingerprint(toIntentMutation(mutation))
    ) {
      throw new Error("Mutation ID was reused with different content");
    }
    if (
      !prior ||
      (mutation.localSequence ?? Number.MAX_SAFE_INTEGER) <
        (prior.localSequence ?? Number.MAX_SAFE_INTEGER)
    ) {
      byCanonicalId.set(mutation.mutationId, mutation);
    }
  }
  const existing = [...byCanonicalId.values()];
  if (canonicalJson(persisted) !== canonicalJson(existing)) {
    store.clear();
    for (const mutation of existing) store.put(mutation);
  }
  let sequence = existing.reduce(
    (maximum, mutation) => Math.max(maximum, mutation.localSequence ?? 0),
    0,
  );
  for (const mutation of existing
    .filter(({ localSequence }) => localSequence === undefined)
    .toSorted(compareLegacyMutationOrder)) {
    mutation.localSequence = ++sequence;
    store.put(mutation);
  }
  const withSequences = existing.map((mutation) => {
    if (mutation.localSequence === undefined)
      throw new Error("Queued mutation sequence was not normalized");
    return { ...mutation, localSequence: mutation.localSequence };
  });
  let priorDeliveryTime = Number.NEGATIVE_INFINITY;
  for (const mutation of withSequences.toSorted(
    (left, right) => left.localSequence - right.localSequence,
  )) {
    const candidate = Date.parse(
      mutation.deliveryUpdatedAt ?? mutation.updatedAt,
    );
    const deliveryTime = Math.max(candidate, priorDeliveryTime + 1);
    const deliveryUpdatedAt = new Date(deliveryTime).toISOString();
    if (mutation.deliveryUpdatedAt !== deliveryUpdatedAt) {
      mutation.deliveryUpdatedAt = deliveryUpdatedAt;
      store.put(mutation);
    }
    priorDeliveryTime = deliveryTime;
  }
  return withSequences
    .toSorted((left, right) => left.localSequence - right.localSequence)
    .map((mutation) => {
      if (mutation.deliveryUpdatedAt === undefined)
        throw new Error("Queued mutation delivery time was not normalized");
      return {
        ...mutation,
        localSequence: mutation.localSequence,
        deliveryUpdatedAt: mutation.deliveryUpdatedAt,
      };
    });
}

export function prepareMutations(
  existing: SequencedSyncMutation[],
  mutations: SyncMutation[],
): SequencedSyncMutation[] {
  const normalizedMutations = mutations.map((mutation) =>
    syncMutationSchema.parse(mutation),
  );
  const byId = new Map(
    existing.map((mutation) => [mutation.mutationId, mutation]),
  );
  let sequence = existing.reduce(
    (maximum, mutation) => Math.max(maximum, mutation.localSequence),
    0,
  );
  let deliveryTime = existing
    .toSorted((left, right) => left.localSequence - right.localSequence)
    .reduce(
      (latest, mutation) =>
        Math.max(latest, Date.parse(mutation.deliveryUpdatedAt)),
      Number.NEGATIVE_INFINITY,
    );
  const prepared: SequencedSyncMutation[] = [];
  for (const mutation of normalizedMutations) {
    const prior = byId.get(mutation.mutationId);
    if (
      prior &&
      syncIntentFingerprint(toIntentMutation(prior)) !==
        syncIntentFingerprint(mutation)
    ) {
      throw new Error("Mutation ID was reused with different content");
    }
    const nextDeliveryTime = Math.max(
      Date.parse(mutation.updatedAt),
      deliveryTime + 1,
    );
    const persisted = prior ?? {
      ...mutation,
      localSequence: ++sequence,
      deliveryUpdatedAt: new Date(nextDeliveryTime).toISOString(),
    };
    if (!prior) deliveryTime = nextDeliveryTime;
    prepared.push(persisted);
    byId.set(mutation.mutationId, persisted);
  }
  return prepared;
}

/**
 * Adopts what a dying document parked, at the place its own intent belongs.
 *
 * `prepareMutations` is the enqueue path, and its rule — append at the tail,
 * stamp `max(intent, newest delivery + 1)` — is right for the only thing that
 * calls it: a mutation the session has just produced, which really is the
 * newest thing that has happened. A journalled mutation is the opposite. It was
 * produced by a document that has already ended, and the session may have done
 * anything since, in this tab or another one sharing the same outbox.
 *
 * Handing it the tail stamp made an intent from minutes ago the newest write in
 * the queue, and the server judges by the delivered `updatedAt` — so a rename
 * parked by a closed tab overwrote a rename the reader had just committed in
 * the tab still open. Two ordinary tabs, no synthetic events, both engines.
 *
 * So adoption inserts by intent instead. Each entry is placed before the first
 * queued mutation whose own intent is newer than it, and is delivered at its
 * own intent time rather than a bumped one. Three consequences, and they are
 * the whole fix:
 *
 * - Against a newer queued edit to the same field, the adopted entry is now the
 *   *earlier* one, so the existing compaction in `planMutationBatch` keeps the
 *   newer edit and discards it. It never reaches the wire.
 * - Against newer state on the server, it is delivered at its true age, so
 *   `isIncomingVersionNewer` refuses it — acknowledged, not applied. The client
 *   does not re-implement that judgement; it stops lying to it.
 * - Against nothing newer at all, it is the reader's most recent intent and
 *   still wins, which is the case the journal exists for.
 *
 * Queued mutations keep their relative order and their existing delivery
 * stamps: only the sequence numbers are re-dealt, densely, so an entry can be
 * given a place ahead of them. Re-adoption is a no-op — an id already in the
 * outbox yields no work at all — which is what keeps clearing the journal only
 * *after* the transaction commits the safe order, and keeps a re-sent mutation
 * the same mutation as far as the server's receipt table is concerned.
 */
export function adoptJournalledMutations(
  existing: SequencedSyncMutation[],
  journalled: readonly SyncMutation[],
): SequencedSyncMutation[] {
  const byId = new Map(
    existing.map((mutation) => [mutation.mutationId, mutation]),
  );
  const adopted: SyncMutation[] = [];
  for (const entry of journalled) {
    const mutation = syncMutationSchema.parse(entry);
    const prior = byId.get(mutation.mutationId);
    if (prior) {
      if (
        syncIntentFingerprint(toIntentMutation(prior)) !==
        syncIntentFingerprint(mutation)
      )
        throw new Error("Mutation ID was reused with different content");
      continue;
    }
    byId.set(mutation.mutationId, {
      ...mutation,
      localSequence: 0,
      deliveryUpdatedAt: mutation.updatedAt,
    });
    adopted.push(mutation);
  }
  if (adopted.length === 0) return [];
  return resequence(mergeByIntent(existing, adopted));
}

function mergeByIntent(
  existing: readonly SequencedSyncMutation[],
  adopted: readonly SyncMutation[],
): (SequencedSyncMutation | SyncMutation)[] {
  const pending = [...adopted].toSorted(
    (left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt),
  );
  const merged: (SequencedSyncMutation | SyncMutation)[] = [];
  for (const mutation of existing) {
    const queuedAt = Date.parse(mutation.updatedAt);
    // `<=`, so an adopted entry and a queued one made in the same millisecond
    // resolve in the queued one's favour: it belongs to the session that is
    // still running, and compaction keeps whichever is later in this list.
    while (pending.length > 0 && Date.parse(pending[0].updatedAt) <= queuedAt)
      merged.push(pending.shift()!);
    merged.push(mutation);
  }
  return [...merged, ...pending];
}

function resequence(
  merged: readonly (SequencedSyncMutation | SyncMutation)[],
): SequencedSyncMutation[] {
  let sequence = 0;
  let priorDeliveryTime = Number.NEGATIVE_INFINITY;
  return merged.map((mutation) => {
    const delivered =
      "deliveryUpdatedAt" in mutation ? mutation.deliveryUpdatedAt : undefined;
    const deliveryTime = Math.max(
      Date.parse(delivered ?? mutation.updatedAt),
      priorDeliveryTime + 1,
    );
    priorDeliveryTime = deliveryTime;
    return {
      ...mutation,
      localSequence: ++sequence,
      deliveryUpdatedAt: new Date(deliveryTime).toISOString(),
    };
  });
}

export function addPreparedMutations(
  store: IDBObjectStore,
  mutations: readonly SequencedSyncMutation[],
): void {
  for (const mutation of mutations) store.put(mutation);
}

export async function queuedMutations(userId: string): Promise<SyncMutation[]> {
  const db = await openDatabase(accountDatabaseName(userId), [
    "plans",
    "outbox",
  ]);
  try {
    const transaction = db.transaction("outbox", "readwrite");
    const mutations = await sequencedMutations(
      transaction.objectStore("outbox"),
    );
    await transactionDone(transaction);
    return mutations.map(toIntentMutation);
  } finally {
    db.close();
  }
}

export async function compactedMutationBatch(
  userId: string,
): Promise<SyncMutation[]> {
  return withAccountLock(userId, async () => {
    if (await isMarkedLoggedOut(userId)) return [];
    const db = await openDatabase(accountDatabaseName(userId), [
      "plans",
      "outbox",
    ]);
    try {
      const transaction = db.transaction("outbox", "readwrite");
      const store = transaction.objectStore("outbox");
      const queued = await sequencedMutations(store);
      const plan = planMutationBatch(queued);
      for (const mutation of plan.retainedMutations) store.put(mutation);
      for (const mutationId of plan.discardedMutationIds)
        store.delete(mutationId);
      await transactionDone(transaction);
      return plan.batch;
    } finally {
      db.close();
    }
  });
}

export async function removeMutations(
  userId: string,
  mutationIds: string[],
): Promise<void> {
  if (mutationIds.length === 0) return;
  return withAccountLock(userId, async () => {
    if (await isMarkedLoggedOut(userId)) return;
    const db = await openDatabase(accountDatabaseName(userId), [
      "plans",
      "outbox",
    ]);
    try {
      const transaction = db.transaction("outbox", "readwrite");
      const store = transaction.objectStore("outbox");
      for (const id of mutationIds) store.delete(id);
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  });
}

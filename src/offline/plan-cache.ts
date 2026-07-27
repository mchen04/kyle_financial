import { z } from "zod";
import { storedPlanSchema } from "@/domain/plan-schema";
import { normalizeStoredPlan, type StoredPlan } from "@/domain/stored-plan";
import type { SyncMutation } from "@/domain/sync";
import { toIntentMutation } from "./queue-planner";
import {
  accountDatabaseName,
  isMarkedLoggedOut,
  openDatabase,
  requestResult,
  transactionDone,
  withAccountLock,
} from "./database-core";
import {
  addPreparedMutations,
  adoptJournalledMutations,
  sequencedMutations,
} from "./outbox";
import {
  canParkDurably,
  dropJournalledMutations,
  pendingUnloadJournal,
} from "./unload-journal";

const storedPlansSchema = z.array(storedPlanSchema);

export async function cachePlansIfOutboxEmpty(
  userId: string,
  plans: StoredPlan[],
): Promise<StoredPlan[] | null> {
  return withAccountLock(userId, async () => {
    if (await isMarkedLoggedOut(userId)) return null;
    const db = await openDatabase(accountDatabaseName(userId), [
      "plans",
      "outbox",
    ]);
    try {
      const transaction = db.transaction(["plans", "outbox"], "readwrite");
      const remaining = await requestResult(
        transaction.objectStore("outbox").count(),
      );
      if (remaining === 0) {
        const store = transaction.objectStore("plans");
        const existing = storedPlansSchema.parse(
          await requestResult(store.getAll()),
        );
        const resolved = mergePlanCache(existing, plans);
        store.clear();
        for (const plan of resolved) store.put(plan);
        await transactionDone(transaction);
        return resolved;
      }
      await transactionDone(transaction);
      return null;
    } finally {
      db.close();
    }
  });
}

function mergePlanCache(
  existingPlans: readonly StoredPlan[],
  serverPlans: readonly StoredPlan[],
): StoredPlan[] {
  const merged = new Map(
    existingPlans.map(normalizeStoredPlan).map((plan) => [plan.year, plan]),
  );
  for (const plan of serverPlans) {
    const current = merged.get(plan.year);
    if (!current || Date.parse(plan.updatedAt) >= Date.parse(current.updatedAt))
      merged.set(plan.year, plan);
  }
  return [...merged.values()]
    .map(normalizeStoredPlan)
    .toSorted((left, right) => left.year - right.year);
}

export interface StartupPlanState {
  cachedPlans: StoredPlan[];
  pendingMutations: SyncMutation[];
  /**
   * Whether this launch found a parked edit it could not recover. Nothing can
   * be done about the bytes; what can be done is refuse to let the chip go on
   * reading `Saved` over the hole they left.
   */
  unreadableJournal: boolean;
  /**
   * Whether this launch has anywhere to park an edit at all. A context with
   * `localStorage` blocked or refusing every write has no synchronous durable
   * store, so no document in this session can rescue an edit a `pagehide`
   * catches mid-flight — and, crucially, this launch cannot tell whether the
   * last one lost one that way. Both halves are the same answer to the chip:
   * do not claim `Saved`.
   */
  parkingUnavailable: boolean;
}

/**
 * The first thing a launch does, and the only place the unload journal is read.
 *
 * A document that died mid-edit parked its mutations in `localStorage` because
 * nothing asynchronous outlives `pagehide`. They are adopted into the outbox
 * here, inside the same transaction that reads it, so by the time any caller
 * sees `pendingMutations` the edit is in the durable queue that drains on its
 * own — the journal never becomes a second thing the app has to remember to
 * consult. They are adopted *at their own intent time*, not at the tail: see
 * `adoptJournalledMutations` for why the difference is the difference between
 * rescuing the reader's edit and destroying it.
 *
 * They are released only after that transaction commits: a drain that fails
 * leaves the journal exactly where the next launch will find it again, and
 * adopting it twice is a no-op because the outbox is keyed by `mutationId`.
 * Only the ids this launch actually took are released, so a `pagehide` in
 * another tab between the read and the commit does not lose its own edit.
 */
export async function startupPlanState(
  userId: string,
  serverPlans: readonly StoredPlan[],
): Promise<StartupPlanState> {
  return withAccountLock(userId, async () => {
    if (await isMarkedLoggedOut(userId))
      throw new Error("This account is no longer available offline.");
    const db = await openDatabase(accountDatabaseName(userId), [
      "plans",
      "outbox",
    ]);
    const journalled = pendingUnloadJournal(userId);
    // Asked once, at the one moment the whole session's answer is settled.
    const parkingUnavailable = !canParkDurably();
    try {
      const transaction = db.transaction(["plans", "outbox"], "readwrite");
      const plansStore = transaction.objectStore("plans");
      const outboxStore = transaction.objectStore("outbox");
      if (journalled.mutations.length > 0)
        addPreparedMutations(
          outboxStore,
          adoptJournalledMutations(
            await sequencedMutations(outboxStore),
            journalled.mutations,
          ),
        );
      const pending = await sequencedMutations(outboxStore);
      const existing = storedPlansSchema.parse(
        await requestResult(plansStore.getAll()),
      );
      const cached =
        pending.length === 0 ? mergePlanCache(existing, serverPlans) : existing;
      if (pending.length === 0) {
        plansStore.clear();
        for (const plan of cached) plansStore.put(plan);
      }
      await transactionDone(transaction);
      dropJournalledMutations(
        userId,
        new Set(journalled.mutations.map(({ mutationId }) => mutationId)),
      );
      return {
        cachedPlans: cached.map(normalizeStoredPlan),
        pendingMutations: pending.map(toIntentMutation),
        unreadableJournal: journalled.unreadable,
        parkingUnavailable,
      };
    } finally {
      db.close();
    }
  });
}

export async function cachedPlans(userId: string): Promise<StoredPlan[]> {
  const db = await openDatabase(accountDatabaseName(userId), [
    "plans",
    "outbox",
  ]);
  try {
    const transaction = db.transaction("plans", "readonly");
    const plans = storedPlansSchema.parse(
      await requestResult(transaction.objectStore("plans").getAll()),
    );
    return plans.map(normalizeStoredPlan).sort((a, b) => a.year - b.year);
  } finally {
    db.close();
  }
}

export async function restorableCachedPlans(
  userId: string,
): Promise<StoredPlan[] | null> {
  return withAccountLock(userId, async () => {
    if (await isMarkedLoggedOut(userId)) return null;
    return cachedPlans(userId);
  });
}

import { z } from "zod";
import { userSchema, type User } from "@/domain/api-contracts";
import { transportSafeFieldVersion } from "@/domain/field-version";
import { maximumEsppDiscountPpm, storedPlanSchema } from "@/domain/plan-schema";
import { normalizeStoredPlan, type StoredPlan } from "@/domain/stored-plan";
import {
  applyDecodedSyncMutation,
  decodeSyncMutation,
  syncIntentFingerprint,
} from "@/domain/sync-decoder";
import {
  canonicalJson,
  parseSyncTarget,
  persistedSyncMutationEnvelopeSchema,
  syncMutationSchema,
  type SyncMutation,
} from "@/domain/sync";
import {
  latestLocalSequenceForField,
  planMutationBatch,
  toIntentMutation,
  type SequencedSyncMutation,
} from "./queue-planner";

const SHELL_DATABASE = "kyle-financial-shell";
const DATABASE_VERSION = 2;
const accountClosureModeSchema = z.enum(["logout", "delete"]);
export type AccountClosureMode = z.infer<typeof accountClosureModeSchema>;
const accountClosureMarkerSchema = z.object({
  mode: accountClosureModeSchema,
  status: z.enum(["indeterminate", "terminal"]),
});
type AccountClosureMarker = z.infer<typeof accountClosureMarkerSchema>;
export type RemoteAccountClosureOutcome =
  | { status: "confirmed" }
  | { status: "indeterminate" }
  | { status: "rejected"; error: unknown };
export interface AccountClosureResult {
  cleanupComplete: boolean;
  remoteStatus: "confirmed" | "indeterminate";
}
const storedPlansSchema = z.array(storedPlanSchema);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampLegacyBenefitDiscount(value: unknown): unknown {
  if (
    !isRecord(value) ||
    typeof value.discountRatePpm !== "number" ||
    value.discountRatePpm <= maximumEsppDiscountPpm
  )
    return value;
  return { ...value, discountRatePpm: maximumEsppDiscountPpm };
}

function migrateLegacyPlanRow(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.benefits)) return value;
  const legacyBenefits = value.benefits;
  const benefits = legacyBenefits.map(clampLegacyBenefitDiscount);
  return benefits.some((benefit, index) => benefit !== legacyBenefits[index])
    ? { ...value, benefits }
    : value;
}

function migrateLegacyMutationRow(value: unknown): unknown {
  if (!isRecord(value) || typeof value.field !== "string") return value;
  const target = parseSyncTarget(value.field);
  if (!target || target.kind !== "benefit") return value;
  if (target.property === "discountRatePpm") {
    return typeof value.value === "number" &&
      value.value > maximumEsppDiscountPpm
      ? { ...value, value: maximumEsppDiscountPpm }
      : value;
  }
  if (target.property !== undefined) return value;
  const migrated = clampLegacyBenefitDiscount(value.value);
  return migrated === value.value ? value : { ...value, value: migrated };
}

function migrateLegacyOutbox(store: IDBObjectStore): void {
  const request = store.getAll();
  request.onsuccess = () => {
    const rows = request.result;
    const migrationRows = rows.map((original, index) => {
      const migrated = migrateLegacyMutationRow(original);
      const localSequence =
        isRecord(original) &&
        Number.isInteger(original.localSequence) &&
        Number(original.localSequence) > 0
          ? Number(original.localSequence)
          : undefined;
      return { index, original, migrated, localSequence };
    });
    if (migrationRows.every(({ original, migrated }) => original === migrated))
      return;
    const legacyRows = migrationRows
      .filter(({ localSequence }) => localSequence === undefined)
      .toSorted((left, right) => {
        const leftRecord = isRecord(left.original) ? left.original : {};
        const rightRecord = isRecord(right.original) ? right.original : {};
        return (
          Date.parse(String(leftRecord.updatedAt)) -
            Date.parse(String(rightRecord.updatedAt)) ||
          String(leftRecord.mutationId).localeCompare(
            String(rightRecord.mutationId),
          )
        );
      });
    const sequencedRows = migrationRows
      .filter(({ localSequence }) => localSequence !== undefined)
      .toSorted((left, right) => left.localSequence! - right.localSequence!);
    const orderedRows = [...legacyRows, ...sequencedRows];
    for (const [index, row] of orderedRows.entries()) {
      row.localSequence = index + 1;
    }
    const latestWholeBenefits = new Map<
      string,
      (typeof migrationRows)[number]
    >();
    for (const row of orderedRows) {
      if (!isRecord(row.migrated)) continue;
      const target = parseSyncTarget(String(row.migrated.field));
      if (target?.kind !== "benefit" || target.property !== undefined) continue;
      latestWholeBenefits.set(
        `${String(row.migrated.planYear)}:${target.id}`,
        row,
      );
    }
    const needsNewIdentity = (row: (typeof migrationRows)[number]) => {
      if (row.original !== row.migrated) return true;
      if (!isRecord(row.migrated)) return false;
      const target = parseSyncTarget(String(row.migrated.field));
      if (target?.kind !== "benefit" || target.property === undefined)
        return false;
      const predecessor = latestWholeBenefits.get(
        `${String(row.migrated.planYear)}:${target.id}`,
      );
      return Boolean(
        predecessor &&
        predecessor.original !== predecessor.migrated &&
        predecessor.localSequence! < row.localSequence!,
      );
    };
    const correctionTime = Date.now();
    const replacements = new Map<
      number,
      { mutationId: string; updatedAt: string }
    >();
    for (const [offset, row] of migrationRows
      .filter(needsNewIdentity)
      .toSorted((left, right) => left.localSequence! - right.localSequence!)
      .entries()) {
      replacements.set(row.index, {
        mutationId: crypto.randomUUID(),
        updatedAt: new Date(correctionTime + offset).toISOString(),
      });
    }
    const corrected = migrationRows.map((row) => {
      if (!isRecord(row.migrated)) return row.migrated;
      const next: Record<string, unknown> = {
        ...row.migrated,
        localSequence: row.localSequence,
      };
      const replacement = replacements.get(row.index);
      if (replacement) {
        next.mutationId = replacement.mutationId;
        next.updatedAt = replacement.updatedAt;
        delete next.intentUpdatedAt;
        delete next.baseVersion;
      }
      delete next.deliveryUpdatedAt;
      delete next.deliveryAfterMutationId;
      delete next.deliveryOrderAssigned;
      return next;
    });
    store.clear();
    for (const row of corrected) store.put(row);
  };
}

function migrateStoreRows(
  store: IDBObjectStore,
  migrate: (value: unknown) => unknown,
): void {
  const request = store.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    const migrated = migrate(cursor.value);
    if (migrated !== cursor.value) cursor.update(migrated);
    cursor.continue();
  };
}

function metaValue(row: unknown): unknown {
  if (typeof row !== "object" || row === null || !("value" in row)) return;
  return row.value;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function openDatabase(name: string, stores: string[]): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      for (const store of stores) {
        if (!request.result.objectStoreNames.contains(store)) {
          request.result.createObjectStore(store, {
            keyPath:
              store === "plans"
                ? "year"
                : store === "outbox"
                  ? "mutationId"
                  : "key",
          });
        }
      }
      if (
        event.oldVersion < 2 &&
        name.startsWith("kyle-financial-account-") &&
        request.transaction
      ) {
        if (request.result.objectStoreNames.contains("plans"))
          migrateStoreRows(
            request.transaction.objectStore("plans"),
            migrateLegacyPlanRow,
          );
        if (request.result.objectStoreNames.contains("outbox"))
          migrateLegacyOutbox(request.transaction.objectStore("outbox"));
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function accountDatabaseName(userId: string): string {
  return `kyle-financial-account-${userId}`;
}

async function withLock<T>(
  name: string,
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (globalThis.navigator?.locks) {
    return navigator.locks.request(
      name,
      { mode: "exclusive", signal },
      operation,
    );
  }
  if (typeof window !== "undefined") {
    throw new Error(
      "This browser cannot safely coordinate private offline data across tabs.",
    );
  }
  return operation();
}

function withAccountLock<T>(
  userId: string,
  operation: () => Promise<T>,
  signal?: AbortSignal,
) {
  return withLock(`kyle-financial-account-${userId}`, operation, signal);
}

function withIntentLock<T>(
  userId: string,
  operation: () => Promise<T>,
  signal?: AbortSignal,
) {
  return withLock(`kyle-financial-intent-${userId}`, operation, signal);
}

export function withCopyForwardIntentLock<T>(
  userId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return withIntentLock(userId, operation);
}

function withShellLock<T>(operation: () => Promise<T>, signal?: AbortSignal) {
  return withLock("kyle-financial-shell-meta", operation, signal);
}

function parseAccountClosureMarker(row: unknown): AccountClosureMarker | null {
  if (row === undefined) return null;
  const value = metaValue(row);
  if (value === true) return { mode: "logout", status: "terminal" };
  const parsed = accountClosureMarkerSchema.safeParse(value);
  return parsed.success ? parsed.data : { mode: "logout", status: "terminal" };
}

async function accountClosureMarker(
  userId: string,
): Promise<AccountClosureMarker | null> {
  return withShellLock(async () => {
    const db = await openDatabase(SHELL_DATABASE, ["meta"]);
    try {
      const transaction = db.transaction("meta", "readonly");
      return parseAccountClosureMarker(
        await requestResult(
          transaction.objectStore("meta").get(`loggedOut:${userId}`),
        ),
      );
    } finally {
      db.close();
    }
  });
}

async function setAccountClosureMarker(
  userId: string,
  marker: AccountClosureMarker | null,
) {
  return withShellLock(async () => {
    const db = await openDatabase(SHELL_DATABASE, ["meta"]);
    try {
      const transaction = db.transaction("meta", "readwrite");
      const store = transaction.objectStore("meta");
      if (marker) store.put({ key: `loggedOut:${userId}`, value: marker });
      else store.delete(`loggedOut:${userId}`);
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  });
}

async function isMarkedLoggedOut(userId: string): Promise<boolean> {
  return (await accountClosureMarker(userId)) !== null;
}

export async function rememberUser(
  user: User,
  explicitAuthentication = false,
  ownerSignal?: AbortSignal,
): Promise<boolean> {
  const throwIfOwnerEnded = () => {
    if (ownerSignal?.aborted)
      throw ownerSignal.reason ?? new DOMException("Aborted", "AbortError");
  };
  throwIfOwnerEnded();
  await withAccountLock(
    user.id,
    async () => {
      throwIfOwnerEnded();
      await withShellLock(async () => {
        throwIfOwnerEnded();
        const db = await openDatabase(SHELL_DATABASE, ["meta"]);
        try {
          const transaction = db.transaction("meta", "readwrite");
          const abortTransaction = () => {
            try {
              transaction.abort();
            } catch {
              // The transaction already completed or aborted.
            }
          };
          ownerSignal?.addEventListener("abort", abortTransaction, {
            once: true,
          });
          const store = transaction.objectStore("meta");
          try {
            const marker = await requestResult(
              store.get(`loggedOut:${user.id}`),
            );
            throwIfOwnerEnded();
            if (marker && !explicitAuthentication) {
              await transactionDone(transaction);
              return;
            }
            store.put({ key: "lastUser", value: user });
            if (explicitAuthentication) store.delete(`loggedOut:${user.id}`);
            await transactionDone(transaction);
          } finally {
            ownerSignal?.removeEventListener("abort", abortTransaction);
          }
        } finally {
          db.close();
        }
      }, ownerSignal);
    },
    ownerSignal,
  );
  throwIfOwnerEnded();
  const remembered =
    explicitAuthentication || !(await isMarkedLoggedOut(user.id));
  throwIfOwnerEnded();
  return remembered;
}

export async function lastRememberedUser(): Promise<User | null> {
  return withShellLock(async () => {
    const db = await openDatabase(SHELL_DATABASE, ["meta"]);
    try {
      const transaction = db.transaction("meta", "readonly");
      const row = await requestResult(
        transaction.objectStore("meta").get("lastUser"),
      );
      const user = userSchema.safeParse(metaValue(row));
      if (!user.success) return null;
      const marker = await requestResult(
        transaction.objectStore("meta").get(`loggedOut:${user.data.id}`),
      );
      return marker ? null : user.data;
    } finally {
      db.close();
    }
  });
}

export async function clearRememberedUser(
  expectedUserId?: string,
): Promise<void> {
  return withShellLock(async () => {
    const db = await openDatabase(SHELL_DATABASE, ["meta"]);
    try {
      const transaction = db.transaction("meta", "readwrite");
      const store = transaction.objectStore("meta");
      const user = userSchema.safeParse(
        metaValue(await requestResult(store.get("lastUser"))),
      );
      if (!expectedUserId || (user.success && user.data.id === expectedUserId))
        store.delete("lastUser");
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  });
}

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
}

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
    try {
      const transaction = db.transaction(["plans", "outbox"], "readwrite");
      const plansStore = transaction.objectStore("plans");
      const pending = await sequencedMutations(
        transaction.objectStore("outbox"),
      );
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
      return {
        cachedPlans: cached.map(normalizeStoredPlan),
        pendingMutations: pending.map(toIntentMutation),
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

async function sequencedMutations(
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

function prepareMutations(
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

function addPreparedMutations(
  store: IDBObjectStore,
  mutations: readonly SequencedSyncMutation[],
): void {
  for (const mutation of mutations) store.put(mutation);
}

function applyMutationToPlan(
  plan: StoredPlan,
  mutation: SyncMutation,
): StoredPlan {
  return applyDecodedSyncMutation(plan, decodeSyncMutation(mutation));
}

export async function cachePlansAndEnqueue(
  userId: string,
  plans: StoredPlan[],
  mutations: SyncMutation[],
  ownerSignal?: AbortSignal,
): Promise<void> {
  const withOwnedIntentLock = <T>(operation: () => Promise<T>) =>
    withIntentLock(userId, operation, ownerSignal);
  const withOwnedAccountLock = <T>(operation: () => Promise<T>) =>
    withAccountLock(userId, operation, ownerSignal);
  return withOwnedIntentLock(() =>
    withOwnedAccountLock(async () => {
      if (await isMarkedLoggedOut(userId))
        throw new Error("This account was logged out in another tab.");
      const db = await openDatabase(accountDatabaseName(userId), [
        "plans",
        "outbox",
      ]);
      try {
        const transaction = db.transaction(["plans", "outbox"], "readwrite");
        const plansStore = transaction.objectStore("plans");
        const outboxStore = transaction.objectStore("outbox");
        try {
          const existingMutations = await sequencedMutations(outboxStore);
          const preparedMutations = prepareMutations(
            existingMutations,
            mutations,
          );
          const fallbackByYear = new Map(
            plans.map((plan) => [plan.year, plan]),
          );
          const byYear = new Map<number, SequencedSyncMutation[]>();
          for (const mutation of preparedMutations) {
            const group = byYear.get(mutation.planYear) ?? [];
            group.push(mutation);
            byYear.set(mutation.planYear, group);
          }
          for (const [year, yearMutations] of byYear) {
            const localSequences: Record<string, number> = {};
            for (const mutation of existingMutations
              .filter(({ planYear }) => planYear === year)
              .toSorted(
                (left, right) => left.localSequence - right.localSequence,
              )) {
              if (
                mutation.localSequence >
                latestLocalSequenceForField(mutation.field, localSequences)
              )
                localSequences[mutation.field] = mutation.localSequence;
            }
            const existingRow = await requestResult(plansStore.get(year));
            const existing =
              existingRow === undefined
                ? undefined
                : storedPlanSchema.parse(existingRow);
            const fallback = fallbackByYear.get(year);
            if (!existing && !fallback) continue;
            const winningMutations = yearMutations
              .toSorted(
                (left, right) => left.localSequence - right.localSequence,
              )
              .filter((mutation) => {
                if (
                  mutation.localSequence <=
                  latestLocalSequenceForField(mutation.field, localSequences)
                )
                  return false;
                localSequences[mutation.field] = mutation.localSequence;
                return true;
              });
            const merged = normalizeStoredPlan(
              winningMutations.reduce(
                applyMutationToPlan,
                normalizeStoredPlan(existing ?? fallback!),
              ),
            );
            plansStore.put(merged);
          }
          addPreparedMutations(outboxStore, preparedMutations);
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

export async function clearAccountCache(userId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(accountDatabaseName(userId));
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Account cache is still open"));
  });
}

async function clearClosedAccount(userId: string): Promise<boolean> {
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("kyle-financial-auth");
    channel.postMessage({ type: "logout", userId });
    channel.close();
  }
  const cleanup = await Promise.allSettled([
    clearAccountCache(userId),
    clearRememberedUser(userId),
  ]);
  return cleanup.every(({ status }) => status === "fulfilled");
}

export async function safelyCloseAccount(
  userId: string,
  mode: AccountClosureMode,
  closeRemote: () => Promise<RemoteAccountClosureOutcome>,
  ownerSignal?: AbortSignal,
): Promise<AccountClosureResult> {
  return withAccountLock(
    userId,
    async () => {
      ownerSignal?.throwIfAborted();
      const priorMarker = await accountClosureMarker(userId);
      ownerSignal?.throwIfAborted();
      if (priorMarker?.mode === "delete") {
        return {
          cleanupComplete: await clearClosedAccount(userId),
          remoteStatus:
            priorMarker.status === "terminal" ? "confirmed" : "indeterminate",
        };
      }
      if (priorMarker?.mode === "logout" && mode === "delete") {
        throw new Error(
          "This browser is already logged out. Sign in again before deleting the account.",
        );
      }
      if (!priorMarker) {
        const queuedMutationCount = (await queuedMutations(userId)).length;
        ownerSignal?.throwIfAborted();
        if (queuedMutationCount > 0) {
          throw new Error(
            "Unsynced edits are still on this device. Reconnect and wait for Saved before logging out.",
          );
        }
        await setAccountClosureMarker(userId, {
          mode,
          status: "indeterminate",
        });
      }
      if (priorMarker?.status === "terminal") {
        return {
          cleanupComplete: await clearClosedAccount(userId),
          remoteStatus: "confirmed",
        };
      }
      if (ownerSignal?.aborted) {
        if (!priorMarker) await setAccountClosureMarker(userId, null);
        ownerSignal.throwIfAborted();
      }
      let outcome: RemoteAccountClosureOutcome;
      try {
        outcome = await closeRemote();
      } catch {
        outcome = { status: "indeterminate" };
      }
      if (outcome.status === "rejected") {
        if (!priorMarker) await setAccountClosureMarker(userId, null);
        throw outcome.error;
      }
      if (outcome.status === "confirmed") {
        await setAccountClosureMarker(userId, { mode, status: "terminal" });
      }
      return {
        cleanupComplete: await clearClosedAccount(userId),
        remoteStatus: outcome.status,
      };
    },
    ownerSignal,
  );
}

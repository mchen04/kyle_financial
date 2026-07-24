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
import { sequencedMutations } from "./outbox";

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

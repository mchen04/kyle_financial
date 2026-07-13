import {
  authenticatedUserSchema,
  sessionIdSchema,
  type User,
} from "@/domain/api-contracts";
import type { StoredPlan } from "@/domain/stored-plan";
import type { SyncMutation } from "@/domain/sync";
import type { SaveState } from "./plan-types";
import {
  applyDecodedSyncMutation,
  decodeSyncMutation,
} from "@/domain/sync-decoder";

interface SavedStateInput {
  queuedMutationCount: number;
  volatileWriteFailure: boolean;
  rejectedWriteFailure: boolean;
}

export function removableAcknowledgementIds(
  acknowledgements: readonly {
    mutationId: string;
    rejected?: boolean;
  }[],
): string[] {
  return acknowledgements
    .filter(({ rejected }) => !rejected)
    .map(({ mutationId }) => mutationId);
}

export function canConfirmSaved(input: SavedStateInput): boolean {
  return (
    input.queuedMutationCount === 0 &&
    !input.volatileWriteFailure &&
    !input.rejectedWriteFailure
  );
}

export function reconciliationCompletionState(
  input: SavedStateInput,
): "saved" | "local-error" | "sync-error" {
  if (canConfirmSaved(input)) return "saved";
  return input.volatileWriteFailure ? "local-error" : "sync-error";
}

export function reconciliationStateWithPersistencePriority(input: {
  candidate: SaveState;
  volatileWriteFailure: boolean;
  retryablePersistenceFailure: boolean;
  reconciliationPersistenceFailure?: boolean;
  rejectedWriteFailure?: boolean;
  syncRequestFailure?: boolean;
}): SaveState {
  if (
    input.volatileWriteFailure ||
    input.retryablePersistenceFailure ||
    input.reconciliationPersistenceFailure
  )
    return "local-error";
  if (input.syncRequestFailure) return "sync-error";
  return input.rejectedWriteFailure ? "rejected" : input.candidate;
}

export function canPublishPlanSnapshot(
  capturedIntentRevision: number,
  currentIntentRevision: number,
  durableIntentRevision: number,
): boolean {
  return (
    capturedIntentRevision === currentIntentRevision &&
    durableIntentRevision === currentIntentRevision
  );
}

export function registerPlanWriteFailure(
  failedPlanYears: Set<number>,
  planYear: number,
): void {
  failedPlanYears.add(planYear);
}

export function resolvePlanWriteSuccess(
  failedPlanYears: Set<number>,
  planYear: number,
  durableIntentRevision: number,
  persistedIntentRevision: number,
): {
  volatileWriteFailure: boolean;
  durableIntentRevision: number;
} {
  failedPlanYears.delete(planYear);
  const volatileWriteFailure = failedPlanYears.size > 0;
  return {
    volatileWriteFailure,
    durableIntentRevision: volatileWriteFailure
      ? durableIntentRevision
      : Math.max(durableIntentRevision, persistedIntentRevision),
  };
}

export async function runDevicePersistenceRetry(
  retryStartupPersistence: (() => Promise<void>) | null,
  retryDraftPersistence: () => void | Promise<void>,
): Promise<void> {
  if (retryStartupPersistence) await retryStartupPersistence();
  await retryDraftPersistence();
}

export interface AccountPersistenceRetry {
  accountId: string;
  generation: number;
  retry: () => Promise<void>;
}

export function queueAccountPersistenceRetry(
  current: AccountPersistenceRetry | null,
  accountId: string,
  generation: number,
  retry: () => Promise<void>,
  activeAccountId: string | null,
  activeGeneration: number,
): AccountPersistenceRetry | null {
  if (activeAccountId !== accountId || activeGeneration !== generation)
    return current;
  if (current?.accountId !== accountId || current.generation !== generation)
    return { accountId, generation, retry };
  return {
    accountId,
    generation,
    retry: async () => {
      await current.retry();
      await retry();
    },
  };
}

export function isCurrentAccountLifecycle(
  retry: AccountPersistenceRetry,
  activeAccountId: string | null,
  activeGeneration: number,
): boolean {
  return (
    retry.accountId === activeAccountId && retry.generation === activeGeneration
  );
}

export function cancelAccountPersistenceRetry(
  current: AccountPersistenceRetry | null,
  accountId?: string,
): AccountPersistenceRetry | null {
  if (!current || (accountId && current.accountId !== accountId))
    return current;
  return null;
}

interface LogoutDurabilityInput {
  draftSnapshot: string;
  durableSnapshot: string | undefined;
  volatileWriteFailure: boolean;
  rejectedWriteFailure: boolean;
}

export function durableLogoutProblem(
  input: LogoutDurabilityInput,
): string | null {
  if (
    input.volatileWriteFailure ||
    input.rejectedWriteFailure ||
    input.durableSnapshot === undefined ||
    input.draftSnapshot !== input.durableSnapshot
  ) {
    return "This plan has not finished saving. Keep this page open and retry before logging out.";
  }
  return null;
}

export function enqueueSerializedIntent(
  chain: Promise<unknown>,
  intentSnapshot: string,
  durableSnapshot: () => string | undefined,
  persist: (baselineSnapshot: string) => Promise<void>,
): Promise<"missing-baseline" | "unchanged" | "persisted"> {
  return chain.then(async () => {
    const baseline = durableSnapshot();
    if (!baseline) return "missing-baseline";
    if (baseline === intentSnapshot) return "unchanged";
    await persist(baseline);
    return "persisted";
  });
}

export function replacePlanIntent<T extends { year: number }>(
  plans: readonly T[],
  draft: T,
): T[] {
  return plans.map((plan) => (plan.year === draft.year ? draft : plan));
}

export function planIntentForYear<T extends { year: number }>(
  plans: readonly T[],
  year: number,
): T | undefined {
  return plans.find((plan) => plan.year === year);
}

export function shouldEvictAccount(
  activeAccountId: string | null,
  restoringAccountId: string | null,
  loggedOutAccountId: string,
): boolean {
  return (
    activeAccountId === loggedOutAccountId ||
    restoringAccountId === loggedOutAccountId
  );
}

export function shouldInvalidateForAuthentication(
  activeAccountId: string | null,
  authenticatedAccountId: string,
): boolean {
  return activeAccountId !== authenticatedAccountId;
}

export function authenticationBroadcastTransition(
  activeAccountId: string | null,
  currentUser: User | null,
  message: { userId?: unknown; sessionId?: unknown },
  replaceCloseOwner: () => void,
): {
  invalidate: boolean;
  sessionIdentity?: { userId: string; sessionId: string };
  user: User | null;
} {
  replaceCloseOwner();
  if (
    typeof message.userId !== "string" ||
    shouldInvalidateForAuthentication(activeAccountId, message.userId)
  ) {
    return { invalidate: true, user: currentUser };
  }
  const sessionId = sessionIdSchema.safeParse(message.sessionId);
  if (!sessionId.success) return { invalidate: false, user: currentUser };
  const sessionIdentity = { userId: message.userId, sessionId: sessionId.data };
  if (!currentUser) return { invalidate: false, sessionIdentity, user: null };
  const authenticated = authenticatedUserSchema.safeParse({
    ...currentUser,
    sessionId: sessionId.data,
  });
  return {
    invalidate: false,
    sessionIdentity,
    user: authenticated.success ? authenticated.data : currentUser,
  };
}

export function userWithLatestSession(
  user: User,
  sessionIdentity: { userId: string; sessionId: string } | null,
): User {
  if (!sessionIdentity || sessionIdentity.userId !== user.id) return user;
  return { ...user, sessionId: sessionIdentity.sessionId };
}

export function mergePlansWithLocalIntent(
  serverPlans: readonly StoredPlan[],
  localPlans: readonly StoredPlan[],
  pendingMutations: readonly SyncMutation[],
): StoredPlan[] {
  const merged = new Map(serverPlans.map((plan) => [plan.year, plan]));
  const serverYears = new Set(merged.keys());
  for (const plan of localPlans) {
    if (!serverYears.has(plan.year)) merged.set(plan.year, plan);
  }
  for (const mutation of pendingMutations) {
    if (!serverYears.has(mutation.planYear)) continue;
    const plan = merged.get(mutation.planYear);
    if (!plan) continue;
    merged.set(
      mutation.planYear,
      applyDecodedSyncMutation(plan, decodeSyncMutation(mutation)),
    );
  }
  return [...merged.values()].toSorted((left, right) => left.year - right.year);
}

export function copyForwardIntentSnapshot(plan: object): string {
  const intent = { ...plan } as Record<string, unknown>;
  delete intent.updatedAt;
  delete intent.fieldVersions;
  return JSON.stringify(intent);
}

interface CopyForwardPreparation {
  localWrites: Promise<void>;
  durabilityProblem: () => string | null;
  reconcile: () => Promise<void>;
  queuedMutationCount: () => Promise<number>;
}

export async function prepareCopyForward(
  preparation: CopyForwardPreparation,
): Promise<void> {
  await preparation.localWrites;
  const localProblem = preparation.durabilityProblem();
  if (localProblem) throw new Error(localProblem);
  await preparation.reconcile();
  const reconciledProblem = preparation.durabilityProblem();
  if (reconciledProblem) throw new Error(reconciledProblem);
  if ((await preparation.queuedMutationCount()) > 0) {
    throw new Error(
      "The source plan still has unsynced edits. Reconnect and wait for Saved before copying it.",
    );
  }
}

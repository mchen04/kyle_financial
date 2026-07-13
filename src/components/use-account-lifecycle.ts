import { useCallback, useEffect, useRef } from "react";
import {
  bootstrapResponseSchema,
  planResponseSchema,
  type User,
} from "@/domain/api-contracts";
import { storedPlanSchema } from "@/domain/plan-schema";
import {
  lastRememberedUser,
  queuedMutations,
  rememberUser,
  restorableCachedPlans,
  safelyCloseAccount,
  withCopyForwardIntentLock,
  type AccountClosureMode,
} from "@/offline/database";
import { HttpError, jsonRequest, type StoredPlan } from "./plan-types";
import {
  authenticationBroadcastTransition,
  copyForwardIntentSnapshot,
  durableLogoutProblem,
  planIntentForYear,
  prepareCopyForward,
  shouldEvictAccount,
  userWithLatestSession,
} from "./sync-state";
import {
  requireAuthoritativePlanRefresh,
  type PlanSessionController,
} from "./use-plan-session";
import type { PlanSyncController } from "./use-plan-sync";
import { requestRemoteAccountClosure } from "./account-closure";

function linkAbortSignals(signals: readonly AbortSignal[]): {
  signal: AbortSignal;
  dispose: () => void;
} {
  const controller = new AbortController();
  const listeners = signals.map((signal) => {
    const abort = () => controller.abort(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    return { signal, abort };
  });
  return {
    signal: controller.signal,
    dispose: () => {
      for (const { signal, abort } of listeners)
        signal.removeEventListener("abort", abort);
    },
  };
}

export function useAccountLifecycle(
  session: PlanSessionController,
  sync: PlanSyncController,
) {
  const {
    user,
    draft,
    runtimeRef,
    beginAccount,
    getOwnerSignal,
    invalidateSession,
    setDraft,
    setLoading,
    setPlans,
    setSaveState,
    setUser,
  } = session;
  const {
    cancelDevicePersistenceRetry,
    loadPlansFor,
    queueDevicePersistenceRetry,
    reconcileFor,
  } = sync;
  const closeAccountInFlight = useRef<{
    mode: AccountClosureMode;
    promise: Promise<void>;
  } | null>(null);
  const latestSessionRef = useRef<{
    userId: string;
    sessionId: string;
  } | null>(null);
  const closeOwnerRef = useRef(new AbortController());
  const replaceCloseOwner = useCallback(() => {
    closeOwnerRef.current.abort(
      new DOMException(
        "A newer authentication replaced this request.",
        "AbortError",
      ),
    );
    closeOwnerRef.current = new AbortController();
  }, []);

  useEffect(() => {
    if (closeOwnerRef.current.signal.aborted)
      closeOwnerRef.current = new AbortController();
    return () => closeOwnerRef.current.abort();
  }, []);

  useEffect(() => {
    let ownerSignal = getOwnerSignal();
    void (async () => {
      const startupGeneration = runtimeRef.current.accountGeneration;
      let ownedGeneration = startupGeneration;
      try {
        const response = await jsonRequest(
          "/api/bootstrap",
          bootstrapResponseSchema,
          { signal: ownerSignal },
        );
        if (ownerSignal.aborted) return;
        latestSessionRef.current = {
          userId: response.user.id,
          sessionId: response.user.sessionId,
        };
        let canRestore = true;
        let retryRememberUser = false;
        try {
          canRestore = await rememberUser(response.user, false, ownerSignal);
        } catch {
          if (ownerSignal.aborted) return;
          retryRememberUser = true;
        }
        if (
          ownerSignal.aborted ||
          runtimeRef.current.accountGeneration !== startupGeneration
        )
          return;
        if (!canRestore) {
          invalidateSession("");
          return;
        }
        const generation = beginAccount(response.user.id, ownerSignal);
        if (generation === null) return;
        ownedGeneration = generation;
        ownerSignal = getOwnerSignal();
        if (retryRememberUser)
          queueDevicePersistenceRetry(
            response.user.id,
            generation,
            async () => {
              if (
                runtimeRef.current.activeAccount !== response.user.id ||
                runtimeRef.current.accountGeneration !== generation
              )
                return;
              if (!(await rememberUser(response.user, false, ownerSignal)))
                throw new Error("This account is no longer available offline.");
            },
          );
        await loadPlansFor(response.user, {
          generation,
          serverPlans: response.plans,
          signal: ownerSignal,
        });
        if (
          !ownerSignal.aborted &&
          runtimeRef.current.activeAccount === response.user.id &&
          runtimeRef.current.accountGeneration === generation
        )
          setUser(
            userWithLatestSession(response.user, latestSessionRef.current),
          );
      } catch (error) {
        if (
          ownerSignal.aborted ||
          runtimeRef.current.accountGeneration !== ownedGeneration
        )
          return;
        if (error instanceof HttpError && error.status === 409) {
          cancelDevicePersistenceRetry();
          invalidateSession(
            "The active account changed in another tab. Sign in again.",
          );
        } else if (!(error instanceof HttpError) || error.status !== 401) {
          let remembered: User | null = null;
          let offlinePlans: StoredPlan[] = [];
          try {
            remembered = await lastRememberedUser();
            if (remembered) {
              const generation = beginAccount(remembered.id, ownerSignal);
              if (generation === null) return;
              ownedGeneration = generation;
              ownerSignal = getOwnerSignal();
              runtimeRef.current.restoringAccount = remembered.id;
              offlinePlans = (await restorableCachedPlans(remembered.id)) ?? [];
              if (
                ownerSignal.aborted ||
                runtimeRef.current.accountGeneration !== generation ||
                runtimeRef.current.activeAccount !== remembered.id
              )
                return;
            }
          } catch {
            if (runtimeRef.current.accountGeneration !== ownedGeneration)
              return;
            setSaveState("local-error");
          }
          if (
            !ownerSignal.aborted &&
            remembered &&
            runtimeRef.current.restoringAccount === remembered.id &&
            offlinePlans.length > 0
          ) {
            setPlans(offlinePlans);
            runtimeRef.current.plans = offlinePlans;
            setDraft(offlinePlans.at(-1) ?? null);
            runtimeRef.current.savedSnapshots = new Map(
              offlinePlans.map((plan) => [plan.year, JSON.stringify(plan)]),
            );
            requireAuthoritativePlanRefresh(runtimeRef.current);
            setSaveState("offline");
            setUser(
              userWithLatestSession(remembered, latestSessionRef.current),
            );
          } else if (remembered) {
            invalidateSession("");
            ownedGeneration = runtimeRef.current.accountGeneration;
          }
          if (runtimeRef.current.restoringAccount === remembered?.id)
            runtimeRef.current.restoringAccount = null;
        } else {
          invalidateSession("");
        }
      } finally {
        if (
          !ownerSignal.aborted &&
          runtimeRef.current.accountGeneration === ownedGeneration
        )
          setLoading(false);
      }
    })();
  }, [
    runtimeRef,
    beginAccount,
    getOwnerSignal,
    cancelDevicePersistenceRetry,
    invalidateSession,
    loadPlansFor,
    queueDevicePersistenceRetry,
    setDraft,
    setLoading,
    setPlans,
    setSaveState,
    setUser,
  ]);

  useEffect(() => {
    const onAccountChange = () => {
      cancelDevicePersistenceRetry();
      invalidateSession(
        "The active account changed in another tab. Sign in again.",
      );
    };
    window.addEventListener("kyle-financial-account-change", onAccountChange);
    return () =>
      window.removeEventListener(
        "kyle-financial-account-change",
        onAccountChange,
      );
  }, [cancelDevicePersistenceRetry, invalidateSession]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("kyle-financial-auth");
    channel.onmessage = ({ data }) => {
      if (data?.type === "authenticated") {
        const transition = authenticationBroadcastTransition(
          runtimeRef.current.activeAccount,
          user,
          data,
          replaceCloseOwner,
        );
        if (transition.sessionIdentity)
          latestSessionRef.current = transition.sessionIdentity;
        if (!transition.invalidate) {
          if (transition.user !== user) setUser(transition.user);
          return;
        }
        cancelDevicePersistenceRetry();
        invalidateSession("The active account changed in another tab.");
        window.location.reload();
        return;
      }
      if (
        data?.type !== "logout" ||
        !shouldEvictAccount(
          runtimeRef.current.activeAccount,
          runtimeRef.current.restoringAccount,
          data.userId,
        )
      )
        return;
      cancelDevicePersistenceRetry(data.userId);
      invalidateSession("");
    };
    return () => channel.close();
  }, [
    runtimeRef,
    cancelDevicePersistenceRetry,
    invalidateSession,
    replaceCloseOwner,
    setUser,
    user,
  ]);

  const authenticate = useCallback(
    (nextUser: User, submissionSignal: AbortSignal) => {
      if (submissionSignal.aborted) return;
      if (nextUser.sessionId)
        latestSessionRef.current = {
          userId: nextUser.id,
          sessionId: nextUser.sessionId,
        };
      replaceCloseOwner();
      const generation = beginAccount(nextUser.id, submissionSignal);
      if (generation === null) return;
      const ownerSignal = getOwnerSignal();
      cancelDevicePersistenceRetry();
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("kyle-financial-auth");
        channel.postMessage({
          type: "authenticated",
          userId: nextUser.id,
          sessionId: nextUser.sessionId,
        });
        channel.close();
      }
      setLoading(true);
      void (async () => {
        try {
          await rememberUser(nextUser, true, ownerSignal);
        } catch {
          if (ownerSignal.aborted) return;
          queueDevicePersistenceRetry(nextUser.id, generation, async () => {
            if (
              runtimeRef.current.activeAccount !== nextUser.id ||
              runtimeRef.current.accountGeneration !== generation
            )
              return;
            await rememberUser(nextUser, true, ownerSignal);
          });
        }
        if (
          ownerSignal.aborted ||
          runtimeRef.current.activeAccount !== nextUser.id ||
          runtimeRef.current.accountGeneration !== generation
        )
          return;
        await loadPlansFor(nextUser, { generation, signal: ownerSignal });
        if (
          !ownerSignal.aborted &&
          runtimeRef.current.activeAccount === nextUser.id &&
          runtimeRef.current.accountGeneration === generation
        )
          setUser(userWithLatestSession(nextUser, latestSessionRef.current));
      })()
        .catch((error) => {
          if (
            !ownerSignal.aborted &&
            runtimeRef.current.activeAccount === nextUser.id &&
            runtimeRef.current.accountGeneration === generation &&
            !(error instanceof HttpError && error.status === 409)
          ) {
            invalidateSession("Your plans could not be loaded. Try again.");
            setSaveState("sync-error");
          }
        })
        .finally(() => {
          if (
            !ownerSignal.aborted &&
            runtimeRef.current.activeAccount === nextUser.id &&
            runtimeRef.current.accountGeneration === generation
          )
            setLoading(false);
        });
    },
    [
      runtimeRef,
      beginAccount,
      getOwnerSignal,
      cancelDevicePersistenceRetry,
      invalidateSession,
      loadPlansFor,
      queueDevicePersistenceRetry,
      replaceCloseOwner,
      setLoading,
      setSaveState,
      setUser,
    ],
  );

  const closeAccount = useCallback(
    (deleteRemote: boolean): Promise<void> => {
      const mode: AccountClosureMode = deleteRemote ? "delete" : "logout";
      if (closeAccountInFlight.current) {
        if (closeAccountInFlight.current.mode === mode)
          return closeAccountInFlight.current.promise;
        return Promise.reject(
          new Error("Another account action is already in progress."),
        );
      }
      if (!user || !draft) return Promise.resolve();
      const closingUser = userWithLatestSession(user, latestSessionRef.current);
      const ownerSignal = getOwnerSignal();
      const linkedLockSignal = linkAbortSignals([
        ownerSignal,
        closeOwnerRef.current.signal,
      ]);
      const operation = (async () => {
        window.clearTimeout(runtimeRef.current.syncTimer);
        await runtimeRef.current.localWriteChain;
        ownerSignal.throwIfAborted();
        const durability = () =>
          durableLogoutProblem({
            draftSnapshot: JSON.stringify(draft),
            durableSnapshot: runtimeRef.current.savedSnapshots.get(draft.year),
            volatileWriteFailure:
              runtimeRef.current.volatileWriteFailure ||
              runtimeRef.current.retryablePersistenceFailure ||
              runtimeRef.current.reconciliationPersistenceFailure,
            rejectedWriteFailure: runtimeRef.current.rejectedWriteFailure,
          });
        const localProblem = durability();
        if (localProblem) throw new Error(localProblem);
        if (navigator.onLine) await reconcileFor(closingUser);
        ownerSignal.throwIfAborted();
        const postSyncProblem = durability();
        if (postSyncProblem) throw new Error(postSyncProblem);
        const closure = await safelyCloseAccount(
          closingUser.id,
          mode,
          () => requestRemoteAccountClosure(closingUser, mode, ownerSignal),
          linkedLockSignal.signal,
        );
        cancelDevicePersistenceRetry(closingUser.id);
        const notice =
          closure.remoteStatus === "indeterminate"
            ? deleteRemote
              ? "Account deletion could not be confirmed. This browser cleared and locked its local copy; sign in again to verify or retry."
              : "The server response could not be confirmed, but this browser cleared its local copy and is safely logged out."
            : closure.cleanupComplete
              ? deleteRemote
                ? "Your account and every server plan were permanently deleted."
                : ""
              : deleteRemote
                ? "Your server account was deleted, but this browser could not finish clearing every cached record."
                : "You are logged out and this account is locked locally, but the browser could not finish deleting every cached record.";
        invalidateSession(notice);
      })();
      const inFlight = { mode, promise: operation };
      closeAccountInFlight.current = inFlight;
      void operation.then(
        () => {
          linkedLockSignal.dispose();
          if (closeAccountInFlight.current === inFlight)
            closeAccountInFlight.current = null;
        },
        () => {
          linkedLockSignal.dispose();
          if (closeAccountInFlight.current === inFlight)
            closeAccountInFlight.current = null;
        },
      );
      return operation;
    },
    [
      user,
      draft,
      runtimeRef,
      getOwnerSignal,
      cancelDevicePersistenceRetry,
      invalidateSession,
      reconcileFor,
    ],
  );

  const copyForward = useCallback(
    async (sourcePlan: StoredPlan, targetYear: number) => {
      if (!user) return;
      window.clearTimeout(runtimeRef.current.syncTimer);
      await runtimeRef.current.localWriteChain;
      const durabilityProblem = () =>
        durableLogoutProblem({
          draftSnapshot: copyForwardIntentSnapshot(sourcePlan),
          durableSnapshot: (() => {
            const snapshot = runtimeRef.current.savedSnapshots.get(
              sourcePlan.year,
            );
            return snapshot
              ? copyForwardIntentSnapshot(
                  storedPlanSchema.parse(JSON.parse(snapshot)),
                )
              : undefined;
          })(),
          volatileWriteFailure:
            runtimeRef.current.volatileWriteFailure ||
            runtimeRef.current.retryablePersistenceFailure ||
            runtimeRef.current.reconciliationPersistenceFailure,
          rejectedWriteFailure: runtimeRef.current.rejectedWriteFailure,
        });
      await withCopyForwardIntentLock(user.id, async () => {
        await prepareCopyForward({
          localWrites: Promise.resolve(),
          durabilityProblem,
          reconcile: () => reconcileFor(user),
          queuedMutationCount: async () =>
            (await queuedMutations(user.id)).length,
        });
        const reconciledSource = planIntentForYear(
          runtimeRef.current.plans,
          sourcePlan.year,
        );
        if (!reconciledSource)
          throw new Error("The source plan is no longer available.");
        await jsonRequest(
          "/api/plans/copy",
          planResponseSchema,
          {
            method: "POST",
            body: JSON.stringify({
              sourceYear: sourcePlan.year,
              targetYear,
              expectedSourceUpdatedAt: reconciledSource.updatedAt,
              expectedSourceFieldVersions: reconciledSource.fieldVersions,
            }),
          },
          user.id,
        );
      });
      await loadPlansFor(user, { selectedYear: targetYear });
    },
    [user, runtimeRef, loadPlansFor, reconcileFor],
  );

  return { authenticate, closeAccount, copyForward };
}

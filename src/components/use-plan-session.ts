import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  type SetStateAction,
} from "react";
import type { User } from "@/domain/api-contracts";
import type { AccountPersistenceRetry } from "./sync-state";
import type { SaveState, Screen, StoredPlan } from "./plan-types";

export type PlanSessionPhase =
  "loading" | "signed-out" | "onboarding" | "ready";

interface SessionState {
  user: User | null;
  plans: StoredPlan[];
  draft: StoredPlan | null;
  loading: boolean;
  screen: Screen;
  saveState: SaveState;
  localSaveRetry: number;
  authNotice: string;
}

type SessionAction =
  | { type: "user"; value: User | null }
  | { type: "plans"; value: StoredPlan[] }
  | { type: "draft"; value: SetStateAction<StoredPlan | null> }
  | { type: "loading"; value: boolean }
  | { type: "screen"; value: Screen }
  | { type: "save"; value: SaveState }
  | { type: "retry"; value: SetStateAction<number> }
  | { type: "account-transition" }
  | { type: "signed-out"; notice: string };

export interface PlanSessionRuntime {
  savedSnapshots: Map<number, string>;
  plans: StoredPlan[];
  activeAccount: string | null;
  accountGeneration: number;
  ownerController: AbortController;
  planLoadRevision: number;
  intentRevision: number;
  durableIntentRevision: number;
  localWriteChain: Promise<void>;
  reconcileRunning: Promise<void> | null;
  reconcileAbortController: AbortController | null;
  reconcileRequested: boolean;
  planRefreshNeeded: boolean;
  reconciliationPersistenceFailure: boolean;
  syncTimer: number | undefined;
  lastMutationTime: number;
  volatileWriteFailureYears: Set<number>;
  volatileWriteFailure: boolean;
  retryablePersistenceFailure: boolean;
  devicePersistenceRetry: AccountPersistenceRetry | null;
  rejectedWriteFailure: boolean;
  restoringAccount: string | null;
}

const initialState: SessionState = {
  user: null,
  plans: [],
  draft: null,
  loading: true,
  screen: "plan",
  saveState: "saved",
  localSaveRetry: 0,
  authNotice: "",
};

function sessionReducer(
  state: SessionState,
  action: SessionAction,
): SessionState {
  switch (action.type) {
    case "user":
      return { ...state, user: action.value };
    case "plans":
      return { ...state, plans: action.value };
    case "draft":
      return {
        ...state,
        draft:
          typeof action.value === "function"
            ? action.value(state.draft)
            : action.value,
      };
    case "loading":
      return { ...state, loading: action.value };
    case "screen":
      return { ...state, screen: action.value };
    case "save":
      return { ...state, saveState: action.value };
    case "retry":
      return {
        ...state,
        localSaveRetry:
          typeof action.value === "function"
            ? action.value(state.localSaveRetry)
            : action.value,
      };
    case "account-transition":
      return {
        ...state,
        user: null,
        plans: [],
        draft: null,
        screen: "plan",
        saveState: "saved",
        localSaveRetry: 0,
        authNotice: "",
      };
    case "signed-out":
      return {
        ...state,
        user: null,
        plans: [],
        draft: null,
        loading: false,
        screen: "plan",
        saveState: "saved",
        localSaveRetry: 0,
        authNotice: action.notice,
      };
  }
}

export function transitionPlanSessionRuntime(
  runtime: PlanSessionRuntime,
  activeAccount: string | null,
): number {
  runtime.ownerController.abort();
  if (runtime.syncTimer !== undefined && typeof window !== "undefined")
    window.clearTimeout(runtime.syncTimer);
  runtime.reconcileAbortController?.abort();
  runtime.savedSnapshots = new Map();
  runtime.plans = [];
  runtime.activeAccount = activeAccount;
  runtime.accountGeneration += 1;
  runtime.ownerController = new AbortController();
  runtime.planLoadRevision = 0;
  runtime.intentRevision = 0;
  runtime.durableIntentRevision = 0;
  runtime.localWriteChain = Promise.resolve();
  runtime.reconcileRunning = null;
  runtime.reconcileAbortController = null;
  runtime.reconcileRequested = false;
  runtime.planRefreshNeeded = false;
  runtime.reconciliationPersistenceFailure = false;
  runtime.syncTimer = undefined;
  runtime.lastMutationTime = 0;
  runtime.volatileWriteFailureYears = new Set();
  runtime.volatileWriteFailure = false;
  runtime.retryablePersistenceFailure = false;
  runtime.devicePersistenceRetry = null;
  runtime.rejectedWriteFailure = false;
  runtime.restoringAccount = null;
  return runtime.accountGeneration;
}

export function disposePlanSessionRuntime(runtime: PlanSessionRuntime): void {
  transitionPlanSessionRuntime(runtime, null);
  runtime.ownerController.abort();
}

export function beginOwnedPlanSessionRuntime(
  runtime: PlanSessionRuntime,
  accountId: string,
  ownerSignal: AbortSignal,
): number | null {
  if (ownerSignal.aborted || ownerSignal !== runtime.ownerController.signal)
    return null;
  return transitionPlanSessionRuntime(runtime, accountId);
}

export function requireAuthoritativePlanRefresh(
  runtime: Pick<PlanSessionRuntime, "planRefreshNeeded">,
): void {
  runtime.planRefreshNeeded = true;
}

export function usePlanSession() {
  const [state, dispatch] = useReducer(sessionReducer, initialState);
  const runtimeRef = useRef<PlanSessionRuntime>({
    savedSnapshots: new Map(),
    plans: [],
    activeAccount: null,
    accountGeneration: 0,
    ownerController: new AbortController(),
    planLoadRevision: 0,
    intentRevision: 0,
    durableIntentRevision: 0,
    localWriteChain: Promise.resolve(),
    reconcileRunning: null,
    reconcileAbortController: null,
    reconcileRequested: false,
    planRefreshNeeded: false,
    reconciliationPersistenceFailure: false,
    syncTimer: undefined,
    lastMutationTime: 0,
    volatileWriteFailureYears: new Set(),
    volatileWriteFailure: false,
    retryablePersistenceFailure: false,
    devicePersistenceRetry: null,
    rejectedWriteFailure: false,
    restoringAccount: null,
  });
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime.ownerController.signal.aborted)
      runtime.ownerController = new AbortController();
    return () => disposePlanSessionRuntime(runtime);
  }, []);

  useEffect(() => {
    runtimeRef.current.plans = state.plans;
  }, [state.plans]);

  const setUser = useCallback(
    (value: User | null) => dispatch({ type: "user", value }),
    [],
  );
  const setPlans = useCallback(
    (value: StoredPlan[]) => dispatch({ type: "plans", value }),
    [],
  );
  const setDraft = useCallback(
    (value: SetStateAction<StoredPlan | null>) =>
      dispatch({ type: "draft", value }),
    [],
  );
  const setLoading = useCallback(
    (value: boolean) => dispatch({ type: "loading", value }),
    [],
  );
  const setScreen = useCallback(
    (value: Screen) => dispatch({ type: "screen", value }),
    [],
  );
  const setSaveState = useCallback(
    (value: SaveState) => dispatch({ type: "save", value }),
    [],
  );
  const setLocalSaveRetry = useCallback(
    (value: SetStateAction<number>) => dispatch({ type: "retry", value }),
    [],
  );
  const beginPlanIntent = useCallback(
    () => ++runtimeRef.current.intentRevision,
    [],
  );
  const getOwnerSignal = useCallback(
    () => runtimeRef.current.ownerController.signal,
    [],
  );
  const beginAccount = useCallback(
    (
      accountId: string,
      ownerSignal = runtimeRef.current.ownerController.signal,
    ) => {
      const generation = beginOwnedPlanSessionRuntime(
        runtimeRef.current,
        accountId,
        ownerSignal,
      );
      if (generation === null) return null;
      dispatch({ type: "account-transition" });
      return generation;
    },
    [],
  );
  const invalidateSession = useCallback((notice: string) => {
    transitionPlanSessionRuntime(runtimeRef.current, null);
    dispatch({ type: "signed-out", notice });
  }, []);

  const phase: PlanSessionPhase = state.loading
    ? "loading"
    : !state.user
      ? "signed-out"
      : !state.draft
        ? "onboarding"
        : "ready";

  return {
    ...state,
    phase,
    runtimeRef,
    setUser,
    setPlans,
    setDraft,
    setLoading,
    setScreen,
    setSaveState,
    setLocalSaveRetry,
    beginPlanIntent,
    getOwnerSignal,
    beginAccount,
    invalidateSession,
  };
}

export type PlanSessionController = ReturnType<typeof usePlanSession>;

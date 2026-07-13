"use client";

import dynamic from "next/dynamic";
import { planIntentForYear, replacePlanIntent } from "./sync-state";
import { AuthView, LoadingView, Onboarding } from "./session-screens";
import { EXPIRED_SESSION_NOTICE } from "./plan-types";
import { useAccountLifecycle } from "./use-account-lifecycle";
import { usePlanSession } from "./use-plan-session";
import { usePlanSync } from "./use-plan-sync";

const PlanWorkspace = dynamic(() =>
  import("./plan-workspace").then(({ PlanWorkspace }) => PlanWorkspace),
);

export function FinancialApp() {
  const session = usePlanSession();
  const sync = usePlanSync(session);
  const account = useAccountLifecycle(session, sync);
  const {
    phase,
    user,
    plans,
    draft,
    screen,
    saveState,
    authNotice,
    runtimeRef,
    beginPlanIntent,
    getOwnerSignal,
    invalidateSession,
    setDraft,
    setPlans,
    setScreen,
  } = session;

  if (phase === "loading") return <LoadingView />;
  if (!user)
    return (
      <AuthView
        notice={authNotice}
        getOwnerSignal={getOwnerSignal}
        onAuthenticated={account.authenticate}
      />
    );
  if (!draft) {
    const onboardingGeneration = runtimeRef.current.accountGeneration;
    return (
      <Onboarding
        user={user}
        getOwnerSignal={getOwnerSignal}
        onCreated={(plan, ownerSignal) =>
          sync.adoptCreatedPlan(user, plan, onboardingGeneration, ownerSignal)
        }
        onRecover={(year, ownerSignal) =>
          sync.recoverCreatedPlan(user, year, onboardingGeneration, ownerSignal)
        }
        onSessionExpired={() => invalidateSession(EXPIRED_SESSION_NOTICE)}
      />
    );
  }

  return (
    <PlanWorkspace
      user={user}
      plans={plans}
      draft={draft}
      screen={screen}
      saveState={saveState}
      onRetryLocalSave={() => void sync.retryDeviceSave()}
      onRetrySync={() => void sync.retrySync()}
      onScreen={setScreen}
      onDraft={(nextDraft) => {
        beginPlanIntent();
        const nextPlans = replacePlanIntent(
          runtimeRef.current.plans,
          nextDraft,
        );
        runtimeRef.current.plans = nextPlans;
        setPlans(nextPlans);
        setDraft(nextDraft);
      }}
      onYear={(year) => {
        const plan = planIntentForYear(runtimeRef.current.plans, year);
        if (!plan) return;
        setDraft(plan);
        setScreen("plan");
      }}
      onCopyForward={account.copyForward}
      onLogout={() => account.closeAccount(false)}
      onDeleteAccount={() => account.closeAccount(true)}
    />
  );
}

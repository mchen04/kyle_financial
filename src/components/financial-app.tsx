"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import {
  planForFollowedYear,
  shouldFollowTodayForSession,
  shouldFollowTodayYear,
  type TodayYearIntent,
} from "@/domain/plan-selection";
import {
  applyDraftChange,
  planIntentForYear,
  replacePlanIntent,
} from "./sync-state";
import { AuthView, LoadingView, Onboarding } from "./session-screens";
import { EXPIRED_SESSION_NOTICE } from "./plan-types";
import { useAccountLifecycle } from "./use-account-lifecycle";
import { useLocalCalendarDay } from "./use-local-calendar-day";
import { usePlanSession } from "./use-plan-session";
import { usePlanSync } from "./use-plan-sync";

const PlanWorkspace = dynamic(() =>
  import("./plan-workspace").then(({ PlanWorkspace }) => PlanWorkspace),
);

export function FinancialApp() {
  const today = useLocalCalendarDay();
  const [yearIntent, setYearIntent] = useState<TodayYearIntent | null>(null);
  const session = usePlanSession();
  const sync = usePlanSync(session);
  const account = useAccountLifecycle(session, sync);
  const {
    phase,
    user,
    accountGeneration,
    plans,
    draft,
    location,
    saveState,
    authNotice,
    runtimeRef,
    beginPlanIntent,
    getOwnerSignal,
    invalidateSession,
    setDraft,
    setPlans,
    setLocation,
  } = session;
  const followTodayYear = shouldFollowTodayForSession(
    yearIntent,
    user?.id,
    accountGeneration,
  );
  const rolloverDraft = followTodayYear
    ? planForFollowedYear(plans, draft?.year, today)
    : null;
  const activeDraft = rolloverDraft ?? draft;
  const activeLocation = rolloverDraft
    ? ({ route: { screen: "home" } } as const)
    : location;

  if (phase === "loading") return <LoadingView />;
  if (!user)
    return (
      <AuthView
        notice={authNotice}
        getOwnerSignal={getOwnerSignal}
        onAuthenticated={account.authenticate}
      />
    );
  if (!activeDraft) {
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
      key={`${user.id}:${activeDraft.id}`}
      today={today}
      user={user}
      plans={plans}
      draft={activeDraft}
      location={activeLocation}
      saveState={saveState}
      onRetryLocalSave={() => void sync.retryDeviceSave()}
      onRetrySync={() => void sync.retrySync()}
      onLocation={(nextLocation) => {
        if (rolloverDraft) setDraft(rolloverDraft);
        setLocation(nextLocation);
      }}
      onDraft={(change) => {
        const currentDraft =
          planIntentForYear(runtimeRef.current.plans, activeDraft.year) ??
          activeDraft;
        const nextDraft = applyDraftChange(currentDraft, change);
        if (nextDraft === currentDraft) return;
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
        setYearIntent({
          accountId: user.id,
          accountGeneration,
          followToday: shouldFollowTodayYear(year, today),
        });
        setDraft(plan);
        setLocation({ route: { screen: "home" } });
      }}
      onCopyForward={async (sourcePlan, targetYear) => {
        const previousIntent = yearIntent;
        const copyIntent = {
          accountId: user.id,
          accountGeneration,
          followToday: shouldFollowTodayYear(targetYear, today),
        };
        setYearIntent(copyIntent);
        try {
          await account.copyForward(sourcePlan, targetYear);
        } catch (error) {
          setYearIntent((current) =>
            current === copyIntent ? previousIntent : current,
          );
          throw error;
        }
      }}
      onLogout={() => account.closeAccount(false)}
      onDeleteAccount={() => account.closeAccount(true)}
    />
  );
}

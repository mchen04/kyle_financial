"use client";

import {
  Activity,
  Check,
  ChevronRight,
  CircleHelp,
  CloudOff,
  House,
  Landmark,
  Plus,
  RefreshCw,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { User } from "@/domain/api-contracts";
import { PRODUCT_MARK, PRODUCT_NAME } from "@/domain/brand";
import { planYearHasStarted } from "@/domain/fast-log";
import { calculatePlan } from "@/domain/tax/engine";
import {
  advanceFollowedPeriod,
  FastLogSheet,
  initialPeriod,
  periodForYear,
} from "./daily-cockpit";
import { PlanWorkspaceContent } from "./plan-workspace-content";
import {
  acceptCalculablePlanDraft,
  retryActionForSaveState,
  type SaveState,
  type Screen,
  type StoredPlan,
  type WorkspaceLocation,
  type WorkspaceRoute,
} from "./plan-types";
import type { PlanDraftChange } from "./sync-state";
import { useFastLogController } from "./use-fast-log-controller";
import styles from "./financial-app.module.css";

export interface PlanWorkspaceProps {
  today: string;
  user: User;
  plans: StoredPlan[];
  draft: StoredPlan;
  location: WorkspaceLocation;
  saveState: SaveState;
  planAwaitingAuthority: boolean;
  onLocation: (location: WorkspaceLocation) => void;
  onDraft: (change: PlanDraftChange) => void;
  onYear: (year: number) => void;
  onCopyForward: (sourcePlan: StoredPlan, targetYear: number) => Promise<void>;
  onRetryLocalSave: () => void;
  onRetrySync: () => void;
  onLogout: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
}

const planScreens = new Set<Screen>([
  "plan",
  "plan-details",
  "benefits",
  "compare",
]);
const budgetScreens = new Set<Screen>([
  "budget",
  "category",
  "edit-budget",
  "manage-categories",
]);

/**
 * Which of the four tabs is highlighted. Monthly wrap is reachable from Home
 * and from Activity, so it keeps the highlight on the branch the reader came
 * from rather than jumping the bar to a tab they did not tap (C13: the tab bar
 * is identical on every surface and never moves under the reader).
 */
function activeTabFor(route: WorkspaceRoute): Screen {
  if (route.screen === "wrap")
    return route.returnTo === "activity" ? "activity" : "budget";
  if (budgetScreens.has(route.screen)) return "budget";
  if (planScreens.has(route.screen)) return "plan";
  return route.screen;
}

export function PlanWorkspace(props: PlanWorkspaceProps) {
  const { draft, location, onLocation, today } = props;
  const { route } = location;
  const { screen } = route;
  const activeTab = activeTabFor(route);
  const contentRef = useRef<HTMLElement>(null);
  const [calculationError, setCalculationError] = useState("");
  const [periodSelection, setPeriodSelection] = useState(() => ({
    period: initialPeriod(draft.year, today),
    selectedOn: today,
  }));
  const currentResult = useMemo(() => calculatePlan(draft), [draft]);

  const activePeriod = advanceFollowedPeriod(
    periodForYear(periodSelection.period, draft.year, today),
    periodSelection.selectedOn,
    today,
    draft.year,
  );
  const selectPeriod = (nextPeriod: typeof activePeriod) =>
    setPeriodSelection({ period: nextPeriod, selectedOn: today });
  useLayoutEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [screen]);

  const acceptDraft = (nextDraft: StoredPlan) => {
    const error = acceptCalculablePlanDraft(nextDraft, props.onDraft);
    if (error) {
      setCalculationError(error);
      return;
    }
    setCalculationError("");
  };
  const changeYear = (year: number) => {
    setCalculationError("");
    props.onYear(year);
  };
  const navigate = (nextRoute: WorkspaceRoute) => {
    onLocation({ route: nextRoute });
  };
  const fastLog = useFastLogController({
    location,
    onLocation,
    onDraft: props.onDraft,
    onValidationError: setCalculationError,
  });
  const showFastLog =
    screen === "home" || screen === "budget" || screen === "activity";
  const canCreateExpense = planYearHasStarted(draft.year, today);

  return (
    <div className={styles.appFrame}>
      <aside className={styles.sidebar}>
        <div className={styles.wordmark}>
          <span className={styles.brandMark}>{PRODUCT_MARK}</span>
          <span>{PRODUCT_NAME}</span>
        </div>
        <nav aria-label="Main navigation">
          <PrimaryNav tab={activeTab} onRoute={navigate} />
        </nav>
        <p className={styles.sidebarFoot}>
          Tax data {currentResult.appliedTaxYear}
        </p>
      </aside>
      <div className={styles.mainColumn}>
        <a className={styles.skipToMobileNav} href="#mobile-primary-navigation">
          Skip to primary navigation
        </a>
        <TopBar
          {...props}
          onYear={changeYear}
          onFastLog={
            showFastLog && canCreateExpense ? () => fastLog.open() : undefined
          }
        />
        {/* The plans on screen came from the device cache and the server's
            answer is still in flight, so this region's content is being
            updated. Assistive technology is told the same thing the reserved
            headline box tells a sighted reader. */}
        <main
          ref={contentRef}
          className={styles.content}
          aria-busy={props.planAwaitingAuthority || undefined}
        >
          {calculationError && (
            <p className={styles.syncNotice} role="alert">
              <CircleHelp size={16} /> {calculationError}
            </p>
          )}
          {/* This notice names the draft's year and asserts something about it.
              While the draft is known-provisional that assertion is provisional
              too — here it read "Tax data isn't available for 2025" about a
              cached year the server was about to replace with 2026, and then
              vanished, moving the whole surface up 65px. It is not suppressed:
              it renders the moment the plan is settled, which is the only
              moment it is true. */}
          {!props.planAwaitingAuthority &&
            currentResult.usesFallbackTaxTable && (
              <p className={styles.fallbackNotice}>
                <CircleHelp size={16} />
                <span>
                  Tax data isn&apos;t available for {draft.year}. This estimate
                  uses {currentResult.appliedTaxYear} data
                  {currentResult.usesFutureTaxTable
                    ? " as a rough later-year proxy"
                    : ""}
                  .
                </span>
              </p>
            )}
          <PlanWorkspaceContent
            today={today}
            user={props.user}
            plans={props.plans}
            draft={draft}
            route={route}
            saveState={props.saveState}
            planAwaitingAuthority={props.planAwaitingAuthority}
            result={currentResult}
            period={activePeriod}
            onPeriod={selectPeriod}
            onDraft={acceptDraft}
            onNavigate={navigate}
            onOpenTransaction={fastLog.open}
            canCreateExpense={canCreateExpense}
            onLogout={props.onLogout}
            onDeleteAccount={props.onDeleteAccount}
          />
        </main>
        {showFastLog && canCreateExpense && (
          <button
            className={`${styles.fastLogButton} ${
              screen === "home" ? styles.fastLogLabeled : ""
            }`}
            aria-label="Fast Log expense"
            onClick={() => fastLog.open()}
          >
            <Plus />
            {screen === "home" && <span>Fast Log</span>}
          </button>
        )}
        <nav
          id="mobile-primary-navigation"
          className={styles.bottomNav}
          aria-label="Main navigation"
          tabIndex={-1}
        >
          <PrimaryNav tab={activeTab} onRoute={navigate} />
        </nav>
      </div>
      {location.overlay?.kind === "fast-log" && (
        <FastLogSheet
          key={location.overlay.transactionId ?? "new"}
          today={today}
          plan={draft}
          state={location.overlay}
          onClose={fastLog.close}
          onDraft={fastLog.acceptTransition}
          onSaved={fastLog.saved}
          onDeleted={fastLog.deleted}
        />
      )}
      {fastLog.toast && (
        <div className={styles.expenseToast} role="status">
          <span>
            <Check /> {fastLog.toast.message}
          </span>
          {fastLog.toast.allowEdit && (
            <button onClick={fastLog.editToast}>Edit</button>
          )}
          <button onClick={fastLog.undoToast}>Undo</button>
        </div>
      )}
    </div>
  );
}

function PrimaryNav({
  tab,
  onRoute,
}: {
  tab: Screen;
  onRoute: (route: WorkspaceRoute) => void;
}) {
  return (
    <>
      <NavButton
        active={tab === "home"}
        icon={<House />}
        label="Home"
        onClick={() => onRoute({ screen: "home" })}
      />
      <NavButton
        active={tab === "budget"}
        icon={<WalletCards />}
        label="Budget"
        onClick={() => onRoute({ screen: "budget" })}
      />
      <NavButton
        active={tab === "activity"}
        icon={<Activity />}
        label="Activity"
        onClick={() => onRoute({ screen: "activity" })}
      />
      <NavButton
        active={tab === "plan"}
        icon={<Landmark />}
        label="Plan"
        onClick={() => onRoute({ screen: "plan" })}
      />
    </>
  );
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={active ? styles.navActive : ""}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function TopBar({
  plans,
  draft,
  location,
  saveState,
  onLocation,
  onYear,
  onCopyForward,
  onRetryLocalSave,
  onRetrySync,
  onFastLog,
  planAwaitingAuthority,
}: PlanWorkspaceProps & { onFastLog?: () => void }) {
  const { screen } = location.route;
  const [copyError, setCopyError] = useState("");
  const [copying, setCopying] = useState(false);
  const retryAction = retryActionForSaveState(saveState);
  const status = {
    saved: (
      <>
        <Check size={14} /> Saved
      </>
    ),
    saving: (
      <>
        <RefreshCw size={14} className={styles.spin} /> Saving
      </>
    ),
    offline: (
      <>
        <CloudOff size={14} /> Offline
      </>
    ),
    "local-error": (
      <>
        <CloudOff size={14} /> Device save failed
      </>
    ),
    "sync-error": (
      <>
        <CloudOff size={14} /> Sync failed
      </>
    ),
    rejected: (
      <>
        <CloudOff size={14} /> Change rejected
      </>
    ),
  }[saveState];

  async function copyNextYear() {
    const targetYear = draft.year + 1;
    if (
      !window.confirm(
        `Start a ${targetYear} plan with every ${draft.year} value copied forward?`,
      )
    )
      return;
    setCopyError("");
    setCopying(true);
    try {
      await onCopyForward(draft, targetYear);
    } catch (error) {
      setCopyError(
        error instanceof Error
          ? error.message
          : `Could not start the ${targetYear} plan.`,
      );
    } finally {
      setCopying(false);
    }
  }

  return (
    <>
      <header className={styles.topBar}>
        <div className={styles.mobileMark}>
          <span className={styles.brandMark}>{PRODUCT_MARK}</span>
        </div>
        <label className={styles.yearPicker}>
          <span>Plan year</span>
          <select
            aria-label="Plan year"
            value={draft.year}
            onChange={(event) => onYear(Number(event.target.value))}
          >
            {plans.map((plan) => (
              <option key={plan.year}>{plan.year}</option>
            ))}
          </select>
        </label>
        <span
          className={`${styles.syncStatus} ${
            saveState.endsWith("error") || saveState === "rejected"
              ? styles.syncError
              : ""
          }`}
          role="status"
        >
          {status}
        </span>
        {planScreens.has(screen) && (
          <button
            className={styles.secondaryButton}
            onClick={() => void copyNextYear()}
            disabled={copying}
          >
            {copying ? "Starting…" : `Start ${draft.year + 1}`}
            {!copying && <ChevronRight />}
          </button>
        )}
        {onFastLog && (
          <button
            className={styles.desktopFastLog}
            aria-label="Fast Log expense"
            onClick={onFastLog}
          >
            <Plus />
            {screen === "home" && <span>Fast Log</span>}
          </button>
        )}
        <button
          className={styles.profileButton}
          aria-label="Open account"
          aria-current={screen === "account" ? "page" : undefined}
          onClick={() => onLocation({ route: { screen: "account" } })}
        >
          <UserRound />
        </button>
      </header>
      {(saveState === "local-error" ||
        saveState === "sync-error" ||
        saveState === "rejected") && (
        <div className={styles.syncNotice} role="alert">
          <span>
            <strong>
              {saveState === "local-error"
                ? "This device could not store the latest change."
                : saveState === "rejected"
                  ? "The server rejected the latest change."
                  : "Not synced to the server."}
            </strong>{" "}
            {saveState === "local-error"
              ? "Keep this page open while you retry local storage."
              : saveState === "rejected"
                ? "Review that edited value and change it again; the server copy is unchanged."
                : "This change is safe on this device. Retry before leaving."}
          </span>
          {retryAction && (
            <button
              className={styles.secondaryButton}
              onClick={() => {
                if (retryAction === "device") onRetryLocalSave();
                else onRetrySync();
              }}
            >
              {retryAction === "device" ? "Retry device save" : "Retry sync"}
            </button>
          )}
        </div>
      )}
      {/* The restore path sets "offline" before the sync engine has had a chance
          to say anything, so during the known-provisional window this 65px
          banner asserts the device is offline while it is in fact fetching, and
          then removes itself — moving the whole surface up 65px, three times
          the CLS bar. `planAwaitingAuthority` is only ever set when
          `navigator.onLine` is true, so a device that really is offline never
          reaches this branch and its banner, its cached plan and its queued
          edits are exactly what they were. */}
      {saveState === "offline" && !planAwaitingAuthority && (
        <div className={styles.offlineNotice} role="status">
          <span>
            Showing the latest copy saved on this device. Offline edits stay
            queued here and sync when the connection returns.
          </span>
          <button className={styles.secondaryButton} onClick={onRetrySync}>
            Retry sync
          </button>
        </div>
      )}
      {copyError && (
        <p className={styles.syncNotice} role="alert">
          Could not start the {draft.year + 1} plan. {copyError}
        </p>
      )}
    </>
  );
}

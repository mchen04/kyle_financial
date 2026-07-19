"use client";

import dynamic from "next/dynamic";
import {
  Check,
  ChevronRight,
  CircleHelp,
  CloudOff,
  ReceiptText,
  RefreshCw,
  Settings2,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { User } from "@/domain/api-contracts";
import { calculatePlan } from "@/domain/tax/engine";
import {
  acceptCalculablePlanDraft,
  retryActionForSaveState,
  type SaveState,
  type Screen,
  type StoredPlan,
} from "./plan-types";
import {
  currentHsaFamilyAllocation,
  type HsaFamilyAllocation,
} from "./hsa-controls";
import { PlanScreen } from "./plan-screen";
import styles from "./financial-app.module.css";

const AccountScreen = dynamic(() =>
  import("./account-screen").then(({ AccountScreen }) => AccountScreen),
);
const BenefitsScreen = dynamic(() =>
  import("./benefits-screen").then(({ BenefitsScreen }) => BenefitsScreen),
);
const CompareScreen = dynamic(() =>
  import("./compare-screen").then(({ CompareScreen }) => CompareScreen),
);

export interface PlanWorkspaceProps {
  user: User;
  plans: StoredPlan[];
  draft: StoredPlan;
  screen: Screen;
  saveState: SaveState;
  onScreen: (screen: Screen) => void;
  onDraft: (plan: StoredPlan) => void;
  onYear: (year: number) => void;
  onCopyForward: (sourcePlan: StoredPlan, targetYear: number) => Promise<void>;
  onRetryLocalSave: () => void;
  onRetrySync: () => void;
  onLogout: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
}

export function PlanWorkspace(props: PlanWorkspaceProps) {
  const { draft, screen, onScreen } = props;
  const [calculationError, setCalculationError] = useState("");
  const [hsaFamilyAllocationIntents, setHsaFamilyAllocationIntents] = useState(
    () => new Map<string, HsaFamilyAllocation>(),
  );
  const currentResult = useMemo(() => calculatePlan(draft), [draft]);
  const currentHsaAllocation = currentHsaFamilyAllocation(draft);
  const preferredHsaAllocation =
    currentHsaAllocation ?? hsaFamilyAllocationIntents.get(draft.id);
  const rememberHsaAllocation = (allocation: HsaFamilyAllocation) => {
    setHsaFamilyAllocationIntents((current) => {
      const next = new Map(current);
      next.set(draft.id, allocation);
      return next;
    });
  };
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
  return (
    <div className={styles.appFrame}>
      <aside className={styles.sidebar}>
        <div className={styles.wordmark}>
          <span className={styles.brandMark}>KF</span>
          <span>
            Kyle
            <br />
            Financial
          </span>
        </div>
        <nav aria-label="Main navigation">
          <NavButton
            active={screen === "plan"}
            icon={<ReceiptText />}
            label="Plan"
            onClick={() => onScreen("plan")}
          />
          <NavButton
            active={screen === "benefits"}
            icon={<WalletCards />}
            label="Benefits"
            onClick={() => onScreen("benefits")}
          />
          <NavButton
            active={screen === "compare"}
            icon={<TrendingUp />}
            label="Compare"
            onClick={() => onScreen("compare")}
          />
          <NavButton
            active={screen === "account"}
            icon={<Settings2 />}
            label="Account"
            onClick={() => onScreen("account")}
          />
        </nav>
        <p className={styles.sidebarFoot}>
          Planning estimate
          <br />
          Tax data {currentResult.appliedTaxYear}
        </p>
      </aside>
      <div className={styles.mainColumn}>
        <a className={styles.skipToMobileNav} href="#mobile-primary-navigation">
          Skip to primary navigation
        </a>
        <TopBar {...props} onYear={changeYear} />
        <nav
          id="mobile-primary-navigation"
          className={styles.bottomNav}
          aria-label="Main navigation"
          tabIndex={-1}
        >
          <NavButton
            active={screen === "plan"}
            icon={<ReceiptText />}
            label="Plan"
            onClick={() => onScreen("plan")}
          />
          <NavButton
            active={screen === "benefits"}
            icon={<WalletCards />}
            label="Benefits"
            onClick={() => onScreen("benefits")}
          />
          <NavButton
            active={screen === "compare"}
            icon={<TrendingUp />}
            label="Compare"
            onClick={() => onScreen("compare")}
          />
          <NavButton
            active={screen === "account"}
            icon={<Settings2 />}
            label="Account"
            onClick={() => onScreen("account")}
          />
        </nav>
        <main className={styles.content}>
          {calculationError && (
            <p className={styles.syncNotice} role="alert">
              <CircleHelp size={16} /> {calculationError}
            </p>
          )}
          {currentResult.usesFallbackTaxTable && (
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
          {screen === "plan" && (
            <PlanScreen
              draft={draft}
              result={currentResult}
              onDraft={acceptDraft}
              preferredHsaAllocation={preferredHsaAllocation}
              onHsaAllocationIntent={rememberHsaAllocation}
            />
          )}
          {screen === "benefits" && (
            <BenefitsScreen
              draft={draft}
              result={currentResult}
              onDraft={acceptDraft}
            />
          )}
          {screen === "compare" && <CompareScreen plans={props.plans} />}
          {screen === "account" && <AccountScreen {...props} />}
        </main>
      </div>
    </div>
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
  saveState,
  onYear,
  onCopyForward,
  onRetryLocalSave,
  onRetrySync,
}: PlanWorkspaceProps) {
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
          <span className={styles.brandMark}>KF</span>
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
          className={`${styles.syncStatus} ${saveState.endsWith("error") || saveState === "rejected" ? styles.syncError : ""}`}
          role="status"
        >
          {status}
        </span>
        <button
          className={styles.secondaryButton}
          onClick={() => void copyNextYear()}
          disabled={copying}
        >
          {copying ? "Starting…" : "Start"}{" "}
          {!copying && (
            <>
              {draft.year + 1}
              <span className={styles.nextYearSuffix}> plan</span>
              <ChevronRight size={16} />
            </>
          )}
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
      {saveState === "offline" && (
        <div className={styles.offlineNotice} role="status">
          <span>
            Edits made offline stay queued on this device and sync when the
            connection returns.
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

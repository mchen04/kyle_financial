"use client";

import { ChevronRight } from "lucide-react";
import type { CategoryRollup, SelectedPeriod } from "@/domain/daily-money";
import {
  buildMonthlyWrap,
  calculateAnnualSavingsProjection,
  observedTransactionsThrough,
  periodLabel,
  rollupBudget,
} from "@/domain/daily-money";
import type { PlanResult } from "@/domain/tax/engine";
import { BackPage } from "./cockpit-back-page";
import { monthlyWrapPhase, wrapBalanceCopy } from "./cockpit-copy";
import { initialMonth, savingsSources } from "./cockpit-period-control";
import { CategoryRow, Metric } from "./cockpit-rows";
import { PlanAllocationChart } from "./plan-allocation-chart";
import { BufferedTextInput } from "./buffered-text-input";
import { MoneyFlow } from "./plan-visualizations";
import {
  centsFromInput,
  money,
  type Screen,
  type StoredPlan,
} from "./plan-types";
import styles from "./cockpit-shared.module.css";

export function MonthlyWrapSurface({
  today,
  plan,
  result,
  period,
  backTo,
  onBack,
}: {
  today: string;
  plan: StoredPlan;
  result: PlanResult;
  period: SelectedPeriod;
  backTo: "home" | "activity";
  onBack: () => void;
}) {
  const backLabel = backTo === "activity" ? "Activity" : "Home";
  const month =
    period.kind === "month"
      ? period
      : {
          kind: "month" as const,
          year: period.year,
          month: initialMonth(period.year, today),
        };
  const phase = monthlyWrapPhase(month.year, month.month, today);
  if (phase === "future") {
    return (
      <BackPage
        title={`${periodLabel(month)} wrap`}
        backLabel={backLabel}
        onBack={onBack}
      >
        <section className={styles.panel}>
          <p className={styles.eyebrow}>Forecast not started</p>
          <h2>This month has not begun.</h2>
          <p className={styles.emptyState}>
            Return when the month begins to see live spending variance and
            savings impact.
          </p>
        </section>
      </BackPage>
    );
  }
  const wrap = buildMonthlyWrap(
    plan.expenses,
    observedTransactionsThrough(plan.transactions, today),
    month,
    savingsSources(result),
    plan.startingSavingsCents,
  );
  const livePreview = phase === "current";
  const balance = wrapBalanceCopy(wrap.budget.safeToSpendCents, phase);
  return (
    <BackPage
      title={`${periodLabel(month)} wrap`}
      backLabel={backLabel}
      onBack={onBack}
    >
      <section className={styles.wrapHero}>
        <p>{balance.label}</p>
        <strong>{money(balance.valueCents)}</strong>
        <span>
          Projected savings impact{" "}
          <b>{money(wrap.savings.projectedSavingsChangeCents)}</b>
        </span>
        {wrap.savings.projectedEndingSavingsCents !== undefined && (
          <span>
            Projected ending savings{" "}
            <b>{money(wrap.savings.projectedEndingSavingsCents)}</b>
          </span>
        )}
        {livePreview && (
          <span>
            Unlogged obligations are not savings. This projection becomes a
            final result only when the month closes.
          </span>
        )}
      </section>
      <section className={styles.panel}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Budget versus actual</p>
            <h2>Total allocated, spent, and funded</h2>
          </div>
        </div>
        <dl className={styles.mathBreakdown}>
          <Metric label="Total budget" value={wrap.budget.allocatedCents} />
          <Metric label="Spent & funded" value={wrap.budget.actualCents} />
          <Metric
            label="Total remaining"
            value={wrap.budget.remainingCents}
            signed
          />
        </dl>
      </section>
      <div className={styles.homeGrid}>
        <WrapList
          title={livePreview ? "Currently unspent" : "Under budget"}
          items={wrap.underBudget}
        />
        <WrapList title="Overruns" items={wrap.overBudget} />
      </div>
      <section className={styles.panel}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>How the savings impact is built</h2>
          </div>
        </div>
        <dl className={styles.mathBreakdown}>
          <Metric
            label="Planned cash savings"
            value={wrap.savings.plannedCashSavingsCents}
          />
          <Metric
            label="Payroll savings"
            value={wrap.savings.payrollSavingsCents}
          />
          <Metric
            label="Employer savings"
            value={wrap.savings.employerSavingsCents}
          />
          <Metric
            label="Saving allocations"
            value={wrap.savings.plannedSavingAllocationCents}
          />
          <Metric
            label="Spending variance"
            value={wrap.savings.spendingVarianceCents}
            signed
          />
          <Metric
            label="Saving funding variance"
            value={wrap.savings.savingFundingVarianceCents}
            signed
          />
        </dl>
        <p className={styles.mathNote}>
          Spending below plan raises the projection; spending above plan lowers
          it. Saving-category funding replaces its planned amount through the
          funding variance, so neither side is counted twice.
        </p>
      </section>
    </BackPage>
  );
}

function WrapList({
  title,
  items,
}: {
  title: string;
  items: readonly CategoryRollup[];
}) {
  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>{title}</p>
      {items.length ? (
        <div className={styles.categoryRows}>
          {items.map((item) => (
            <CategoryRow key={item.category.id} item={item} />
          ))}
        </div>
      ) : (
        <p className={styles.emptyState}>Nothing to show here.</p>
      )}
    </section>
  );
}

export function PlanHub({
  today,
  plan,
  result,
  onScreen,
  onDraft,
}: {
  today: string;
  plan: StoredPlan;
  result: PlanResult;
  onScreen: (screen: Screen) => void;
  onDraft: (plan: StoredPlan) => void;
}) {
  const todayYear = Number(today.slice(0, 4));
  const futurePlan = plan.year > todayYear;
  const observedTransactions = observedTransactionsThrough(
    plan.transactions,
    today,
  );
  const annualBudget = rollupBudget(plan.expenses, observedTransactions, {
    kind: "year",
    year: plan.year,
  });
  const observedBudget =
    plan.year > todayYear
      ? undefined
      : rollupBudget(
          plan.expenses,
          observedTransactions,
          plan.year === todayYear
            ? { kind: "ytd", year: plan.year, throughDate: today }
            : { kind: "year", year: plan.year },
        );
  const annualProjection = calculateAnnualSavingsProjection(
    annualBudget,
    observedBudget,
    savingsSources(result),
    plan.startingSavingsCents,
  );
  return (
    <div className={`${styles.surfaceStack} ${styles.planHub}`}>
      <header className={styles.surfaceHeader}>
        <div>
          <p className={styles.eyebrow}>{plan.year} annual plan</p>
          <h1>{money(result.cashSavingsAnnualCents)} cash savings planned.</h1>
          <p>
            {money(result.savingsMonthlyCents)} each month after tax, benefits,
            and planned allocations.
          </p>
        </div>
      </header>
      <section className={styles.planOutcome}>
        <div>
          <p className={styles.eyebrow}>Annual outcome</p>
          <strong>{money(result.cashSavingsAnnualCents)}</strong>
          <span>cash savings</span>
        </div>
        <div>
          <p className={styles.eyebrow}>Monthly outcome</p>
          <strong>{money(result.savingsMonthlyCents)}</strong>
          <span>cash savings</span>
        </div>
        <label>
          Starting savings
          <span>
            $
            <BufferedTextInput
              inputMode="decimal"
              value={
                plan.startingSavingsCents === undefined
                  ? ""
                  : (plan.startingSavingsCents / 100).toString()
              }
              placeholder="Optional"
              onValue={(value) =>
                onDraft({
                  ...plan,
                  startingSavingsCents:
                    value === "" ? undefined : centsFromInput(value),
                })
              }
            />
          </span>
        </label>
        <div>
          <p className={styles.eyebrow}>
            {futurePlan
              ? annualProjection.projectedEndingSavingsCents === undefined
                ? "Planned savings change"
                : "Planned ending savings"
              : annualProjection.projectedEndingSavingsCents === undefined
                ? "Projected savings change"
                : "Projected ending savings"}
          </p>
          <strong>
            {money(
              annualProjection.projectedEndingSavingsCents ??
                annualProjection.projectedSavingsChangeCents,
            )}
          </strong>
          <span>
            {futurePlan
              ? plan.startingSavingsCents === undefined
                ? `${money(
                    annualProjection.plannedSavingsChangeCents,
                    2,
                  )} planned total (cash, payroll/employer, allocations); observed variance begins when the year starts`
                : `${money(plan.startingSavingsCents, 2)} start + ${money(
                    annualProjection.plannedSavingsChangeCents,
                    2,
                  )} planned total (cash, payroll/employer, allocations); observed variance begins when the year starts`
              : annualProjection.projectedEndingSavingsCents === undefined
                ? `${money(
                    annualProjection.plannedSavingsChangeCents,
                    2,
                  )} planned total (cash, payroll/employer, allocations) + ${money(
                    annualProjection.observedSpendingVarianceCents,
                    2,
                  )} spending variance + ${money(
                    annualProjection.observedSavingFundingVarianceCents,
                    2,
                  )} funding variance`
                : `${money(plan.startingSavingsCents ?? 0, 2)} start + ${money(
                    annualProjection.plannedSavingsChangeCents,
                    2,
                  )} planned total (cash, payroll/employer, allocations) + ${money(
                    annualProjection.observedSpendingVarianceCents,
                    2,
                  )} spending variance + ${money(
                    annualProjection.observedSavingFundingVarianceCents,
                    2,
                  )} funding variance`}
          </span>
        </div>
      </section>
      <div className={styles.planGrid}>
        <PlanAllocationChart plan={plan} />
        <MoneyFlow result={result} expenses={plan.expenses} />
      </div>
      <div className={styles.linkGrid}>
        <PlanLink
          label="Plan details"
          detail="Income, tax, and allocation inputs"
          onClick={() => onScreen("plan-details")}
        />
        <PlanLink
          label="Benefits"
          detail="Payroll and employer contributions"
          onClick={() => onScreen("benefits")}
        />
        <PlanLink
          label="Compare years"
          detail="See plans side by side"
          onClick={() => onScreen("compare")}
        />
        <PlanLink
          label="Edit budget"
          detail="Change planned category amounts"
          onClick={() => onScreen("edit-budget")}
        />
      </div>
    </div>
  );
}

function PlanLink({
  label,
  detail,
  onClick,
}: {
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button className={styles.actionCard} onClick={onClick}>
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <ChevronRight />
    </button>
  );
}

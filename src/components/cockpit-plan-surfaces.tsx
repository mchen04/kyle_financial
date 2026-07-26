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
          <p className={styles.groupLabel}>Forecast not started</p>
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
            {/* C5. The eyebrow and the heading said the same thing twice, and
                the heading spent 55px and two lines doing it. One of them is
                the subject of the section; the other was a restatement. */}
            <h2>Budget versus actual</h2>
          </div>
        </div>
        <dl className={styles.mathBreakdown}>
          <Metric label="Total budget" value={wrap.budget.allocatedCents} />
          <Metric label="Spent & funded" value={wrap.budget.actualCents} />
          <Metric
            label="Left to spend"
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
      <p className={styles.groupLabel}>{title}</p>
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
  // The two branches that used to print a "… start +" term, kept exactly: a
  // future plan showed it when a starting balance had been entered, and a
  // current one whenever the projection had an ending balance to be measured
  // from (in which case it printed `?? 0`, which is what the fallback is).
  const showStartingBalance = futurePlan
    ? plan.startingSavingsCents !== undefined
    : annualProjection.projectedEndingSavingsCents !== undefined;
  return (
    <div className={`${styles.surfaceStack} ${styles.planHub}`}>
      {/* C2/C7. This was a 46.8px two-line *sentence* — "$9,837 cash savings
          planned." — which cost 98px of the one screen that decides whether the
          reader has to scroll, restated a figure the money-flow legend already
          prints in full below, and was not the number this surface exists to
          answer. It is now the same shape Budget uses: a 13px eyebrow naming
          the screen and a 24px headline carrying the answer and nothing else,
          with its one-line qualifier under it (C7). The annual figure is not
          reprinted here at all, so it is stated exactly once on the surface, in
          the money-flow legend that computes it. */}
      <header className={styles.surfaceHeader}>
        <div>
          <p className={styles.eyebrow}>{plan.year} annual plan</p>
          <h1>
            {money(Math.abs(result.savingsMonthlyCents))}{" "}
            {result.savingsMonthlyCents < 0
              ? "short each month"
              : "saved each month"}
          </h1>
        </div>
      </header>
      <p className={styles.budgetNote}>
        Cash left after tax, benefits, and every planned allocation.
      </p>
      {/* Each figure once. The monthly total used to be both this section's
          "Monthly outcome" cell and, in words, the headline above; it is now
          only the headline, so this section carries the two facts the headline
          does not: what the year is projected to end at, and the starting
          balance that projection is measured from. */}
      <section className={styles.planOutcome}>
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
          <p className={styles.groupLabel}>
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
        </div>
      </section>
      {/* The same four terms, to the same cent, in the same order — as the row
          list this app already gives the identical concept on Monthly wrap
          ("How the savings impact is built") instead of as one run-on sentence.
          It was a single 90px paragraph, which is one datum per 90px on the
          least dense primary tab in the app, and it read as prose rather than
          as the arithmetic it is. Nothing is added, removed or rounded: the
          conditions below are the four branches the sentence had, term for
          term. C1/C5/C6. */}
      <dl className={styles.mathBreakdown}>
        {showStartingBalance && (
          <ProjectionTerm
            label="Starting balance"
            valueCents={plan.startingSavingsCents ?? 0}
          />
        )}
        <ProjectionTerm
          label="Planned total"
          valueCents={annualProjection.plannedSavingsChangeCents}
        />
        {!futurePlan && (
          <ProjectionTerm
            label="Spending variance"
            valueCents={annualProjection.observedSpendingVarianceCents}
            signed
          />
        )}
        {!futurePlan && (
          <ProjectionTerm
            label="Funding variance"
            valueCents={annualProjection.observedSavingFundingVarianceCents}
            signed
          />
        )}
      </dl>
      <p className={styles.budgetNote}>
        Planned total is cash, payroll/employer, and allocations.
        {futurePlan ? " Observed variance begins when the year starts." : ""}
      </p>
      {/* C5. Four homogeneous units, scanned down a column, acted on one at a
          time — that is a row list by the rule's own terms, and it fails the
          card test on the "no more than 3 on the surface" clause outright. Each
          was an 80px card plus a 16px gap; each is now a 48px row separated by a
          hairline (C1, C4), which is 192px back and the same row the Monthly
          wrap link already uses everywhere else in the app. */}
      <div className={styles.linkGrid}>
        <PlanLink
          label="Plan details"
          detail="Income, tax, allocations"
          onClick={() => onScreen("plan-details")}
        />
        <PlanLink
          label="Benefits"
          detail="Payroll and employer"
          onClick={() => onScreen("benefits")}
        />
        <PlanLink
          label="Compare years"
          detail="Every saved year"
          onClick={() => onScreen("compare")}
        />
        <PlanLink
          label="Edit budget"
          detail="Planned category amounts"
          onClick={() => onScreen("edit-budget")}
        />
      </div>
      {/* DEN-6/C7. The two charts used to sit between the figures and the
          destinations, so a 300px donut restating one number was what a reader
          met first and every link on the hub started below the fold. The
          surface's own facts and its four destinations come first; the charts
          explain them and follow them. */}
      <div className={styles.planGrid}>
        <PlanAllocationChart plan={plan} />
        <MoneyFlow result={result} expenses={plan.expenses} />
      </div>
    </div>
  );
}

/**
 * One term of the projection arithmetic. `Metric` is not reused because it
 * rounds to the dollar and these four terms were published to the cent; the
 * figures must not change precision just because their container did.
 */
function ProjectionTerm({
  label,
  valueCents,
  signed = false,
}: {
  label: string;
  valueCents: number;
  signed?: boolean;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd data-negative={valueCents < 0}>
        {signed && valueCents > 0 ? "+" : ""}
        {money(valueCents, 2)}
      </dd>
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
    <button className={styles.navRow} data-lead="none" onClick={onClick}>
      <strong>{label}</strong>
      <em>{detail}</em>
      <ChevronRight />
    </button>
  );
}

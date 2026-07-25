"use client";

export { FastLogSheet, type FastLogState } from "./fast-log-sheet";
export {
  EditBudgetSurface,
  ManageCategoriesSurface,
} from "./cockpit-category-settings";
export {
  ActivitySurface,
  CategoryDetailSurface,
} from "./cockpit-activity-surfaces";
export { MonthlyWrapSurface, PlanHub } from "./cockpit-plan-surfaces";
export {
  advanceFollowedPeriod,
  initialPeriod,
  periodForYear,
} from "./cockpit-period-control";

import { CalendarDays, ChevronRight } from "lucide-react";
import { guidanceBucket } from "@/domain/budget";
import {
  categoryRollupIsVisible,
  observedTransactionsThrough,
  periodLabel,
  rollupBudget,
  transactionIsInPeriod,
  type SelectedPeriod,
} from "@/domain/daily-money";
import type { PlanResult } from "@/domain/tax/engine";
import {
  homeSavingsImpactCents,
  homeSavingsImpactLabel,
} from "./cockpit-home-projection";
import { PeriodControl, savingsSources } from "./cockpit-period-control";
import { selectedPeriodPhase } from "./cockpit-period-phase";
import { CategoryRow, Metric, TransactionRows } from "./cockpit-rows";
import { money, type Screen, type StoredPlan } from "./plan-types";
import styles from "./cockpit-shared.module.css";

export function HomeSurface({
  today,
  plan,
  result,
  period,
  compactForOffline,
  onPeriod,
  onScreen,
  onCategory,
  onEditTransaction,
}: {
  today: string;
  plan: StoredPlan;
  result: PlanResult;
  period: SelectedPeriod;
  compactForOffline: boolean;
  onPeriod: (period: SelectedPeriod) => void;
  onScreen: (screen: Screen) => void;
  onCategory: (id: string) => void;
  onEditTransaction: (id: string) => void;
}) {
  const phase = selectedPeriodPhase(period, today);
  const observedTransactions = observedTransactionsThrough(
    plan.transactions,
    today,
  );
  const effectiveTransactions = phase === "future" ? [] : observedTransactions;
  const rollup = rollupBudget(plan.expenses, effectiveTransactions, period);
  const savingsImpactCents = homeSavingsImpactCents(
    plan.expenses,
    plan.transactions,
    period,
    savingsSources(result),
    today,
  );
  const attention = rollup.categories
    .filter(
      ({ remainingCents, category }) =>
        guidanceBucket(category) !== "saving" && remainingCents < 0,
    )
    .toSorted((left, right) => left.remainingCents - right.remainingCents)
    .slice(0, 3);
  const recent = effectiveTransactions
    .filter((transaction) => transactionIsInPeriod(transaction, period))
    .toSorted(
      (left, right) =>
        right.date.localeCompare(left.date) ||
        right.updatedAt.localeCompare(left.updatedAt),
    )
    // Two rows, not four: Home's job is "correct it while it is fresh", and the
    // full ledger is one tap away on the Activity tab (HIG-L1, DEN-6).
    .slice(0, 2);
  const progress =
    rollup.spendingAllocatedCents === 0
      ? 0
      : Math.min(
          100,
          (rollup.spendingActualCents / rollup.spendingAllocatedCents) * 100,
        );
  const over = rollup.safeToSpendCents < 0;
  const unstarted = phase === "future";
  return (
    <div
      className={`${styles.surfaceStack} ${styles.homeSurface} ${
        compactForOffline ? styles.offlineHome : ""
      }`}
    >
      <header className={styles.surfaceHeader}>
        <div>
          <h1>{unstarted ? "Your plan, ahead." : "Your money, right now."}</h1>
        </div>
        <PeriodControl period={period} today={today} onPeriod={onPeriod} />
      </header>

      <section className={styles.runwayCard}>
        <div className={styles.runwayHeadline}>
          <span>
            {unstarted
              ? "Planned spending"
              : over
                ? "Over budget"
                : "Left to spend"}
          </span>
          <strong data-negative={over}>
            {money(
              unstarted
                ? rollup.spendingAllocatedCents
                : Math.abs(rollup.safeToSpendCents),
            )}
          </strong>
          {/* The period is named by the month picker directly above, so it is
              not restated here. */}
          <small>
            {unstarted ? (
              <>
                {money(rollup.spendingAllocatedCents, 2)} planned; actuals begin
                when the period starts
              </>
            ) : (
              <>
                exact: {money(rollup.spendingAllocatedCents, 2)} −{" "}
                {money(rollup.spendingActualCents, 2)} ={" "}
                {money(rollup.safeToSpendCents, 2)}
              </>
            )}
          </small>
        </div>
        <div
          className={styles.runwayTrack}
          role="meter"
          aria-label="Spending budget used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <i style={{ width: `${progress}%` }} />
        </div>
        {/* Budgeted, spent and remaining are the three terms of the exact line
            directly above, to the cent. Only the savings impact is a fact the
            equation does not already carry, so only it gets its own row. */}
        <dl className={styles.runwayMetrics}>
          <Metric
            label={homeSavingsImpactLabel(period, today)}
            value={savingsImpactCents}
            signed
          />
        </dl>
      </section>

      <section className={styles.rowGroup}>
        <h2 className={styles.groupLabel}>Needs attention</h2>
        {attention.length ? (
          <div className={styles.categoryRows}>
            {attention.map((item) => (
              <CategoryRow
                key={item.category.id}
                item={item}
                onClick={() => onCategory(item.category.id)}
              />
            ))}
          </div>
        ) : (
          <p className={styles.groupEmpty}>
            Nothing is over budget in this period.
          </p>
        )}
      </section>

      <section className={styles.rowGroup}>
        <h2 className={styles.groupLabel}>Recent activity</h2>
        {recent.length ? (
          <TransactionRows
            transactions={recent}
            categories={rollup.categories.map(({ category }) => category)}
            onEdit={onEditTransaction}
          />
        ) : (
          <p className={styles.groupEmpty}>
            No expenses logged for this period yet.
          </p>
        )}
      </section>

      <div className={styles.rowGroup}>
        <button
          className={styles.navRow}
          onClick={() => onScreen("wrap")}
          disabled={period.kind !== "month" || unstarted}
        >
          <CalendarDays />
          <strong>Monthly wrap</strong>
          <em>
            {unstarted
              ? "Starts with the period"
              : period.kind === "month"
                ? periodLabel(period)
                : "Choose a month"}
          </em>
          <ChevronRight />
        </button>
      </div>
    </div>
  );
}

export function BudgetSurface({
  today,
  plan,
  period,
  onPeriod,
  onScreen,
  onCategory,
}: {
  today: string;
  plan: StoredPlan;
  period: SelectedPeriod;
  onPeriod: (period: SelectedPeriod) => void;
  onScreen: (screen: Screen) => void;
  onCategory: (id: string) => void;
}) {
  const unstarted = selectedPeriodPhase(period, today) === "future";
  const observedTransactions = observedTransactionsThrough(
    plan.transactions,
    today,
  );
  const rollup = rollupBudget(
    plan.expenses,
    unstarted ? [] : observedTransactions,
    period,
  );
  // One list in plan order. The old surface rendered every over-budget or
  // near-limit category twice — once in a "Needs attention" block, once here —
  // and that block appeared and disappeared with the selected period, which was
  // this surface's largest layout shift. Over-budget rows keep their own
  // warning colour and read "$81 over" in place of a negative remainder, so
  // nothing about them is hidden by dropping the duplicate.
  const visibleCategories = rollup.categories.filter(categoryRollupIsVisible);
  return (
    <div className={`${styles.surfaceStack} ${styles.budgetSurface}`}>
      <header className={styles.surfaceHeader}>
        <div>
          <p className={styles.eyebrow}>Budget</p>
          <h1>
            {unstarted
              ? `${money(rollup.spendingAllocatedCents)} planned spending`
              : `${money(Math.abs(rollup.safeToSpendCents))} ${
                  rollup.safeToSpendCents < 0 ? "over" : "safe to spend"
                }`}
          </h1>
        </div>
        <PeriodControl period={period} today={today} onPeriod={onPeriod} />
      </header>
      {/* One box in both period phases: identical labels, identical row count,
          so stepping the month changes digits and never geometry (C9). */}
      <dl className={styles.budgetMath}>
        <div>
          <dt>Spent or funded</dt>
          <dd>{money(rollup.actualCents, 2)}</dd>
        </div>
        <div>
          <dt>Allocated total</dt>
          <dd>{money(rollup.allocatedCents, 2)}</dd>
        </div>
        <div>
          <dt>Saving reserved</dt>
          <dd>{money(rollup.savingAllocatedCents, 2)}</dd>
        </div>
        <div>
          <dt>Safe to spend</dt>
          <dd data-negative={rollup.safeToSpendCents < 0}>
            {money(rollup.safeToSpendCents, 2)}
          </dd>
        </div>
      </dl>
      <p className={styles.budgetNote}>
        {unstarted
          ? `Actual spending begins when ${periodLabel(period)} starts.`
          : "Safe to spend holds saving allocations in reserve."}
      </p>
      <div className={styles.budgetActions}>
        <button onClick={() => onScreen("edit-budget")}>Edit budget</button>
        <button onClick={() => onScreen("manage-categories")}>
          Manage categories
        </button>
      </div>
      <section className={styles.rowGroup}>
        <h2 className={styles.groupLabel}>All categories</h2>
        <div className={styles.categoryRows}>
          {visibleCategories.map((item) => (
            <CategoryRow
              key={item.category.id}
              item={item}
              onClick={() => onCategory(item.category.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

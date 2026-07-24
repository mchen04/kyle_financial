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

import { CalendarDays, ChevronRight, Sparkles } from "lucide-react";
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
    .slice(0, 4);
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
      className={`${styles.surfaceStack} ${
        compactForOffline ? styles.offlineHome : ""
      }`}
    >
      <header className={styles.surfaceHeader}>
        <div>
          <p className={styles.eyebrow}>
            {unstarted ? "Planned money cockpit" : "Today's money cockpit"}
          </p>
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
          <small>
            {unstarted ? (
              <>
                {periodLabel(period)} ·{" "}
                {money(rollup.spendingAllocatedCents, 2)} planned; actuals begin
                when the period starts
              </>
            ) : (
              <>
                {periodLabel(period)} · exact:{" "}
                {money(rollup.spendingAllocatedCents, 2)} −{" "}
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
        <dl className={styles.runwayMetrics}>
          <Metric
            label={unstarted ? "Spending plan" : "Budgeted"}
            value={rollup.spendingAllocatedCents}
          />
          <Metric
            label={unstarted ? "Actuals to date" : "Spent"}
            value={rollup.spendingActualCents}
          />
          <Metric
            label={unstarted ? "Planned available" : "Remaining"}
            value={rollup.spendingRemainingCents}
          />
          <Metric
            label={homeSavingsImpactLabel(period, today)}
            value={savingsImpactCents}
            signed
          />
        </dl>
      </section>

      <div className={styles.homeGrid}>
        <section className={styles.panel}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Needs attention</p>
              <h2>
                {attention.length ? "Tight categories" : "Budget is on track"}
              </h2>
            </div>
            <button
              className={styles.textButton}
              onClick={() => onScreen("budget")}
            >
              View budget <ChevronRight />
            </button>
          </div>
          {attention.length ? (
            <div className={styles.categoryRows}>
              {attention.map((item) => (
                <CategoryRow
                  key={item.category.id}
                  item={item}
                  unstarted={unstarted}
                  onClick={() => onCategory(item.category.id)}
                />
              ))}
            </div>
          ) : (
            <p className={styles.emptyState}>
              Nothing is over budget in this period. Keep logging expenses to
              protect the signal.
            </p>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Recent activity</p>
              <h2>Correct it while it&apos;s fresh</h2>
            </div>
            <button
              className={styles.textButton}
              onClick={() => onScreen("activity")}
            >
              All activity <ChevronRight />
            </button>
          </div>
          {recent.length ? (
            <TransactionRows
              transactions={recent}
              categories={rollup.categories.map(({ category }) => category)}
              onEdit={onEditTransaction}
            />
          ) : (
            <p className={styles.emptyState}>
              No expenses logged for this period yet. Fast Log is ready when you
              are.
            </p>
          )}
        </section>
      </div>

      <div className={styles.actionRail}>
        <button
          className={styles.actionCard}
          onClick={() => onScreen("wrap")}
          disabled={period.kind !== "month" || unstarted}
        >
          <CalendarDays />
          <span>
            <strong>Monthly wrap</strong>
            <small>
              {unstarted
                ? "Available when this month begins"
                : period.kind === "month"
                  ? "See wins, overruns, and savings impact"
                  : "Choose a month to open its wrap"}
            </small>
          </span>
          <ChevronRight />
        </button>
        <button className={styles.actionCard} onClick={() => onScreen("plan")}>
          <Sparkles />
          <span>
            <strong>Annual plan</strong>
            <small>See the long view behind today&apos;s choices</small>
          </span>
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
  const visibleCategories = rollup.categories.filter(categoryRollupIsVisible);
  const attention = visibleCategories.filter(
    ({ remainingCents, allocatedCents, category }) =>
      remainingCents < 0 ||
      (allocatedCents > 0 &&
        remainingCents <= Math.ceil(allocatedCents / 10) &&
        guidanceBucket(category) !== "saving"),
  );
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
      <div className={styles.toolbar}>
        {unstarted ? (
          <p>
            <strong>{money(rollup.spendingAllocatedCents, 2)}</strong> is
            planned for spending and{" "}
            <strong>{money(rollup.savingAllocatedCents, 2)}</strong> for saving.
            Actual spending begins when {periodLabel(period)} starts.
          </p>
        ) : (
          <p>
            <strong>{money(rollup.actualCents, 2)}</strong> spent or funded of{" "}
            {money(rollup.allocatedCents, 2)} total. Safe to spend keeps{" "}
            {money(rollup.savingAllocatedCents, 2)} of saving allocations
            reserved; exact remainder{" "}
            <strong>{money(rollup.safeToSpendCents, 2)}</strong>.
          </p>
        )}
        <div>
          <button onClick={() => onScreen("edit-budget")}>Edit budget</button>
          <button onClick={() => onScreen("manage-categories")}>
            Manage categories
          </button>
        </div>
      </div>
      {attention.length > 0 && (
        <section className={styles.panel}>
          <p className={styles.eyebrow}>Needs attention</p>
          <div className={styles.categoryRows}>
            {attention.map((item) => (
              <CategoryRow
                key={item.category.id}
                item={item}
                unstarted={unstarted}
                onClick={() => onCategory(item.category.id)}
              />
            ))}
          </div>
        </section>
      )}
      <section className={styles.panel}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>All categories</p>
            <h2>Planned and actual</h2>
          </div>
        </div>
        <div className={styles.categoryRows}>
          {visibleCategories.map((item) => (
            <CategoryRow
              key={item.category.id}
              item={item}
              unstarted={unstarted}
              onClick={() => onCategory(item.category.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

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
import {
  PeriodControl,
  savingsSources,
  type PlanYearChoice,
} from "./cockpit-period-control";
import { selectedPeriodPhase } from "./cockpit-period-phase";
import {
  CategoryRow,
  Metric,
  MonthlyWrapRow,
  TransactionRows,
} from "./cockpit-rows";
import { money, type Screen, type StoredPlan } from "./plan-types";
import styles from "./cockpit-shared.module.css";

/**
 * The only content a reserved headline box carries. A non-breaking space forms
 * exactly one line box in whatever font and leading the settled text would have
 * used, so the reservation is the settled geometry by construction rather than
 * by a hard-coded height that could drift away from it.
 */
const RESERVED_LINE = "\u00a0";

export function HomeSurface({
  today,
  plan,
  result,
  period,
  planYear,
  compactForOffline,
  awaitingAuthority,
  onPeriod,
  onScreen,
  onCategory,
  onEditTransaction,
}: {
  today: string;
  plan: StoredPlan;
  result: PlanResult;
  period: SelectedPeriod;
  planYear: PlanYearChoice;
  compactForOffline: boolean;
  awaitingAuthority: boolean;
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
    // D4. Home is required to be exactly one screen at 360x740, 390x844 and
    // 430x932, and those three differ by 192px of scroll region while the rest
    // of the surface — the answer, the attention rows, the wrap row — is fixed
    // by what it has to say. Something has to absorb 192px, and until now
    // nothing did: the surface was sized for 390x844 (632px of content in 635px
    // of region, which is why that one viewport looked perfect), so 430x932 sat
    // on a 91px dead band and 360x740 pushed 86px below the fold and cut the
    // last transaction through its own subtitle.
    //
    // The recent list is the only block on Home whose length is a judgement
    // call rather than a fact — it is a preview of a ledger that is one labelled
    // tap away on Activity, and it was already an arbitrary two of sixty-one. So
    // it is the one lever, and the count is chosen per viewport in CSS (a media
    // query, not a measurement, so there is no second paint and no layout
    // shift): three rows at 430x932, two at 390x844, and none at 360x740, where
    // the answer, the three attention rows and the wrap row already use the
    // whole screen. Three are rendered and the stylesheet reveals as many as fit
    // (HIG-L1, DEN-6, C7).
    .slice(0, 3);
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
          <h1>Home</h1>
        </div>
        <PeriodControl
          period={period}
          today={today}
          planYear={planYear}
          onPeriod={onPeriod}
        />
      </header>

      <section className={styles.runwayCard}>
        {/* Two legal states and no third (C9-2): the reserved box, or the
            settled value. The reserved box is these same three elements
            carrying a single non-breaking space, so each line box is set by the
            same font, leading and grid gap as the settled block and the swap
            moves nothing. The label lives inside the reservation because it is
            derived from the same provisional numbers (C9-3). */}
        <div
          className={styles.runwayHeadline}
          data-reserved={awaitingAuthority || undefined}
        >
          <span>
            {awaitingAuthority
              ? RESERVED_LINE
              : unstarted
                ? "Planned spending"
                : over
                  ? "Over budget"
                  : "Left to spend"}
          </span>
          <strong data-negative={!awaitingAuthority && over}>
            {awaitingAuthority
              ? RESERVED_LINE
              : money(
                  unstarted
                    ? rollup.spendingAllocatedCents
                    : Math.abs(rollup.safeToSpendCents),
                )}
          </strong>
          {/* The period is named by the month picker directly above, so it is
              not restated here. */}
          <small>
            {awaitingAuthority ? (
              RESERVED_LINE
            ) : unstarted ? (
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

      <section className={styles.rowGroup} data-home-group="recent">
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

      <MonthlyWrapRow
        period={period}
        unstarted={unstarted}
        onOpen={() => onScreen("wrap")}
      />
    </div>
  );
}

export function BudgetSurface({
  today,
  plan,
  period,
  planYear,
  awaitingAuthority,
  onPeriod,
  onScreen,
  onCategory,
}: {
  today: string;
  plan: StoredPlan;
  period: SelectedPeriod;
  planYear: PlanYearChoice;
  awaitingAuthority: boolean;
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
          {/* The eyebrow is a fixed section name and never moves. The `h1`
              carries both the figure and the phrase that gives it meaning, so
              the whole line is the reservation (C9-2, C9-3).

              B1b. The figure and the phrase are two elements rather than one
              string. They were one string reserved at two lines
              (`min-height: calc(2 * --text-2xl * --leading-tight)`), because
              stepping the period swaps the phrase and a change of line count
              moves the whole surface. But at 390 and 430 — the two commonest
              iPhone widths — no phase string ever reached a second line, so the
              reservation was never spent: the surface carried 32px of empty
              band under a one-line headline in every phase, permanently, and
              read as a hole rather than as rhythm.

              Splitting them buys the same guarantee out of geometry instead of
              out of whitespace. On a phone the `h1` is a grid, so each part is
              its own row: the figure sets on line one and the phrase on line
              two, in EVERY phase, at EVERY width, for any magnitude. The box is
              the same 67.2px it was reserved at — nothing on the surface moved
              — but both lines now carry text, so the band is gone and the
              layout is stiffer than the reservation was (that one still
              shifted if a phrase ever reached a third line; this cannot).

              Each part is a `<span>` and both are inside the one `h1`, so the
              accessible name is unchanged. Whitespace between them is a grid
              container's ignored anonymous text, and reappears as the word
              space when the grid does not apply (desktop, where the headline
              sets inline on one line as before). */}
          <h1 data-reserved={awaitingAuthority || undefined}>
            <span>
              {awaitingAuthority
                ? RESERVED_LINE
                : /* D4. One quantity, one name. This figure is the same
                     cents Home prints under "Left to spend" and Monthly wrap
                     printed as both "currently unspent" and "Total remaining":
                     four names for one number, which reads as four numbers. */
                  money(
                    unstarted
                      ? rollup.spendingAllocatedCents
                      : Math.abs(rollup.safeToSpendCents),
                  )}
            </span>{" "}
            <span>
              {awaitingAuthority
                ? RESERVED_LINE
                : unstarted
                  ? "planned spending"
                  : rollup.safeToSpendCents < 0
                    ? "over"
                    : "left to spend"}
            </span>
          </h1>
        </div>
        <PeriodControl
          period={period}
          today={today}
          planYear={planYear}
          onPeriod={onPeriod}
        />
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

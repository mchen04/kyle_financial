"use client";

import { useMemo } from "react";
import { annualExpenseAmount } from "@/domain/budget";
import { calculatePlan } from "@/domain/tax/engine";
import { expenseTotalsByGroup } from "./expense-totals";
import { money, type StoredPlan } from "./plan-types";
import styles from "./compare.module.css";

export function CompareScreen({ plans }: { plans: StoredPlan[] }) {
  const expenseGroups = useMemo(
    () =>
      [
        ...new Set(
          plans.flatMap((plan) =>
            plan.expenses.map((expense) => expense.group.trim() || "Ungrouped"),
          ),
        ),
      ]
        .filter((group) =>
          plans.some((plan) =>
            plan.expenses.some(
              (expense) =>
                (expense.group.trim() || "Ungrouped") === group &&
                annualExpenseAmount(expense) > 0,
            ),
          ),
        )
        .sort((left, right) => left.localeCompare(right)),
    [plans],
  );
  const comparisonRows = useMemo(
    () =>
      plans.map((plan) => ({
        plan,
        result: calculatePlan(plan),
        expensesByGroup: new Map(expenseTotalsByGroup(plan.expenses)),
      })),
    [plans],
  );
  const previousComparison = comparisonRows.at(-2);
  const latestComparison = comparisonRows.at(-1);
  const leftDelta =
    previousComparison && latestComparison
      ? latestComparison.result.savingsMonthlyCents -
        previousComparison.result.savingsMonthlyCents
      : null;
  const expenseDelta =
    previousComparison && latestComparison
      ? latestComparison.result.expensesAnnualCents -
        previousComparison.result.expensesAnnualCents
      : null;
  const singleYear = comparisonRows.length < 2;
  const soleYear = comparisonRows.at(-1)?.plan.year;
  return (
    <section className={styles.wideCard}>
      <p className={styles.eyebrow}>
        {singleYear ? "This year" : "Year over year"}
      </p>
      <h1>
        {singleYear
          ? `Your ${soleYear} plan at a glance.`
          : "See what changed—and what stayed yours."}
      </h1>
      <p className={styles.muted}>
        {singleYear
          ? "Start next year's plan to compare them side by side."
          : "Each year remains a separate, editable plan."}
      </p>
      {!singleYear && (
        <p id="comparison-scroll-hint" className={styles.comparisonScrollHint}>
          Scroll horizontally to see every category →
        </p>
      )}
      <div
        className={styles.compareTable}
        role="table"
        aria-label="Year-over-year plan comparison"
        aria-describedby={singleYear ? undefined : "comparison-scroll-hint"}
        tabIndex={0}
      >
        <div
          role="row"
          className={styles.compareHeader}
          style={{
            gridTemplateColumns: `minmax(130px, .7fr) repeat(${expenseGroups.length + 4}, minmax(125px, 1fr))`,
          }}
        >
          <span role="columnheader">Year</span>
          <span role="columnheader">Gross income / year</span>
          <span role="columnheader">Estimated tax / year</span>
          {expenseGroups.map((group) => (
            <span role="columnheader" key={group}>
              {group} / year
            </span>
          ))}
          <span role="columnheader">Total expenses / year</span>
          <span role="columnheader">Left / month</span>
        </div>
        {comparisonRows.map(({ plan, result, expensesByGroup }) => {
          return (
            <div
              role="row"
              key={plan.year}
              style={{
                gridTemplateColumns: `minmax(130px, .7fr) repeat(${expenseGroups.length + 4}, minmax(125px, 1fr))`,
              }}
            >
              <strong role="cell">
                {plan.year}
                {result.usesFallbackTaxTable && (
                  <small> · tax proxy: {result.appliedTaxYear}</small>
                )}
              </strong>
              <span role="cell">{money(result.grossIncomeCents, 2)}</span>
              <span role="cell">{money(result.totalTaxCents, 2)}</span>
              {expenseGroups.map((group) => (
                <span role="cell" key={group}>
                  {money(expensesByGroup.get(group) ?? 0, 2)}
                </span>
              ))}
              <span role="cell">{money(result.expensesAnnualCents, 2)}</span>
              <strong
                role="cell"
                className={
                  result.savingsMonthlyCents < 0 || !result.isPayrollFeasible
                    ? styles.negativeText
                    : styles.positiveText
                }
              >
                {result.isPayrollFeasible
                  ? money(result.savingsMonthlyCents, 2)
                  : `Needs adjustment · ${money(result.savingsMonthlyCents, 2)} / month cash`}
              </strong>
            </div>
          );
        })}
      </div>
      <div
        className={styles.compareCards}
        role="region"
        aria-label="Year-over-year plan comparison"
      >
        {previousComparison &&
          latestComparison &&
          leftDelta !== null &&
          expenseDelta !== null && (
            <aside className={styles.compareDelta} aria-label="Latest change">
              <strong>
                {latestComparison.plan.year} vs {previousComparison.plan.year}
              </strong>
              <span>
                Left / month
                <b
                  className={
                    leftDelta >= 0 ? styles.positiveText : styles.negativeText
                  }
                >
                  {leftDelta > 0 ? "+" : ""}
                  {money(leftDelta, 2)}
                </b>
              </span>
              <span>
                Annual expenses
                <b
                  className={
                    expenseDelta <= 0
                      ? styles.positiveText
                      : styles.negativeText
                  }
                >
                  {expenseDelta > 0 ? "+" : ""}
                  {money(expenseDelta, 2)}
                </b>
              </span>
            </aside>
          )}
        {comparisonRows.map(({ plan, result, expensesByGroup }) => (
          <article
            className={styles.compareCard}
            key={plan.year}
            aria-labelledby={`compare-year-${plan.year}`}
          >
            <div className={styles.compareCardHeading}>
              <h2 id={`compare-year-${plan.year}`}>{plan.year}</h2>
              {result.usesFallbackTaxTable && (
                <span>Uses {result.appliedTaxYear} tax data</span>
              )}
            </div>
            <dl>
              <div>
                <dt>Gross income / year</dt>
                <dd>{money(result.grossIncomeCents, 2)}</dd>
              </div>
              <div>
                <dt>Estimated tax / year</dt>
                <dd>{money(result.totalTaxCents, 2)}</dd>
              </div>
              {expenseGroups.map((group) => (
                <div key={group}>
                  <dt>{group} / year</dt>
                  <dd>{money(expensesByGroup.get(group) ?? 0, 2)}</dd>
                </div>
              ))}
              <div>
                <dt>Total expenses / year</dt>
                <dd>{money(result.expensesAnnualCents, 2)}</dd>
              </div>
              <div className={styles.compareCardAnswer}>
                <dt>Left / month</dt>
                <dd
                  className={
                    result.savingsMonthlyCents < 0 || !result.isPayrollFeasible
                      ? styles.negativeText
                      : styles.positiveText
                  }
                >
                  {result.isPayrollFeasible
                    ? money(result.savingsMonthlyCents, 2)
                    : `Needs adjustment · ${money(result.savingsMonthlyCents, 2)}`}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

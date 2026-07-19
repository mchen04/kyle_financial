import { CircleHelp } from "lucide-react";
import { treatmentFor } from "@/domain/benefits";
import { annualExpenseAmount } from "@/domain/budget";
import type { PlanResult } from "@/domain/tax/engine";
import { money, rate, type StoredPlan } from "./plan-types";
import { MoneyFlow } from "./plan-visualizations";
import { BoundedMessages, WarningCard } from "./workspace-messages";
import styles from "./plan.module.css";

export function PlanAnswer({
  draft,
  result,
}: {
  draft: StoredPlan;
  result: PlanResult;
}) {
  const negative = result.savingsMonthlyCents < 0;
  const hasPlannedExpenses = draft.expenses.some(
    (expense) => annualExpenseAmount(expense) > 0,
  );
  const largestExpense = draft.expenses.toSorted(
    (left, right) => annualExpenseAmount(right) - annualExpenseAmount(left),
  )[0];
  const largestPayrollChoice = result.benefits
    .filter(
      ({ entry }) =>
        treatmentFor(entry).reducesTakeHome &&
        (result.infeasiblePayrollOwner === "household" ||
          result.infeasiblePayrollOwner === null ||
          (entry.owner ?? "primary") === result.infeasiblePayrollOwner),
    )
    .toSorted(
      (left, right) => right.annualAmountCents - left.annualAmountCents,
    )[0];
  const taxRate = result.grossIncomeCents
    ? Math.round((result.totalTaxCents * 1_000_000) / result.grossIncomeCents)
    : 0;
  const payrollProblem = `Payroll choices exceed fundable wages. ${largestPayrollChoice ? `${largestPayrollChoice.entry.label} is the largest at ${money(largestPayrollChoice.annualAmountCents)} per year.` : "Reduce a benefit or deduction to make this plan feasible."}`;
  const planNotices = result.notices.filter(
    (notice) => !notice.startsWith("Participant limits are aggregated"),
  );

  return (
    <section
      className={`${styles.answerCard} ${negative || !result.isPayrollFeasible ? styles.answerNegative : ""}`}
      aria-labelledby="answer-heading"
    >
      <div>
        <p className={styles.eyebrow} id="answer-heading">
          {hasPlannedExpenses ? "Savings / month" : "Unallocated / month"}
        </p>
        <p className={styles.answerNumber}>
          {money(result.savingsMonthlyCents, 2)}
        </p>
        <p className={styles.answerContext}>
          {!result.isPayrollFeasible || result.takeHomeAnnualCents < 0
            ? payrollProblem
            : negative
              ? `Planned expenses are above take-home pay.${largestExpense ? ` ${largestExpense.name} is the largest row at ${money(annualExpenseAmount(largestExpense))} per year.` : ""}`
              : hasPlannedExpenses
                ? "Flexible cash saving after every planned expense."
                : "Starting estimate. Add housing and everyday expenses to see what is truly left."}
        </p>
        <p className={styles.answerRates}>
          {hasPlannedExpenses ? "Cash savings" : "Unallocated"} rate:{" "}
          {rate(result.cashSavingsRateGrossPpm)} of gross ·{" "}
          {result.takeHomeAnnualCents > 0
            ? `${rate(result.cashSavingsRateNetPpm)} of take-home`
            : "not meaningful against non-positive take-home"}
        </p>
      </div>
      <div className={styles.takeHomeBlock}>
        <span>
          Spendable after taxes and payroll deductions{" "}
          <small>monthly estimate</small>
        </span>
        <strong>{money(result.takeHomeMonthlyCents, 2)}</strong>
        <span className={styles.taxLine}>
          {rate(taxRate)} effective tax rate
        </span>
      </div>
      <MoneyFlow result={result} expenses={draft.expenses} />
      <BoundedMessages visibleCount={result.warnings.length > 0 ? 1 : 0}>
        {[
          ...result.warnings.map((warning) => (
            <WarningCard key={warning.code} warning={warning} location="plan" />
          )),
          ...planNotices.map((notice) => (
            <p key={notice} className={styles.modelDisclosure} role="note">
              <CircleHelp size={16} /> {notice}
            </p>
          )),
        ]}
      </BoundedMessages>
    </section>
  );
}

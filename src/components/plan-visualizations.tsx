import { treatmentFor } from "@/domain/benefits";
import { annualExpenseAmount, type ExpenseEntry } from "@/domain/budget";
import type { PlanResult } from "@/domain/tax/engine";
import { expenseTotalsByGroup } from "./expense-totals";
import { money } from "./plan-types";
import styles from "./plan-visualizations.module.css";

const flowExpenseColors = [
  "#76a9cf",
  "#8eb9d7",
  "#a7c9df",
  "#bdd7e7",
  "#6f9fba",
  "#9db8c8",
];

function allocateUpTo(values: number[], capacity: number): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= capacity) return values;
  if (total === 0 || capacity <= 0) return values.map(() => 0);

  const allocations = values.map((value) =>
    Math.floor((value * capacity) / total),
  );
  let remainder = capacity - allocations.reduce((sum, value) => sum + value, 0);
  for (let index = 0; remainder > 0; index = (index + 1) % values.length) {
    if (values[index] === 0) continue;
    allocations[index] += 1;
    remainder -= 1;
  }
  return allocations;
}

export function MoneyFlow({
  result,
  expenses,
}: {
  result: PlanResult;
  expenses: ExpenseEntry[];
}) {
  const base = Math.max(1, result.grossIncomeCents);
  const tax = Math.min(base, result.totalTaxCents);
  const payrollCapacity = Math.min(
    Math.max(0, base - tax),
    result.isPayrollFeasible
      ? result.paycheckDeductionsAnnualCents
      : result.fundablePaycheckDeductionsAnnualCents,
  );
  const configuredPayrollSaving = result.benefits
    .filter(({ entry }) => {
      const treatment = treatmentFor(entry);
      return treatment.reducesTakeHome && treatment.countsAsSavings;
    })
    .reduce((sum, { annualAmountCents }) => sum + annualAmountCents, 0);
  const configuredPayrollCosts =
    result.paycheckDeductionsAnnualCents - configuredPayrollSaving;
  const [payrollSaving, payrollCosts] = allocateUpTo(
    [configuredPayrollSaving, configuredPayrollCosts],
    payrollCapacity,
  );
  const available = Math.max(0, base - tax - payrollCapacity);
  const groupedExpenses = expenseTotalsByGroup(expenses);
  const fundedExpenses = allocateUpTo(
    groupedExpenses.map(([, value]) => value),
    Math.min(result.expensesAnnualCents, available),
  );
  const fundedExpenseTotal = fundedExpenses.reduce(
    (sum, value) => sum + value,
    0,
  );
  const segments = [
    { label: "Estimated tax", value: tax, color: "#46617e" },
    {
      label: result.isPayrollFeasible
        ? "Payroll saving"
        : "Fundable payroll saving",
      value: payrollSaving,
      color: "#287cae",
    },
    {
      label: result.isPayrollFeasible
        ? "Other payroll deductions"
        : "Fundable other payroll deductions",
      value: payrollCosts,
      color: "#5a9bc6",
    },
    ...groupedExpenses.map(([group], index) => ({
      label: `${group} expenses${result.expensesAnnualCents > available ? " (fundable)" : ""}`,
      value: fundedExpenses[index],
      color: flowExpenseColors[index % flowExpenseColors.length],
    })),
    {
      label: expenses.some((expense) => annualExpenseAmount(expense) > 0)
        ? "Cash savings"
        : "Unallocated cash",
      value: available - fundedExpenseTotal,
      color: "#087e73",
    },
  ].filter(({ value }) => value > 0);
  return (
    <div className={styles.flow} aria-label="Annual income flow">
      <div className={styles.flowLabels}>
        <span>Annual gross income {money(result.grossIncomeCents, 2)}</span>
        <span>Annual destinations of gross income</span>
      </div>
      <div className={styles.flowRail}>
        {segments.map((segment) => (
          <span
            key={segment.label}
            style={{
              width: `${Math.max(0, (segment.value / base) * 100)}%`,
              backgroundColor: segment.color,
            }}
            title={`${segment.label}: ${money(segment.value, 2)} per year`}
          />
        ))}
      </div>
      <div className={styles.flowLegend}>
        {segments.map((segment) => (
          <span key={segment.label}>
            <i style={{ backgroundColor: segment.color }} />
            {segment.label} {money(segment.value, 2)} / year
          </span>
        ))}
      </div>
      {(result.savingsMonthlyCents < 0 || !result.isPayrollFeasible) && (
        <p className={styles.muted}>
          {result.isPayrollFeasible
            ? "The shortfall is shown above, not as a destination of gross income."
            : `Configured payroll choices are ${money(result.paycheckDeductionsAnnualCents, 2)} per year; the rail breaks out only the ${money(result.fundablePaycheckDeductionsAnnualCents, 2)} gross pay can fund.`}
        </p>
      )}
    </div>
  );
}

export function Guidance({ result }: { result: PlanResult }) {
  const planResources = Math.max(
    1,
    result.takeHomeAnnualCents + result.payrollSavingsAnnualCents,
  );
  const percent = (value: number) =>
    Math.max(0, Math.round((value * 100) / planResources));
  const needs = percent(result.needsExpensesAnnualCents);
  const wants = percent(result.wantsExpensesAnnualCents);
  const saving = percent(
    Math.max(
      0,
      planResources -
        result.needsExpensesAnnualCents -
        result.wantsExpensesAnnualCents,
    ),
  );
  return (
    <div className={styles.guidance}>
      <p className={styles.eyebrow}>50 / 30 / 20 lens</p>
      <p>One denominator: take-home plus employee payroll saving.</p>
      <div>
        <span>
          <i style={{ width: `${Math.min(100, needs)}%` }} />
          Needs <strong>{needs}%</strong>
        </span>
        <span>
          <i style={{ width: `${Math.min(100, wants)}%` }} />
          Wants <strong>{wants}%</strong>
        </span>
        <span>
          <i style={{ width: `${Math.min(100, saving)}%` }} />
          Saving / investing{" "}
          <strong>
            {result.isPayrollFeasible
              ? `${saving}% of plan resources`
              : "Not feasible"}
          </strong>
        </span>
      </div>
    </div>
  );
}

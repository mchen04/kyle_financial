import { annualBenefitAmount } from "../benefits";
import { annualExpenseAmount, guidanceBucket, type PlanInput } from "../budget";
import {
  assertCents,
  divideAnnualForMonthly,
  multiplyByRate,
  sumCents,
} from "../money";
import type { BenefitResult } from "./plan-result";

export interface IncomeBenefitStage {
  primaryWageIncomeCents: number;
  grossIncomeCents: number;
  benefits: BenefitResult[];
}

export interface ExpenseStage {
  expensesAnnualCents: number;
  expensesMonthlyCents: number;
  needsExpensesAnnualCents: number;
  wantsExpensesAnnualCents: number;
  plannedInvestmentAnnualCents: number;
}

export function validatePlanInput(plan: PlanInput): void {
  if (
    plan.filingStatus !== "mfj" &&
    (plan.spouseWageIncomeCents > 0 ||
      plan.benefits.some(({ owner }) => owner === "spouse"))
  ) {
    throw new RangeError(
      "Spouse wages and spouse-owned payroll items require married filing jointly.",
    );
  }
  for (const [label, value] of [
    ["salary", plan.grossSalaryCents],
    ["bonus wages", plan.additionalWageIncomeCents],
    ["spouse wages", plan.spouseWageIncomeCents],
    ["other income", plan.otherOrdinaryIncomeCents],
  ] as const) {
    if (assertCents(value, label) < 0)
      throw new RangeError(`${label} cannot be negative`);
  }
  for (const expense of plan.expenses) {
    if (assertCents(expense.amountCents, expense.name) < 0)
      throw new RangeError(`${expense.name} cannot be negative`);
  }
  for (const benefit of plan.benefits) {
    const amount = benefit.amount;
    const value = amount.kind === "percent" ? amount.ratePpm : amount.cents;
    const maximum = amount.kind === "percent" ? 1_000_000 : Infinity;
    if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
      throw new RangeError(`${benefit.label} has an invalid amount`);
    }
    if (
      benefit.discountRatePpm !== undefined &&
      (!Number.isSafeInteger(benefit.discountRatePpm) ||
        benefit.discountRatePpm < 0 ||
        benefit.discountRatePpm > 150_000)
    ) {
      throw new RangeError(`${benefit.label} has an invalid ESPP discount`);
    }
  }
}

export function materializeIncomeAndBenefits(
  plan: PlanInput,
): IncomeBenefitStage {
  const primaryWageIncomeCents = sumCents([
    plan.grossSalaryCents,
    plan.additionalWageIncomeCents,
  ]);
  const grossIncomeCents = sumCents([
    primaryWageIncomeCents,
    plan.spouseWageIncomeCents,
    plan.otherOrdinaryIncomeCents,
  ]);
  const benefits = plan.benefits.map((entry) => {
    const payrollBaseCents =
      entry.owner === "spouse"
        ? plan.spouseWageIncomeCents
        : primaryWageIncomeCents;
    const annualAmountCents = annualBenefitAmount(
      entry.amount,
      payrollBaseCents,
    );
    const discount = entry.type === "espp" ? (entry.discountRatePpm ?? 0) : 0;
    const impliedEsppDiscountGainCents =
      discount > 0 && discount < 1_000_000
        ? multiplyByRate(
            Number(
              (BigInt(annualAmountCents) * 1_000_000n) /
                BigInt(1_000_000 - discount),
            ),
            discount,
          )
        : 0;
    return { entry, annualAmountCents, impliedEsppDiscountGainCents };
  });
  return { primaryWageIncomeCents, grossIncomeCents, benefits };
}

export function calculateExpenseStage(plan: PlanInput): ExpenseStage {
  const expenseAmounts = plan.expenses.map((expense) => ({
    expense,
    annualCents: annualExpenseAmount(expense),
  }));
  const expensesAnnualCents = sumCents(
    expenseAmounts.map(({ annualCents }) => annualCents),
  );
  const expenseBucketTotal = (bucket: ReturnType<typeof guidanceBucket>) =>
    sumCents(
      expenseAmounts
        .filter(({ expense }) => guidanceBucket(expense) === bucket)
        .map(({ annualCents }) => annualCents),
    );
  return {
    expensesAnnualCents,
    expensesMonthlyCents: divideAnnualForMonthly(expensesAnnualCents),
    needsExpensesAnnualCents: expenseBucketTotal("needs"),
    wantsExpensesAnnualCents: expenseBucketTotal("wants"),
    plannedInvestmentAnnualCents: expenseBucketTotal("saving"),
  };
}

export function ratioPpm(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Number((BigInt(numerator) * 1_000_000n) / BigInt(denominator));
}

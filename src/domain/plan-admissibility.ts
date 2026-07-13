import type { PlanInput } from "./budget";

export const PLAN_AGGREGATE_TOO_LARGE_MESSAGE =
  "Combined plan amounts are too large to calculate safely.";

type PlanAggregateInput = Pick<
  PlanInput,
  | "grossSalaryCents"
  | "additionalWageIncomeCents"
  | "spouseWageIncomeCents"
  | "otherOrdinaryIncomeCents"
  | "benefits"
  | "expenses"
>;

export function planAggregateError(plan: PlanAggregateInput): string | null {
  const primaryWages =
    BigInt(plan.grossSalaryCents) + BigInt(plan.additionalWageIncomeCents);
  const spouseWages = BigInt(plan.spouseWageIncomeCents);
  let aggregate =
    primaryWages + spouseWages + BigInt(plan.otherOrdinaryIncomeCents);

  for (const benefit of plan.benefits) {
    const amount = benefit.amount;
    let annual: bigint;
    if (amount.kind === "fixedAnnual") annual = BigInt(amount.cents);
    else if (amount.kind === "fixedMonthly")
      annual = BigInt(amount.cents) * 12n;
    else {
      const wageBase = benefit.owner === "spouse" ? spouseWages : primaryWages;
      annual = (wageBase * BigInt(amount.ratePpm)) / 1_000_000n;
    }

    const discount = BigInt(benefit.discountRatePpm ?? 0);
    aggregate +=
      benefit.type === "espp" && discount > 0n
        ? (annual * 1_000_000n) / (1_000_000n - discount)
        : annual;
  }

  for (const expense of plan.expenses) {
    aggregate +=
      BigInt(expense.amountCents) * (expense.cadence === "monthly" ? 12n : 1n);
  }

  return aggregate > BigInt(Number.MAX_SAFE_INTEGER)
    ? PLAN_AGGREGATE_TOO_LARGE_MESSAGE
    : null;
}

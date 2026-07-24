import type { BenefitEntry } from "@/domain/benefits";
import {
  canonicalBudgetCategory,
  type BudgetCategory,
  type PlanInput,
  type TransactionEntry,
} from "@/domain/budget";
import { normalizeStoredPlan, type StoredPlan } from "@/domain/stored-plan";

export type CanonicalPlanInput = Omit<
  PlanInput,
  "expenses" | "transactions"
> & {
  expenses: BudgetCategory[];
  transactions: TransactionEntry[];
};

export function planInput(
  overrides: Partial<PlanInput> = {},
): CanonicalPlanInput {
  const plan: PlanInput = {
    year: 2026,
    grossSalaryCents: 10_000_000,
    additionalWageIncomeCents: 0,
    spouseWageIncomeCents: 0,
    otherOrdinaryIncomeCents: 0,
    filingStatus: "single",
    stateCode: "TX",
    hsaCoverage: "self",
    primaryHsaEligible: true,
    spouseHsaEligible: false,
    primaryHsaCatchUpEligible: false,
    spouseHsaCatchUpEligible: false,
    primaryHsaFamilyAllocationPpm: 1_000_000,
    spouseHsaFamilyAllocationPpm: 0,
    benefits: [],
    expenses: [],
    ...overrides,
  };
  return {
    ...plan,
    expenses: plan.expenses.map(canonicalBudgetCategory),
    transactions: plan.transactions ?? [],
  };
}

export function benefitEntry(
  overrides: Partial<BenefitEntry> = {},
): BenefitEntry {
  return {
    id: "benefit",
    type: "traditional401k",
    label: "401(k)",
    amount: { kind: "fixedAnnual", cents: 1_000_000 },
    ...overrides,
  };
}

export function storedPlan(
  year = 2026,
  overrides: Partial<StoredPlan> = {},
): StoredPlan {
  return normalizeStoredPlan({
    id: "f09af018-f6c2-4eb1-9380-123173bd9802",
    ...planInput({ year, stateCode: "CA" }),
    updatedAt: "2026-07-12T00:00:00.000Z",
    fieldVersions: {},
    ...overrides,
  });
}

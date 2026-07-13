import type { BenefitEntry } from "./benefits";
import type { FilingStatus } from "./tax/types";
import type { StateCode } from "./tax/jurisdictions";

export type ExpenseCadence = "monthly" | "yearly";
export type GuidanceBucket = "needs" | "wants" | "saving";

export interface ExpenseEntry {
  id: string;
  name: string;
  group: string;
  cadence: ExpenseCadence;
  amountCents: number;
  sortOrder: number;
  guidanceBucket?: GuidanceBucket;
}

export interface PlanInput {
  year: number;
  grossSalaryCents: number;
  additionalWageIncomeCents: number;
  spouseWageIncomeCents: number;
  otherOrdinaryIncomeCents: number;
  filingStatus: FilingStatus;
  stateCode: StateCode;
  hsaCoverage: "self" | "family";
  primaryHsaEligible: boolean;
  spouseHsaEligible: boolean;
  primaryHsaCatchUpEligible: boolean;
  spouseHsaCatchUpEligible: boolean;
  primaryHsaFamilyAllocationPpm: number;
  spouseHsaFamilyAllocationPpm: number;
  benefits: BenefitEntry[];
  expenses: ExpenseEntry[];
}

export interface HsaPlanSettings {
  primaryHsaEligible: boolean;
  spouseHsaEligible: boolean;
  primaryHsaCatchUpEligible: boolean;
  spouseHsaCatchUpEligible: boolean;
  primaryHsaFamilyAllocationPpm: number;
  spouseHsaFamilyAllocationPpm: number;
}

export function normalizedHsaPlanSettings(
  plan: Pick<PlanInput, "filingStatus" | "hsaCoverage"> &
    Partial<HsaPlanSettings>,
): HsaPlanSettings {
  const primaryHsaEligible = plan.primaryHsaEligible ?? true;
  const spouseHsaEligible =
    plan.filingStatus === "mfj"
      ? (plan.spouseHsaEligible ?? plan.hsaCoverage === "family")
      : false;
  const primaryHsaCatchUpEligible =
    primaryHsaEligible && (plan.primaryHsaCatchUpEligible ?? false);
  const spouseHsaCatchUpEligible =
    spouseHsaEligible &&
    plan.filingStatus === "mfj" &&
    (plan.spouseHsaCatchUpEligible ?? false);
  if (plan.filingStatus !== "mfj" || plan.hsaCoverage !== "family") {
    return {
      primaryHsaEligible,
      spouseHsaEligible,
      primaryHsaCatchUpEligible,
      spouseHsaCatchUpEligible,
      primaryHsaFamilyAllocationPpm: 1_000_000,
      spouseHsaFamilyAllocationPpm: 0,
    };
  }
  if (!primaryHsaEligible && !spouseHsaEligible) {
    return {
      primaryHsaEligible,
      spouseHsaEligible,
      primaryHsaCatchUpEligible,
      spouseHsaCatchUpEligible,
      primaryHsaFamilyAllocationPpm: 0,
      spouseHsaFamilyAllocationPpm: 0,
    };
  }
  if (primaryHsaEligible && !spouseHsaEligible) {
    return {
      primaryHsaEligible,
      spouseHsaEligible,
      primaryHsaCatchUpEligible,
      spouseHsaCatchUpEligible,
      primaryHsaFamilyAllocationPpm: 1_000_000,
      spouseHsaFamilyAllocationPpm: 0,
    };
  }
  if (!primaryHsaEligible && spouseHsaEligible) {
    return {
      primaryHsaEligible,
      spouseHsaEligible,
      primaryHsaCatchUpEligible,
      spouseHsaCatchUpEligible,
      primaryHsaFamilyAllocationPpm: 0,
      spouseHsaFamilyAllocationPpm: 1_000_000,
    };
  }
  const primaryAllocation = plan.primaryHsaFamilyAllocationPpm;
  const spouseAllocation = plan.spouseHsaFamilyAllocationPpm;
  if (
    Number.isSafeInteger(primaryAllocation) &&
    Number.isSafeInteger(spouseAllocation) &&
    primaryAllocation! >= 0 &&
    spouseAllocation! >= 0 &&
    primaryAllocation! + spouseAllocation! === 1_000_000
  ) {
    return {
      primaryHsaEligible,
      spouseHsaEligible,
      primaryHsaCatchUpEligible,
      spouseHsaCatchUpEligible,
      primaryHsaFamilyAllocationPpm: primaryAllocation!,
      spouseHsaFamilyAllocationPpm: spouseAllocation!,
    };
  }
  return {
    primaryHsaEligible,
    spouseHsaEligible,
    primaryHsaCatchUpEligible,
    spouseHsaCatchUpEligible,
    primaryHsaFamilyAllocationPpm: 500_000,
    spouseHsaFamilyAllocationPpm: 500_000,
  };
}

export function annualExpenseAmount(expense: ExpenseEntry): number {
  return expense.cadence === "monthly"
    ? expense.amountCents * 12
    : expense.amountCents;
}

export function guidanceBucket(
  expense: Pick<ExpenseEntry, "group" | "guidanceBucket">,
): GuidanceBucket {
  if (expense.guidanceBucket) return expense.guidanceBucket;
  const group = expense.group.trim().toLowerCase();
  if (
    [
      "investing",
      "investment",
      "investments",
      "retirement",
      "saving",
      "savings",
      "brokerage",
      "emergency fund",
      "401(k)",
      "401k",
    ].includes(group)
  )
    return "saving";
  if (
    [
      "needs",
      "need",
      "home",
      "housing",
      "everyday",
      "utilities",
      "transportation",
      "transport",
      "medical",
      "healthcare",
      "insurance",
      "food",
      "groceries",
      "childcare",
      "debt",
      "debt payments",
      "mortgage",
      "property tax",
      "education",
      "rent & utilities",
      "dining & groceries",
    ].includes(group)
  )
    return "needs";
  return "wants";
}

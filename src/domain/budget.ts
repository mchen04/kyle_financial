import type { BenefitEntry } from "./benefits";
import type { FilingStatus } from "./tax/types";
import type { StateCode } from "./tax/jurisdictions";

export type ExpenseCadence = "monthly" | "yearly";
export type GuidanceBucket = "needs" | "wants" | "saving";
export const CATEGORY_COLOR_TOKENS = [
  "blue",
  "teal",
  "violet",
  "amber",
  "rose",
  "cyan",
  "green",
  "orange",
  "indigo",
  "pink",
  "lime",
  "slate",
] as const;
export type CategoryColorToken = (typeof CATEGORY_COLOR_TOKENS)[number];

export interface ExpenseEntry {
  id: string;
  name: string;
  group: string;
  cadence: ExpenseCadence;
  amountCents: number;
  sortOrder: number;
  guidanceBucket?: GuidanceBucket;
  colorToken?: CategoryColorToken;
  archived?: boolean;
}

export interface BudgetCategory extends Omit<
  ExpenseEntry,
  "guidanceBucket" | "colorToken" | "archived"
> {
  guidanceBucket: GuidanceBucket;
  colorToken: CategoryColorToken;
  archived: boolean;
}

export function createBudgetCategory(
  id: string,
  sortOrder: number,
): BudgetCategory {
  return {
    id,
    name: "New category",
    group: "Wants",
    cadence: "monthly",
    amountCents: 0,
    sortOrder,
    guidanceBucket: "wants",
    colorToken: CATEGORY_COLOR_TOKENS[sortOrder % CATEGORY_COLOR_TOKENS.length],
    archived: false,
  };
}

export function addBudgetCategory(
  categories: readonly BudgetCategory[],
  id: string,
): BudgetCategory[] {
  return [...categories, createBudgetCategory(id, categories.length)];
}

export function patchBudgetCategory(
  categories: readonly BudgetCategory[],
  categoryId: string,
  change: Partial<BudgetCategory>,
): BudgetCategory[] {
  return categories.map((category) =>
    category.id === categoryId ? { ...category, ...change } : category,
  );
}

export interface TransactionEntry {
  id: string;
  categoryId: string;
  amountCents: number;
  title: string;
  note?: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export function moveActiveBudgetCategory(
  categories: readonly BudgetCategory[],
  categoryId: string,
  direction: -1 | 1,
): BudgetCategory[] {
  const activeIndexes = categories.flatMap((category, index) =>
    category.archived ? [] : [index],
  );
  const activeIndex = activeIndexes.findIndex(
    (index) => categories[index]?.id === categoryId,
  );
  const sourceIndex = activeIndexes[activeIndex];
  const targetIndex = activeIndexes[activeIndex + direction];
  if (sourceIndex === undefined || targetIndex === undefined) {
    return [...categories];
  }

  const reordered = [...categories];
  [reordered[sourceIndex], reordered[targetIndex]] = [
    reordered[targetIndex],
    reordered[sourceIndex],
  ];
  return reordered.map((category, sortOrder) => ({ ...category, sortOrder }));
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
  transactions?: TransactionEntry[];
  startingSavingsCents?: number;
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
  if (expense.archived) return 0;
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

export function canonicalBudgetCategory(
  expense: ExpenseEntry,
  fallbackIndex = expense.sortOrder,
): BudgetCategory {
  return {
    ...expense,
    guidanceBucket: guidanceBucket(expense),
    colorToken:
      expense.colorToken ??
      CATEGORY_COLOR_TOKENS[
        Math.abs(fallbackIndex) % CATEGORY_COLOR_TOKENS.length
      ],
    archived: expense.archived ?? false,
  };
}

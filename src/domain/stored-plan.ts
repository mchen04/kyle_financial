import {
  canonicalBudgetCategory,
  normalizedHsaPlanSettings,
  type BudgetCategory,
  type ExpenseEntry,
  type PlanInput,
  type TransactionEntry,
} from "./budget";
import type { FieldVersion } from "./field-version";
import type { SyncField } from "./sync-field";

export type { FieldVersion } from "./field-version";

export type FieldVersions = Partial<Record<SyncField, FieldVersion>>;

export interface StoredPlan extends Omit<
  PlanInput,
  "expenses" | "transactions"
> {
  id: string;
  expenses: BudgetCategory[];
  transactions: TransactionEntry[];
  updatedAt: string;
  fieldVersions: FieldVersions;
}

export function normalizeStoredPlan(
  plan: Omit<StoredPlan, "fieldVersions" | "expenses" | "transactions"> & {
    expenses: ExpenseEntry[];
    transactions?: TransactionEntry[];
    fieldVersions?: FieldVersions;
  },
): StoredPlan {
  return {
    ...plan,
    ...normalizedHsaPlanSettings(plan),
    expenses: plan.expenses.map(canonicalBudgetCategory),
    transactions: plan.transactions ?? [],
    fieldVersions: plan.fieldVersions ?? {},
  };
}

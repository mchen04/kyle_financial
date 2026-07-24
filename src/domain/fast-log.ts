import type { BudgetCategory, TransactionEntry } from "./budget";
import { localDateBelongsToYear } from "./local-calendar-date";
import type { StoredPlan } from "./stored-plan";

export interface FastLogTransition {
  nextPlan: StoredPlan;
  before: TransactionEntry | null;
  after: TransactionEntry | null;
}

export type FastLogEditPatch = Partial<
  Pick<
    TransactionEntry,
    "categoryId" | "amountCents" | "title" | "note" | "date"
  >
>;

export function planYearHasStarted(year: number, today: string): boolean {
  return `${year}-01-01` <= today;
}

export function maximumActualExpenseDate(year: number, today: string): string {
  const yearEnd = `${year}-12-31`;
  return yearEnd < today ? yearEnd : today;
}

export function actualExpenseDateError(
  date: string,
  year: number,
  today: string,
): string | null {
  if (!localDateBelongsToYear(date, year))
    return `Choose a date inside ${year}.`;
  if (date > today) return "Actual expenses cannot be dated in the future.";
  return null;
}

export function rankFastLogCategories(
  categories: readonly BudgetCategory[],
  transactions: readonly TransactionEntry[],
): BudgetCategory[] {
  const usage = new Map<string, { count: number; latest: string }>();
  for (const transaction of transactions) {
    const current = usage.get(transaction.categoryId);
    const timestamp = `${transaction.date}:${transaction.updatedAt}`;
    usage.set(transaction.categoryId, {
      count: (current?.count ?? 0) + 1,
      latest:
        current && current.latest.localeCompare(timestamp) > 0
          ? current.latest
          : timestamp,
    });
  }

  return categories
    .filter(({ archived }) => !archived)
    .toSorted((left, right) => {
      const leftUsage = usage.get(left.id);
      const rightUsage = usage.get(right.id);
      if (leftUsage && !rightUsage) return -1;
      if (!leftUsage && rightUsage) return 1;
      if (leftUsage && rightUsage) {
        const recency = rightUsage.latest.localeCompare(leftUsage.latest);
        if (recency) return recency;
        const frequency = rightUsage.count - leftUsage.count;
        if (frequency) return frequency;
      }
      return left.sortOrder - right.sortOrder;
    });
}

export function fastLogCategoryOptions(
  categories: readonly BudgetCategory[],
  transactions: readonly TransactionEntry[],
  existingCategoryId?: string,
): BudgetCategory[] {
  const ranked = rankFastLogCategories(categories, transactions);
  const existingCategory = categories.find(
    ({ id }) => id === existingCategoryId,
  );
  return existingCategory?.archived ? [existingCategory, ...ranked] : ranked;
}

export function commitFastLogEntry(
  plan: StoredPlan,
  transaction: TransactionEntry,
  provisionalCategory: BudgetCategory | null = null,
): StoredPlan {
  const expenses =
    provisionalCategory &&
    !plan.expenses.some(({ id }) => id === provisionalCategory.id)
      ? [...plan.expenses, provisionalCategory]
      : plan.expenses;
  return {
    ...plan,
    expenses,
    transactions: [
      ...plan.transactions.filter(({ id }) => id !== transaction.id),
      transaction,
    ],
  };
}

export function fastLogSaveTransition(
  plan: StoredPlan,
  transaction: TransactionEntry,
  provisionalCategory: BudgetCategory | null = null,
  requireExisting = false,
): FastLogTransition | null {
  const before =
    plan.transactions.find(({ id }) => id === transaction.id) ?? null;
  if (requireExisting && !before) return null;
  return {
    nextPlan: commitFastLogEntry(plan, transaction, provisionalCategory),
    before,
    after: transaction,
  };
}

export function fastLogEditTransition(
  plan: StoredPlan,
  transactionId: string,
  patch: FastLogEditPatch,
  updatedAt: string,
  provisionalCategory: BudgetCategory | null = null,
): FastLogTransition | null {
  const before =
    plan.transactions.find(({ id }) => id === transactionId) ?? null;
  if (!before) return null;
  const after = { ...before, ...patch, updatedAt };
  if (!after.note) delete after.note;
  return {
    nextPlan: commitFastLogEntry(plan, after, provisionalCategory),
    before,
    after,
  };
}

export function deleteFastLogEntry(
  plan: StoredPlan,
  transactionId: string,
): StoredPlan {
  return {
    ...plan,
    transactions: plan.transactions.filter(({ id }) => id !== transactionId),
  };
}

export function fastLogDeleteTransition(
  plan: StoredPlan,
  transactionId: string,
): FastLogTransition | null {
  const before =
    plan.transactions.find(({ id }) => id === transactionId) ?? null;
  if (!before) return null;
  return {
    nextPlan: deleteFastLogEntry(plan, transactionId),
    before,
    after: null,
  };
}

function sameTransaction(
  left: TransactionEntry | undefined,
  right: TransactionEntry,
): boolean {
  return (
    left?.id === right.id &&
    left.categoryId === right.categoryId &&
    left.amountCents === right.amountCents &&
    left.title === right.title &&
    left.note === right.note &&
    left.date === right.date &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt
  );
}

export function undoFastLogEntry(
  plan: StoredPlan,
  before: TransactionEntry | null,
  after: TransactionEntry | null,
): StoredPlan {
  const transactionId = after?.id ?? before?.id;
  if (!transactionId) return plan;
  const current = plan.transactions.find(({ id }) => id === transactionId);
  const stillAtChangedState = after
    ? sameTransaction(current, after)
    : current === undefined;
  if (!stillAtChangedState) return plan;
  if (before) return commitFastLogEntry(plan, before);
  return deleteFastLogEntry(plan, transactionId);
}

import { annualExpenseAmount, type ExpenseEntry } from "@/domain/budget";

export function expenseTotalsByGroup(expenses: ExpenseEntry[]) {
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    const group = expense.group.trim() || "Ungrouped";
    totals.set(group, (totals.get(group) ?? 0) + annualExpenseAmount(expense));
  }
  return [...totals.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

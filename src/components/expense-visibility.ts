import { annualExpenseAmount, type ExpenseEntry } from "@/domain/budget";
import { DEFAULT_EXPENSES } from "@/domain/defaults";

const primaryDefaultExpenseNames = new Set([
  "Rent",
  "Groceries",
  "Water",
  "Electric",
  "Gas",
  "Internet",
]);
const defaultExpenseNames = new Set(DEFAULT_EXPENSES.map(({ name }) => name));

export function isUnusedDefaultExpense(expense: ExpenseEntry): boolean {
  return (
    annualExpenseAmount(expense) === 0 &&
    defaultExpenseNames.has(expense.name) &&
    !primaryDefaultExpenseNames.has(expense.name)
  );
}

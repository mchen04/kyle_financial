import { describe, expect, it } from "vitest";
import type { ExpenseEntry } from "@/domain/budget";
import { DEFAULT_EXPENSES } from "@/domain/defaults";
import { isUnusedDefaultExpense } from "./expense-visibility";

const expenses: ExpenseEntry[] = DEFAULT_EXPENSES.map((expense, index) => ({
  ...expense,
  id: `expense-${index}`,
}));

describe("default expense progressive disclosure", () => {
  it("keeps six common rows visible and collapses the other unused defaults", () => {
    expect(
      expenses.filter((expense) => !isUnusedDefaultExpense(expense)),
    ).toHaveLength(6);
    expect(expenses.filter(isUnusedDefaultExpense)).toHaveLength(17);
  });

  it("keeps nonzero, renamed, and custom rows visible without deleting data", () => {
    const carPayment = expenses[0];
    expect(isUnusedDefaultExpense(carPayment)).toBe(true);
    expect(isUnusedDefaultExpense({ ...carPayment, amountCents: 50_000 })).toBe(
      false,
    );
    expect(
      isUnusedDefaultExpense({ ...carPayment, name: "Lease payment" }),
    ).toBe(false);
    expect(isUnusedDefaultExpense({ ...carPayment, name: "New expense" })).toBe(
      false,
    );
  });
});

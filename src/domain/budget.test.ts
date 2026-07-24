import { describe, expect, it } from "vitest";
import {
  addBudgetCategory,
  annualExpenseAmount,
  moveActiveBudgetCategory,
  normalizedHsaPlanSettings,
  patchBudgetCategory,
  type BudgetCategory,
} from "./budget";

describe("HSA plan settings", () => {
  it("preserves explicit spouse eligibility for MFJ self-only coverage", () => {
    expect(
      normalizedHsaPlanSettings({
        filingStatus: "mfj",
        hsaCoverage: "self",
        primaryHsaEligible: true,
        spouseHsaEligible: true,
        primaryHsaCatchUpEligible: true,
        spouseHsaCatchUpEligible: true,
        primaryHsaFamilyAllocationPpm: 500_000,
        spouseHsaFamilyAllocationPpm: 500_000,
      }),
    ).toEqual({
      primaryHsaEligible: true,
      spouseHsaEligible: true,
      primaryHsaCatchUpEligible: true,
      spouseHsaCatchUpEligible: true,
      primaryHsaFamilyAllocationPpm: 1_000_000,
      spouseHsaFamilyAllocationPpm: 0,
    });
  });

  it("removes catch-up eligibility from an ineligible owner and non-MFJ spouse", () => {
    expect(
      normalizedHsaPlanSettings({
        filingStatus: "single",
        hsaCoverage: "self",
        primaryHsaEligible: false,
        spouseHsaEligible: true,
        primaryHsaCatchUpEligible: true,
        spouseHsaCatchUpEligible: true,
      }),
    ).toMatchObject({
      primaryHsaEligible: false,
      spouseHsaEligible: false,
      primaryHsaCatchUpEligible: false,
      spouseHsaCatchUpEligible: false,
    });
  });
});

describe("archived budget categories", () => {
  it("uses one canonical category creation and patch policy", () => {
    const categories = addBudgetCategory([], "new");
    expect(categories).toEqual([
      expect.objectContaining({
        id: "new",
        name: "New category",
        group: "Wants",
        guidanceBucket: "wants",
        colorToken: "blue",
        archived: false,
      }),
    ]);

    expect(
      patchBudgetCategory(categories, "new", {
        name: "Rent",
        guidanceBucket: "needs",
      }),
    ).toEqual([
      expect.objectContaining({
        id: "new",
        name: "Rent",
        guidanceBucket: "needs",
      }),
    ]);
  });

  it("removes archived allocations from the active annual plan", () => {
    const expense = {
      id: "rent",
      name: "Rent",
      group: "Needs",
      cadence: "monthly" as const,
      amountCents: 200_000,
      sortOrder: 0,
    };

    expect(annualExpenseAmount(expense)).toBe(2_400_000);
    expect(annualExpenseAmount({ ...expense, archived: true })).toBe(0);
  });

  it("reorders active siblings without moving hidden archived rows", () => {
    const category = (
      id: string,
      sortOrder: number,
      archived = false,
    ): BudgetCategory => ({
      id,
      name: id,
      group: "Everyday",
      cadence: "monthly",
      amountCents: 0,
      sortOrder,
      guidanceBucket: "wants",
      colorToken: "slate",
      archived,
    });
    const categories = [
      category("first", 0),
      category("archived", 1, true),
      category("second", 2),
    ];

    const reordered = moveActiveBudgetCategory(categories, "second", -1);

    expect(reordered.map(({ id }) => id)).toEqual([
      "second",
      "archived",
      "first",
    ]);
    expect(reordered.map(({ sortOrder }) => sortOrder)).toEqual([0, 1, 2]);
    expect(moveActiveBudgetCategory(reordered, "second", -1)).toEqual(
      reordered,
    );
  });
});

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { BudgetCategory, TransactionEntry } from "./budget";
import {
  allocateAnnualCentsToMonths,
  allocateDisplayedPercentageTenths,
  allocatePiePercentages,
  buildMonthlyWrap,
  calculateAnnualSavingsProjection,
  calculateSavingsImpact,
  currentLocalDate,
  localDate,
  observedTransactionsThrough,
  rollupBudget,
  transactionIsInPeriod,
  type SelectedPeriod,
  unobservedTransactionsAfter,
} from "./daily-money";

const needs: BudgetCategory = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Groceries",
  group: "Everyday",
  cadence: "monthly",
  amountCents: 50_000,
  sortOrder: 0,
  guidanceBucket: "needs",
  colorToken: "blue",
  archived: false,
};
const wants: BudgetCategory = {
  ...needs,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Fun",
  group: "Lifestyle",
  amountCents: 20_000,
  sortOrder: 1,
  guidanceBucket: "wants",
  colorToken: "teal",
};
const saving: BudgetCategory = {
  ...needs,
  id: "33333333-3333-4333-8333-333333333333",
  name: "Brokerage",
  group: "Investing",
  amountCents: 30_000,
  sortOrder: 2,
  guidanceBucket: "saving",
  colorToken: "violet",
};

function transaction(
  overrides: Partial<TransactionEntry> = {},
): TransactionEntry {
  return {
    id: crypto.randomUUID(),
    categoryId: needs.id,
    amountCents: 10_000,
    title: "Market",
    date: "2026-07-10",
    createdAt: "2026-07-10T12:00:00.000Z",
    updatedAt: "2026-07-10T12:00:00.000Z",
    ...overrides,
  };
}

describe("daily money domain", () => {
  it("excludes actuals after the observer's local today", () => {
    const transactions = [
      transaction({ id: "today", date: "2026-07-24" }),
      transaction({ id: "future", date: "2026-07-25" }),
    ];
    const observed = observedTransactionsThrough(transactions, "2026-07-24");
    const unobserved = unobservedTransactionsAfter(transactions, "2026-07-24");

    expect(observed.map(({ id }) => id)).toEqual(["today"]);
    expect(unobserved.map(({ id }) => id)).toEqual(["future"]);
  });

  it("allocates every annual cent across twelve months exactly", () => {
    fc.assert(
      fc.property(
        fc.integer({
          min: -Number.MAX_SAFE_INTEGER,
          max: Number.MAX_SAFE_INTEGER,
        }),
        (annualCents) => {
          const months = allocateAnnualCentsToMonths(annualCents);
          expect(months).toHaveLength(12);
          expect(months.reduce((sum, value) => sum + value, 0)).toBe(
            annualCents,
          );
          expect(Math.max(...months) - Math.min(...months)).toBeLessThanOrEqual(
            1,
          );
        },
      ),
    );
  });

  it("keeps local calendar dates stable without UTC conversion", () => {
    expect(localDate(2024, 2, 29)).toBe("2024-02-29");
    expect(() => localDate(2025, 2, 29)).toThrow();
    const localMidnight = new Date(2026, 0, 1, 0, 15);
    expect(currentLocalDate(localMidnight)).toBe("2026-01-01");
  });

  it("uses exact month, YTD-through-date, and full-year boundaries", () => {
    const entry = transaction({ date: "2026-07-31" });
    expect(
      transactionIsInPeriod(entry, { kind: "month", year: 2026, month: 7 }),
    ).toBe(true);
    expect(
      transactionIsInPeriod(entry, {
        kind: "ytd",
        year: 2026,
        throughDate: "2026-07-30",
      }),
    ).toBe(false);
    expect(transactionIsInPeriod(entry, { kind: "year", year: 2026 })).toBe(
      true,
    );
    expect(
      transactionIsInPeriod(transaction({ date: "2025-12-31" }), {
        kind: "year",
        year: 2026,
      }),
    ).toBe(false);
  });

  it.each<SelectedPeriod>([
    { kind: "month", year: 2026, month: 7 },
    { kind: "ytd", year: 2026, throughDate: "2026-07-23" },
    { kind: "year", year: 2026 },
  ])("reconciles category and total rollups for $kind", (period) => {
    const transactions = [
      transaction(),
      transaction({
        categoryId: wants.id,
        amountCents: 25_000,
        title: "Concert",
      }),
      transaction({
        categoryId: saving.id,
        amountCents: 15_000,
        title: "Deposit",
      }),
    ];
    const result = rollupBudget([needs, wants, saving], transactions, period);
    expect(
      result.categories.reduce(
        (sum, category) => sum + category.allocatedCents,
        0,
      ),
    ).toBe(result.allocatedCents);
    expect(
      result.categories.reduce(
        (sum, category) => sum + category.actualCents,
        0,
      ),
    ).toBe(result.actualCents);
    expect(result.remainingCents).toBe(
      result.allocatedCents - result.actualCents,
    );
    expect(result.safeToSpendCents).toBe(
      result.spendingAllocatedCents - result.spendingActualCents,
    );
  });

  it("keeps over-budget values negative and uses funding terminology", () => {
    const result = rollupBudget(
      [needs, saving],
      [
        transaction({ amountCents: 60_000 }),
        transaction({
          categoryId: saving.id,
          amountCents: 5_000,
          title: "Deposit",
        }),
      ],
      { kind: "month", year: 2026, month: 7 },
    );
    expect(result.categories[0].remainingCents).toBe(-10_000);
    expect(result.safeToSpendCents).toBe(-10_000);
    expect(result.categories[1]).toMatchObject({
      actualLabel: "funded",
      remainingLabel: "left to fund",
    });
  });

  it.each<SelectedPeriod>([
    { kind: "month", year: 2026, month: 7 },
    { kind: "ytd", year: 2026, throughDate: "2026-07-23" },
    { kind: "year", year: 2026 },
  ])(
    "retains archived category history with no active allocation for $kind",
    (period) => {
      const archived = { ...needs, archived: true };
      const entry = transaction({ amountCents: 12_345 });

      const result = rollupBudget([archived], [entry], period);

      expect(result.categories).toHaveLength(1);
      expect(result.categories[0]).toMatchObject({
        category: { id: archived.id, archived: true },
        allocatedCents: 0,
        actualCents: 12_345,
        remainingCents: -12_345,
      });
      expect(result.safeToSpendCents).toBe(-12_345);
    },
  );

  it("keeps archived history in Monthly Wrap without restoring its allocation", () => {
    const archived = { ...needs, archived: true };
    const entry = transaction({ amountCents: 12_345 });
    const wrap = buildMonthlyWrap(
      [archived],
      [entry],
      { kind: "month", year: 2026, month: 7 },
      {
        cashSavingsAnnualCents: 0,
        payrollSavingsAnnualCents: 0,
        employerSavingsAnnualCents: 0,
      },
    );

    expect(wrap.overBudget).toHaveLength(1);
    expect(wrap.budget).toMatchObject({
      allocatedCents: 0,
      actualCents: 12_345,
      safeToSpendCents: -12_345,
    });
  });

  it("does not double-count spending variance or saving funding", () => {
    const budget = rollupBudget(
      [needs, saving],
      [
        transaction({ amountCents: 40_000 }),
        transaction({
          categoryId: saving.id,
          amountCents: 35_000,
          title: "Deposit",
        }),
      ],
      { kind: "month", year: 2026, month: 7 },
    );
    const impact = calculateSavingsImpact(budget, {
      cashSavingsAnnualCents: 120_000,
      payrollSavingsAnnualCents: 240_000,
      employerSavingsAnnualCents: 60_000,
    });
    expect(impact.plannedSavingsChangeCents).toBe(65_000);
    expect(impact.spendingVarianceCents).toBe(10_000);
    expect(impact.savingFundingVarianceCents).toBe(5_000);
    expect(impact.projectedSavingsChangeCents).toBe(80_000);
  });

  it("shows an ending balance only when starting savings is known", () => {
    const budget = rollupBudget([needs], [], {
      kind: "month",
      year: 2026,
      month: 7,
    });
    const sources = {
      cashSavingsAnnualCents: 120_000,
      payrollSavingsAnnualCents: 0,
      employerSavingsAnnualCents: 0,
    };
    expect(calculateSavingsImpact(budget, sources)).not.toHaveProperty(
      "projectedEndingSavingsCents",
    );
    expect(calculateSavingsImpact(budget, sources, 1_000_000)).toMatchObject({
      startingSavingsCents: 1_000_000,
      projectedEndingSavingsCents: 1_060_000,
    });
  });

  it("projects the annual plan with observed variance but not future unspent months", () => {
    const sources = {
      cashSavingsAnnualCents: 120_000,
      payrollSavingsAnnualCents: 240_000,
      employerSavingsAnnualCents: 60_000,
    };
    const annual = rollupBudget([needs, wants, saving], [], {
      kind: "year",
      year: 2026,
    });
    const observed = rollupBudget(
      [needs, wants, saving],
      [
        transaction({ amountCents: 330_000 }),
        transaction({
          categoryId: wants.id,
          amountCents: 140_000,
          title: "Observed wants",
        }),
        transaction({
          categoryId: saving.id,
          amountCents: 200_000,
          title: "Observed funding",
        }),
      ],
      { kind: "ytd", year: 2026, throughDate: "2026-07-23" },
    );
    expect(
      calculateAnnualSavingsProjection(annual, undefined, sources),
    ).toMatchObject({
      plannedSavingsChangeCents: 780_000,
      observedSpendingVarianceCents: 0,
      observedSavingFundingVarianceCents: 0,
      projectedSavingsChangeCents: 780_000,
    });
    expect(
      calculateAnnualSavingsProjection(annual, observed, sources, 1_000_000),
    ).toMatchObject({
      plannedSavingsChangeCents: 780_000,
      observedSpendingVarianceCents: 20_000,
      observedSavingFundingVarianceCents: -10_000,
      projectedSavingsChangeCents: 790_000,
      projectedEndingSavingsCents: 1_790_000,
    });
  });

  it("builds wrap under/over groups from spending categories only", () => {
    const wrap = buildMonthlyWrap(
      [needs, wants, saving],
      [
        transaction({ amountCents: 45_000 }),
        transaction({
          categoryId: wants.id,
          amountCents: 25_000,
          title: "Concert",
        }),
      ],
      { kind: "month", year: 2026, month: 7 },
      {
        cashSavingsAnnualCents: 0,
        payrollSavingsAnnualCents: 0,
        employerSavingsAnnualCents: 0,
      },
    );
    expect(wrap.underBudget.map(({ category }) => category.id)).toEqual([
      needs.id,
    ]);
    expect(wrap.overBudget.map(({ category }) => category.id)).toEqual([
      wants.id,
    ]);
    expect(
      [...wrap.underBudget, ...wrap.overBudget].some(
        ({ category }) => category.id === saving.id,
      ),
    ).toBe(false);
  });

  it("allocates pie percentages to exactly one million millionths", () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.integer({ min: 0, max: 1_000_000_000 }), {
            minLength: 1,
            maxLength: 40,
          })
          .filter((values) => values.some((value) => value > 0)),
        (values) => {
          const result = allocatePiePercentages(
            values.map((valueCents, index) => ({
              id: String(index),
              valueCents,
            })),
          );
          expect(
            result.reduce((sum, value) => sum + value.percentagePpm, 0),
          ).toBe(1_000_000);
          expect(result.map(({ valueCents }) => valueCents)).toEqual(values);
        },
      ),
    );
  });

  it("allocates displayed tenths to exactly 100.0 percent", () => {
    const allocations = allocatePiePercentages([
      { id: "a", valueCents: 1 },
      { id: "b", valueCents: 1 },
      { id: "c", valueCents: 1 },
    ]);
    const displayed = allocateDisplayedPercentageTenths(allocations);

    expect([...displayed.values()]).toEqual([334, 333, 333]);
    expect([...displayed.values()].reduce((sum, value) => sum + value, 0)).toBe(
      1_000,
    );
  });

  it("keeps displayed pie totals exact for arbitrary positive allocations", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 100_000_000 }), {
          minLength: 1,
          maxLength: 40,
        }),
        (values) => {
          fc.pre(values.some((value) => value > 0));
          const allocations = allocatePiePercentages(
            values.map((valueCents, index) => ({
              id: `category-${index}`,
              valueCents,
            })),
          );
          const displayed = [
            ...allocateDisplayedPercentageTenths(allocations).values(),
          ];

          expect(displayed.reduce((sum, value) => sum + value, 0)).toBe(1_000);
          expect(displayed.every((value) => value >= 0)).toBe(true);
        },
      ),
    );
  });
});

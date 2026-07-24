import { describe, expect, it } from "vitest";
import type { ExpenseEntry, TransactionEntry } from "@/domain/budget";
import {
  homeSavingsImpactCents,
  homeSavingsImpactLabel,
} from "./cockpit-home-projection";

const spending: ExpenseEntry = {
  id: "spending",
  name: "Spending",
  group: "Needs",
  cadence: "monthly",
  amountCents: 10_000,
  sortOrder: 0,
  guidanceBucket: "needs",
};
const sources = {
  cashSavingsAnnualCents: 120_000,
  payrollSavingsAnnualCents: 0,
  employerSavingsAnnualCents: 0,
};

function transaction(date: string, amountCents: number): TransactionEntry {
  return {
    id: `${date}-${amountCents}`,
    categoryId: spending.id,
    amountCents,
    title: "Expense",
    date,
    createdAt: `${date}T12:00:00.000Z`,
    updatedAt: `${date}T12:00:00.000Z`,
  };
}

describe("Home savings impact", () => {
  it("does not count an unstarted month's unspent budget as savings", () => {
    expect(
      homeSavingsImpactCents(
        [spending],
        [],
        { kind: "month", year: 2026, month: 8 },
        sources,
        "2026-07-24",
      ),
    ).toBe(10_000);
    expect(
      homeSavingsImpactLabel(
        { kind: "month", year: 2026, month: 8 },
        "2026-07-24",
      ),
    ).toBe("Planned savings");
  });

  it("uses only observed variance in a current full-year projection", () => {
    expect(
      homeSavingsImpactCents(
        [spending],
        [transaction("2026-07-20", 8_000)],
        { kind: "year", year: 2026 },
        sources,
        "2026-07-24",
      ),
    ).toBe(182_000);
    expect(
      homeSavingsImpactLabel({ kind: "year", year: 2026 }, "2026-07-24"),
    ).toBe("Projected savings");
  });

  it("keeps closed-month variance in the reported impact", () => {
    expect(
      homeSavingsImpactCents(
        [spending],
        [transaction("2026-06-20", 8_000)],
        { kind: "month", year: 2026, month: 6 },
        sources,
        "2026-07-24",
      ),
    ).toBe(12_000);
  });
});

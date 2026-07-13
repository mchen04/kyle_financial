import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  benefitEntry as benefit,
  planInput as plan,
} from "@/test/fixtures/plans";
import { multiplyByRate } from "../money";
import { calculatePlan } from "./engine";

describe("property coverage", () => {
  it("makes percent deductions agree with their exact fixed-dollar equivalent", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.constantFrom("TX", "IL", "CA", "NY", "CO"),
        (grossSalaryCents, ratePpm, stateCode) => {
          const exactCents = multiplyByRate(grossSalaryCents, ratePpm);
          const percent = calculatePlan(
            plan({
              grossSalaryCents,
              stateCode,
              benefits: [benefit({ amount: { kind: "percent", ratePpm } })],
            }),
          );
          const fixed = calculatePlan(
            plan({
              grossSalaryCents,
              stateCode,
              benefits: [
                benefit({ amount: { kind: "fixedAnnual", cents: exactCents } }),
              ],
            }),
          );

          expect(percent.benefits[0].annualAmountCents).toBe(exactCents);
          expect(percent).toMatchObject({
            federalTaxableIncomeCents: fixed.federalTaxableIncomeCents,
            stateTaxableIncomeCents: fixed.stateTaxableIncomeCents,
            ficaTaxableWagesCents: fixed.ficaTaxableWagesCents,
            totalTaxCents: fixed.totalTaxCents,
            paycheckDeductionsAnnualCents: fixed.paycheckDeductionsAnnualCents,
            takeHomeAnnualCents: fixed.takeHomeAnnualCents,
            payrollSavingsAnnualCents: fixed.payrollSavingsAnnualCents,
            accountingDifferenceCents: 0,
          });
        },
      ),
      { numRuns: 1_000, seed: 20_260_712 },
    );
  });

  it("never reduces take-home when gross wages increase", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 99_000_000 }),
        fc.integer({ min: 100, max: 1_000_000 }),
        fc.constantFrom("TX", "IL", "CA", "NY", "CO"),
        (income, increase, stateCode) => {
          const before = calculatePlan(
            plan({ grossSalaryCents: income, stateCode }),
          );
          const after = calculatePlan(
            plan({ grossSalaryCents: income + increase, stateCode }),
          );
          expect(after.takeHomeAnnualCents).toBeGreaterThanOrEqual(
            before.takeHomeAnnualCents,
          );
        },
      ),
      { numRuns: 1_000, seed: 20_260_712 },
    );
  });

  it("never increases take-home when a post-tax payroll deduction increases", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1_000_000, max: 100_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (grossSalaryCents, initialCents, increase) => {
          const before = calculatePlan(
            plan({
              grossSalaryCents,
              benefits: [
                benefit({
                  type: "roth401k",
                  amount: { kind: "fixedAnnual", cents: initialCents },
                }),
              ],
            }),
          );
          const after = calculatePlan(
            plan({
              grossSalaryCents,
              benefits: [
                benefit({
                  type: "roth401k",
                  amount: {
                    kind: "fixedAnnual",
                    cents: initialCents + increase,
                  },
                }),
              ],
            }),
          );

          expect(after.totalTaxCents).toBe(before.totalTaxCents);
          expect(after.takeHomeAnnualCents).toBe(
            before.takeHomeAnnualCents - increase,
          );
        },
      ),
      { numRuns: 1_000, seed: 20_260_712 },
    );
  });

  it("keeps exact accounting and finite nonnegative taxes for random valid plans", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.integer({ min: 0, max: 50_000_000 }),
        fc.constantFrom("TX", "IL", "CA", "NY", "CO"),
        (income, expense, stateCode) => {
          const result = calculatePlan(
            plan({
              grossSalaryCents: income,
              stateCode,
              expenses: [
                {
                  id: "expense",
                  name: "Expense",
                  group: "Other",
                  cadence: "yearly",
                  amountCents: expense,
                  sortOrder: 0,
                },
              ],
            }),
          );
          expect(result.accountingDifferenceCents).toBe(0);
          expect(result.totalTaxCents).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(result.totalTaxCents)).toBe(true);
          expect(result.savingsMonthlyCents).toBe(
            result.takeHomeMonthlyCents - result.expensesMonthlyCents,
          );
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it("never decreases total tax when gross wages rise without deductions", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 99_999_900 }),
        fc.integer({ min: 1, max: 100 }),
        fc.constantFrom("TX", "IL", "CA", "NY", "CO"),
        (income, increase, stateCode) => {
          const before = calculatePlan(
            plan({ grossSalaryCents: income, stateCode }),
          );
          const after = calculatePlan(
            plan({ grossSalaryCents: income + increase, stateCode }),
          );
          expect(after.totalTaxCents).toBeGreaterThanOrEqual(
            before.totalTaxCents,
          );
        },
      ),
      { numRuns: 1_000 },
    );
  });
});

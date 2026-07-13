import fc from "fast-check";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planInput as plan } from "@/test/fixtures/plans";
import {
  BENEFIT_TREATMENTS,
  type BenefitEntry,
  type BenefitType,
} from "./benefits";
import type { PlanInput } from "./budget";
import { diffPlanMutations, isIncomingVersionNewer } from "./sync";
import oracleData from "./tax/fixtures/2026-gross-to-net-oracle.json";
import { calculatePlan, type PlanResult } from "./tax/engine";
import { selectTaxTable } from "./tax/table-registry";
import { STATE_CODES } from "./tax/jurisdictions";
import type { FilingStatus } from "./tax/types";

const stateCodes = STATE_CODES;
const filingStatuses: FilingStatus[] = ["single", "mfj", "hoh"];
const benefitTypes = Object.keys(BENEFIT_TREATMENTS) as Exclude<
  BenefitType,
  "custom"
>[];

function aggregate(result: PlanResult) {
  return {
    federalTaxableIncomeCents: result.federalTaxableIncomeCents,
    stateTaxableIncomeCents: result.stateTaxableIncomeCents,
    ficaTaxableWagesCents: result.ficaTaxableWagesCents,
    totalTaxCents: result.totalTaxCents,
    paycheckDeductionsAnnualCents: result.paycheckDeductionsAnnualCents,
    takeHomeAnnualCents: result.takeHomeAnnualCents,
    expensesAnnualCents: result.expensesAnnualCents,
    cashSavingsAnnualCents: result.cashSavingsAnnualCents,
    payrollSavingsAnnualCents: result.payrollSavingsAnnualCents,
    employerSavingsAnnualCents: result.employerSavingsAnnualCents,
    totalSavedAnnualCents: result.totalSavedAnnualCents,
    accountingDifferenceCents: result.accountingDifferenceCents,
  };
}

describe("independent 2026 gross-to-net oracle", () => {
  it.each(oracleData)("matches every recorded intermediate for $id", (row) => {
    const result = calculatePlan(plan(row.input as Partial<PlanInput>));
    const actual = {
      ...Object.fromEntries(
        Object.keys(row.expected)
          .filter((key) => key !== "federalBracketTaxes")
          .map((key) => [key, result[key as keyof PlanResult]]),
      ),
      federalBracketTaxes: result.federalBracketTaxes.map(
        ({ taxableSliceCents, taxCents }) => [taxableSliceCents, taxCents],
      ),
    };
    expect(actual).toEqual(row.expected);
    expect(result.accountingDifferenceCents).toBe(0);
  });
});

describe("seeded combinatorial and boundary matrices", () => {
  it("runs every state, filing status, and benefit treatment", () => {
    let cases = 0;
    for (const stateCode of stateCodes) {
      for (const filingStatus of filingStatuses) {
        for (const type of benefitTypes) {
          const spouseWageIncomeCents = filingStatus === "mfj" ? 10_000_000 : 0;
          const grossIncomeCents = 10_000_000 + spouseWageIncomeCents;
          const entry: BenefitEntry = {
            id: `${stateCode}-${filingStatus}-${type}`,
            type,
            label: type,
            amount: { kind: "fixedAnnual", cents: 120_000 },
            ...(type === "espp" ? { discountRatePpm: 150_000 } : {}),
          };
          const result = calculatePlan(
            plan({
              stateCode,
              filingStatus,
              spouseWageIncomeCents,
              benefits: [entry],
            }),
          );
          const treatment = BENEFIT_TREATMENTS[type];
          expect(result.federalTaxableIncomeCents).toBe(
            Math.max(
              0,
              grossIncomeCents -
                (treatment.reducesFederalTaxable ? 120_000 : 0) -
                selectTaxTable(2026).table.federal[filingStatus]
                  .standardDeductionCents,
            ),
          );
          expect(result.ficaTaxableWagesCents).toBe(
            grossIncomeCents - (treatment.reducesFicaTaxable ? 120_000 : 0),
          );
          expect(result.accountingDifferenceCents).toBe(0);
          expect(Number.isSafeInteger(result.totalTaxCents)).toBe(true);
          cases += 1;
        }
      }
    }
    expect(cases).toBe(51 * 3 * benefitTypes.length);
  });

  it.each([0, 1, 2, 3, 5, 10, 30, 31, 100, 101])(
    "handles an expense batch at the %i-entry boundary",
    (count) => {
      const result = calculatePlan(
        plan({
          expenses: Array.from({ length: count }, (_, index) => ({
            id: String(index),
            name: `Expense ${index}`,
            group: "Other",
            cadence: "yearly" as const,
            amountCents: 1,
            sortOrder: index,
          })),
        }),
      );
      expect(result.expensesAnnualCents).toBe(count);
      expect(result.cashSavingsAnnualCents).toBe(
        result.takeHomeAnnualCents - count,
      );
    },
  );

  it("treats equivalent monthly and yearly amounts identically", () => {
    const monthly = calculatePlan(
      plan({
        expenses: [
          {
            id: "expense",
            name: "Expense",
            group: "Other",
            cadence: "monthly",
            amountCents: 12_345,
            sortOrder: 0,
          },
        ],
      }),
    );
    const yearly = calculatePlan(
      plan({
        expenses: [
          {
            id: "expense",
            name: "Expense",
            group: "Other",
            cadence: "yearly",
            amountCents: 148_140,
            sortOrder: 0,
          },
        ],
      }),
    );
    expect(aggregate(monthly)).toEqual(aggregate(yearly));
  });
});

describe("metamorphic behavior", () => {
  it("is invariant to benefit and expense input order", () => {
    const benefits: BenefitEntry[] = [
      {
        id: "401k",
        type: "traditional401k",
        label: "401(k)",
        amount: { kind: "fixedAnnual", cents: 500_000 },
      },
      {
        id: "hsa",
        type: "hsa",
        label: "HSA",
        amount: { kind: "fixedMonthly", cents: 20_000 },
      },
    ];
    const expenses = [
      {
        id: "rent",
        name: "Rent",
        group: "Needs",
        cadence: "monthly" as const,
        amountCents: 200_000,
        sortOrder: 0,
      },
      {
        id: "travel",
        name: "Travel",
        group: "Wants",
        cadence: "yearly" as const,
        amountCents: 300_000,
        sortOrder: 1,
      },
    ];
    const forward = calculatePlan(plan({ benefits, expenses }));
    const reversed = calculatePlan(
      plan({
        benefits: benefits.toReversed(),
        expenses: expenses.toReversed(),
      }),
    );
    expect(aggregate(forward)).toEqual(aggregate(reversed));
  });

  it("diffs exactly the changed top-level fields without mutating either plan", () => {
    const previous = {
      id: "plan",
      ...plan(),
      updatedAt: "2026-07-12T00:00:00.000Z",
      fieldVersions: {},
    };
    const current = {
      ...previous,
      stateCode: "CA" as const,
      expenses: [
        {
          id: "00000000-0000-4000-8000-000000000101",
          name: "Rent",
          group: "Needs",
          cadence: "monthly" as const,
          amountCents: 200_000,
          sortOrder: 0,
        },
      ],
    };
    const before = JSON.stringify({ previous, current });
    let sequence = 0;
    const mutations = diffPlanMutations(
      previous,
      current,
      "2026-07-12T01:00:00.000Z",
      () => `mutation-${sequence++}`,
    );
    expect(mutations.map(({ field }) => field)).toEqual([
      "stateCode",
      "expense:00000000-0000-4000-8000-000000000101",
    ]);
    expect(JSON.stringify({ previous, current })).toBe(before);
    expect(
      diffPlanMutations(
        current,
        structuredClone(current),
        "2026-07-12T01:00:00.000Z",
      ),
    ).toEqual([]);

    const customTreatment = {
      reducesFederalTaxable: true,
      reducesFicaTaxable: false,
      reducesStateTaxable: true,
      reducesTakeHome: true,
      countsAsSavings: false,
      employerSide: false,
    };
    const withCustom = {
      ...current,
      benefits: [
        {
          id: "00000000-0000-4000-8000-000000000102",
          type: "custom" as const,
          label: "Custom",
          amount: { kind: "fixedAnnual" as const, cents: 100 },
          customTaxTreatment: customTreatment,
        },
      ],
    };
    const reordered = {
      ...withCustom,
      benefits: [
        {
          ...withCustom.benefits[0],
          customTaxTreatment: Object.fromEntries(
            Object.entries(customTreatment).toReversed(),
          ) as typeof customTreatment,
        },
      ],
    };
    expect(
      diffPlanMutations(withCustom, reordered, "2026-07-12T01:00:00.000Z"),
    ).toEqual([]);
  });

  it("diffs existing collection entries by property and caps sync batches", () => {
    const previous = {
      id: "plan",
      ...plan({
        expenses: [
          {
            id: "00000000-0000-4000-8000-000000000103",
            name: "Rent",
            group: "Needs",
            cadence: "monthly" as const,
            amountCents: 100_000,
            sortOrder: 0,
          },
        ],
      }),
      updatedAt: "2026-07-12T00:00:00.000Z",
      fieldVersions: {},
    };
    const current = {
      ...previous,
      expenses: [{ ...previous.expenses[0], amountCents: 200_000 }],
    };
    let sequence = 0;
    const mutations = diffPlanMutations(
      previous,
      current,
      "2026-07-12T01:00:00.000Z",
      () => `mutation-${sequence++}`,
    );
    expect(mutations.map(({ field }) => field)).toEqual([
      "expense:00000000-0000-4000-8000-000000000103:amountCents",
    ]);
  });
});

describe("seeded property and fuzz coverage", () => {
  it("keeps an explicit guidance bucket independent from its label", () => {
    const result = calculatePlan(
      plan({
        expenses: [
          {
            id: "medical",
            name: "Copays",
            group: "Medical copays",
            guidanceBucket: "needs",
            cadence: "yearly",
            amountCents: 100_000,
            sortOrder: 0,
          },
        ],
      }),
    );
    expect(result.needsExpensesAnnualCents).toBe(100_000);
    expect(result.wantsExpensesAnnualCents).toBe(0);
  });
  it("preserves conservation under rich randomized plans", () => {
    fc.assert(
      fc.property(
        fc.record({
          grossSalaryCents: fc.integer({ min: 0, max: 100_000_000 }),
          additionalWageIncomeCents: fc.integer({
            min: 0,
            max: 10_000_000,
          }),
          spouseWageIncomeCents: fc.integer({ min: 0, max: 100_000_000 }),
          otherOrdinaryIncomeCents: fc.integer({
            min: 0,
            max: 10_000_000,
          }),
          expenseCents: fc.integer({ min: 0, max: 150_000_000 }),
          contributionRatePpm: fc.integer({ min: 0, max: 1_000_000 }),
          stateCode: fc.constantFrom(...stateCodes),
          filingStatus: fc.constantFrom(...filingStatuses),
        }),
        (sample) => {
          const result = calculatePlan(
            plan({
              ...sample,
              spouseWageIncomeCents:
                sample.filingStatus === "mfj"
                  ? sample.spouseWageIncomeCents
                  : 0,
              benefits: [
                {
                  id: "benefit",
                  type: "traditional401k",
                  label: "401(k)",
                  amount: {
                    kind: "percent",
                    ratePpm: sample.contributionRatePpm,
                  },
                },
              ],
              expenses: [
                {
                  id: "expense",
                  name: "Expense",
                  group: "Other",
                  cadence: "yearly",
                  amountCents: sample.expenseCents,
                  sortOrder: 0,
                },
              ],
            }),
          );
          expect(result.accountingDifferenceCents).toBe(0);
          expect(result.grossIncomeCents).toBe(
            result.totalTaxCents +
              result.paycheckDeductionsAnnualCents +
              result.takeHomeAnnualCents,
          );
          expect(result.cashSavingsAnnualCents).toBe(
            result.takeHomeAnnualCents - result.expensesAnnualCents,
          );
          expect(result.totalSavedAnnualCents).toBe(
            result.cashSavingsAnnualCents +
              result.payrollSavingsAnnualCents +
              result.employerSavingsAnnualCents +
              result.plannedInvestmentAnnualCents,
          );
          expect(result.savingsMonthlyCents).toBe(
            result.takeHomeMonthlyCents - result.expensesMonthlyCents,
          );
        },
      ),
      { numRuns: 3_000, seed: 20_260_712 },
    );
  });

  it("orders conflict timestamps by epoch and mutation IDs only break ties", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2_000_000_000_000 }),
        fc.integer({ min: 0, max: 2_000_000_000_000 }),
        (incomingMs, currentMs) => {
          const incoming = {
            updatedAt: new Date(incomingMs).toISOString(),
            mutationId: "a",
          };
          const current = {
            updatedAt: new Date(currentMs).toISOString(),
            mutationId: "z",
          };
          expect(isIncomingVersionNewer(incoming, current)).toBe(
            incomingMs > currentMs,
          );
        },
      ),
      { numRuns: 5_000, seed: 20_260_712 },
    );
  });
});

describe("deterministic hot-path guard", () => {
  it("contains no model SDK, generation helper, or network fallback", () => {
    const files = [
      "benefits.ts",
      "budget.ts",
      "money.ts",
      "sync.ts",
      "tax/calculate-progressive-tax.ts",
      "tax/engine.ts",
      "tax/table-registry.ts",
      "../server/sync/repository.ts",
    ];
    const forbidden =
      /\b(?:openai|anthropic|generateText|streamText)\b|@ai-sdk|fetch\s*\(/i;
    for (const file of files) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source, file).not.toMatch(forbidden);
    }
  });
});

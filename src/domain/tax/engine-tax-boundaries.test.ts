import { describe, expect, it } from "vitest";
import {
  benefitEntry as benefit,
  planInput as plan,
} from "@/test/fixtures/plans";
import { calculatePlan } from "./engine";

describe("boundaries, warnings, and fallback", () => {
  it("returns an exact zero breakdown for zero income", () => {
    const result = calculatePlan(plan({ grossSalaryCents: 0 }));

    expect(result).toMatchObject({
      grossIncomeCents: 0,
      federalTaxableIncomeCents: 0,
      stateTaxableIncomeCents: 0,
      ficaTaxableWagesCents: 0,
      federalIncomeTaxCents: 0,
      socialSecurityTaxCents: 0,
      medicareTaxCents: 0,
      additionalMedicareTaxCents: 0,
      stateIncomeTaxCents: 0,
      totalTaxCents: 0,
      paycheckDeductionsAnnualCents: 0,
      takeHomeAnnualCents: 0,
      takeHomeMonthlyCents: 0,
      cashSavingsAnnualCents: 0,
      savingsMonthlyCents: 0,
      accountingDifferenceCents: 0,
    });
  });

  it.each([
    {
      filingStatus: "single" as const,
      standardDeductionCents: 1_610_000,
      edges: [
        [1_240_000, 124_000],
        [5_040_000, 580_000],
        [10_570_000, 1_796_600],
        [20_177_500, 4_102_400],
        [25_622_500, 5_844_800],
        [64_060_000, 19_297_925],
      ],
    },
    {
      filingStatus: "mfj" as const,
      standardDeductionCents: 3_220_000,
      edges: [
        [2_480_000, 248_000],
        [10_080_000, 1_160_000],
        [21_140_000, 3_593_200],
        [40_355_000, 8_204_800],
        [51_245_000, 11_689_600],
        [76_870_000, 20_658_350],
      ],
    },
    {
      filingStatus: "hoh" as const,
      standardDeductionCents: 2_415_000,
      edges: [
        [1_770_000, 177_000],
        [6_745_000, 774_000],
        [10_570_000, 1_615_500],
        [20_175_000, 3_920_700],
        [25_620_000, 5_663_100],
        [64_060_000, 19_117_100],
      ],
    },
  ])(
    "calculates every $filingStatus federal bracket edge exactly",
    ({ filingStatus, standardDeductionCents, edges }) => {
      for (const [taxableIncomeCents, expectedTaxCents] of edges) {
        const result = calculatePlan(
          plan({
            filingStatus,
            grossSalaryCents: standardDeductionCents + taxableIncomeCents,
          }),
        );
        expect(result.federalTaxableIncomeCents).toBe(taxableIncomeCents);
        expect(result.federalIncomeTaxCents).toBe(expectedTaxCents);
        const edgeBracket = result.federalBracketTaxes.find(
          ({ thresholdCents }) => thresholdCents === taxableIncomeCents,
        );
        expect(edgeBracket?.taxableSliceCents).toBe(0);
        expect(edgeBracket?.taxCents).toBe(0);
      }
    },
  );

  it("stops Social Security tax at the exact per-participant wage base", () => {
    const wageBaseCents = 18_450_000;
    const atPrimaryCap = calculatePlan(
      plan({ grossSalaryCents: wageBaseCents }),
    );
    const abovePrimaryCap = calculatePlan(
      plan({ grossSalaryCents: wageBaseCents + 100 }),
    );
    expect(atPrimaryCap.socialSecurityTaxCents).toBe(1_143_900);
    expect(abovePrimaryCap.socialSecurityTaxCents).toBe(1_143_900);

    const bothAtCap = calculatePlan(
      plan({
        filingStatus: "mfj",
        grossSalaryCents: wageBaseCents,
        spouseWageIncomeCents: wageBaseCents,
      }),
    );
    expect(bothAtCap.socialSecurityTaxCents).toBe(2_287_800);
  });

  it("starts Additional Medicare one cent above each filing threshold", () => {
    const singleAt = calculatePlan(plan({ grossSalaryCents: 20_000_000 }));
    const singleAbove = calculatePlan(plan({ grossSalaryCents: 20_000_100 }));
    expect(singleAt.additionalMedicareTaxCents).toBe(0);
    expect(singleAbove.additionalMedicareTaxCents).toBe(1);

    const jointAt = calculatePlan(
      plan({
        filingStatus: "mfj",
        grossSalaryCents: 12_500_000,
        spouseWageIncomeCents: 12_500_000,
      }),
    );
    const jointAbove = calculatePlan(
      plan({
        filingStatus: "mfj",
        grossSalaryCents: 12_500_000,
        spouseWageIncomeCents: 12_500_100,
      }),
    );
    expect(jointAt.additionalMedicareTaxCents).toBe(0);
    expect(jointAbove.additionalMedicareTaxCents).toBe(1);
  });

  it("never creates negative taxable income", () => {
    const result = calculatePlan(
      plan({
        grossSalaryCents: 100_000,
        benefits: [
          benefit({ amount: { kind: "fixedAnnual", cents: 2_000_000 } }),
        ],
      }),
    );
    expect(result.federalTaxableIncomeCents).toBe(0);
    expect(result.federalIncomeTaxCents).toBe(0);
  });

  it("rejects corrupted negative domain inputs", () => {
    expect(() =>
      calculatePlan(
        plan({
          expenses: [
            {
              id: "bad",
              name: "Bad expense",
              group: "Other",
              cadence: "monthly",
              amountCents: -1,
              sortOrder: 0,
            },
          ],
        }),
      ),
    ).toThrow("cannot be negative");
  });
});

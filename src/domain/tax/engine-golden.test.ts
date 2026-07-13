import { describe, expect, it } from "vitest";
import type { PlanInput } from "../budget";
import {
  benefitEntry as benefit,
  planInput as plan,
} from "@/test/fixtures/plans";
import { calculatePlan } from "./engine";

describe("tax and budget engine golden scenarios", () => {
  it.each([
    {
      label: "TX single $100,000",
      input: { grossSalaryCents: 10_000_000, stateCode: "TX" },
      expected: {
        federalIncomeTaxCents: 1_317_000,
        ficaTaxCents: 765_000,
        stateIncomeTaxCents: 0,
        takeHomeAnnualCents: 7_918_000,
      },
    },
    {
      label: "IL married $180,000",
      input: {
        grossSalaryCents: 18_000_000,
        filingStatus: "mfj",
        stateCode: "IL",
      },
      expected: {
        federalIncomeTaxCents: 2_194_000,
        ficaTaxCents: 1_377_000,
        stateIncomeTaxCents: 862_043,
        takeHomeAnnualCents: 13_566_957,
      },
    },
    {
      label: "CA single $150,000",
      input: { grossSalaryCents: 15_000_000, stateCode: "CA" },
      expected: {
        federalIncomeTaxCents: 2_473_400,
        ficaTaxCents: 1_147_500,
        stateIncomeTaxCents: 987_342,
        takeHomeAnnualCents: 10_391_758,
      },
    },
    {
      label: "NY married $250,000",
      input: {
        grossSalaryCents: 25_000_000,
        filingStatus: "mfj",
        stateCode: "NY",
      },
      expected: {
        federalIncomeTaxCents: 3_746_800,
        ficaTaxCents: 1_506_400,
        stateIncomeTaxCents: 1_266_280,
        takeHomeAnnualCents: 18_480_520,
      },
    },
    {
      label: "FL single $300,000",
      input: { grossSalaryCents: 30_000_000, stateCode: "FL" },
      expected: {
        federalIncomeTaxCents: 6_813_425,
        ficaTaxCents: 1_668_900,
        stateIncomeTaxCents: 0,
        takeHomeAnnualCents: 21_517_675,
      },
    },
  ] satisfies {
    label: string;
    input: Partial<PlanInput>;
    expected: {
      federalIncomeTaxCents: number;
      ficaTaxCents: number;
      stateIncomeTaxCents: number;
      takeHomeAnnualCents: number;
    };
  }[])(
    "locks every engine component used by the SmartAsset comparison for $label",
    ({ input, expected }) => {
      expect(calculatePlan(plan(input))).toMatchObject(expected);
    },
  );

  it("calculates a $100k single filer in Texas", () => {
    const result = calculatePlan(plan());

    expect(result).toMatchObject({
      grossIncomeCents: 10_000_000,
      federalTaxableIncomeCents: 8_390_000,
      federalIncomeTaxCents: 1_317_000,
      socialSecurityTaxCents: 620_000,
      medicareTaxCents: 145_000,
      additionalMedicareTaxCents: 0,
      stateIncomeTaxCents: 0,
      totalTaxCents: 2_082_000,
      takeHomeAnnualCents: 7_918_000,
      takeHomeMonthlyCents: 659_833,
      savingsMonthlyCents: 659_833,
      accountingDifferenceCents: 0,
    });
    expect(result.federalBracketTaxes.map((row) => row.taxCents)).toEqual([
      124_000, 456_000, 737_000, 0, 0, 0, 0,
    ]);
  });

  it("treats traditional 401(k) as income-tax pre-tax but not FICA pre-tax", () => {
    const result = calculatePlan(
      plan({
        benefits: [benefit({})],
        expenses: [
          {
            id: "rent",
            name: "Rent",
            group: "Needs",
            cadence: "monthly",
            amountCents: 200_000,
            sortOrder: 0,
          },
        ],
      }),
    );

    expect(result.federalTaxableIncomeCents).toBe(7_390_000);
    expect(result.ficaTaxableWagesCents).toBe(10_000_000);
    expect(result.paycheckDeductionsAnnualCents).toBe(1_000_000);
    expect(result.federalIncomeTaxCents).toBe(1_097_000);
    expect(result.takeHomeAnnualCents).toBe(7_138_000);
    expect(result.expensesAnnualCents).toBe(2_400_000);
    expect(result.cashSavingsAnnualCents).toBe(4_738_000);
    expect(result.savingsMonthlyCents).toBe(394_833);
  });

  it("locks every intermediate in a benefit, participant, expense, and savings pipeline", () => {
    const result = calculatePlan(
      plan({
        grossSalaryCents: 12_000_000,
        additionalWageIncomeCents: 1_000_000,
        spouseWageIncomeCents: 8_000_000,
        otherOrdinaryIncomeCents: 500_000,
        filingStatus: "mfj",
        spouseHsaEligible: true,
        benefits: [
          benefit({
            id: "traditional",
            owner: "primary",
            amount: { kind: "fixedAnnual", cents: 1_000_000 },
          }),
          benefit({
            id: "hsa",
            owner: "spouse",
            type: "hsa",
            label: "Spouse HSA",
            amount: { kind: "fixedAnnual", cents: 400_000 },
          }),
          benefit({
            id: "roth",
            owner: "primary",
            type: "roth401k",
            label: "Roth 401(k)",
            amount: { kind: "fixedAnnual", cents: 500_000 },
          }),
          benefit({
            id: "match",
            owner: "primary",
            type: "employer401kMatch",
            label: "Employer match",
            amount: { kind: "fixedAnnual", cents: 600_000 },
          }),
        ],
        expenses: [
          {
            id: "rent",
            name: "Rent",
            group: "Needs",
            guidanceBucket: "needs",
            cadence: "monthly",
            amountCents: 200_000,
            sortOrder: 0,
          },
          {
            id: "brokerage",
            name: "Brokerage",
            group: "Investing",
            guidanceBucket: "saving",
            cadence: "yearly",
            amountCents: 1_200_000,
            sortOrder: 1,
          },
        ],
      }),
    );

    expect(result).toMatchObject({
      grossIncomeCents: 21_500_000,
      federalTaxableIncomeCents: 16_880_000,
      stateTaxableIncomeCents: 20_100_000,
      ficaTaxableWagesCents: 20_600_000,
      federalIncomeTaxCents: 2_656_000,
      socialSecurityTaxCents: 1_277_200,
      medicareTaxCents: 298_700,
      additionalMedicareTaxCents: 0,
      ficaTaxCents: 1_575_900,
      stateIncomeTaxCents: 0,
      totalTaxCents: 4_231_900,
      paycheckDeductionsAnnualCents: 1_900_000,
      primaryPaycheckDeductionsAnnualCents: 1_500_000,
      spousePaycheckDeductionsAnnualCents: 400_000,
      takeHomeAnnualCents: 15_368_100,
      takeHomeMonthlyCents: 1_280_675,
      expensesAnnualCents: 3_600_000,
      expensesMonthlyCents: 300_000,
      needsExpensesAnnualCents: 2_400_000,
      plannedInvestmentAnnualCents: 1_200_000,
      cashSavingsAnnualCents: 11_768_100,
      savingsMonthlyCents: 980_675,
      payrollSavingsAnnualCents: 1_900_000,
      employerSavingsAnnualCents: 600_000,
      totalSavedAnnualCents: 15_468_100,
      accountingDifferenceCents: 0,
    });
    expect(result.federalBracketTaxes.map(({ taxCents }) => taxCents)).toEqual([
      248_000, 912_000, 1_496_000, 0, 0, 0, 0,
    ]);
    expect(
      result.benefits.map(({ annualAmountCents }) => annualAmountCents),
    ).toEqual([1_000_000, 400_000, 500_000, 600_000]);
    expect(result.federalCitations).toEqual(
      expect.arrayContaining(["IRS_PUB_15B_2026", "IRS_401K_2026"]),
    );
  });

  it("handles MFJ in Illinois and the state table", () => {
    const result = calculatePlan(
      plan({
        grossSalaryCents: 18_000_000,
        filingStatus: "mfj",
        stateCode: "IL",
      }),
    );

    expect(result.federalTaxableIncomeCents).toBe(14_780_000);
    expect(result.federalIncomeTaxCents).toBe(2_194_000);
    expect(result.ficaTaxCents).toBe(1_377_000);
    expect(result.stateIncomeTaxCents).toBeGreaterThan(800_000);
    expect(result.takeHomeAnnualCents).toBe(
      18_000_000 -
        result.federalIncomeTaxCents -
        result.ficaTaxCents -
        result.stateIncomeTaxCents,
    );
  });

  it("applies the Social Security cap and Additional Medicare above $200k", () => {
    const result = calculatePlan(
      plan({ grossSalaryCents: 30_000_000, stateCode: "FL" }),
    );

    expect(result.socialSecurityTaxCents).toBe(1_143_900);
    expect(result.medicareTaxCents).toBe(435_000);
    expect(result.additionalMedicareTaxCents).toBe(90_000);
  });

  it("separates wage, spouse wage, and non-wage ordinary income", () => {
    const nonWage = calculatePlan(
      plan({
        otherOrdinaryIncomeCents: 2_000_000,
        benefits: [benefit({ amount: { kind: "percent", ratePpm: 100_000 } })],
      }),
    );
    expect(nonWage.grossIncomeCents).toBe(12_000_000);
    expect(nonWage.ficaTaxableWagesCents).toBe(10_000_000);
    expect(nonWage.benefits[0].annualAmountCents).toBe(1_000_000);

    const joint = calculatePlan(
      plan({
        filingStatus: "mfj",
        grossSalaryCents: 15_000_000,
        spouseWageIncomeCents: 15_000_000,
      }),
    );
    expect(joint.socialSecurityTaxCents).toBe(1_860_000);
    expect(joint.ficaTaxableWagesCents).toBe(30_000_000);
  });

  it("models spouse payroll benefits against spouse wages", () => {
    const result = calculatePlan(
      plan({
        filingStatus: "mfj",
        grossSalaryCents: 10_000_000,
        spouseWageIncomeCents: 20_000_000,
        spouseHsaEligible: true,
        benefits: [
          benefit({
            owner: "spouse",
            type: "hsa",
            label: "Spouse HSA",
            amount: { kind: "percent", ratePpm: 10_000 },
          }),
        ],
      }),
    );
    expect(result.benefits[0].annualAmountCents).toBe(200_000);
    expect(result.spousePaycheckDeductionsAnnualCents).toBe(200_000);
    expect(result.ficaTaxableWagesCents).toBe(29_800_000);
  });

  it("flags primary payroll deductions even when spouse income masks the gap", () => {
    const result = calculatePlan(
      plan({
        filingStatus: "mfj",
        grossSalaryCents: 1_000_000,
        spouseWageIncomeCents: 20_000_000,
        benefits: [
          benefit({ amount: { kind: "fixedAnnual", cents: 2_000_000 } }),
        ],
      }),
    );
    expect(result.isPayrollFeasible).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "paycheck-feasibility" }),
    );
  });

  it("reserves each owner's FICA before declaring payroll choices feasible", () => {
    const result = calculatePlan(
      plan({
        filingStatus: "mfj",
        grossSalaryCents: 1_000_000,
        spouseWageIncomeCents: 20_000_000,
        benefits: [
          benefit({
            type: "roth401k",
            amount: { kind: "fixedAnnual", cents: 950_000 },
          }),
        ],
      }),
    );
    expect(result.isPayrollFeasible).toBe(false);
    expect(result.infeasiblePayrollOwner).toBe("primary");
    expect(result.fundablePaycheckDeductionsAnnualCents).toBe(923_500);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "paycheck-feasibility" }),
    );
  });

  it("reserves mandatory per-employee Additional Medicare withholding", () => {
    const result = calculatePlan(
      plan({
        filingStatus: "mfj",
        grossSalaryCents: 30_000_000,
        spouseWageIncomeCents: 100_000_000,
        benefits: [
          benefit({
            type: "lifeDisabilityInsurance",
            amount: { kind: "fixedAnnual", cents: 28_400_000 },
          }),
        ],
      }),
    );
    expect(result.isPayrollFeasible).toBe(false);
    expect(result.infeasiblePayrollOwner).toBe("primary");
  });

  it("rejects spouse payroll inputs outside married filing jointly", () => {
    expect(() =>
      calculatePlan(
        plan({
          spouseWageIncomeCents: 1,
        }),
      ),
    ).toThrow("require married filing jointly");
    expect(() =>
      calculatePlan(
        plan({
          benefits: [benefit({ owner: "spouse" })],
        }),
      ),
    ).toThrow("require married filing jointly");
  });

  it("models progressive California tax and preserves a negative savings result", () => {
    const result = calculatePlan(
      plan({
        grossSalaryCents: 15_000_000,
        stateCode: "CA",
        expenses: [
          {
            id: "all",
            name: "Planned spending",
            group: "Needs",
            cadence: "yearly",
            amountCents: 20_000_000,
            sortOrder: 0,
          },
        ],
      }),
    );

    expect(result.stateIncomeTaxCents).toBeGreaterThan(800_000);
    expect(result.savingsMonthlyCents).toBeLessThan(0);
    expect(result.cashSavingsAnnualCents).toBe(
      result.takeHomeAnnualCents - result.expensesAnnualCents,
    );
  });

  it("counts investment-ledger contributions as saved rather than consumed", () => {
    const baseline = calculatePlan(plan());
    const invested = calculatePlan(
      plan({
        expenses: [
          {
            id: "brokerage",
            name: "Brokerage investing",
            group: "Investing",
            cadence: "monthly",
            amountCents: 100_000,
            sortOrder: 0,
          },
        ],
      }),
    );
    expect(invested.plannedInvestmentAnnualCents).toBe(1_200_000);
    expect(invested.totalSavedAnnualCents).toBe(baseline.totalSavedAnnualCents);
  });
});

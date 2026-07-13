import { describe, expect, it } from "vitest";
import type { BenefitEntry } from "../benefits";
import {
  benefitEntry as benefit,
  planInput as plan,
} from "@/test/fixtures/plans";
import { calculatePlan } from "./engine";

describe("boundaries, warnings, and fallback", () => {
  it("keeps excess HSA payroll contributions post-tax while preserving the entered deduction", () => {
    const result = calculatePlan(
      plan({
        benefits: [
          benefit({
            type: "hsa",
            label: "HSA",
            amount: { kind: "fixedAnnual", cents: 1_000_000 },
          }),
        ],
      }),
    );

    expect(result).toMatchObject({
      federalTaxableIncomeCents: 7_950_000,
      ficaTaxableWagesCents: 9_560_000,
      federalIncomeTaxCents: 1_220_200,
      ficaTaxCents: 731_340,
      paycheckDeductionsAnnualCents: 1_000_000,
    });
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "hsa-limit",
        actualCents: 1_000_000,
        limitCents: 440_000,
      }),
    );
  });

  it("adds excess employer HSA contributions back to income and wages independent of entry order", () => {
    const entries = [
      benefit({
        id: "employee-hsa",
        type: "hsa",
        label: "Employee HSA",
        amount: { kind: "fixedAnnual", cents: 300_000 },
      }),
      benefit({
        id: "employer-hsa",
        type: "employerHsa",
        label: "Employer HSA",
        amount: { kind: "fixedAnnual", cents: 300_000 },
      }),
    ];
    const calculate = (benefits: BenefitEntry[]) =>
      calculatePlan(plan({ stateCode: "PA", benefits }));
    const forward = calculate(entries);
    const reversed = calculate(entries.toReversed());

    for (const result of [forward, reversed]) {
      expect(result).toMatchObject({
        federalTaxableIncomeCents: 8_250_000,
        stateTaxableIncomeCents: 9_860_000,
        ficaTaxableWagesCents: 9_860_000,
        paycheckDeductionsAnnualCents: 300_000,
      });
    }
    expect(forward.totalTaxCents).toBe(reversed.totalTaxCents);
    expect(forward.notices).toContainEqual(
      expect.stringContaining(
        "applies the eligible exclusion to employee HSA entries first",
      ),
    );
  });

  it("splits the married family HSA limit equally before applying each spouse's employee-first allocation", () => {
    const result = calculatePlan(
      plan({
        grossSalaryCents: 30_000_000,
        spouseWageIncomeCents: 5_000_000,
        filingStatus: "mfj",
        hsaCoverage: "family",
        spouseHsaEligible: true,
        primaryHsaFamilyAllocationPpm: 500_000,
        spouseHsaFamilyAllocationPpm: 500_000,
        benefits: [
          benefit({
            id: "primary-hsa",
            type: "hsa",
            label: "Primary HSA",
            amount: { kind: "fixedAnnual", cents: 875_000 },
          }),
          benefit({
            id: "spouse-hsa",
            owner: "spouse",
            type: "hsa",
            label: "Spouse HSA",
            amount: { kind: "fixedAnnual", cents: 875_000 },
          }),
        ],
      }),
    );

    expect(result).toMatchObject({
      ficaTaxableWagesCents: 34_125_000,
      socialSecurityTaxCents: 1_426_775,
      paycheckDeductionsAnnualCents: 1_750_000,
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "hsa-limit-family-primary",
          actualCents: 875_000,
          limitCents: 437_500,
        }),
        expect.objectContaining({
          code: "hsa-limit-family-spouse",
          actualCents: 875_000,
          limitCents: 437_500,
        }),
      ]),
    );
    expect(result.notices).toContainEqual(
      expect.stringContaining("allocated 50% to the primary owner"),
    );
  });

  it("allocates employee then employer HSA amounts independently inside each spouse's family share", () => {
    const result = calculatePlan(
      plan({
        grossSalaryCents: 30_000_000,
        spouseWageIncomeCents: 5_000_000,
        filingStatus: "mfj",
        hsaCoverage: "family",
        spouseHsaEligible: true,
        primaryHsaFamilyAllocationPpm: 500_000,
        spouseHsaFamilyAllocationPpm: 500_000,
        benefits: [
          benefit({
            id: "primary-employee-hsa",
            type: "hsa",
            label: "Primary employee HSA",
            amount: { kind: "fixedAnnual", cents: 300_000 },
          }),
          benefit({
            id: "primary-employer-hsa",
            type: "employerHsa",
            label: "Primary employer HSA",
            amount: { kind: "fixedAnnual", cents: 300_000 },
          }),
          benefit({
            id: "spouse-employee-hsa",
            owner: "spouse",
            type: "hsa",
            label: "Spouse employee HSA",
            amount: { kind: "fixedAnnual", cents: 300_000 },
          }),
          benefit({
            id: "spouse-employer-hsa",
            owner: "spouse",
            type: "employerHsa",
            label: "Spouse employer HSA",
            amount: { kind: "fixedAnnual", cents: 300_000 },
          }),
        ],
      }),
    );

    expect(result).toMatchObject({
      ficaTaxableWagesCents: 34_725_000,
      socialSecurityTaxCents: 1_445_375,
      paycheckDeductionsAnnualCents: 600_000,
      employerSavingsAnnualCents: 600_000,
    });
  });

  it("gives the full family HSA cap to the sole eligible primary owner", () => {
    const result = calculatePlan(
      plan({
        grossSalaryCents: 10_000_000,
        filingStatus: "mfj",
        hsaCoverage: "family",
        benefits: [
          benefit({
            type: "hsa",
            amount: { kind: "fixedAnnual", cents: 875_000 },
          }),
        ],
      }),
    );

    expect(result.ficaTaxableWagesCents).toBe(9_125_000);
    expect(result.warnings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "hsa-limit-family-primary" }),
      ]),
    );
  });

  it("gives the full family HSA cap to the sole eligible spouse using the spouse wage base", () => {
    const result = calculatePlan(
      plan({
        grossSalaryCents: 30_000_000,
        spouseWageIncomeCents: 5_000_000,
        filingStatus: "mfj",
        hsaCoverage: "family",
        primaryHsaEligible: false,
        spouseHsaEligible: true,
        primaryHsaFamilyAllocationPpm: 0,
        spouseHsaFamilyAllocationPpm: 1_000_000,
        benefits: [
          benefit({
            owner: "spouse",
            type: "hsa",
            amount: { kind: "fixedAnnual", cents: 875_000 },
          }),
        ],
      }),
    );

    expect(result.ficaTaxableWagesCents).toBe(34_125_000);
    expect(result.socialSecurityTaxCents).toBe(1_399_650);
    expect(result.spousePaycheckDeductionsAnnualCents).toBe(875_000);
    expect(result.warnings).toEqual([]);
  });

  it("reports one exact warning when an ineligible owner has an HSA contribution", () => {
    const result = calculatePlan(
      plan({
        grossSalaryCents: 30_000_000,
        spouseWageIncomeCents: 5_000_000,
        filingStatus: "mfj",
        hsaCoverage: "family",
        primaryHsaEligible: false,
        spouseHsaEligible: true,
        primaryHsaFamilyAllocationPpm: 0,
        spouseHsaFamilyAllocationPpm: 1_000_000,
        benefits: [
          benefit({
            type: "hsa",
            amount: { kind: "fixedAnnual", cents: 600_000 },
          }),
        ],
      }),
    );

    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: "hsa-owner-ineligible",
        actualCents: 600_000,
        limitCents: 0,
      }),
    ]);
  });

  it("supports an agreed 60/40 family allocation at exact owner boundaries", () => {
    const result = calculatePlan(
      plan({
        grossSalaryCents: 30_000_000,
        spouseWageIncomeCents: 5_000_000,
        filingStatus: "mfj",
        hsaCoverage: "family",
        spouseHsaEligible: true,
        primaryHsaFamilyAllocationPpm: 600_000,
        spouseHsaFamilyAllocationPpm: 400_000,
        benefits: [
          benefit({
            id: "primary-employee",
            type: "hsa",
            amount: { kind: "fixedAnnual", cents: 300_000 },
          }),
          benefit({
            id: "primary-employer",
            type: "employerHsa",
            amount: { kind: "fixedAnnual", cents: 225_000 },
          }),
          benefit({
            id: "spouse-employee",
            owner: "spouse",
            type: "hsa",
            amount: { kind: "fixedAnnual", cents: 200_000 },
          }),
          benefit({
            id: "spouse-employer",
            owner: "spouse",
            type: "employerHsa",
            amount: { kind: "fixedAnnual", cents: 150_000 },
          }),
        ],
      }),
    );

    expect(result.ficaTaxableWagesCents).toBe(34_500_000);
    expect(result.socialSecurityTaxCents).toBe(1_441_500);
    expect(result.warnings).toEqual([]);
    expect(result.notices).toContainEqual(
      expect.stringContaining("allocated 60% to the primary owner and 40%"),
    );
  });

  it("lets a 100/0 agreement consume the primary share and rejects spouse exclusion", () => {
    const result = calculatePlan(
      plan({
        grossSalaryCents: 30_000_000,
        spouseWageIncomeCents: 5_000_000,
        filingStatus: "mfj",
        hsaCoverage: "family",
        spouseHsaEligible: true,
        primaryHsaFamilyAllocationPpm: 1_000_000,
        spouseHsaFamilyAllocationPpm: 0,
        benefits: [
          benefit({
            id: "primary-employee",
            type: "hsa",
            amount: { kind: "fixedAnnual", cents: 400_000 },
          }),
          benefit({
            id: "primary-employer",
            type: "employerHsa",
            amount: { kind: "fixedAnnual", cents: 475_000 },
          }),
          benefit({
            id: "spouse-employee",
            owner: "spouse",
            type: "hsa",
            amount: { kind: "fixedAnnual", cents: 100 },
          }),
        ],
      }),
    );

    expect(result.ficaTaxableWagesCents).toBe(34_600_000);
    expect(result.socialSecurityTaxCents).toBe(1_453_900);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "hsa-limit-family-spouse",
          actualCents: 100,
          limitCents: 0,
        }),
      ]),
    );
  });

  it("adds each spouse's age-55 catch-up outside the agreed family allocation", () => {
    const result = calculatePlan(
      plan({
        grossSalaryCents: 30_000_000,
        spouseWageIncomeCents: 5_000_000,
        filingStatus: "mfj",
        hsaCoverage: "family",
        spouseHsaEligible: true,
        primaryHsaCatchUpEligible: true,
        spouseHsaCatchUpEligible: true,
        primaryHsaFamilyAllocationPpm: 600_000,
        spouseHsaFamilyAllocationPpm: 400_000,
        benefits: [
          benefit({
            id: "primary-hsa-catch-up-boundary",
            type: "hsa",
            amount: { kind: "fixedAnnual", cents: 625_000 },
          }),
          benefit({
            id: "spouse-hsa-catch-up-boundary",
            owner: "spouse",
            type: "hsa",
            amount: { kind: "fixedAnnual", cents: 450_000 },
          }),
        ],
      }),
    );

    expect(result.ficaTaxableWagesCents).toBe(33_925_000);
    expect(result.warnings).toEqual([]);
    expect(result.notices).toContainEqual(
      expect.stringContaining(
        "adds $1000 only to each qualifying owner's limit",
      ),
    );
  });

  it("gives a sole eligible spouse the family limit plus only that spouse's catch-up", () => {
    const result = calculatePlan(
      plan({
        grossSalaryCents: 30_000_000,
        spouseWageIncomeCents: 5_000_000,
        filingStatus: "mfj",
        hsaCoverage: "family",
        primaryHsaEligible: false,
        spouseHsaEligible: true,
        spouseHsaCatchUpEligible: true,
        primaryHsaFamilyAllocationPpm: 0,
        spouseHsaFamilyAllocationPpm: 1_000_000,
        benefits: [
          benefit({
            id: "spouse-employee-catch-up",
            owner: "spouse",
            type: "hsa",
            amount: { kind: "fixedAnnual", cents: 900_000 },
          }),
          benefit({
            id: "spouse-employer-catch-up",
            owner: "spouse",
            type: "employerHsa",
            amount: { kind: "fixedAnnual", cents: 100_000 },
          }),
        ],
      }),
    );

    expect(result.ficaTaxableWagesCents).toBe(34_125_000);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "hsa-limit-family-spouse",
          actualCents: 1_000_000,
          limitCents: 975_000,
        }),
      ]),
    );
  });

  it("adds separate age-55 catch-ups to both self-only owner limits", () => {
    const result = calculatePlan(
      plan({
        grossSalaryCents: 10_000_000,
        spouseWageIncomeCents: 10_000_000,
        filingStatus: "mfj",
        spouseHsaEligible: true,
        primaryHsaCatchUpEligible: true,
        spouseHsaCatchUpEligible: true,
        benefits: [
          benefit({
            id: "primary-self-catch-up",
            type: "hsa",
            amount: { kind: "fixedAnnual", cents: 540_000 },
          }),
          benefit({
            id: "spouse-self-catch-up",
            owner: "spouse",
            type: "hsa",
            amount: { kind: "fixedAnnual", cents: 540_000 },
          }),
        ],
      }),
    );

    expect(result.ficaTaxableWagesCents).toBe(18_920_000);
    expect(result.warnings).toEqual([]);
  });

  it("describes an exceeded HSA threshold as including the selected catch-up", () => {
    const result = calculatePlan(
      plan({
        primaryHsaCatchUpEligible: true,
        benefits: [
          benefit({
            type: "hsa",
            amount: { kind: "fixedAnnual", cents: 540_001 },
          }),
        ],
      }),
    );

    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "hsa-limit",
        limitCents: 540_000,
        message: expect.stringContaining(
          "planning limit, including any selected age-55 HSA catch-up",
        ),
      }),
    );
    expect(
      result.warnings.find(({ code }) => code === "hsa-limit")?.message,
    ).not.toContain("before any eligible catch-up");
    expect(
      result.warnings.find(({ code }) => code === "hsa-limit")?.message,
    ).not.toContain("eligible catch-ups");
  });
});

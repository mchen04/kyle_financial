import { describe, expect, it } from "vitest";
import {
  benefitEntry as benefit,
  planInput as plan,
} from "@/test/fixtures/plans";
import { calculatePlan } from "./engine";
import { availableTaxYears, selectTaxTable } from "./table-registry";

describe("boundaries, warnings, and fallback", () => {
  it("warns without blocking when the combined 401(k) limit is exceeded", () => {
    const result = calculatePlan(
      plan({
        benefits: [
          benefit({ amount: { kind: "fixedAnnual", cents: 2_000_000 } }),
          benefit({
            id: "roth",
            type: "roth401k",
            label: "Roth 401(k)",
            amount: { kind: "fixedAnnual", cents: 1_000_000 },
          }),
        ],
      }),
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "401k-limit", actualCents: 3_000_000 }),
    );
    expect(result.takeHomeAnnualCents).toBeLessThan(result.grossIncomeCents);
  });

  it("caps the shared Traditional and Roth 401(k) eligible amount per owner", () => {
    const result = calculatePlan(
      plan({
        benefits: [
          benefit({
            id: "traditional",
            amount: { kind: "fixedAnnual", cents: 3_000_000 },
          }),
          benefit({
            id: "roth",
            type: "roth401k",
            label: "Roth 401(k)",
            amount: { kind: "fixedAnnual", cents: 500_000 },
          }),
        ],
      }),
    );

    expect(result).toMatchObject({
      federalTaxableIncomeCents: 5_940_000,
      ficaTaxableWagesCents: 10_000_000,
      paycheckDeductionsAnnualCents: 3_500_000,
    });
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "401k-limit",
        actualCents: 3_500_000,
        limitCents: 2_450_000,
      }),
    );
  });

  it("caps Health FSA exclusions separately for each payroll owner", () => {
    const result = calculatePlan(
      plan({
        filingStatus: "mfj",
        spouseWageIncomeCents: 10_000_000,
        benefits: [
          benefit({
            id: "primary-fsa",
            type: "healthFsa",
            label: "Primary FSA",
            amount: { kind: "fixedAnnual", cents: 500_000 },
          }),
          benefit({
            id: "spouse-fsa",
            owner: "spouse",
            type: "healthFsa",
            label: "Spouse FSA",
            amount: { kind: "fixedAnnual", cents: 500_000 },
          }),
        ],
      }),
    );

    expect(result).toMatchObject({
      federalTaxableIncomeCents: 16_100_000,
      ficaTaxableWagesCents: 19_320_000,
      paycheckDeductionsAnnualCents: 1_000_000,
    });
  });

  it("caps the household dependent-care exclusion at both plan and earned-income limits", () => {
    const planLimit = calculatePlan(
      plan({
        filingStatus: "mfj",
        spouseWageIncomeCents: 10_000_000,
        benefits: [
          benefit({
            id: "primary-care",
            type: "dependentCareFsa",
            label: "Primary dependent care",
            amount: { kind: "fixedAnnual", cents: 600_000 },
          }),
          benefit({
            id: "spouse-care",
            owner: "spouse",
            type: "dependentCareFsa",
            label: "Spouse dependent care",
            amount: { kind: "fixedAnnual", cents: 400_000 },
          }),
        ],
      }),
    );
    const earnedIncomeLimit = calculatePlan(
      plan({
        filingStatus: "mfj",
        grossSalaryCents: 500_000,
        spouseWageIncomeCents: 10_000_000,
        benefits: [
          benefit({
            type: "dependentCareFsa",
            label: "Dependent care",
            amount: { kind: "fixedAnnual", cents: 750_000 },
          }),
        ],
      }),
    );

    expect(planLimit).toMatchObject({
      federalTaxableIncomeCents: 16_030_000,
      ficaTaxableWagesCents: 19_250_000,
      paycheckDeductionsAnnualCents: 1_000_000,
    });
    expect(earnedIncomeLimit).toMatchObject({
      federalTaxableIncomeCents: 6_780_000,
      ficaTaxableWagesCents: 10_000_000,
      paycheckDeductionsAnnualCents: 750_000,
    });
  });

  it("caps transit and parking exclusions independently for each owner", () => {
    const result = calculatePlan(
      plan({
        benefits: [
          benefit({
            id: "transit",
            type: "commuter",
            label: "Transit",
            amount: { kind: "fixedAnnual", cents: 500_000 },
          }),
          benefit({
            id: "parking",
            type: "commuterParking",
            label: "Parking",
            amount: { kind: "fixedAnnual", cents: 500_000 },
          }),
        ],
      }),
    );

    expect(result).toMatchObject({
      federalTaxableIncomeCents: 7_574_000,
      ficaTaxableWagesCents: 9_184_000,
      paycheckDeductionsAnnualCents: 1_000_000,
    });
  });

  it("caps tax-eligible deferrals at the combined employee and employer plan limit", () => {
    const result = calculatePlan(
      plan({
        benefits: [
          benefit({ amount: { kind: "fixedAnnual", cents: 2_450_000 } }),
          benefit({
            id: "match",
            type: "employer401kMatch",
            label: "Match",
            amount: { kind: "fixedAnnual", cents: 5_000_000 },
          }),
        ],
      }),
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "defined-contribution-limit",
        actualCents: 7_450_000,
        limitCents: 7_200_000,
      }),
    );
    expect(result.warnings[0].message).toContain(
      "base planning limit before any eligible catch-up",
    );
    expect(result).toMatchObject({
      federalTaxableIncomeCents: 6_190_000,
      ficaTaxableWagesCents: 10_000_000,
      paycheckDeductionsAnnualCents: 2_450_000,
    });
  });

  it("checks participant benefit limits separately for married filers", () => {
    const result = calculatePlan(
      plan({
        filingStatus: "mfj",
        spouseWageIncomeCents: 10_000_000,
        benefits: [
          benefit({
            id: "primary-401k",
            owner: "primary",
            amount: { kind: "fixedAnnual", cents: 2_000_000 },
          }),
          benefit({
            id: "spouse-401k",
            owner: "spouse",
            amount: { kind: "fixedAnnual", cents: 2_000_000 },
          }),
          benefit({
            id: "primary-fsa",
            owner: "primary",
            type: "healthFsa",
            amount: { kind: "fixedAnnual", cents: 200_000 },
          }),
          benefit({
            id: "spouse-fsa",
            owner: "spouse",
            type: "healthFsa",
            amount: { kind: "fixedAnnual", cents: 200_000 },
          }),
        ],
      }),
    );
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({ code: expect.stringContaining("401k-limit") }),
    );
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({
        code: expect.stringContaining("health-fsa-limit"),
      }),
    );
  });

  it("uses the lower wage earner for dependent-care eligibility", () => {
    const result = calculatePlan(
      plan({
        filingStatus: "mfj",
        grossSalaryCents: 500_000,
        spouseWageIncomeCents: 10_000_000,
        benefits: [
          benefit({
            type: "dependentCareFsa",
            amount: { kind: "fixedAnnual", cents: 750_000 },
          }),
        ],
      }),
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "dependent-care-earned-income",
        limitCents: 500_000,
      }),
    );
  });

  it("aggregates ESPP entries before checking the grant-value limit", () => {
    const result = calculatePlan(
      plan({
        benefits: ["first", "second"].map((id) =>
          benefit({
            id,
            type: "espp",
            label: "ESPP",
            amount: { kind: "fixedAnnual", cents: 2_000_000 },
            discountRatePpm: 150_000,
          }),
        ),
      }),
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "espp-limit",
        actualCents: 4_705_882,
        limitCents: 2_500_000,
      }),
    );
  });

  it("models transit and qualified parking as separate monthly limits", () => {
    const result = calculatePlan(
      plan({
        benefits: [
          benefit({
            id: "transit",
            type: "commuter",
            amount: { kind: "fixedMonthly", cents: 34_000 },
          }),
          benefit({
            id: "parking",
            type: "commuterParking",
            amount: { kind: "fixedMonthly", cents: 34_000 },
          }),
        ],
      }),
    );
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({
        code: expect.stringContaining("commuter"),
      }),
    );
  });

  it("discloses the state HOH schedule proxy in result metadata", () => {
    expect(
      calculatePlan(plan({ filingStatus: "hoh", stateCode: "CA" }))
        .stateApproximation,
    ).toContain("Head of household uses the published Single state schedule");
  });

  it("rejects an ESPP discount above the modeled Section 423 maximum", () => {
    expect(() =>
      calculatePlan(
        plan({
          benefits: [
            benefit({
              type: "espp",
              label: "ESPP",
              discountRatePpm: 150_001,
            }),
          ],
        }),
      ),
    ).toThrow("invalid ESPP discount");
  });

  it("explains impossible payroll choices without clamping entered amounts", () => {
    const result = calculatePlan(
      plan({
        benefits: [
          benefit({ amount: { kind: "fixedAnnual", cents: 20_000_000 } }),
        ],
      }),
    );
    expect(result.takeHomeAnnualCents).toBeLessThan(0);
    expect(result.cashSavingsRateNetPpm).toBe(0);
    expect(result.paycheckDeductionsAnnualCents).toBe(20_000_000);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "paycheck-feasibility" }),
    );
  });

  it("uses cited state-specific benefit tax treatment overrides", () => {
    const california = calculatePlan(
      plan({
        stateCode: "CA",
        benefits: [
          benefit({
            type: "hsa",
            label: "HSA",
            amount: { kind: "fixedAnnual", cents: 400_000 },
          }),
        ],
      }),
    );
    expect(california.stateTaxableIncomeCents).toBe(9_446_000);

    const pennsylvania = calculatePlan(
      plan({ stateCode: "PA", benefits: [benefit({})] }),
    );
    expect(pennsylvania.stateTaxableIncomeCents).toBe(10_000_000);

    const employerHsa = calculatePlan(
      plan({
        stateCode: "CA",
        benefits: [
          benefit({
            type: "employerHsa",
            label: "Employer HSA",
            amount: { kind: "fixedAnnual", cents: 400_000 },
          }),
        ],
      }),
    );
    expect(employerHsa.stateTaxableIncomeCents).toBe(9_846_000);
    expect(employerHsa.stateApproximation).toContain("Planning estimate");
    expect(employerHsa.stateCitations).toContain("CA_FTB_HSA_2025");
  });

  it("does not grant an HSA exclusion alongside a general health FSA", () => {
    const result = calculatePlan(
      plan({
        benefits: [
          benefit({
            id: "hsa",
            type: "hsa",
            label: "HSA",
            amount: { kind: "fixedAnnual", cents: 440_000 },
          }),
          benefit({
            id: "health-fsa",
            type: "healthFsa",
            label: "Health FSA",
            amount: { kind: "fixedAnnual", cents: 340_000 },
          }),
        ],
      }),
    );

    expect(result.federalTaxableIncomeCents).toBe(8_050_000);
    expect(result.ficaTaxableWagesCents).toBe(9_660_000);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "hsa-eligibility",
        actualCents: 440_000,
        limitCents: 0,
      }),
    );
  });

  it("discloses the eligibility assumption when granting an HSA exclusion", () => {
    const result = calculatePlan(
      plan({
        benefits: [
          benefit({
            type: "hsa",
            label: "HSA",
            amount: { kind: "fixedAnnual", cents: 440_000 },
          }),
        ],
      }),
    );

    expect(result.federalTaxableIncomeCents).toBe(7_950_000);
    expect(result.ficaTaxableWagesCents).toBe(9_560_000);
    expect(result.notices).toContainEqual(
      expect.stringContaining("selected eligibility under a qualifying HDHP"),
    );
  });

  it("adds an ineligible employer HSA amount back to taxable wages", () => {
    const result = calculatePlan(
      plan({
        stateCode: "IL",
        benefits: [
          benefit({
            id: "employer-hsa",
            type: "employerHsa",
            label: "Employer HSA",
            amount: { kind: "fixedAnnual", cents: 400_000 },
          }),
          benefit({
            id: "health-fsa",
            type: "healthFsa",
            label: "Health FSA",
            amount: { kind: "fixedAnnual", cents: 340_000 },
          }),
        ],
      }),
    );

    expect(result.federalTaxableIncomeCents).toBe(8_450_000);
    expect(result.ficaTaxableWagesCents).toBe(10_060_000);
    expect(result.stateTaxableIncomeCents).toBe(9_767_500);
  });

  it("uses fixed Pennsylvania law expectations for payroll benefits", () => {
    const result = calculatePlan(
      plan({
        stateCode: "PA",
        benefits: [
          benefit({
            id: "dependent-care",
            type: "dependentCareFsa",
            label: "Dependent care FSA",
            amount: { kind: "fixedAnnual", cents: 750_000 },
          }),
          benefit({
            id: "transit",
            type: "commuter",
            label: "Transit",
            amount: { kind: "fixedAnnual", cents: 408_000 },
          }),
          benefit({
            id: "parking",
            type: "commuterParking",
            label: "Parking",
            amount: { kind: "fixedAnnual", cents: 408_000 },
          }),
        ],
      }),
    );

    expect(result.stateTaxableIncomeCents).toBe(10_000_000);
    expect(result.stateIncomeTaxCents).toBe(307_000);
    expect(result.stateCitations).toEqual(
      expect.arrayContaining([
        "PA_GROSS_COMP_2026",
        "PA_HSA_DEDUCTIONS_2026",
        "PA_HSA_RULING_2006",
      ]),
    );
  });

  it("deducts an employee payroll HSA contribution from Pennsylvania taxable income", () => {
    const result = calculatePlan(
      plan({
        stateCode: "PA",
        benefits: [
          benefit({
            type: "hsa",
            label: "HSA",
            amount: { kind: "fixedAnnual", cents: 440_000 },
          }),
        ],
      }),
    );

    expect(result.stateTaxableIncomeCents).toBe(9_560_000);
    expect(result.stateIncomeTaxCents).toBe(293_492);
  });

  it("excludes an employer HSA contribution from Pennsylvania taxable income", () => {
    const result = calculatePlan(
      plan({
        stateCode: "PA",
        benefits: [
          benefit({
            type: "employerHsa",
            label: "Employer HSA",
            amount: { kind: "fixedAnnual", cents: 440_000 },
          }),
        ],
      }),
    );

    expect(result.stateTaxableIncomeCents).toBe(10_000_000);
    expect(result.stateIncomeTaxCents).toBe(307_000);
  });

  it("warns about reimbursement-account overlap in the expense ledger", () => {
    const result = calculatePlan(
      plan({
        benefits: [benefit({ type: "healthFsa", label: "Health FSA" })],
      }),
    );
    expect(result.notices[0]).toContain("avoid counting it twice");
  });

  it("flags the MFJ dependent-care earned-income assumption", () => {
    const result = calculatePlan(
      plan({
        filingStatus: "mfj",
        benefits: [
          benefit({
            type: "dependentCareFsa",
            label: "Dependent care FSA",
            amount: { kind: "fixedAnnual", cents: 750_000 },
          }),
        ],
      }),
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "dependent-care-earned-income" }),
    );
  });

  it("uses the latest prior table and exposes fallback metadata", () => {
    const years = availableTaxYears();
    const latestYear = years.at(-1)!;
    const requestedYear = latestYear + 3;
    const result = calculatePlan(plan({ year: requestedYear }));
    expect(result).toMatchObject({
      requestedTaxYear: requestedYear,
      appliedTaxYear: latestYear,
      usesFallbackTaxTable: true,
    });
    expect(selectTaxTable(latestYear).isFallback).toBe(false);
    expect(selectTaxTable(years[0] - 1).usesFutureTable).toBe(true);
  });

  it("makes percent and equivalent fixed deductions agree exactly", () => {
    const percent = calculatePlan(
      plan({
        benefits: [benefit({ amount: { kind: "percent", ratePpm: 100_000 } })],
      }),
    );
    const fixed = calculatePlan(plan({ benefits: [benefit({})] }));
    expect(percent).toMatchObject({
      federalIncomeTaxCents: fixed.federalIncomeTaxCents,
      takeHomeAnnualCents: fixed.takeHomeAnnualCents,
      payrollSavingsAnnualCents: fixed.payrollSavingsAnnualCents,
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  benefitSchema,
  expenseSchema,
  fieldVersionSchema,
  fullPlanSchema,
  normalizedFullPlanSchema,
  planYearSchema,
  updatePlanBasicsSchema,
} from "@/domain/plan-schema";

const unsafeMonthly = Math.floor(Number.MAX_SAFE_INTEGER / 12) + 1;

describe("shared plan boundary primitives", () => {
  it("keeps plan years and field versions within their canonical bounds", () => {
    expect(planYearSchema.safeParse(2000).success).toBe(true);
    expect(planYearSchema.safeParse(2200).success).toBe(true);
    expect(planYearSchema.safeParse(1999).success).toBe(false);
    expect(planYearSchema.safeParse(2201).success).toBe(false);
    expect(
      fieldVersionSchema.safeParse({
        updatedAt: "2026-07-12T00:00:00.000Z",
        mutationId: "",
      }).success,
    ).toBe(false);
  });
});

describe("plan schema annualization", () => {
  it("rejects monthly benefit amounts that cannot annualize safely", () => {
    expect(() =>
      benefitSchema.parse({
        id: "00000000-0000-4000-8000-000000000001",
        type: "commuter",
        label: "Transit",
        amount: { kind: "fixedMonthly", cents: unsafeMonthly },
      }),
    ).toThrow();
  });

  it("rejects monthly expenses that cannot annualize safely", () => {
    expect(() =>
      expenseSchema.parse({
        id: "00000000-0000-4000-8000-000000000002",
        name: "Expense",
        group: "Other",
        cadence: "monthly",
        amountCents: unsafeMonthly,
        sortOrder: 0,
      }),
    ).toThrow("Monthly amount is too large");
  });
});

describe("whole-plan invariants", () => {
  const basics = {
    stateCode: "TX",
    filingStatus: "single" as const,
    grossSalaryCents: 1_000_000,
    additionalWageIncomeCents: 0,
    spouseWageIncomeCents: 0,
    otherOrdinaryIncomeCents: 0,
    hsaCoverage: "self" as const,
  };

  it("rejects aggregate amounts that exceed safe calculation range", () => {
    expect(() =>
      fullPlanSchema.parse({
        ...basics,
        benefits: ["1", "2"].map((suffix) => ({
          id: `00000000-0000-4000-8000-00000000000${suffix}`,
          type: "commuter",
          label: "Transit",
          amount: {
            kind: "fixedMonthly",
            cents: Math.floor(Number.MAX_SAFE_INTEGER / 12),
          },
        })),
        expenses: [],
      }),
    ).toThrow("Combined plan amounts are too large");
  });

  it("rejects combined scalar income overflow on create and patch", () => {
    const unsafe = {
      ...basics,
      grossSalaryCents: Number.MAX_SAFE_INTEGER,
      additionalWageIncomeCents: Number.MAX_SAFE_INTEGER,
    };
    expect(() => updatePlanBasicsSchema.parse(unsafe)).toThrow(
      "Combined income is too large",
    );
  });

  it("includes ESPP discount gross-up in the safe aggregate bound", () => {
    expect(() =>
      fullPlanSchema.parse({
        ...basics,
        grossSalaryCents: 0,
        benefits: [
          {
            id: "00000000-0000-4000-8000-000000000004",
            type: "espp",
            label: "ESPP",
            amount: {
              kind: "fixedAnnual",
              cents: Number.MAX_SAFE_INTEGER,
            },
            discountRatePpm: 150_000,
          },
        ],
        expenses: [],
      }),
    ).toThrow("Combined plan amounts are too large");
  });

  it("rejects spouse inputs outside married filing jointly", () => {
    expect(() =>
      updatePlanBasicsSchema.parse({ ...basics, spouseWageIncomeCents: 1 }),
    ).toThrow("Spouse wages require married filing jointly");
    expect(() =>
      fullPlanSchema.parse({
        ...basics,
        benefits: [
          {
            id: "00000000-0000-4000-8000-000000000003",
            owner: "spouse",
            type: "roth401k",
            label: "Spouse Roth",
            amount: { kind: "fixedAnnual", cents: 1 },
          },
        ],
        expenses: [],
      }),
    ).toThrow("Spouse-owned payroll items require married filing jointly");
  });

  it("normalizes non-MFJ spouse HSA fields and sole-eligible family allocations", () => {
    expect(
      updatePlanBasicsSchema.parse({
        ...basics,
        spouseHsaEligible: true,
        spouseHsaCatchUpEligible: true,
        primaryHsaFamilyAllocationPpm: 0,
        spouseHsaFamilyAllocationPpm: 1_000_000,
      }),
    ).toMatchObject({
      spouseHsaEligible: false,
      spouseHsaCatchUpEligible: false,
      primaryHsaFamilyAllocationPpm: 1_000_000,
      spouseHsaFamilyAllocationPpm: 0,
    });
    expect(
      updatePlanBasicsSchema.parse({
        ...basics,
        filingStatus: "mfj",
        hsaCoverage: "family",
        primaryHsaEligible: false,
        spouseHsaEligible: true,
        primaryHsaCatchUpEligible: true,
        spouseHsaCatchUpEligible: true,
        primaryHsaFamilyAllocationPpm: 500_000,
        spouseHsaFamilyAllocationPpm: 500_000,
      }),
    ).toMatchObject({
      primaryHsaFamilyAllocationPpm: 0,
      spouseHsaFamilyAllocationPpm: 1_000_000,
      primaryHsaCatchUpEligible: false,
      spouseHsaCatchUpEligible: true,
    });
  });

  it("distinguishes accepted input from already-normalized domain state", () => {
    const input = {
      ...basics,
      primaryHsaEligible: true,
      spouseHsaEligible: true,
      primaryHsaCatchUpEligible: false,
      spouseHsaCatchUpEligible: true,
      primaryHsaFamilyAllocationPpm: 0,
      spouseHsaFamilyAllocationPpm: 1_000_000,
      benefits: [],
      expenses: [],
    };

    expect(fullPlanSchema.safeParse(input).success).toBe(true);
    expect(normalizedFullPlanSchema.safeParse(input).success).toBe(false);
    expect(
      normalizedFullPlanSchema.safeParse(fullPlanSchema.parse(input)).success,
    ).toBe(true);
  });

  it("defaults two eligible spouses equally and rejects malformed agreements", () => {
    const jointFamily = {
      ...basics,
      filingStatus: "mfj" as const,
      hsaCoverage: "family" as const,
      primaryHsaEligible: true,
      spouseHsaEligible: true,
    };
    expect(updatePlanBasicsSchema.parse(jointFamily)).toMatchObject({
      primaryHsaFamilyAllocationPpm: 500_000,
      spouseHsaFamilyAllocationPpm: 500_000,
    });
    expect(() =>
      updatePlanBasicsSchema.parse({
        ...jointFamily,
        primaryHsaFamilyAllocationPpm: 600_000,
        spouseHsaFamilyAllocationPpm: 500_000,
      }),
    ).toThrow("Married-family HSA allocations must total 100%");
  });
});

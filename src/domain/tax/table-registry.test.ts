import { describe, expect, it } from "vitest";
import { STATE_CODES } from "./jurisdictions";
import { availableTaxYears, selectTaxTable } from "./table-registry";
import { taxTableSchema } from "./table-schema";

describe("tax table registry", () => {
  it("contains complete, traceable, ordered data for every year", () => {
    const years = availableTaxYears();
    expect(years).toContain(2026);

    for (const year of years) {
      const selection = selectTaxTable(year);
      expect(selection.appliedYear).toBe(year);
      expect(selection.isFallback).toBe(false);
      expect(new Set(Object.keys(selection.table.states))).toEqual(
        new Set(STATE_CODES),
      );

      for (const state of Object.values(selection.table.states)) {
        expect(state.citations.length).toBeGreaterThan(0);
        for (const schedule of Object.values(state.filingStatuses)) {
          expect(schedule.citations.length).toBeGreaterThan(0);
          expect(schedule.standardDeductionCents).toBeGreaterThanOrEqual(0);
          let previous = -1;
          for (const bracket of schedule.brackets) {
            expect(bracket.thresholdCents).toBeGreaterThan(previous);
            expect(bracket.ratePpm).toBeGreaterThanOrEqual(0);
            expect(bracket.ratePpm).toBeLessThanOrEqual(1_000_000);
            expect(bracket.citations.length).toBeGreaterThan(0);
            previous = bracket.thresholdCents;
          }
        }
      }

      for (const limit of Object.values(selection.table.limits)) {
        expect(limit.cents).toBeGreaterThan(0);
        expect(limit.citations.length).toBeGreaterThan(0);
      }
    }
  });

  it("preserves the verified 2026 policy data", () => {
    const { table } = selectTaxTable(2026);

    for (const code of ["CA", "NJ"] as const) {
      expect(table.states[code].benefitStateTaxOverrides).toBeDefined();
      expect(table.states[code].citations).toHaveLength(2);
    }
    expect(table.states.PA.citations).toEqual([
      "TF_STATE_2026",
      "PA_GROSS_COMP_2026",
      "PA_HSA_DEDUCTIONS_2026",
      "PA_HSA_RULING_2006",
    ]);
    expect(table.states.PA.benefitStateTaxOverrides).toEqual({
      traditional401k: false,
      dependentCareFsa: false,
      commuter: false,
      commuterParking: false,
    });
    expect(table.limits.hsaCatchUp).toEqual({
      cents: 100_000,
      citations: ["IRS_PUB_969"],
    });
  });

  it("rejects incomplete federal and FICA contracts", () => {
    const { table } = selectTaxTable(2026);
    const incompleteFederal = {
      single: table.federal.single,
      mfj: table.federal.mfj,
    };
    const incompleteFica = Object.fromEntries(
      Object.entries(table.fica).filter(([key]) => key !== "citations"),
    );
    const emptyFederalBrackets = {
      ...table,
      federal: {
        ...table.federal,
        single: { ...table.federal.single, brackets: [] },
      },
    };
    const reversedFederalBrackets = {
      ...table,
      federal: {
        ...table.federal,
        single: {
          ...table.federal.single,
          brackets: table.federal.single.brackets.toReversed(),
        },
      },
    };
    const nonzeroFederalOrigin = {
      ...table,
      federal: {
        ...table.federal,
        single: {
          ...table.federal.single,
          brackets: [
            { ...table.federal.single.brackets[0], thresholdCents: 1 },
            ...table.federal.single.brackets.slice(1),
          ],
        },
      },
    };
    const duplicateFederalThreshold = {
      ...table,
      federal: {
        ...table.federal,
        single: {
          ...table.federal.single,
          brackets: table.federal.single.brackets.map((bracket, index) =>
            index === 1
              ? {
                  ...bracket,
                  thresholdCents:
                    table.federal.single.brackets[0].thresholdCents,
                }
              : bracket,
          ),
        },
      },
    };

    expect(
      taxTableSchema.safeParse({ ...table, federal: incompleteFederal })
        .success,
    ).toBe(false);
    expect(
      taxTableSchema.safeParse({ ...table, fica: incompleteFica }).success,
    ).toBe(false);
    expect(taxTableSchema.safeParse(emptyFederalBrackets).success).toBe(false);
    expect(taxTableSchema.safeParse(reversedFederalBrackets).success).toBe(
      false,
    );
    expect(taxTableSchema.safeParse(nonzeroFederalOrigin).success).toBe(false);
    expect(taxTableSchema.safeParse(duplicateFederalThreshold).success).toBe(
      false,
    );
  });

  it("rejects substituted jurisdictions and unknown citations", () => {
    const { table } = selectTaxTable(2026);
    const { CA, ...withoutCalifornia } = table.states;
    const substitutedStates = {
      ...withoutCalifornia,
      ZZ: { ...CA, code: "ZZ" },
    };
    const unknownCitation = {
      ...table,
      federal: {
        ...table.federal,
        single: {
          ...table.federal.single,
          citations: ["UNKNOWN_SOURCE"],
        },
      },
    };
    const unknownBenefitCitation = {
      ...table,
      benefitTreatmentCitations: {
        ...table.benefitTreatmentCitations,
        traditional401k: ["UNKNOWN_SOURCE"],
      },
    };

    expect(
      taxTableSchema.safeParse({ ...table, states: substitutedStates }).success,
    ).toBe(false);
    expect(taxTableSchema.safeParse(unknownCitation).success).toBe(false);
    expect(taxTableSchema.safeParse(unknownBenefitCitation).success).toBe(
      false,
    );
  });

  it("has the expected zero-tax and representative rate structures", () => {
    const { table } = selectTaxTable(2026);
    for (const code of [
      "AK",
      "FL",
      "NV",
      "NH",
      "SD",
      "TN",
      "TX",
      "WA",
      "WY",
    ] as const) {
      expect(table.states[code].filingStatuses.single.brackets).toEqual([]);
    }
    expect(table.states.IL.filingStatuses.single.brackets).toEqual([
      expect.objectContaining({ thresholdCents: 0, ratePpm: 49_500 }),
    ]);
    expect(table.states.CA.filingStatuses.single.brackets.at(-1)).toEqual(
      expect.objectContaining({ ratePpm: 133_000 }),
    );
  });
});

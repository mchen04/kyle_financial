import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { PlanInput } from "../budget";
import { calculatePlan } from "./engine";

const currency = z.string().regex(/^-?\$[\d,]+(?:\.\d{2})?$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const exactScenarios = [
  {
    id: "tx-single-100000",
    householdIncome: "$100,000",
    location: "Austin, TX",
    filingStatus: "Single",
    engineFilingStatus: "single",
    stateCode: "TX",
  },
  {
    id: "il-mfj-180000",
    householdIncome: "$180,000",
    location: "Springfield, IL",
    filingStatus: "Married",
    engineFilingStatus: "mfj",
    stateCode: "IL",
  },
  {
    id: "ca-single-150000",
    householdIncome: "$150,000",
    location: "Sacramento, CA",
    filingStatus: "Single",
    engineFilingStatus: "single",
    stateCode: "CA",
  },
  {
    id: "ny-mfj-250000",
    householdIncome: "$250,000",
    location: "Albany, NY",
    filingStatus: "Married",
    engineFilingStatus: "mfj",
    stateCode: "NY",
  },
  {
    id: "fl-single-300000",
    householdIncome: "$300,000",
    location: "Orlando, FL",
    filingStatus: "Single",
    engineFilingStatus: "single",
    stateCode: "FL",
  },
] as const;

const zeroAdjustment = z.literal("$0");

const evidenceSchema = z
  .object({
    artifact: z.string().min(1),
    captureMethod: z.string().min(1),
    provenanceManifest: z.literal("smartasset-2025-live.manifest.json"),
    capturedAt: date,
    calculator: z
      .object({
        name: z.string().min(1),
        year: z.literal(2025),
        rawYearLabels: z.array(z.string().min(1)).min(1),
      })
      .strict(),
    calculatorContext: z
      .object({
        payFrequency: z.string().min(1),
        w4Allowances: z.string().min(1),
      })
      .strict(),
    scenarios: z
      .array(
        z
          .object({
            id: z.string().min(1),
            sourceUrl: z.literal(
              "https://www.smartasset.com/taxes/income-taxes",
            ),
            capturedAt: date,
            calculatorYear: z.literal(2025),
            inputs: z
              .object({
                householdIncome: currency,
                location: z.string().min(1),
                filingStatus: z.enum(["Single", "Married"]),
                incomeType: z.literal("one household wage job"),
                dependents: z.literal(0),
                credits: zeroAdjustment,
                deduction: z.literal("Standard Deduction"),
                "401kContribution": zeroAdjustment,
                traditionalIraContribution: zeroAdjustment,
                dependentDeductions: z.literal(0),
                otherPreTaxDeductions: zeroAdjustment,
                employeeBenefits: zeroAdjustment,
                localCityTaxScenario: z.literal(false),
              })
              .strict(),
            rawDisplayed: z
              .object({
                federal: currency,
                fica: currency,
                state: currency,
                local: currency,
                total: currency,
                net: currency,
              })
              .strict(),
            independentComparison: z
              .object({
                kyle2026Trace: z
                  .object({
                    federal: currency,
                    fica: currency,
                    state: currency,
                    total: currency,
                    net: currency,
                  })
                  .strict(),
                formula: z.literal("(SmartAsset net - Kyle net) / Kyle net"),
                deltaDollars: currency,
                deltaPercent: z.number().finite(),
              })
              .strict(),
          })
          .strict(),
      )
      .length(5),
  })
  .strict()
  .superRefine(({ scenarios }, context) => {
    scenarios.forEach((scenario, index) => {
      const expected = exactScenarios[index];
      for (const [field, actual, wanted] of [
        ["id", scenario.id, expected.id],
        [
          "inputs.householdIncome",
          scenario.inputs.householdIncome,
          expected.householdIncome,
        ],
        ["inputs.location", scenario.inputs.location, expected.location],
        [
          "inputs.filingStatus",
          scenario.inputs.filingStatus,
          expected.filingStatus,
        ],
      ] as const) {
        if (actual !== wanted) {
          context.addIssue({
            code: "custom",
            path: ["scenarios", index, ...field.split(".")],
            message: `Expected exact validation value ${wanted}`,
          });
        }
      }
    });
  });

const provenanceSchema = z
  .object({
    artifact: z.literal("SmartAsset raw-capture provenance manifest"),
    captureSession: z.string().min(1),
    capturedAt: date,
    sourceUrl: z.literal("https://www.smartasset.com/taxes/income-taxes"),
    retention: z.string().min(1),
    replayInstructions: z.string().min(1),
    scenarios: z
      .array(
        z
          .object({
            id: z.string().min(1),
            rawDomPath: z.string().min(1).nullable(),
            screenshotPath: z.string().min(1).nullable(),
            captureStatus: z.literal("recorded-dom-values-only"),
          })
          .strict(),
      )
      .length(5),
  })
  .strict();

function cents(value: string): number {
  const normalized = value.replaceAll(",", "").replace("$", "");
  const sign = normalized.startsWith("-") ? -1 : 1;
  const [whole, fraction = ""] = normalized.replace("-", "").split(".");
  return sign * (Number(whole) * 100 + Number(fraction.padEnd(2, "0")));
}

describe("SmartAsset live evidence artifact", () => {
  const evidence = evidenceSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          "../../../docs/research/evidence/smartasset-2025-live.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  const provenance = provenanceSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          "../../../docs/research/evidence/smartasset-2025-live.manifest.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );

  it("keeps five distinct, same-day calculator captures with complete inputs", () => {
    expect(new Set(evidence.scenarios.map(({ id }) => id)).size).toBe(5);
    expect(
      evidence.scenarios.every(
        ({ capturedAt, calculatorYear }) =>
          capturedAt === evidence.capturedAt &&
          calculatorYear === evidence.calculator.year,
      ),
    ).toBe(true);
  });

  it("rejects drift from the exact validation scenario matrix", () => {
    const drifted = structuredClone(evidence);
    drifted.scenarios[0].inputs.location = "Dallas, TX";
    expect(() => evidenceSchema.parse(drifted)).toThrow();
  });

  it("keeps an inspectable provenance hook for every raw capture", () => {
    expect(provenance.capturedAt).toBe(evidence.capturedAt);
    expect(provenance.scenarios.map(({ id }) => id)).toEqual(
      exactScenarios.map(({ id }) => id),
    );
    expect(provenance.retention).toContain("not retained");
  });

  it.each(evidence.scenarios)(
    "reconciles taxes, net income, and the recorded Kyle delta for $id",
    ({ id, inputs, rawDisplayed, independentComparison }) => {
      const householdIncome = cents(inputs.householdIncome);
      const totalTax = cents(rawDisplayed.total);
      const net = cents(rawDisplayed.net);
      const scenario = exactScenarios.find((candidate) => candidate.id === id);
      if (!scenario) throw new Error(`Unexpected scenario ${id}`);
      const plan: PlanInput = {
        year: 2026,
        grossSalaryCents: householdIncome,
        additionalWageIncomeCents: 0,
        spouseWageIncomeCents: 0,
        otherOrdinaryIncomeCents: 0,
        filingStatus: scenario.engineFilingStatus,
        stateCode: scenario.stateCode,
        hsaCoverage: "self",
        primaryHsaEligible: true,
        spouseHsaEligible: false,
        primaryHsaCatchUpEligible: false,
        spouseHsaCatchUpEligible: false,
        primaryHsaFamilyAllocationPpm: 1_000_000,
        spouseHsaFamilyAllocationPpm: 0,
        benefits: [],
        expenses: [],
      };
      const kyle = calculatePlan(plan);
      const trace = independentComparison.kyle2026Trace;
      const kyleNet = kyle.takeHomeAnnualCents;
      const delta = net - kyleNet;

      expect({
        federal: kyle.federalIncomeTaxCents,
        fica: kyle.ficaTaxCents,
        state: kyle.stateIncomeTaxCents,
        total: kyle.totalTaxCents,
        net: kyle.takeHomeAnnualCents,
      }).toEqual({
        federal: cents(trace.federal),
        fica: cents(trace.fica),
        state: cents(trace.state),
        total: cents(trace.total),
        net: cents(trace.net),
      });

      expect(
        cents(rawDisplayed.federal) +
          cents(rawDisplayed.fica) +
          cents(rawDisplayed.state) +
          cents(rawDisplayed.local),
      ).toBe(totalTax);
      expect(totalTax + net).toBe(householdIncome);
      expect(cents(independentComparison.deltaDollars)).toBe(delta);
      expect(independentComparison.deltaPercent).toBeCloseTo(
        (delta / kyleNet) * 100,
        8,
      );
      expect(Math.abs(independentComparison.deltaPercent)).toBeLessThanOrEqual(
        2,
      );
    },
  );
});

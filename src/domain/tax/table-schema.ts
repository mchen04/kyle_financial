import { z } from "zod";
import { BUILT_IN_BENEFIT_TYPES } from "../benefits";
import { STATE_CODES, STATE_NAMES } from "./jurisdictions";
import type { TaxTable } from "./types";

const citationsSchema = z.array(z.string().min(1)).min(1);
const centsSchema = z.int().nonnegative();
const rateSchema = z.int().min(0).max(1_000_000);

const bracketSchema = z.object({
  thresholdCents: centsSchema,
  ratePpm: rateSchema,
  citations: citationsSchema,
});

function orderedFilingScheduleSchema(
  minimumBrackets: 0 | 1,
  requireZeroOrigin = false,
) {
  return z
    .object({
      standardDeductionCents: centsSchema,
      personalExemptionCents: centsSchema.optional(),
      citations: citationsSchema,
      brackets: z.array(bracketSchema).min(minimumBrackets),
    })
    .superRefine((schedule, context) => {
      if (requireZeroOrigin && schedule.brackets[0]?.thresholdCents !== 0) {
        context.addIssue({
          code: "custom",
          path: ["brackets", 0, "thresholdCents"],
          message: "Federal tax brackets must start at zero",
        });
      }
      for (let index = 1; index < schedule.brackets.length; index += 1) {
        if (
          schedule.brackets[index].thresholdCents <=
          schedule.brackets[index - 1].thresholdCents
        ) {
          context.addIssue({
            code: "custom",
            path: ["brackets", index, "thresholdCents"],
            message: "Tax bracket thresholds must be strictly increasing",
          });
        }
      }
    });
}

const stateFilingScheduleSchema = orderedFilingScheduleSchema(0);
const federalFilingScheduleSchema = orderedFilingScheduleSchema(1, true);

function filingStatusesSchema(
  scheduleSchema: typeof stateFilingScheduleSchema,
) {
  return z.object({
    single: scheduleSchema,
    mfj: scheduleSchema,
    hoh: scheduleSchema,
  });
}

const stateFilingStatusesSchema = filingStatusesSchema(
  stateFilingScheduleSchema,
);
const federalFilingStatusesSchema = filingStatusesSchema(
  federalFilingScheduleSchema,
);

const benefitTypeSchema = z.enum(BUILT_IN_BENEFIT_TYPES);

const citedLimitSchema = z.object({
  cents: z.int().positive(),
  citations: citationsSchema,
});

const stateTaxEntrySchema = z.object({
  code: z.enum(STATE_CODES),
  name: z.string().min(1),
  approximation: z.string().min(1),
  citations: citationsSchema,
  benefitStateTaxOverrides: z
    .partialRecord(benefitTypeSchema, z.boolean())
    .optional(),
  filingStatuses: stateFilingStatusesSchema,
});

function validateCitationIds(
  citations: string[],
  path: PropertyKey[],
  sources: TaxTable["sources"],
  context: z.RefinementCtx,
): void {
  for (const [index, citation] of citations.entries()) {
    if (!sources[citation]) {
      context.addIssue({
        code: "custom",
        path: [...path, index],
        message: `Citation ${citation} has no source metadata`,
      });
    }
  }
}

function validateCitationReferences(
  value: unknown,
  path: PropertyKey[],
  sources: TaxTable["sources"],
  context: z.RefinementCtx,
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      validateCitationReferences(entry, [...path, index], sources, context),
    );
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, entry] of Object.entries(value)) {
    if (key === "citations" && Array.isArray(entry)) {
      validateCitationIds(entry, [...path, key], sources, context);
      continue;
    }
    validateCitationReferences(entry, [...path, key], sources, context);
  }
}

export const taxTableSchema: z.ZodType<TaxTable> = z
  .object({
    year: z.int().min(2000).max(9999),
    sources: z.record(
      z.string().min(1),
      z.object({ label: z.string().min(1), url: z.url() }),
    ),
    benefitTreatmentCitations: z.record(benefitTypeSchema, citationsSchema),
    federal: federalFilingStatusesSchema,
    fica: z.object({
      socialSecurityRatePpm: rateSchema,
      socialSecurityWageBaseCents: centsSchema,
      medicareRatePpm: rateSchema,
      additionalMedicareRatePpm: rateSchema,
      additionalMedicareWithholdingThresholdCents: centsSchema,
      additionalMedicareThresholdCents: z.object({
        single: centsSchema,
        mfj: centsSchema,
        hoh: centsSchema,
      }),
      citations: citationsSchema,
    }),
    limits: z.object({
      employee401k: citedLimitSchema,
      definedContributionPlan: citedLimitSchema,
      hsaSelf: citedLimitSchema,
      hsaFamily: citedLimitSchema,
      hsaCatchUp: citedLimitSchema,
      healthFsa: citedLimitSchema,
      dependentCareFsa: citedLimitSchema,
      commuterMonthly: citedLimitSchema,
      esppGrantValue: citedLimitSchema,
    }),
    states: z.record(z.enum(STATE_CODES), stateTaxEntrySchema),
  })
  .superRefine((table, context) => {
    for (const [benefitType, citations] of Object.entries(
      table.benefitTreatmentCitations,
    )) {
      validateCitationIds(
        citations,
        ["benefitTreatmentCitations", benefitType],
        table.sources,
        context,
      );
    }
    for (const code of STATE_CODES) {
      const state = table.states[code];
      if (state.code !== code) {
        context.addIssue({
          code: "custom",
          path: ["states", code, "code"],
          message: `State key ${code} does not match code ${state.code}`,
        });
      }
      if (state.name !== STATE_NAMES[code]) {
        context.addIssue({
          code: "custom",
          path: ["states", code, "name"],
          message: `State ${code} must be named ${STATE_NAMES[code]}`,
        });
      }
    }
    validateCitationReferences(table, [], table.sources, context);
  });

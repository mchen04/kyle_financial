import { z } from "zod";
import { BENEFIT_TYPES } from "./benefits";
import {
  PLAN_AGGREGATE_TOO_LARGE_MESSAGE,
  planAggregateError,
} from "./plan-admissibility";
import {
  normalizedHsaPlanSettings,
  type HsaPlanSettings,
  type PlanInput,
} from "./budget";
import {
  fieldVersionSchema,
  isIncomingVersionNewer,
  persistedFieldVersionSchema,
  type FieldVersion,
} from "./field-version";
import { normalizeStoredPlan } from "./stored-plan";
import {
  entityIdSchema,
  parseSyncTarget,
  syncFieldForTarget,
  type SyncField,
} from "./sync-field";
import { STATE_CODES } from "./tax/jurisdictions";

export const maximumMonthlyCents = Math.floor(Number.MAX_SAFE_INTEGER / 12);
export const maximumRatePpm = 1_000_000;
export const maximumEsppDiscountPpm = 150_000;
export const maximumExpenseSortOrder = 10_000;

export const planYearSchema = z.int().min(2000).max(2200);
export { fieldVersionSchema } from "./field-version";

function canonicalFieldVersionsSchema(
  versionSchema: z.ZodType<FieldVersion>,
  mergeAliases: boolean,
) {
  return z.record(z.string(), versionSchema).transform((versions, context) => {
    const normalized: Partial<Record<SyncField, FieldVersion>> = {};
    for (const [field, version] of Object.entries(versions)) {
      const target = parseSyncTarget(field);
      if (!target) {
        context.addIssue({
          code: "custom",
          message: "Unsupported sync field",
          path: [field],
        });
        continue;
      }
      const canonicalField = syncFieldForTarget(target);
      const prior = normalized[canonicalField];
      if (prior && !mergeAliases) {
        context.addIssue({
          code: "custom",
          message: "Duplicate canonical sync field",
          path: [field],
        });
        continue;
      }
      if (!prior || isIncomingVersionNewer(version, prior)) {
        normalized[canonicalField] = version;
      }
    }
    return normalized;
  });
}

export const fieldVersionsSchema = canonicalFieldVersionsSchema(
  fieldVersionSchema,
  false,
);
export const persistedFieldVersionsSchema = canonicalFieldVersionsSchema(
  persistedFieldVersionSchema,
  true,
);
export const stateCodeSchema = z.enum(STATE_CODES);
export const filingStatusSchema = z.enum(["single", "mfj", "hoh"]);
export const hsaCoverageSchema = z.enum(["self", "family"]);
export const safeNonnegativeCentsSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
export const hsaAllocationSchema = z.number().int().min(0).max(maximumRatePpm);
export const benefitOwnerSchema = z.enum(["primary", "spouse"]);
export const entryLabelSchema = z.string().trim().min(1).max(100);
export const esppDiscountRateSchema = z
  .number()
  .int()
  .min(0)
  .max(maximumEsppDiscountPpm);
export const expenseCadenceSchema = z.enum(["monthly", "yearly"]);
export const expenseGuidanceBucketSchema = z.enum(["needs", "wants", "saving"]);
export const expenseSortOrderSchema = z
  .number()
  .int()
  .min(0)
  .max(maximumExpenseSortOrder);

const planBasicsBaseSchema = z.object({
  year: planYearSchema,
  stateCode: stateCodeSchema,
  filingStatus: filingStatusSchema,
  grossSalaryCents: safeNonnegativeCentsSchema,
  additionalWageIncomeCents: safeNonnegativeCentsSchema,
  spouseWageIncomeCents: safeNonnegativeCentsSchema,
  otherOrdinaryIncomeCents: safeNonnegativeCentsSchema,
  hsaCoverage: hsaCoverageSchema,
  primaryHsaEligible: z.boolean().optional(),
  spouseHsaEligible: z.boolean().optional(),
  primaryHsaCatchUpEligible: z.boolean().optional(),
  spouseHsaCatchUpEligible: z.boolean().optional(),
  primaryHsaFamilyAllocationPpm: hsaAllocationSchema.optional(),
  spouseHsaFamilyAllocationPpm: hsaAllocationSchema.optional(),
});

function validateSpouseConsistency(
  value: {
    filingStatus: "single" | "mfj" | "hoh";
    spouseWageIncomeCents: number;
    grossSalaryCents: number;
    additionalWageIncomeCents: number;
    otherOrdinaryIncomeCents: number;
    hsaCoverage?: "self" | "family";
    primaryHsaEligible?: boolean;
    spouseHsaEligible?: boolean;
    primaryHsaCatchUpEligible?: boolean;
    spouseHsaCatchUpEligible?: boolean;
    primaryHsaFamilyAllocationPpm?: number;
    spouseHsaFamilyAllocationPpm?: number;
  },
  context: z.RefinementCtx,
) {
  if (value.filingStatus !== "mfj" && value.spouseWageIncomeCents > 0) {
    context.addIssue({
      code: "custom",
      message: "Spouse wages require married filing jointly.",
      path: ["spouseWageIncomeCents"],
    });
  }
  const incomeTotal =
    BigInt(value.grossSalaryCents) +
    BigInt(value.additionalWageIncomeCents) +
    BigInt(value.spouseWageIncomeCents) +
    BigInt(value.otherOrdinaryIncomeCents);
  if (incomeTotal > BigInt(Number.MAX_SAFE_INTEGER)) {
    context.addIssue({
      code: "custom",
      message: "Combined income is too large to calculate safely.",
      path: [],
    });
  }
  if (
    value.filingStatus === "mfj" &&
    value.hsaCoverage === "family" &&
    value.primaryHsaEligible !== false &&
    value.spouseHsaEligible !== false &&
    value.primaryHsaFamilyAllocationPpm !== undefined &&
    value.spouseHsaFamilyAllocationPpm !== undefined &&
    value.primaryHsaFamilyAllocationPpm + value.spouseHsaFamilyAllocationPpm !==
      1_000_000
  ) {
    context.addIssue({
      code: "custom",
      message: "Married-family HSA allocations must total 100%.",
      path: ["primaryHsaFamilyAllocationPpm"],
    });
  }
}

function normalizeHsaFields<
  T extends Pick<PlanInput, "filingStatus" | "hsaCoverage"> &
    Partial<HsaPlanSettings>,
>(value: T): T & HsaPlanSettings {
  return { ...value, ...normalizedHsaPlanSettings(value) };
}

export const planBasicsSchema = planBasicsBaseSchema
  .superRefine(validateSpouseConsistency)
  .transform(normalizeHsaFields);
export type PlanBasicsInput = z.input<typeof planBasicsSchema>;
export type PlanBasics = z.output<typeof planBasicsSchema>;

const updatePlanBasicsBaseSchema = planBasicsBaseSchema.omit({ year: true });
export const updatePlanBasicsSchema = updatePlanBasicsBaseSchema
  .superRefine(validateSpouseConsistency)
  .transform(normalizeHsaFields);
export type UpdatePlanBasicsInput = z.input<typeof updatePlanBasicsSchema>;
export type UpdatePlanBasics = z.output<typeof updatePlanBasicsSchema>;

export const configuredAmountSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("percent"),
    ratePpm: z.int().min(0).max(maximumRatePpm),
  }),
  z.object({
    kind: z.literal("fixedAnnual"),
    cents: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }),
  z.object({
    kind: z.literal("fixedMonthly"),
    cents: z.int().nonnegative().max(maximumMonthlyCents),
  }),
]);

export const taxTreatmentSchema = z.object({
  reducesFederalTaxable: z.boolean(),
  reducesFicaTaxable: z.boolean(),
  reducesStateTaxable: z.boolean(),
  reducesTakeHome: z.boolean(),
  countsAsSavings: z.boolean(),
  employerSide: z.boolean(),
});

const benefitTypeSchema = z.enum(BENEFIT_TYPES);

export const benefitSchema = z
  .object({
    id: entityIdSchema,
    owner: benefitOwnerSchema.optional(),
    type: benefitTypeSchema,
    label: entryLabelSchema,
    amount: configuredAmountSchema,
    discountRatePpm: esppDiscountRateSchema.optional(),
    customTaxTreatment: taxTreatmentSchema.optional(),
  })
  .superRefine((benefit, context) => {
    if ((benefit.type === "custom") !== Boolean(benefit.customTaxTreatment)) {
      context.addIssue({
        code: "custom",
        message: "Custom benefits require a tax treatment.",
        path: ["customTaxTreatment"],
      });
    }
  });

export const expenseSchema = z
  .object({
    id: entityIdSchema,
    name: entryLabelSchema,
    group: entryLabelSchema,
    cadence: expenseCadenceSchema,
    amountCents: safeNonnegativeCentsSchema,
    sortOrder: expenseSortOrderSchema,
    guidanceBucket: expenseGuidanceBucketSchema.optional(),
  })
  .superRefine((expense, context) => {
    if (
      expense.cadence === "monthly" &&
      expense.amountCents > maximumMonthlyCents
    ) {
      context.addIssue({
        code: "too_big",
        maximum: maximumMonthlyCents,
        origin: "number",
        inclusive: true,
        message: "Monthly amount is too large to annualize safely.",
        path: ["amountCents"],
      });
    }
  });

const fullPlanBaseSchema = updatePlanBasicsBaseSchema
  .extend({
    benefits: z.array(benefitSchema).max(100),
    expenses: z.array(expenseSchema).max(500),
  })
  .superRefine((plan, context) => {
    validateSpouseConsistency(plan, context);
    for (const collection of ["benefits", "expenses"] as const) {
      const seen = new Set<string>();
      for (const [index, entry] of plan[collection].entries()) {
        if (seen.has(entry.id)) {
          context.addIssue({
            code: "custom",
            message: "Entry IDs must be unique.",
            path: [collection, index, "id"],
          });
        }
        seen.add(entry.id);
      }
    }
    if (
      plan.filingStatus !== "mfj" &&
      plan.benefits.some(({ owner }) => owner === "spouse")
    ) {
      context.addIssue({
        code: "custom",
        message: "Spouse-owned payroll items require married filing jointly.",
        path: ["benefits"],
      });
    }
    if (planAggregateError(plan)) {
      context.addIssue({
        code: "custom",
        message: PLAN_AGGREGATE_TOO_LARGE_MESSAGE,
        path: [],
      });
    }
  });

export const fullPlanSchema = fullPlanBaseSchema.transform(normalizeHsaFields);
export type FullPlanInput = z.input<typeof fullPlanSchema>;
export type FullPlan = z.output<typeof fullPlanSchema>;

export const normalizedFullPlanSchema = fullPlanBaseSchema.superRefine(
  (plan, context) => {
    const normalized = normalizedHsaPlanSettings(plan);
    const differs = Object.entries(normalized).some(
      ([field, expected]) => plan[field as keyof HsaPlanSettings] !== expected,
    );
    if (differs) {
      context.addIssue({
        code: "custom",
        message: "HSA settings must already be normalized.",
        path: [],
      });
    }
  },
);

export const storedPlanSchema = z
  .intersection(
    fullPlanSchema,
    z.object({
      id: z.uuid(),
      year: planYearSchema,
      updatedAt: z.iso.datetime(),
      fieldVersions: persistedFieldVersionsSchema.default({}),
    }),
  )
  .transform(normalizeStoredPlan);

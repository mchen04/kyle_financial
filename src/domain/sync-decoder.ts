import { z } from "zod";
import type { BenefitEntry, ConfiguredAmount, TaxTreatment } from "./benefits";
import type { ExpenseEntry } from "./budget";
import {
  benefitSchema,
  benefitOwnerSchema,
  configuredAmountSchema,
  entryLabelSchema,
  esppDiscountRateSchema,
  expenseCadenceSchema,
  expenseGuidanceBucketSchema,
  expenseSchema,
  expenseSortOrderSchema,
  filingStatusSchema,
  hsaAllocationSchema,
  hsaCoverageSchema,
  safeNonnegativeCentsSchema,
  stateCodeSchema,
  taxTreatmentSchema,
} from "./plan-schema";
import type { StoredPlan } from "./stored-plan";
import { canonicalJson, parseSyncTarget, type SyncMutation } from "./sync";

type MutationMetadata = Omit<SyncMutation, "field" | "value">;

type ScalarMutation<K extends string, V> = MutationMetadata & {
  kind: "scalar";
  field: K;
  value: V;
};

type BenefitMutation<P extends string | null, V> = MutationMetadata & {
  kind: "benefit";
  field: SyncMutation["field"];
  entityId: string;
  property: P;
  value: V;
};

type ExpenseMutation<P extends string | null, V> = MutationMetadata & {
  kind: "expense";
  field: SyncMutation["field"];
  entityId: string;
  property: P;
  value: V;
};

export type DecodedSyncMutation =
  | ScalarMutation<"stateCode", StoredPlan["stateCode"]>
  | ScalarMutation<"filingStatus", StoredPlan["filingStatus"]>
  | ScalarMutation<"grossSalaryCents", number>
  | ScalarMutation<"additionalWageIncomeCents", number>
  | ScalarMutation<"spouseWageIncomeCents", number>
  | ScalarMutation<"otherOrdinaryIncomeCents", number>
  | ScalarMutation<"hsaCoverage", StoredPlan["hsaCoverage"]>
  | ScalarMutation<"primaryHsaEligible", boolean>
  | ScalarMutation<"spouseHsaEligible", boolean>
  | ScalarMutation<"primaryHsaCatchUpEligible", boolean>
  | ScalarMutation<"spouseHsaCatchUpEligible", boolean>
  | ScalarMutation<"primaryHsaFamilyAllocationPpm", number>
  | ScalarMutation<"spouseHsaFamilyAllocationPpm", number>
  | BenefitMutation<null, BenefitEntry | null>
  | BenefitMutation<"owner", BenefitEntry["owner"]>
  | BenefitMutation<"label", string>
  | BenefitMutation<"amount", ConfiguredAmount>
  | BenefitMutation<"discountRatePpm", number | null>
  | BenefitMutation<"customTaxTreatment", TaxTreatment | null>
  | ExpenseMutation<null, ExpenseEntry | null>
  | ExpenseMutation<"name" | "group", string>
  | ExpenseMutation<"cadence", ExpenseEntry["cadence"]>
  | ExpenseMutation<"amountCents", number>
  | ExpenseMutation<"sortOrder", number>
  | ExpenseMutation<"guidanceBucket", ExpenseEntry["guidanceBucket"]>;

function canonicalSyncIntent(mutation: SyncMutation): SyncMutation {
  const canonical = encodeSyncMutation(decodeSyncMutation(mutation));
  const intent = {
    ...canonical,
    updatedAt: canonical.intentUpdatedAt ?? canonical.updatedAt,
  };
  delete intent.intentUpdatedAt;
  delete intent.deliveryAfterMutationId;
  return intent;
}

export function syncIntentFingerprint(mutation: SyncMutation): string {
  return canonicalJson(canonicalSyncIntent(mutation));
}

function metadata(mutation: SyncMutation): MutationMetadata {
  return {
    mutationId: mutation.mutationId,
    planYear: mutation.planYear,
    updatedAt: mutation.updatedAt,
    ...(mutation.intentUpdatedAt
      ? { intentUpdatedAt: mutation.intentUpdatedAt }
      : {}),
    ...(mutation.deliveryAfterMutationId
      ? { deliveryAfterMutationId: mutation.deliveryAfterMutationId }
      : {}),
    ...(mutation.baseVersion !== undefined
      ? { baseVersion: mutation.baseVersion }
      : {}),
  };
}

export function decodeSyncMutation(
  mutation: SyncMutation,
): DecodedSyncMutation {
  const target = parseSyncTarget(mutation.field);
  if (!target) throw new Error(`Unsupported sync field: ${mutation.field}`);
  const base = metadata(mutation);
  if (target.kind === "scalar") {
    switch (target.field) {
      case "stateCode":
        return {
          ...base,
          kind: "scalar",
          field: target.field,
          value: stateCodeSchema.parse(mutation.value),
        };
      case "filingStatus":
        return {
          ...base,
          kind: "scalar",
          field: target.field,
          value: filingStatusSchema.parse(mutation.value),
        };
      case "hsaCoverage":
        return {
          ...base,
          kind: "scalar",
          field: target.field,
          value: hsaCoverageSchema.parse(mutation.value),
        };
      case "primaryHsaEligible":
      case "spouseHsaEligible":
      case "primaryHsaCatchUpEligible":
      case "spouseHsaCatchUpEligible":
        return {
          ...base,
          kind: "scalar",
          field: target.field,
          value: z.boolean().parse(mutation.value),
        };
      case "primaryHsaFamilyAllocationPpm":
      case "spouseHsaFamilyAllocationPpm":
        return {
          ...base,
          kind: "scalar",
          field: target.field,
          value: hsaAllocationSchema.parse(mutation.value),
        };
      default:
        return {
          ...base,
          kind: "scalar",
          field: target.field,
          value: safeNonnegativeCentsSchema.parse(mutation.value),
        };
    }
  }
  if (target.kind === "benefit") {
    const common = {
      ...base,
      kind: "benefit" as const,
      field: mutation.field,
      entityId: target.id,
    };
    if (!target.property) {
      const value =
        mutation.value === null ? null : benefitSchema.parse(mutation.value);
      if (value && value.id !== target.id)
        throw new Error("Benefit mutation ID mismatch");
      return { ...common, property: null, value };
    }
    switch (target.property) {
      case "owner":
        return {
          ...common,
          property: target.property,
          value:
            mutation.value === null
              ? undefined
              : benefitOwnerSchema.parse(mutation.value),
        };
      case "label":
        return {
          ...common,
          property: target.property,
          value: entryLabelSchema.parse(mutation.value),
        };
      case "amount":
        return {
          ...common,
          property: target.property,
          value: configuredAmountSchema.parse(mutation.value),
        };
      case "discountRatePpm":
        return {
          ...common,
          property: target.property,
          value:
            mutation.value === null
              ? null
              : esppDiscountRateSchema.parse(mutation.value),
        };
      case "customTaxTreatment":
        return {
          ...common,
          property: target.property,
          value:
            mutation.value === null
              ? null
              : taxTreatmentSchema.parse(mutation.value),
        };
    }
  }
  const common = {
    ...base,
    kind: "expense" as const,
    field: mutation.field,
    entityId: target.id,
  };
  if (!target.property) {
    const value =
      mutation.value === null ? null : expenseSchema.parse(mutation.value);
    if (value && value.id !== target.id)
      throw new Error("Expense mutation ID mismatch");
    return { ...common, property: null, value };
  }
  switch (target.property) {
    case "name":
    case "group":
      return {
        ...common,
        property: target.property,
        value: entryLabelSchema.parse(mutation.value),
      };
    case "cadence":
      return {
        ...common,
        property: target.property,
        value: expenseCadenceSchema.parse(mutation.value),
      };
    case "amountCents":
      return {
        ...common,
        property: target.property,
        value: safeNonnegativeCentsSchema.parse(mutation.value),
      };
    case "sortOrder":
      return {
        ...common,
        property: target.property,
        value: expenseSortOrderSchema.parse(mutation.value),
      };
    case "guidanceBucket":
      return {
        ...common,
        property: target.property,
        value:
          mutation.value === null
            ? undefined
            : expenseGuidanceBucketSchema.parse(mutation.value),
      };
  }
}

export function encodeSyncMutation(
  mutation: DecodedSyncMutation,
): SyncMutation {
  return {
    ...metadata(mutation),
    field: mutation.field,
    value: mutation.value ?? null,
  };
}

export function applyDecodedSyncMutation(
  plan: StoredPlan,
  mutation: DecodedSyncMutation,
): StoredPlan {
  const next = structuredClone(plan);
  if (mutation.kind === "scalar") {
    switch (mutation.field) {
      case "stateCode":
        next.stateCode = mutation.value;
        break;
      case "filingStatus":
        next.filingStatus = mutation.value;
        break;
      case "grossSalaryCents":
        next.grossSalaryCents = mutation.value;
        break;
      case "additionalWageIncomeCents":
        next.additionalWageIncomeCents = mutation.value;
        break;
      case "spouseWageIncomeCents":
        next.spouseWageIncomeCents = mutation.value;
        break;
      case "otherOrdinaryIncomeCents":
        next.otherOrdinaryIncomeCents = mutation.value;
        break;
      case "hsaCoverage":
        next.hsaCoverage = mutation.value;
        break;
      case "primaryHsaEligible":
        next.primaryHsaEligible = mutation.value;
        break;
      case "spouseHsaEligible":
        next.spouseHsaEligible = mutation.value;
        break;
      case "primaryHsaCatchUpEligible":
        next.primaryHsaCatchUpEligible = mutation.value;
        break;
      case "spouseHsaCatchUpEligible":
        next.spouseHsaCatchUpEligible = mutation.value;
        break;
      case "primaryHsaFamilyAllocationPpm":
        next.primaryHsaFamilyAllocationPpm = mutation.value;
        break;
      case "spouseHsaFamilyAllocationPpm":
        next.spouseHsaFamilyAllocationPpm = mutation.value;
        break;
    }
    return next;
  }
  if (mutation.kind === "benefit") {
    const index = next.benefits.findIndex(
      (entry) => entry.id === mutation.entityId,
    );
    if (mutation.property === null) {
      if (mutation.value === null) {
        if (index >= 0) next.benefits.splice(index, 1);
      } else if (index >= 0) next.benefits[index] = mutation.value;
      else next.benefits.push(mutation.value);
      return next;
    }
    if (index < 0) return next;
    const entry = next.benefits[index];
    switch (mutation.property) {
      case "owner":
        entry.owner = mutation.value;
        break;
      case "label":
        entry.label = mutation.value;
        break;
      case "amount":
        entry.amount = mutation.value;
        break;
      case "discountRatePpm":
        entry.discountRatePpm = mutation.value ?? undefined;
        break;
      case "customTaxTreatment":
        entry.customTaxTreatment = mutation.value ?? undefined;
        break;
    }
    return next;
  }
  const index = next.expenses.findIndex(
    (entry) => entry.id === mutation.entityId,
  );
  if (mutation.property === null) {
    if (mutation.value === null) {
      if (index >= 0) next.expenses.splice(index, 1);
    } else if (index >= 0) next.expenses[index] = mutation.value;
    else next.expenses.push(mutation.value);
    return next;
  }
  if (index < 0) return next;
  const entry = next.expenses[index];
  switch (mutation.property) {
    case "name":
      entry.name = mutation.value;
      break;
    case "group":
      entry.group = mutation.value;
      break;
    case "cadence":
      entry.cadence = mutation.value;
      break;
    case "amountCents":
      entry.amountCents = mutation.value;
      break;
    case "sortOrder":
      entry.sortOrder = mutation.value;
      break;
    case "guidanceBucket":
      entry.guidanceBucket = mutation.value;
      break;
  }
  return next;
}

import { z } from "zod";

export const SCALAR_SYNC_FIELDS = [
  "stateCode",
  "filingStatus",
  "grossSalaryCents",
  "additionalWageIncomeCents",
  "spouseWageIncomeCents",
  "otherOrdinaryIncomeCents",
  "hsaCoverage",
  "primaryHsaEligible",
  "spouseHsaEligible",
  "primaryHsaCatchUpEligible",
  "spouseHsaCatchUpEligible",
  "primaryHsaFamilyAllocationPpm",
  "spouseHsaFamilyAllocationPpm",
] as const;
export const BENEFIT_SYNC_PROPERTIES = [
  "owner",
  "label",
  "amount",
  "discountRatePpm",
  "customTaxTreatment",
] as const;
export const EXPENSE_SYNC_PROPERTIES = [
  "name",
  "group",
  "cadence",
  "amountCents",
  "sortOrder",
  "guidanceBucket",
] as const;

export const canonicalUuidSchema = z.uuid().transform((id) => id.toLowerCase());
export const entityIdSchema = canonicalUuidSchema;

export type ScalarSyncField = (typeof SCALAR_SYNC_FIELDS)[number];
export type BenefitSyncProperty = (typeof BENEFIT_SYNC_PROPERTIES)[number];
export type ExpenseSyncProperty = (typeof EXPENSE_SYNC_PROPERTIES)[number];
declare const collectionSyncFieldBrand: unique symbol;
export type CollectionSyncField = string & {
  readonly [collectionSyncFieldBrand]: true;
};
export type SyncField = ScalarSyncField | CollectionSyncField;

export type SyncTarget =
  | { kind: "scalar"; field: ScalarSyncField }
  | { kind: "benefit"; id: string; property?: BenefitSyncProperty }
  | { kind: "expense"; id: string; property?: ExpenseSyncProperty };

export function parseSyncTarget(value: string): SyncTarget | null {
  if ((SCALAR_SYNC_FIELDS as readonly string[]).includes(value)) {
    return { kind: "scalar", field: value as ScalarSyncField };
  }
  const match = value.match(/^(benefit|expense):([^:]+)(?::([A-Za-z]+))?$/);
  if (!match) return null;
  const kind = match[1];
  if (kind !== "benefit" && kind !== "expense") return null;
  const parsedId = entityIdSchema.safeParse(match[2]);
  if (!parsedId.success) return null;
  const id = parsedId.data;
  if (!match[3]) return { kind, id };
  const properties =
    kind === "benefit" ? BENEFIT_SYNC_PROPERTIES : EXPENSE_SYNC_PROPERTIES;
  if (!(properties as readonly string[]).includes(match[3])) return null;
  return kind === "benefit"
    ? { kind, id, property: match[3] as BenefitSyncProperty }
    : { kind, id, property: match[3] as ExpenseSyncProperty };
}

export function syncFieldForTarget(target: SyncTarget): SyncField {
  if (target.kind === "scalar") return target.field;
  const parsed = parseSyncTarget(
    `${target.kind}:${target.id}${target.property ? `:${target.property}` : ""}`,
  );
  if (!parsed || parsed.kind === "scalar") {
    throw new Error("Cannot create a sync field from an invalid target");
  }
  return `${parsed.kind}:${parsed.id}${parsed.property ? `:${parsed.property}` : ""}` as CollectionSyncField;
}

export function entityFieldForTarget(target: SyncTarget): SyncField {
  return target.kind === "scalar"
    ? target.field
    : syncFieldForTarget({ kind: target.kind, id: target.id });
}

export function isSyncField(value: string): value is SyncField {
  const target = parseSyncTarget(value);
  return target !== null && syncFieldForTarget(target) === value;
}

export const syncFieldSchema = z.string().transform((value, context) => {
  const target = parseSyncTarget(value);
  if (!target) {
    context.addIssue({ code: "custom", message: "Unsupported sync field" });
    return z.NEVER;
  }
  return syncFieldForTarget(target);
});

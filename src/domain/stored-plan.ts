import { normalizedHsaPlanSettings, type PlanInput } from "./budget";
import type { FieldVersion } from "./field-version";
import type { SyncField } from "./sync-field";

export type { FieldVersion } from "./field-version";

export type FieldVersions = Partial<Record<SyncField, FieldVersion>>;

export interface StoredPlan extends PlanInput {
  id: string;
  updatedAt: string;
  fieldVersions: FieldVersions;
}

export function normalizeStoredPlan(
  plan: Omit<StoredPlan, "fieldVersions"> & {
    fieldVersions?: FieldVersions;
  },
): StoredPlan {
  return {
    ...plan,
    ...normalizedHsaPlanSettings(plan),
    fieldVersions: plan.fieldVersions ?? {},
  };
}

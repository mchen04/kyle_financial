import { z } from "zod";
import {
  fieldVersionSchema,
  isIncomingVersionNewer,
  persistedFieldVersionSchema,
  transportSafeFieldVersion,
} from "./field-version";
import type { FieldVersion, FieldVersions, StoredPlan } from "./stored-plan";
import { planYearSchema } from "./plan-schema";
import {
  BENEFIT_SYNC_PROPERTIES,
  canonicalUuidSchema,
  entityFieldForTarget,
  EXPENSE_SYNC_PROPERTIES,
  parseSyncTarget,
  SCALAR_SYNC_FIELDS,
  syncFieldForTarget,
  syncFieldSchema,
  type SyncField,
  type SyncTarget,
} from "./sync-field";

export type { FieldVersion } from "./stored-plan";
export { isIncomingVersionNewer } from "./field-version";
export {
  BENEFIT_SYNC_PROPERTIES,
  entityFieldForTarget,
  EXPENSE_SYNC_PROPERTIES,
  isSyncField,
  parseSyncTarget,
  SCALAR_SYNC_FIELDS,
  syncFieldForTarget,
} from "./sync-field";
export type {
  BenefitSyncProperty,
  CollectionSyncField,
  ExpenseSyncProperty,
  ScalarSyncField,
  SyncField,
  SyncTarget,
} from "./sync-field";

export interface SyncMutation {
  mutationId: string;
  planYear: number;
  field: SyncField;
  value: unknown;
  updatedAt: string;
  intentUpdatedAt?: string;
  deliveryAfterMutationId?: string;
  baseVersion?: FieldVersion | null;
}

export const SYNC_BATCH_SIZE = 500;

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

export const syncMutationSchema = z.object({
  mutationId: canonicalUuidSchema,
  planYear: planYearSchema,
  field: syncFieldSchema,
  value: z.unknown(),
  updatedAt: z.iso.datetime(),
  intentUpdatedAt: z.iso.datetime().optional(),
  deliveryAfterMutationId: canonicalUuidSchema.optional(),
  baseVersion: fieldVersionSchema.nullable().optional(),
});

export const persistedSyncMutationEnvelopeSchema = syncMutationSchema.extend({
  baseVersion: persistedFieldVersionSchema.nullable().optional(),
});

export function normalizeClientTimestamp(
  updatedAt: string,
  receivedAt: Date,
  minimumTimestamp?: string,
): string {
  const parsed = Date.parse(updatedAt);
  const minimum = minimumTimestamp
    ? Date.parse(minimumTimestamp) + 1
    : Number.NEGATIVE_INFINITY;
  if (parsed <= receivedAt.getTime() && parsed >= minimum) return updatedAt;
  return new Date(
    Math.max(Math.min(parsed, receivedAt.getTime()), minimum),
  ).toISOString();
}

function collectionMutations<T extends { id: string }, P extends keyof T>(
  previous: readonly T[],
  current: readonly T[],
  properties: readonly P[],
  targetFor: (id: string, property?: P) => SyncTarget,
  planYear: number,
  updatedAt: string,
  createId: () => string,
  replaceWhole: (prior: T, next: T) => boolean = () => false,
  fieldVersions: FieldVersions = {},
): SyncMutation[] {
  const before = new Map(previous.map((entry) => [entry.id, entry]));
  const after = new Map(current.map((entry) => [entry.id, entry]));
  const mutations: SyncMutation[] = [];
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const prior = before.get(id);
    const next = after.get(id);
    if (canonicalJson(prior) === canonicalJson(next)) continue;
    if (!prior || !next || replaceWhole(prior, next)) {
      const field = syncFieldForTarget(targetFor(id));
      mutations.push({
        mutationId: createId(),
        planYear,
        field,
        value: next ?? null,
        updatedAt,
        baseVersion:
          transportSafeFieldVersion(
            latestVersionForField(field, fieldVersions),
          ) ?? null,
      });
      continue;
    }
    for (const property of properties) {
      if (canonicalJson(prior[property]) === canonicalJson(next[property]))
        continue;
      const field = syncFieldForTarget(targetFor(id, property));
      mutations.push({
        mutationId: createId(),
        planYear,
        field,
        value: next[property] ?? null,
        updatedAt,
        baseVersion:
          transportSafeFieldVersion(
            latestVersionForField(field, fieldVersions),
          ) ?? null,
      });
    }
  }
  return mutations;
}

export function diffPlanMutations(
  previous: StoredPlan,
  current: StoredPlan,
  updatedAt: string,
  createId: () => string = () => crypto.randomUUID(),
): SyncMutation[] {
  const scalarMutations = SCALAR_SYNC_FIELDS.filter(
    (field) => canonicalJson(previous[field]) !== canonicalJson(current[field]),
  ).map((field) => ({
    mutationId: createId(),
    planYear: current.year,
    field,
    value: current[field],
    updatedAt,
    baseVersion:
      transportSafeFieldVersion(
        latestVersionForField(field, previous.fieldVersions),
      ) ?? null,
  }));
  return [
    ...scalarMutations,
    ...collectionMutations(
      previous.benefits,
      current.benefits,
      BENEFIT_SYNC_PROPERTIES,
      (id, property) => ({
        kind: "benefit",
        id,
        ...(property === undefined ? {} : { property }),
      }),
      current.year,
      updatedAt,
      createId,
      (prior, next) => prior.type !== next.type,
      previous.fieldVersions,
    ),
    ...collectionMutations(
      previous.expenses,
      current.expenses,
      EXPENSE_SYNC_PROPERTIES,
      (id, property) => ({
        kind: "expense",
        id,
        ...(property === undefined ? {} : { property }),
      }),
      current.year,
      updatedAt,
      createId,
      () => false,
      previous.fieldVersions,
    ),
  ];
}

export function latestVersionForField(
  field: SyncField,
  versions: FieldVersions,
): FieldVersion | undefined {
  const target = parseSyncTarget(field);
  if (!target || target.kind === "scalar") return versions[field];
  const entityField = entityFieldForTarget(target);
  const relevant = target.property
    ? [versions[field], versions[entityField]]
    : Object.entries(versions)
        .filter(
          ([key]) => key === entityField || key.startsWith(`${entityField}:`),
        )
        .map(([, version]) => version);
  let latest: FieldVersion | undefined;
  for (const version of relevant) {
    if (version && isIncomingVersionNewer(version, latest)) latest = version;
  }
  return latest;
}

import "server-only";

import type { Sql, TransactionSql } from "postgres";
import { z } from "zod";
import { guidanceBucket } from "@/domain/budget";
import { normalizedFullPlanSchema } from "@/domain/plan-schema";
import {
  applyDecodedSyncMutation,
  decodeSyncMutation,
  encodeSyncMutation,
  syncIntentFingerprint,
  type DecodedSyncMutation,
} from "@/domain/sync-decoder";
import {
  canonicalJson,
  entityFieldForTarget,
  isIncomingVersionNewer,
  latestVersionForField,
  normalizeClientTimestamp,
  parseSyncTarget,
  persistedSyncMutationEnvelopeSchema,
  syncFieldForTarget,
  syncMutationSchema,
  type SyncMutation,
} from "@/domain/sync";
import { canonicalUuidSchema } from "@/domain/sync-field";
import { transportSafeFieldVersion } from "@/domain/field-version";
import type { FieldVersions } from "@/domain/stored-plan";
import {
  getPlanByYearInTransaction,
  listPlans,
} from "@/server/plans/repository";
import { parseFieldVersions } from "@/server/field-versions";

class InvalidFinalPlanError extends Error {}
export class SyncPlanNotFoundError extends Error {}

interface CommittedSyncAcknowledgement {
  mutationId: string;
  applied: boolean;
  rejected?: never;
}

interface RejectedSyncAcknowledgement {
  mutationId: string;
  applied: false;
  rejected: true;
}

type SyncAcknowledgement =
  CommittedSyncAcknowledgement | RejectedSyncAcknowledgement;

type PlanYearSyncResult =
  | {
      kind: "committed";
      acknowledgements: CommittedSyncAcknowledgement[];
    }
  | { kind: "rejected"; acknowledgements: RejectedSyncAcknowledgement[] };

const receiptResultSchema = z.object({
  fingerprint: z.string().optional(),
  applied: z.boolean().optional(),
});

function legacyDeliveryFingerprint(mutation: SyncMutation): string {
  const delivered = { ...mutation };
  delete delivered.intentUpdatedAt;
  delete delivered.deliveryAfterMutationId;
  return canonicalJson(delivered);
}

function legacyReceiptFingerprintCandidates(fingerprint: string): Set<string> {
  const candidates = new Set([fingerprint]);
  try {
    const parsed = JSON.parse(fingerprint) as unknown;
    const envelope = persistedSyncMutationEnvelopeSchema.safeParse(parsed);
    if (!envelope.success) return candidates;
    const baseVersion = transportSafeFieldVersion(envelope.data.baseVersion);
    const transportMutation =
      baseVersion === undefined
        ? envelope.data
        : { ...envelope.data, baseVersion };
    candidates.add(syncIntentFingerprint(transportMutation));
    candidates.add(legacyDeliveryFingerprint(transportMutation));
  } catch {
    return candidates;
  }
  return candidates;
}

function versionsJson(
  versions: FieldVersions,
): Record<string, Record<string, string>> {
  return Object.fromEntries(
    Object.entries(versions).flatMap(([field, version]) =>
      version
        ? [
            [
              field,
              { updatedAt: version.updatedAt, mutationId: version.mutationId },
            ],
          ]
        : [],
    ),
  );
}

type BenefitMutation = Extract<DecodedSyncMutation, { kind: "benefit" }>;
type ExpenseMutation = Extract<DecodedSyncMutation, { kind: "expense" }>;
type WholeBenefitMutation = Extract<BenefitMutation, { property: null }>;
type WholeExpenseMutation = Extract<ExpenseMutation, { property: null }>;
type BenefitPropertyMutation = Exclude<BenefitMutation, WholeBenefitMutation>;
type ExpensePropertyMutation = Exclude<ExpenseMutation, WholeExpenseMutation>;

async function replaceBenefit(
  transaction: TransactionSql,
  planId: string,
  mutation: WholeBenefitMutation,
): Promise<void> {
  const entryId = mutation.entityId;
  const existing = await transaction<{ sort_order: number }[]>`
    SELECT sort_order FROM benefits WHERE plan_id = ${planId} AND id = ${entryId}
  `;
  const nextOrder =
    existing[0]?.sort_order ??
    (
      await transaction<{ next_order: number }[]>`
      SELECT coalesce(max(sort_order), -1) + 1 AS next_order
      FROM benefits WHERE plan_id = ${planId}
    `
    )[0].next_order;
  await transaction`
    DELETE FROM benefits WHERE plan_id = ${planId} AND id = ${entryId}
  `;
  if (mutation.value === null) return;
  const entry = mutation.value;
  const amountValue =
    entry.amount.kind === "percent" ? entry.amount.ratePpm : entry.amount.cents;
  const customTreatment = entry.customTaxTreatment
    ? JSON.stringify(entry.customTaxTreatment)
    : null;
  await transaction`
    INSERT INTO benefits (
      id, plan_id, owner, type, label, amount_kind, amount_value,
      discount_rate_ppm, custom_tax_treatment, sort_order
    ) VALUES (
      ${entry.id}, ${planId}, ${entry.owner ?? "primary"}, ${entry.type}, ${entry.label}, ${entry.amount.kind},
      ${amountValue}, ${entry.discountRatePpm ?? null}, ${customTreatment}::jsonb,
      ${nextOrder}
    )
  `;
}

async function updateBenefitProperty(
  transaction: TransactionSql,
  planId: string,
  mutation: BenefitPropertyMutation,
): Promise<boolean> {
  const entryId = mutation.entityId;
  switch (mutation.property) {
    case "label":
      return (
        (
          await transaction`UPDATE benefits SET label = ${mutation.value} WHERE plan_id = ${planId} AND id = ${entryId} RETURNING id`
        ).length > 0
      );
    case "owner":
      return (
        (
          await transaction`UPDATE benefits SET owner = ${mutation.value ?? "primary"} WHERE plan_id = ${planId} AND id = ${entryId} RETURNING id`
        ).length > 0
      );
    case "amount": {
      const amount = mutation.value;
      const amountValue =
        amount.kind === "percent" ? amount.ratePpm : amount.cents;
      return (
        (
          await transaction`UPDATE benefits SET amount_kind = ${amount.kind}, amount_value = ${amountValue} WHERE plan_id = ${planId} AND id = ${entryId} RETURNING id`
        ).length > 0
      );
    }
    case "discountRatePpm":
      return (
        (
          await transaction`UPDATE benefits SET discount_rate_ppm = ${mutation.value} WHERE plan_id = ${planId} AND id = ${entryId} RETURNING id`
        ).length > 0
      );
    case "customTaxTreatment": {
      return (
        (
          await transaction`UPDATE benefits SET custom_tax_treatment = ${mutation.value === null ? null : transaction.json({ ...mutation.value })} WHERE plan_id = ${planId} AND id = ${entryId} RETURNING id`
        ).length > 0
      );
    }
  }
}

async function replaceExpense(
  transaction: TransactionSql,
  planId: string,
  mutation: WholeExpenseMutation,
): Promise<void> {
  const entryId = mutation.entityId;
  await transaction`
    DELETE FROM expenses WHERE plan_id = ${planId} AND id = ${entryId}
  `;
  if (mutation.value === null) return;
  const entry = mutation.value;
  await transaction`
    INSERT INTO expenses (
      id, plan_id, name, category_group, cadence, amount_cents, sort_order,
      guidance_bucket
    ) VALUES (
      ${entry.id}, ${planId}, ${entry.name}, ${entry.group}, ${entry.cadence},
      ${entry.amountCents}, ${entry.sortOrder}, ${guidanceBucket(entry)}
    )
  `;
}

async function updateExpenseProperty(
  transaction: TransactionSql,
  planId: string,
  mutation: ExpensePropertyMutation,
): Promise<boolean> {
  const entryId = mutation.entityId;
  switch (mutation.property) {
    case "name":
      return (
        (
          await transaction`UPDATE expenses SET name = ${mutation.value} WHERE plan_id = ${planId} AND id = ${entryId} RETURNING id`
        ).length > 0
      );
    case "group":
      return (
        (
          await transaction`UPDATE expenses SET category_group = ${mutation.value} WHERE plan_id = ${planId} AND id = ${entryId} RETURNING id`
        ).length > 0
      );
    case "cadence":
      return (
        (
          await transaction`UPDATE expenses SET cadence = ${mutation.value} WHERE plan_id = ${planId} AND id = ${entryId} RETURNING id`
        ).length > 0
      );
    case "amountCents":
      return (
        (
          await transaction`UPDATE expenses SET amount_cents = ${mutation.value} WHERE plan_id = ${planId} AND id = ${entryId} RETURNING id`
        ).length > 0
      );
    case "sortOrder":
      return (
        (
          await transaction`UPDATE expenses SET sort_order = ${mutation.value} WHERE plan_id = ${planId} AND id = ${entryId} RETURNING id`
        ).length > 0
      );
    case "guidanceBucket":
      return (
        (
          await transaction`UPDATE expenses SET guidance_bucket = ${mutation.value ?? null} WHERE plan_id = ${planId} AND id = ${entryId} RETURNING id`
        ).length > 0
      );
  }
}

async function reconcilePlanYear(
  sql: Sql,
  userId: string,
  planYear: number,
  yearMutations: DecodedSyncMutation[],
  receivedAt: Date,
): Promise<PlanYearSyncResult> {
  try {
    const acknowledgements = await sql.begin(async (transaction) => {
      const result: CommittedSyncAcknowledgement[] = [];
      const mutationIds = yearMutations.map(({ mutationId }) => mutationId);
      const advisoryKeys = mutationIds.map(
        (mutationId) => `${userId}:${mutationId}`,
      );
      await transaction`
        SELECT pg_advisory_xact_lock(hashtextextended(key, 0))
        FROM unnest(${transaction.array(advisoryKeys, 25)}::text[]) AS key
        ORDER BY key
      `;
      const priorRows = await transaction<
        { mutation_id: string; result: unknown }[]
      >`
        SELECT DISTINCT ON (lower(mutation_id))
          lower(mutation_id) AS mutation_id,
          result
        FROM applied_mutations
        WHERE user_id = ${userId}
          AND lower(mutation_id) = ANY(${transaction.array(mutationIds, 25)}::text[])
        ORDER BY lower(mutation_id), applied_at DESC, mutation_id
      `;
      const priorById = new Map(
        priorRows.map((row) => [row.mutation_id, row.result]),
      );
      const planRows = await transaction<
        { id: string; field_versions: unknown }[]
      >`
        SELECT id, field_versions FROM plans
        WHERE user_id = ${userId} AND year = ${planYear}
        FOR UPDATE
      `;
      const plan = planRows[0];
      if (!plan) throw new SyncPlanNotFoundError();
      const initialPlan = await getPlanByYearInTransaction(
        transaction,
        userId,
        planYear,
      );
      if (!initialPlan) throw new SyncPlanNotFoundError();
      let projectedPlan = initialPlan;
      const versions = parseFieldVersions(plan.field_versions);
      const receipts: Array<{
        mutation_id: string;
        result: { applied: boolean; fingerprint: string };
      }> = [];
      for (const [index, mutation] of yearMutations.entries()) {
        const transportMutation = encodeSyncMutation(mutation);
        const fingerprint = syncIntentFingerprint(transportMutation);
        const prior = priorById.get(mutation.mutationId);
        if (prior !== undefined) {
          const receipt = receiptResultSchema.parse(
            typeof prior === "string" ? JSON.parse(prior) : prior,
          );
          const priorFingerprint = receipt.fingerprint;
          const deliveryFingerprint =
            legacyDeliveryFingerprint(transportMutation);
          const acceptedFingerprints = new Set([
            ...legacyReceiptFingerprintCandidates(fingerprint),
            ...legacyReceiptFingerprintCandidates(deliveryFingerprint),
          ]);
          if (
            priorFingerprint !== undefined &&
            ![...legacyReceiptFingerprintCandidates(priorFingerprint)].some(
              (candidate) => acceptedFingerprints.has(candidate),
            )
          ) {
            throw new Error("Mutation ID was reused with different content");
          }
          result.push({
            mutationId: mutation.mutationId,
            applied: Boolean(receipt.applied),
          });
          continue;
        }
        const entityField = entityFieldForTarget(
          mutation.kind === "scalar"
            ? { kind: "scalar", field: mutation.field }
            : mutation.kind === "benefit"
              ? {
                  kind: "benefit",
                  id: mutation.entityId,
                  ...(mutation.property === null
                    ? {}
                    : { property: mutation.property }),
                }
              : {
                  kind: "expense",
                  id: mutation.entityId,
                  ...(mutation.property === null
                    ? {}
                    : { property: mutation.property }),
                },
        );
        const newestVersion = latestVersionForField(mutation.field, versions);
        const baseMatches =
          mutation.baseVersion !== undefined &&
          canonicalJson(mutation.baseVersion) ===
            canonicalJson(newestVersion ?? null);
        const incoming = {
          updatedAt: normalizeClientTimestamp(
            mutation.updatedAt,
            new Date(receivedAt.getTime() - (yearMutations.length - index - 1)),
            newestVersion !== undefined &&
              (baseMatches ||
                (mutation.deliveryAfterMutationId !== undefined &&
                  mutation.deliveryAfterMutationId ===
                    newestVersion.mutationId))
              ? newestVersion.updatedAt
              : undefined,
          ),
          mutationId: mutation.mutationId,
        };
        let applied =
          baseMatches || isIncomingVersionNewer(incoming, newestVersion);

        if (applied) {
          if (mutation.kind === "benefit") {
            if (mutation.property !== null) {
              applied = await updateBenefitProperty(
                transaction,
                plan.id,
                mutation,
              );
            } else {
              await replaceBenefit(transaction, plan.id, mutation);
            }
          } else if (mutation.kind === "expense") {
            if (mutation.property !== null) {
              applied = await updateExpenseProperty(
                transaction,
                plan.id,
                mutation,
              );
            } else {
              await replaceExpense(transaction, plan.id, mutation);
            }
          }
          if (applied) {
            projectedPlan = applyDecodedSyncMutation(projectedPlan, mutation);
            if (mutation.kind !== "scalar" && mutation.property === null) {
              for (const field of Object.keys(versions)) {
                const target = parseSyncTarget(field);
                if (target && field.startsWith(`${entityField}:`)) {
                  delete versions[syncFieldForTarget(target)];
                }
              }
            }
            versions[mutation.field] = incoming;
          }
        }
        receipts.push({
          mutation_id: mutation.mutationId,
          result: { applied, fingerprint },
        });
        result.push({ mutationId: mutation.mutationId, applied });
      }
      if (receipts.length > 0) {
        await transaction`
          UPDATE plans
          SET state_code = ${projectedPlan.stateCode},
              filing_status = ${projectedPlan.filingStatus},
              gross_salary_cents = ${projectedPlan.grossSalaryCents},
              additional_income_cents = ${projectedPlan.additionalWageIncomeCents},
              spouse_wage_income_cents = ${projectedPlan.spouseWageIncomeCents},
              other_ordinary_income_cents = ${projectedPlan.otherOrdinaryIncomeCents},
              hsa_coverage = ${projectedPlan.hsaCoverage},
              primary_hsa_eligible = ${projectedPlan.primaryHsaEligible},
              spouse_hsa_eligible = ${projectedPlan.spouseHsaEligible},
              primary_hsa_catch_up_eligible = ${projectedPlan.primaryHsaCatchUpEligible},
              spouse_hsa_catch_up_eligible = ${projectedPlan.spouseHsaCatchUpEligible},
              primary_hsa_family_allocation_ppm = ${projectedPlan.primaryHsaFamilyAllocationPpm},
              spouse_hsa_family_allocation_ppm = ${projectedPlan.spouseHsaFamilyAllocationPpm},
              field_versions = ${transaction.json(versionsJson(versions))},
              updated_at = now()
          WHERE id = ${plan.id}
        `;
        await transaction`
          INSERT INTO applied_mutations (user_id, mutation_id, result)
          SELECT ${userId}, receipt.mutation_id, receipt.result
          FROM jsonb_to_recordset(
            ${transaction.typed(JSON.stringify(receipts), 25)}::jsonb
          ) AS receipt(mutation_id text, result jsonb)
        `;
      }
      if (!normalizedFullPlanSchema.safeParse(projectedPlan).success)
        throw new InvalidFinalPlanError();
      return result;
    });
    return { kind: "committed", acknowledgements };
  } catch (error) {
    if (!(error instanceof InvalidFinalPlanError)) throw error;
    return {
      kind: "rejected",
      acknowledgements: yearMutations.map(({ mutationId }) => ({
        mutationId,
        applied: false,
        rejected: true,
      })),
    };
  }
}

export async function applySyncMutations(
  sql: Sql,
  userId: string,
  rawMutations: unknown[],
) {
  const acknowledgements: SyncAcknowledgement[] = [];
  const envelopesById = new Map<string, SyncMutation[]>();
  const invalidCanonicalIds = new Set<string>();
  for (const raw of rawMutations) {
    const parsed = syncMutationSchema.safeParse(raw);
    if (parsed.success) {
      const group = envelopesById.get(parsed.data.mutationId) ?? [];
      group.push(parsed.data);
      envelopesById.set(parsed.data.mutationId, group);
      continue;
    }
    const rawMutationId =
      typeof raw === "object" &&
      raw !== null &&
      typeof (raw as { mutationId?: unknown }).mutationId === "string"
        ? String((raw as { mutationId: string }).mutationId)
        : "";
    const canonicalId = canonicalUuidSchema.safeParse(rawMutationId);
    const mutationId = canonicalId.success ? canonicalId.data : rawMutationId;
    if (canonicalId.success) invalidCanonicalIds.add(canonicalId.data);
    acknowledgements.push({ mutationId, applied: false, rejected: true });
  }
  const parsedMutations: DecodedSyncMutation[] = [];
  for (const [mutationId, envelopes] of envelopesById) {
    let decoded: DecodedSyncMutation[];
    try {
      decoded = envelopes.map((envelope) => decodeSyncMutation(envelope));
    } catch {
      decoded = [];
    }
    const fingerprints = new Set(
      decoded.map((mutation) =>
        syncIntentFingerprint(encodeSyncMutation(mutation)),
      ),
    );
    if (
      invalidCanonicalIds.has(mutationId) ||
      decoded.length !== envelopes.length ||
      fingerprints.size > 1
    ) {
      acknowledgements.push(
        ...envelopes.map(() => ({
          mutationId,
          applied: false as const,
          rejected: true as const,
        })),
      );
      continue;
    }
    parsedMutations.push(decoded[0]);
  }
  parsedMutations.sort(
    (left, right) =>
      Date.parse(left.updatedAt) - Date.parse(right.updatedAt) ||
      left.mutationId.localeCompare(right.mutationId),
  );
  const receivedAt = new Date();
  const byYear = new Map<number, DecodedSyncMutation[]>();
  for (const mutation of parsedMutations) {
    const group = byYear.get(mutation.planYear) ?? [];
    group.push(mutation);
    byYear.set(mutation.planYear, group);
  }

  for (const [planYear, yearMutations] of byYear) {
    const result = await reconcilePlanYear(
      sql,
      userId,
      planYear,
      yearMutations,
      receivedAt,
    );
    acknowledgements.push(...result.acknowledgements);
  }
  if (byYear.size > 0) {
    await sql`
      DELETE FROM applied_mutations
      WHERE user_id = ${userId} AND applied_at < now() - interval '90 days'
    `;
  }

  return { acknowledgements, plans: await listPlans(sql, userId) };
}

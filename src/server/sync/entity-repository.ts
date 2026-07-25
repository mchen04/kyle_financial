import "server-only";

import type { TransactionSql } from "postgres";
import type {
  DecodedBenefitMutation,
  DecodedEntityMutation,
  DecodedExpenseMutation,
  DecodedTransactionMutation,
} from "@/domain/sync-entity-decoder";

type WholeBenefitMutation = Extract<DecodedBenefitMutation, { property: null }>;
type WholeExpenseMutation = Extract<DecodedExpenseMutation, { property: null }>;
type WholeTransactionMutation = Extract<
  DecodedTransactionMutation,
  { property: null }
>;
type BenefitPropertyMutation = Exclude<
  DecodedBenefitMutation,
  WholeBenefitMutation
>;
type ExpensePropertyMutation = Exclude<
  DecodedExpenseMutation,
  WholeExpenseMutation
>;
type TransactionPropertyMutation = Exclude<
  DecodedTransactionMutation,
  WholeTransactionMutation
>;

/**
 * Entity ids arrive from the client, so a batch can name a row that belongs to
 * someone else's plan. Every whole-entity write therefore arbitrates on the
 * primary key and carries a `plan_id` predicate: a foreign id updates nothing
 * and answers `applied: false`, instead of raising the duplicate-key error that
 * used to fail the whole sync and confirm the id exists. The predicate rides
 * inside the write, so ownership costs no extra round trip.
 */
async function replaceBenefit(
  transaction: TransactionSql,
  planId: string,
  mutation: WholeBenefitMutation,
): Promise<boolean> {
  const entryId = mutation.entityId;
  if (mutation.value === null) {
    const removed = await transaction`
      DELETE FROM benefits
      WHERE plan_id = ${planId} AND id = ${entryId}
      RETURNING id
    `;
    return removed.length > 0;
  }
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
  const entry = mutation.value;
  const amountValue =
    entry.amount.kind === "percent" ? entry.amount.ratePpm : entry.amount.cents;
  const customTreatment = entry.customTaxTreatment
    ? JSON.stringify(entry.customTaxTreatment)
    : null;
  const written = await transaction`
    INSERT INTO benefits (
      id, plan_id, owner, type, label, amount_kind, amount_value,
      discount_rate_ppm, custom_tax_treatment, sort_order
    ) VALUES (
      ${entry.id}, ${planId}, ${entry.owner ?? "primary"}, ${entry.type}, ${entry.label}, ${entry.amount.kind},
      ${amountValue}, ${entry.discountRatePpm ?? null}, ${customTreatment}::jsonb,
      ${nextOrder}
    )
    ON CONFLICT (id) DO UPDATE SET
      owner = EXCLUDED.owner,
      type = EXCLUDED.type,
      label = EXCLUDED.label,
      amount_kind = EXCLUDED.amount_kind,
      amount_value = EXCLUDED.amount_value,
      discount_rate_ppm = EXCLUDED.discount_rate_ppm,
      custom_tax_treatment = EXCLUDED.custom_tax_treatment,
      sort_order = EXCLUDED.sort_order
    WHERE benefits.plan_id = ${planId}
    RETURNING id
  `;
  return written.length > 0;
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
    case "customTaxTreatment":
      return (
        (
          await transaction`UPDATE benefits SET custom_tax_treatment = ${mutation.value === null ? null : transaction.json({ ...mutation.value })} WHERE plan_id = ${planId} AND id = ${entryId} RETURNING id`
        ).length > 0
      );
  }
}

async function replaceExpense(
  transaction: TransactionSql,
  planId: string,
  mutation: WholeExpenseMutation,
): Promise<boolean> {
  const entryId = mutation.entityId;
  if (mutation.value === null) {
    // A category that still carries dated transactions cannot be deleted: the
    // composite foreign key would abort the whole sync transaction and every
    // unrelated mutation travelling with it. Reject this one mutation instead.
    const blocking = await transaction`
      SELECT 1 FROM transactions
      WHERE plan_id = ${planId} AND category_id = ${entryId}
      LIMIT 1
    `;
    if (blocking.length > 0) return false;
    await transaction`
      DELETE FROM expenses WHERE plan_id = ${planId} AND id = ${entryId}
    `;
    return true;
  }
  const entry = mutation.value;
  // The arbiter must be the primary key, so an id already owned by another
  // plan updates nothing instead of raising a duplicate-key error that would
  // both fail the batch and confirm the id exists.
  const written = await transaction`
    INSERT INTO expenses (
      id, plan_id, name, category_group, cadence, amount_cents, sort_order,
      guidance_bucket, color_token, archived
    ) VALUES (
      ${entry.id}, ${planId}, ${entry.name}, ${entry.group}, ${entry.cadence},
      ${entry.amountCents}, ${entry.sortOrder}, ${entry.guidanceBucket},
      ${entry.colorToken}, ${entry.archived}
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      category_group = EXCLUDED.category_group,
      cadence = EXCLUDED.cadence,
      amount_cents = EXCLUDED.amount_cents,
      sort_order = EXCLUDED.sort_order,
      guidance_bucket = EXCLUDED.guidance_bucket,
      color_token = EXCLUDED.color_token,
      archived = EXCLUDED.archived
    WHERE expenses.plan_id = ${planId}
    RETURNING id
  `;
  return written.length > 0;
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
      // The column is NOT NULL; an absent bucket is a mutation this server
      // cannot apply, not a null to write.
      if (mutation.value === undefined || mutation.value === null) return false;
      return (
        (
          await transaction`UPDATE expenses SET guidance_bucket = ${mutation.value} WHERE plan_id = ${planId} AND id = ${entryId} RETURNING id`
        ).length > 0
      );
    case "colorToken":
      return (
        (
          await transaction`UPDATE expenses SET color_token = ${mutation.value} WHERE plan_id = ${planId} AND id = ${entryId} RETURNING id`
        ).length > 0
      );
    case "archived":
      return (
        (
          await transaction`UPDATE expenses SET archived = ${mutation.value} WHERE plan_id = ${planId} AND id = ${entryId} RETURNING id`
        ).length > 0
      );
  }
}

async function replaceTransaction(
  transaction: TransactionSql,
  planId: string,
  mutation: WholeTransactionMutation,
): Promise<boolean> {
  const entryId = mutation.entityId;
  if (mutation.value === null) {
    const removed = await transaction`
      DELETE FROM transactions
      WHERE plan_id = ${planId} AND id = ${entryId}
      RETURNING id
    `;
    return removed.length > 0;
  }
  const entry = mutation.value;
  const written = await transaction`
    INSERT INTO transactions (
      id, plan_id, category_id, amount_cents, title, note, transaction_date,
      created_at, updated_at
    ) VALUES (
      ${entry.id}, ${planId}, ${entry.categoryId}, ${entry.amountCents},
      ${entry.title}, ${entry.note ?? null}, ${entry.date}, ${entry.createdAt},
      ${entry.updatedAt}
    )
    ON CONFLICT (id) DO UPDATE SET
      category_id = EXCLUDED.category_id,
      amount_cents = EXCLUDED.amount_cents,
      title = EXCLUDED.title,
      note = EXCLUDED.note,
      transaction_date = EXCLUDED.transaction_date,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at
    WHERE transactions.plan_id = ${planId}
    RETURNING id
  `;
  return written.length > 0;
}

async function updateTransactionProperty(
  transaction: TransactionSql,
  planId: string,
  mutation: TransactionPropertyMutation,
): Promise<boolean> {
  const entryId = mutation.entityId;
  switch (mutation.property) {
    case "categoryId":
      return (
        (
          await transaction`UPDATE transactions SET category_id = ${mutation.value} WHERE plan_id = ${planId} AND id = ${entryId} RETURNING id`
        ).length > 0
      );
    case "amountCents":
      return (
        (
          await transaction`UPDATE transactions SET amount_cents = ${mutation.value} WHERE plan_id = ${planId} AND id = ${entryId} RETURNING id`
        ).length > 0
      );
    case "title":
      return (
        (
          await transaction`UPDATE transactions SET title = ${mutation.value} WHERE plan_id = ${planId} AND id = ${entryId} RETURNING id`
        ).length > 0
      );
    case "note":
      return (
        (
          await transaction`UPDATE transactions SET note = ${mutation.value ?? null} WHERE plan_id = ${planId} AND id = ${entryId} RETURNING id`
        ).length > 0
      );
    case "date":
      return (
        (
          await transaction`UPDATE transactions SET transaction_date = ${mutation.value} WHERE plan_id = ${planId} AND id = ${entryId} RETURNING id`
        ).length > 0
      );
    case "updatedAt":
      return (
        (
          await transaction`UPDATE transactions SET updated_at = ${mutation.value} WHERE plan_id = ${planId} AND id = ${entryId} RETURNING id`
        ).length > 0
      );
  }
}

export async function persistDecodedEntityMutation(
  transaction: TransactionSql,
  planId: string,
  mutation: DecodedEntityMutation,
): Promise<boolean> {
  if (mutation.kind === "benefit") {
    if (mutation.property !== null)
      return updateBenefitProperty(transaction, planId, mutation);
    return replaceBenefit(transaction, planId, mutation);
  }
  if (mutation.kind === "expense") {
    if (mutation.property !== null)
      return updateExpenseProperty(transaction, planId, mutation);
    return replaceExpense(transaction, planId, mutation);
  }
  if (mutation.property !== null)
    return updateTransactionProperty(transaction, planId, mutation);
  return replaceTransaction(transaction, planId, mutation);
}

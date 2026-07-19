import "server-only";

import type { Sql, TransactionSql } from "postgres";
import type { BenefitEntry, ConfiguredAmount } from "../../domain/benefits";
import {
  guidanceBucket,
  type ExpenseEntry,
  type PlanInput,
} from "../../domain/budget";
import { DEFAULT_BENEFITS, DEFAULT_EXPENSES } from "../../domain/defaults";
import {
  stateCodeSchema,
  taxTreatmentSchema,
  type PlanBasics,
} from "../../domain/plan-schema";
import type { StoredPlan } from "../../domain/stored-plan";
import { canonicalJson } from "../../domain/sync";
import { parseFieldVersions } from "../field-versions";
import { isUniqueConstraintViolation } from "../postgres-errors";

export class PlanYearConflictError extends Error {}
export class SourcePlanNotFoundError extends Error {}
export class SourcePlanChangedError extends Error {}

interface PlanRow {
  id: string;
  year: number;
  state_code: string;
  filing_status: PlanInput["filingStatus"];
  gross_salary_cents: string;
  additional_income_cents: string;
  spouse_wage_income_cents: string;
  other_ordinary_income_cents: string;
  hsa_coverage: PlanInput["hsaCoverage"];
  primary_hsa_eligible: boolean;
  spouse_hsa_eligible: boolean;
  primary_hsa_catch_up_eligible: boolean;
  spouse_hsa_catch_up_eligible: boolean;
  primary_hsa_family_allocation_ppm: number;
  spouse_hsa_family_allocation_ppm: number;
  updated_at: Date;
  field_versions: unknown;
}

interface BenefitRow {
  id: string;
  owner: "primary" | "spouse";
  type: BenefitEntry["type"];
  label: string;
  amount_kind: ConfiguredAmount["kind"];
  amount_value: string;
  discount_rate_ppm: number | null;
  custom_tax_treatment: unknown;
}

interface ExpenseRow {
  id: string;
  name: string;
  category_group: string;
  cadence: ExpenseEntry["cadence"];
  amount_cents: string;
  sort_order: number;
  guidance_bucket: "needs" | "wants" | "saving";
}

interface PlanBenefitRow extends BenefitRow {
  plan_id: string;
}

interface PlanExpenseRow extends ExpenseRow {
  plan_id: string;
}

type PersistableBenefit = Omit<BenefitEntry, "id"> & { id?: string };
type PersistableExpense = Omit<ExpenseEntry, "id"> & { id?: string };

function groupByPlan<T extends { plan_id: string }>(
  rows: readonly T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const group = grouped.get(row.plan_id);
    if (group) group.push(row);
    else grouped.set(row.plan_id, [row]);
  }
  return grouped;
}

async function insertBenefits(
  transaction: TransactionSql,
  planId: string,
  entries: readonly PersistableBenefit[],
): Promise<void> {
  if (entries.length === 0) return;
  const rows = entries.map((entry, sortOrder) => ({
    id: entry.id ?? null,
    owner: entry.owner ?? "primary",
    type: entry.type,
    label: entry.label,
    amount_kind: entry.amount.kind,
    amount_value:
      entry.amount.kind === "percent"
        ? entry.amount.ratePpm
        : entry.amount.cents,
    discount_rate_ppm: entry.discountRatePpm ?? null,
    custom_tax_treatment: entry.customTaxTreatment ?? null,
    sort_order: sortOrder,
  }));
  await transaction`
    INSERT INTO benefits (
      id, plan_id, owner, type, label, amount_kind, amount_value,
      discount_rate_ppm, custom_tax_treatment, sort_order
    )
    SELECT coalesce(entry.id, gen_random_uuid()), ${planId}, entry.owner,
           entry.type, entry.label, entry.amount_kind, entry.amount_value,
           entry.discount_rate_ppm, entry.custom_tax_treatment, entry.sort_order
    FROM jsonb_to_recordset(${transaction.typed(JSON.stringify(rows), 25)}::jsonb) AS entry(
      id uuid, owner text, type text, label text, amount_kind text,
      amount_value bigint, discount_rate_ppm integer,
      custom_tax_treatment jsonb, sort_order integer
    )
  `;
}

async function insertExpenses(
  transaction: TransactionSql,
  planId: string,
  entries: readonly PersistableExpense[],
): Promise<void> {
  if (entries.length === 0) return;
  const rows = entries.map((entry) => ({
    id: entry.id ?? null,
    name: entry.name,
    category_group: entry.group,
    cadence: entry.cadence,
    amount_cents: entry.amountCents,
    sort_order: entry.sortOrder,
    guidance_bucket: guidanceBucket(entry),
  }));
  await transaction`
    INSERT INTO expenses (
      id, plan_id, name, category_group, cadence, amount_cents, sort_order,
      guidance_bucket
    )
    SELECT coalesce(entry.id, gen_random_uuid()), ${planId}, entry.name,
           entry.category_group, entry.cadence, entry.amount_cents,
           entry.sort_order, entry.guidance_bucket
    FROM jsonb_to_recordset(${transaction.typed(JSON.stringify(rows), 25)}::jsonb) AS entry(
      id uuid, name text, category_group text, cadence text,
      amount_cents bigint, sort_order integer, guidance_bucket text
    )
  `;
}

function configuredAmount(row: BenefitRow): ConfiguredAmount {
  const value = Number(row.amount_value);
  switch (row.amount_kind) {
    case "percent":
      return { kind: "percent", ratePpm: value };
    case "fixedAnnual":
      return { kind: "fixedAnnual", cents: value };
    case "fixedMonthly":
      return { kind: "fixedMonthly", cents: value };
  }
}

function mapBenefit(row: BenefitRow): BenefitEntry {
  const customTaxTreatment =
    row.custom_tax_treatment === null
      ? null
      : taxTreatmentSchema.parse(
          typeof row.custom_tax_treatment === "string"
            ? JSON.parse(row.custom_tax_treatment)
            : row.custom_tax_treatment,
        );
  return {
    id: row.id,
    owner: row.owner,
    type: row.type,
    label: row.label,
    amount: configuredAmount(row),
    ...(row.discount_rate_ppm === null
      ? {}
      : { discountRatePpm: row.discount_rate_ppm }),
    ...(customTaxTreatment === null ? {} : { customTaxTreatment }),
  };
}

function mapExpense(row: ExpenseRow): ExpenseEntry {
  return {
    id: row.id,
    name: row.name,
    group: row.category_group,
    cadence: row.cadence,
    amountCents: Number(row.amount_cents),
    sortOrder: row.sort_order,
    guidanceBucket: row.guidance_bucket,
  };
}

function materializePlan(
  row: PlanRow,
  benefits: readonly BenefitRow[],
  expenses: readonly ExpenseRow[],
): StoredPlan {
  return {
    id: row.id,
    year: row.year,
    stateCode: stateCodeSchema.parse(row.state_code),
    filingStatus: row.filing_status,
    grossSalaryCents: Number(row.gross_salary_cents),
    additionalWageIncomeCents: Number(row.additional_income_cents),
    spouseWageIncomeCents: Number(row.spouse_wage_income_cents),
    otherOrdinaryIncomeCents: Number(row.other_ordinary_income_cents),
    hsaCoverage: row.hsa_coverage,
    primaryHsaEligible: row.primary_hsa_eligible,
    spouseHsaEligible: row.spouse_hsa_eligible,
    primaryHsaCatchUpEligible: row.primary_hsa_catch_up_eligible,
    spouseHsaCatchUpEligible: row.spouse_hsa_catch_up_eligible,
    primaryHsaFamilyAllocationPpm: row.primary_hsa_family_allocation_ppm,
    spouseHsaFamilyAllocationPpm: row.spouse_hsa_family_allocation_ppm,
    benefits: benefits.map(mapBenefit),
    expenses: expenses.map(mapExpense),
    updatedAt: row.updated_at.toISOString(),
    fieldVersions: parseFieldVersions(row.field_versions),
  };
}

async function hydratePlan(
  sql: Sql | TransactionSql,
  row: PlanRow,
): Promise<StoredPlan> {
  const [benefits, expenses] = await Promise.all([
    sql<BenefitRow[]>`
      SELECT id, owner, type, label, amount_kind, amount_value, discount_rate_ppm,
             custom_tax_treatment
      FROM benefits
      WHERE plan_id = ${row.id}
      ORDER BY sort_order, id
    `,
    sql<ExpenseRow[]>`
      SELECT id, name, category_group, cadence, amount_cents, sort_order,
             guidance_bucket
      FROM expenses
      WHERE plan_id = ${row.id}
      ORDER BY sort_order, id
    `,
  ]);
  return materializePlan(row, benefits, expenses);
}

async function hydratePlans(
  sql: TransactionSql,
  rows: readonly PlanRow[],
): Promise<StoredPlan[]> {
  if (rows.length === 0) return [];
  const planIds = rows.map(({ id }) => id);
  const [benefits, expenses] = await Promise.all([
    sql<PlanBenefitRow[]>`
      SELECT plan_id, id, owner, type, label, amount_kind, amount_value,
             discount_rate_ppm, custom_tax_treatment
      FROM benefits
      WHERE plan_id = ANY(${planIds})
      ORDER BY plan_id, sort_order, id
    `,
    sql<PlanExpenseRow[]>`
      SELECT plan_id, id, name, category_group, cadence, amount_cents,
             sort_order, guidance_bucket
      FROM expenses
      WHERE plan_id = ANY(${planIds})
      ORDER BY plan_id, sort_order, id
    `,
  ]);
  const benefitsByPlan = groupByPlan(benefits);
  const expensesByPlan = groupByPlan(expenses);
  return rows.map((row) =>
    materializePlan(
      row,
      benefitsByPlan.get(row.id) ?? [],
      expensesByPlan.get(row.id) ?? [],
    ),
  );
}

export async function getPlanByYearInTransaction(
  sql: TransactionSql,
  userId: string,
  year: number,
): Promise<StoredPlan | null> {
  const rows = await sql<PlanRow[]>`
    SELECT id, year, state_code, filing_status, gross_salary_cents,
           additional_income_cents, spouse_wage_income_cents,
           other_ordinary_income_cents, hsa_coverage, primary_hsa_eligible,
           spouse_hsa_eligible, primary_hsa_catch_up_eligible,
           spouse_hsa_catch_up_eligible, primary_hsa_family_allocation_ppm,
           spouse_hsa_family_allocation_ppm, updated_at, field_versions
    FROM plans
    WHERE user_id = ${userId} AND year = ${year}
  `;
  return rows[0] ? hydratePlan(sql, rows[0]) : null;
}

export async function getPlanByYear(
  sql: Sql,
  userId: string,
  year: number,
): Promise<StoredPlan | null> {
  return sql.begin("isolation level repeatable read read only", (transaction) =>
    getPlanByYearInTransaction(transaction, userId, year),
  );
}

async function listPlansInTransaction(
  sql: TransactionSql,
  userId: string,
): Promise<StoredPlan[]> {
  const rows = await sql<PlanRow[]>`
    SELECT id, year, state_code, filing_status, gross_salary_cents,
           additional_income_cents, spouse_wage_income_cents,
           other_ordinary_income_cents, hsa_coverage, primary_hsa_eligible,
           spouse_hsa_eligible, primary_hsa_catch_up_eligible,
           spouse_hsa_catch_up_eligible, primary_hsa_family_allocation_ppm,
           spouse_hsa_family_allocation_ppm, updated_at, field_versions
    FROM plans
    WHERE user_id = ${userId}
    ORDER BY year
  `;
  return hydratePlans(sql, rows);
}

export async function listPlans(
  sql: Sql,
  userId: string,
): Promise<StoredPlan[]> {
  return sql.begin("isolation level repeatable read read only", (transaction) =>
    listPlansInTransaction(transaction, userId),
  );
}

export async function createPlanWithDefaults(
  sql: Sql,
  userId: string,
  basics: PlanBasics,
): Promise<StoredPlan> {
  try {
    return await sql.begin(async (transaction) => {
      const rows = await transaction<{ id: string }[]>`
      INSERT INTO plans (
        user_id, year, state_code, filing_status, gross_salary_cents,
        additional_income_cents, spouse_wage_income_cents,
        other_ordinary_income_cents, hsa_coverage, primary_hsa_eligible,
        spouse_hsa_eligible, primary_hsa_catch_up_eligible,
        spouse_hsa_catch_up_eligible, primary_hsa_family_allocation_ppm,
        spouse_hsa_family_allocation_ppm
      ) VALUES (
        ${userId}, ${basics.year}, ${basics.stateCode}, ${basics.filingStatus},
        ${basics.grossSalaryCents}, ${basics.additionalWageIncomeCents},
        ${basics.spouseWageIncomeCents}, ${basics.otherOrdinaryIncomeCents},
        ${basics.hsaCoverage}, ${basics.primaryHsaEligible},
        ${basics.spouseHsaEligible}, ${basics.primaryHsaCatchUpEligible},
        ${basics.spouseHsaCatchUpEligible}, ${basics.primaryHsaFamilyAllocationPpm},
        ${basics.spouseHsaFamilyAllocationPpm}
      )
      RETURNING id
    `;
      const planId = rows[0].id;
      await Promise.all([
        insertBenefits(transaction, planId, DEFAULT_BENEFITS),
        insertExpenses(transaction, planId, DEFAULT_EXPENSES),
      ]);
      const created = await getPlanByYearInTransaction(
        transaction,
        userId,
        basics.year,
      );
      if (!created) throw new Error("Created plan could not be loaded");
      return created;
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) throw new PlanYearConflictError();
    throw error;
  }
}

export async function copyPlanToYear(
  sql: Sql,
  userId: string,
  sourceYear: number,
  targetYear: number,
  expectedSourceUpdatedAt: string,
  expectedSourceFieldVersions: StoredPlan["fieldVersions"],
): Promise<StoredPlan> {
  try {
    return await sql.begin(async (transaction) => {
      const sourceRows = await transaction<PlanRow[]>`
      SELECT id, year, state_code, filing_status, gross_salary_cents,
             additional_income_cents, spouse_wage_income_cents,
             other_ordinary_income_cents, hsa_coverage, primary_hsa_eligible,
             spouse_hsa_eligible, primary_hsa_catch_up_eligible,
             spouse_hsa_catch_up_eligible, primary_hsa_family_allocation_ppm,
             spouse_hsa_family_allocation_ppm, updated_at, field_versions
      FROM plans
      WHERE user_id = ${userId} AND year = ${sourceYear}
      FOR UPDATE
    `;
      const source = sourceRows[0];
      if (!source) throw new SourcePlanNotFoundError();
      const sourceFieldVersions = parseFieldVersions(source.field_versions);
      if (
        source.updated_at.toISOString() !== expectedSourceUpdatedAt ||
        canonicalJson(sourceFieldVersions) !==
          canonicalJson(expectedSourceFieldVersions)
      )
        throw new SourcePlanChangedError();
      const inserted = await transaction<{ id: string }[]>`
      INSERT INTO plans (
        user_id, year, state_code, filing_status, gross_salary_cents,
        additional_income_cents, spouse_wage_income_cents,
        other_ordinary_income_cents, hsa_coverage, primary_hsa_eligible,
        spouse_hsa_eligible, primary_hsa_catch_up_eligible,
        spouse_hsa_catch_up_eligible, primary_hsa_family_allocation_ppm,
        spouse_hsa_family_allocation_ppm, field_versions
      )
      VALUES (
        ${userId}, ${targetYear}, ${source.state_code}, ${source.filing_status},
        ${source.gross_salary_cents}, ${source.additional_income_cents},
        ${source.spouse_wage_income_cents}, ${source.other_ordinary_income_cents},
        ${source.hsa_coverage}, ${source.primary_hsa_eligible},
        ${source.spouse_hsa_eligible},
        ${source.primary_hsa_catch_up_eligible},
        ${source.spouse_hsa_catch_up_eligible},
        ${source.primary_hsa_family_allocation_ppm},
        ${source.spouse_hsa_family_allocation_ppm}, '{}'::jsonb
      )
      RETURNING id
    `;
      const targetId = inserted[0]?.id;
      if (!targetId) throw new Error("Copied plan ID was not returned");
      await transaction`
      INSERT INTO benefits (
        plan_id, owner, type, label, amount_kind, amount_value, discount_rate_ppm,
        custom_tax_treatment, sort_order
      )
      SELECT ${targetId}, owner, type, label, amount_kind, amount_value, discount_rate_ppm,
             custom_tax_treatment, sort_order
      FROM benefits
      WHERE plan_id = ${source.id}
    `;
      await transaction`
      INSERT INTO expenses (
        plan_id, name, category_group, cadence, amount_cents, sort_order,
        guidance_bucket
      )
      SELECT ${targetId}, name, category_group, cadence, amount_cents, sort_order,
             guidance_bucket
      FROM expenses
      WHERE plan_id = ${source.id}
    `;
      const copied = await getPlanByYearInTransaction(
        transaction,
        userId,
        targetYear,
      );
      if (!copied) throw new Error("Copied plan could not be loaded");
      return copied;
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) throw new PlanYearConflictError();
    throw error;
  }
}

export async function exportAccount(sql: Sql, userId: string, email: string) {
  return {
    format: "kyle-financial-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    account: { email },
    plans: await listPlans(sql, userId),
  } as const;
}

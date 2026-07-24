import { afterAll, describe, expect, it } from "vitest";
import { createUser } from "../auth/repository";
import { testSql } from "../../test/database";
import {
  copyPlanToYear,
  createPlanWithDefaults,
  exportAccount,
  getPlanByYear,
  listPlans,
} from "./repository";

const sql = testSql();

afterAll(async () => {
  await sql.end();
});

interface ExplainRow {
  "QUERY PLAN": [
    {
      Plan: unknown;
      "Planning Time": number;
      "Execution Time": number;
    },
  ];
}

function elapsed(start: number): number {
  return performance.now() - start;
}

describe("representative daily-cockpit database scale", () => {
  it("hydrates, exports, filters, and copies a plan with 10,000 transactions", async () => {
    const user = await createUser(
      sql,
      "daily-performance@example.com",
      "daily performance password is long",
    );
    const plan = await createPlanWithDefaults(sql, user.id, {
      year: 2038,
      stateCode: "CA",
      filingStatus: "single",
      grossSalaryCents: 18_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
      primaryHsaEligible: true,
      spouseHsaEligible: false,
      primaryHsaCatchUpEligible: false,
      spouseHsaCatchUpEligible: false,
      primaryHsaFamilyAllocationPpm: 1_000_000,
      spouseHsaFamilyAllocationPpm: 0,
    });
    const categoryId = plan.expenses[0].id;
    const categoryIds = plan.expenses.map(({ id }) => id);
    await sql`
      INSERT INTO transactions (
        plan_id, category_id, amount_cents, title, note, transaction_date,
        created_at, updated_at
      )
      SELECT
        ${plan.id},
        (${categoryIds}::uuid[])[
          ((series - 1) % ${categoryIds.length}) + 1
        ],
        100 + series,
        'Representative transaction ' || series,
        CASE WHEN series % 5 = 0 THEN 'Measured fixture' ELSE NULL END,
        make_date(2038, ((series - 1) % 12) + 1, ((series - 1) % 28) + 1),
        timestamptz '2038-01-01T00:00:00Z' + series * interval '1 second',
        timestamptz '2038-01-01T00:00:00Z' + series * interval '1 second'
      FROM generate_series(1, 10000) AS series
    `;
    await sql`ANALYZE transactions`;

    const indexRows = await sql<{ indexname: string }[]>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = current_schema() AND tablename = 'transactions'
    `;
    expect(indexRows.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        "transactions_plan_date_idx",
        "transactions_plan_category_date_idx",
      ]),
    );

    const periodExplain = await sql<ExplainRow[]>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT id
      FROM transactions
      WHERE plan_id = ${plan.id}
        AND transaction_date BETWEEN date '2038-06-01' AND date '2038-06-30'
      ORDER BY transaction_date DESC, id
    `;
    const categoryExplain = await sql<ExplainRow[]>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT id
      FROM transactions
      WHERE plan_id = ${plan.id}
        AND category_id = ${categoryId}
        AND transaction_date BETWEEN date '2038-06-01' AND date '2038-06-30'
      ORDER BY transaction_date DESC, id
    `;
    const periodPlan = periodExplain[0]["QUERY PLAN"][0];
    const categoryPlan = categoryExplain[0]["QUERY PLAN"][0];
    expect(JSON.stringify(periodPlan.Plan)).toContain(
      "transactions_plan_date_idx",
    );
    expect(JSON.stringify(categoryPlan.Plan)).toContain(
      "transactions_plan_category_date_idx",
    );
    expect(periodPlan["Execution Time"]).toBeLessThan(50);
    expect(categoryPlan["Execution Time"]).toBeLessThan(50);

    let start = performance.now();
    const hydrated = await getPlanByYear(sql, user.id, 2038);
    const hydrateMs = elapsed(start);
    expect(hydrated?.transactions).toHaveLength(10_000);
    expect(hydrateMs).toBeLessThan(500);

    start = performance.now();
    const bootstrap = await listPlans(sql, user.id);
    const bootstrapMs = elapsed(start);
    expect(bootstrap[0].transactions).toHaveLength(10_000);
    expect(bootstrapMs).toBeLessThan(500);

    start = performance.now();
    const exported = await exportAccount(sql, user.id, user.email);
    const exportMs = elapsed(start);
    expect(exported.plans[0].transactions).toHaveLength(10_000);
    expect(exportMs).toBeLessThan(500);

    start = performance.now();
    const copied = await copyPlanToYear(
      sql,
      user.id,
      2038,
      2039,
      hydrated!.updatedAt,
      hydrated!.fieldVersions,
    );
    const copyMs = elapsed(start);
    expect(copied.transactions).toEqual([]);
    expect(copyMs).toBeLessThan(500);

    if (process.env.RECORD_PERF_EVIDENCE === "1") {
      console.info(
        JSON.stringify({
          transactions: 10_000,
          periodQueryMs: periodPlan["Execution Time"],
          categoryQueryMs: categoryPlan["Execution Time"],
          hydrateMs,
          bootstrapMs,
          exportMs,
          copyMs,
        }),
      );
    }
  });
});

import { afterAll, describe, expect, it } from "vitest";
import { createUser } from "@/server/auth/repository";
import { testSql } from "@/test/database";
import { createPlanWithDefaults } from "@/test/plan-repository";
import { applySyncMutations } from "./repository";

const sql = testSql();
afterAll(async () => {
  await sql.end();
});

describe("refusal search bounds", () => {
  it("does not destroy innocent work in a large batch", async () => {
    const user = await createUser(
      sql,
      "sync-refusal-bounds@example.com",
      "sync refusal bounds password",
    );
    const created = await createPlanWithDefaults(sql, user.id, {
      year: 2026,
      stateCode: "TX",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const category = created.expenses[0];
    // One culprit (a scalar that alone makes the plan invalid) plus 149
    // perfectly good transactions.
    const batch = [
      {
        mutationId: "00000000-0000-4000-8000-000000009000",
        planYear: 2026,
        field: "spouseWageIncomeCents" as const,
        value: 5_000_000,
        updatedAt: "2026-07-24T12:00:00.000Z",
      },
      ...Array.from({ length: 149 }, (_, i) => {
        const suffix = (9100 + i).toString().padStart(12, "0");
        const id = `00000000-0000-4000-8000-${suffix}`;
        return {
          mutationId: `00000000-0000-4000-9000-${suffix}`,
          planYear: 2026,
          field: `transaction:${id}` as const,
          value: {
            id,
            categoryId: category.id,
            amountCents: 100 + i,
            title: `t${i}`,
            date: "2026-07-24",
            createdAt: "2026-07-24T12:00:00.000Z",
            updatedAt: "2026-07-24T12:00:00.000Z",
          },
          updatedAt: "2026-07-24T12:00:00.000Z",
        };
      }),
    ];

    const started = performance.now();
    const response = await applySyncMutations(sql, user.id, batch);
    const elapsed = performance.now() - started;

    const refused = response.acknowledgements.filter(({ applied }) => !applied);
    const written = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM transactions
      WHERE plan_id = ${created.id}
    `;

    // Exactly the guilty scalar is refused; all 149 innocent writes survive.
    expect(refused).toEqual([
      { mutationId: "00000000-0000-4000-8000-000000009000", applied: false },
    ]);
    expect(written[0].n).toBe(149);
    // Must stay far below the 30s idle-in-transaction timeout.
    expect(elapsed).toBeLessThan(10_000);
  });
});

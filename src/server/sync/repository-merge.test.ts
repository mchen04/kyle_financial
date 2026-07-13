import { afterAll, describe, expect, it } from "vitest";
import { createUser } from "@/server/auth/repository";
import { copyPlanToYear, getPlanByYear } from "@/server/plans/repository";
import { testSql } from "@/test/database";
import { createPlanWithDefaults } from "@/test/plan-repository";
import { applySyncMutations } from "./repository";

const sql = testSql();

afterAll(async () => {
  await sql.end();
});

describe("offline mutation reconciliation", () => {
  it("merges disjoint expense edits instead of replacing the collection", async () => {
    const user = await createUser(
      sql,
      "sync-disjoint-expenses@example.com",
      "sync disjoint expenses long",
    );
    const created = await createPlanWithDefaults(sql, user.id, {
      year: 2033,
      stateCode: "TX",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const [first, second] = created.expenses;
    const mutations = [
      {
        mutationId: "00000000-0000-4000-8000-000000000021",
        planYear: 2033,
        field: `expense:${first.id}` as const,
        value: { ...first, amountCents: 111_100 },
        updatedAt: "2026-07-12T01:00:00.000Z",
      },
      {
        mutationId: "00000000-0000-4000-8000-000000000022",
        planYear: 2033,
        field: `expense:${second.id}` as const,
        value: { ...second, amountCents: 222_200 },
        updatedAt: "2026-07-12T02:00:00.000Z",
      },
    ];
    await applySyncMutations(sql, user.id, mutations);
    const merged = await getPlanByYear(sql, user.id, 2033);
    expect(
      merged?.expenses.find(({ id }) => id === first.id)?.amountCents,
    ).toBe(111_100);
    expect(
      merged?.expenses.find(({ id }) => id === second.id)?.amountCents,
    ).toBe(222_200);
    expect(merged?.expenses).toHaveLength(created.expenses.length);
  });

  it("clamps future clocks and rejects mutation ID content reuse atomically", async () => {
    const user = await createUser(
      sql,
      "sync-clock-skew@example.com",
      "sync clock skew long",
    );
    await createPlanWithDefaults(sql, user.id, {
      year: 2034,
      stateCode: "TX",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const future = {
      mutationId: "00000000-0000-4000-8000-000000000023",
      planYear: 2034,
      field: "grossSalaryCents" as const,
      value: 11_000_000,
      updatedAt: "2099-01-01T00:00:00.000Z",
    };
    await applySyncMutations(sql, user.id, [future]);
    const later = {
      ...future,
      mutationId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      value: 12_000_000,
    };
    expect(
      (await applySyncMutations(sql, user.id, [later])).acknowledgements[0]
        .applied,
    ).toBe(true);

    const reused = { ...later, value: 13_000_000 };
    await expect(applySyncMutations(sql, user.id, [reused])).rejects.toThrow(
      "reused with different content",
    );
    expect((await getPlanByYear(sql, user.id, 2034))?.grossSalaryCents).toBe(
      12_000_000,
    );
  });

  it("merges disjoint properties on one expense and preserves future edit order", async () => {
    const user = await createUser(
      sql,
      "sync-property-merge@example.com",
      "sync property merge long",
    );
    const created = await createPlanWithDefaults(sql, user.id, {
      year: 2035,
      stateCode: "TX",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const expense = created.expenses[0];
    await applySyncMutations(sql, user.id, [
      {
        mutationId: "00000000-0000-4000-8000-000000000040",
        planYear: 2035,
        field: `expense:${expense.id}:name`,
        value: "Updated name",
        updatedAt: "2026-07-12T01:00:00.000Z",
      },
      {
        mutationId: "00000000-0000-4000-8000-000000000041",
        planYear: 2035,
        field: `expense:${expense.id}:amountCents`,
        value: 456_700,
        updatedAt: "2026-07-12T02:00:00.000Z",
      },
    ]);
    const merged = (await getPlanByYear(sql, user.id, 2035))?.expenses.find(
      ({ id }) => id === expense.id,
    );
    expect(merged).toMatchObject({
      name: "Updated name",
      amountCents: 456_700,
    });

    const acknowledgements = (
      await applySyncMutations(sql, user.id, [
        {
          mutationId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          planYear: 2035,
          field: "grossSalaryCents",
          value: 11_000_000,
          updatedAt: "2099-01-01T00:00:00.000Z",
        },
        {
          mutationId: "00000000-0000-4000-8000-000000000042",
          planYear: 2035,
          field: "grossSalaryCents",
          value: 12_000_000,
          updatedAt: "2099-01-01T00:00:01.000Z",
        },
      ])
    ).acknowledgements;
    expect(acknowledgements.every(({ applied }) => applied)).toBe(true);
    expect((await getPlanByYear(sql, user.id, 2035))?.grossSalaryCents).toBe(
      12_000_000,
    );
  });

  it("orders whole-item and property conflicts through one entity version", async () => {
    const user = await createUser(
      sql,
      "sync-entity-version@example.com",
      "sync entity version password",
    );
    const created = await createPlanWithDefaults(sql, user.id, {
      year: 2036,
      stateCode: "TX",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const expense = created.expenses[0];
    const now = Date.now();
    await applySyncMutations(sql, user.id, [
      {
        mutationId: "00000000-0000-4000-8000-000000000060",
        planYear: 2036,
        field: `expense:${expense.id}`,
        value: { ...expense, name: "New whole row", amountCents: 777_700 },
        updatedAt: new Date(now).toISOString(),
      },
    ]);
    const staleProperty = (
      await applySyncMutations(sql, user.id, [
        {
          mutationId: "00000000-0000-4000-8000-000000000061",
          planYear: 2036,
          field: `expense:${expense.id}:amountCents`,
          value: 111_100,
          updatedAt: new Date(now - 1_000).toISOString(),
        },
      ])
    ).acknowledgements[0];
    expect(staleProperty.applied).toBe(false);
    expect(
      (await getPlanByYear(sql, user.id, 2036))?.expenses.find(
        ({ id }) => id === expense.id,
      )?.amountCents,
    ).toBe(777_700);

    await applySyncMutations(sql, user.id, [
      {
        mutationId: "00000000-0000-4000-8000-000000000062",
        planYear: 2036,
        field: `expense:${expense.id}`,
        value: null,
        updatedAt: new Date(now + 1_000).toISOString(),
      },
    ]);
    const missingProperty = (
      await applySyncMutations(sql, user.id, [
        {
          mutationId: "00000000-0000-4000-8000-000000000063",
          planYear: 2036,
          field: `expense:${expense.id}:amountCents`,
          value: 222_200,
          updatedAt: new Date(now + 2_000).toISOString(),
        },
      ])
    ).acknowledgements[0];
    expect(missingProperty.applied).toBe(false);
  });

  it("syncs HSA eligibility and complementary family allocation as versioned scalars", async () => {
    const user = await createUser(
      sql,
      "sync-hsa-allocation@example.com",
      "sync hsa allocation password",
    );
    await createPlanWithDefaults(sql, user.id, {
      year: 2050,
      stateCode: "TX",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const changes = [
      ["filingStatus", "mfj"],
      ["hsaCoverage", "family"],
      ["spouseHsaEligible", true],
      ["primaryHsaCatchUpEligible", true],
      ["spouseHsaCatchUpEligible", true],
      ["primaryHsaFamilyAllocationPpm", 600_000],
      ["spouseHsaFamilyAllocationPpm", 400_000],
    ] as const;
    const mutations = changes.map(([field, value], index) => ({
      mutationId: `00000000-0000-4000-8000-${String(700 + index).padStart(12, "0")}`,
      planYear: 2050,
      field,
      value,
      updatedAt: new Date(Date.now() + index).toISOString(),
      baseVersion: null,
    }));

    const result = await applySyncMutations(sql, user.id, mutations);
    expect(result.acknowledgements.every(({ applied }) => applied)).toBe(true);
    const synced = await getPlanByYear(sql, user.id, 2050);
    expect(synced).toMatchObject({
      filingStatus: "mfj",
      hsaCoverage: "family",
      primaryHsaEligible: true,
      spouseHsaEligible: true,
      primaryHsaCatchUpEligible: true,
      spouseHsaCatchUpEligible: true,
      primaryHsaFamilyAllocationPpm: 600_000,
      spouseHsaFamilyAllocationPpm: 400_000,
    });
    expect(synced?.fieldVersions.primaryHsaFamilyAllocationPpm).toMatchObject({
      mutationId: mutations[5].mutationId,
    });

    const noncanonical = await applySyncMutations(sql, user.id, [
      {
        mutationId: "00000000-0000-4000-8000-000000000799",
        planYear: 2050,
        field: "filingStatus",
        value: "single",
        updatedAt: new Date(Date.now() + 100).toISOString(),
        baseVersion: synced?.fieldVersions.filingStatus ?? null,
      },
    ]);
    expect(noncanonical.acknowledgements).toEqual([
      {
        mutationId: "00000000-0000-4000-8000-000000000799",
        applied: false,
        rejected: true,
      },
    ]);
    expect(await getPlanByYear(sql, user.id, 2050)).toMatchObject({
      filingStatus: "mfj",
      spouseHsaEligible: true,
      primaryHsaFamilyAllocationPpm: 600_000,
      spouseHsaFamilyAllocationPpm: 400_000,
    });

    const canonicalChanges = [
      ["filingStatus", "single"],
      ["spouseHsaEligible", false],
      ["spouseHsaCatchUpEligible", false],
      ["primaryHsaFamilyAllocationPpm", 1_000_000],
      ["spouseHsaFamilyAllocationPpm", 0],
    ] as const;
    const canonicalMutations = canonicalChanges.map(
      ([field, value], index) => ({
        mutationId: `00000000-0000-4000-8000-${String(800 + index).padStart(12, "0")}`,
        planYear: 2050,
        field,
        value,
        updatedAt: new Date(Date.now() + 200 + index).toISOString(),
        baseVersion: synced?.fieldVersions[field] ?? null,
      }),
    );
    const canonical = await applySyncMutations(
      sql,
      user.id,
      canonicalMutations,
    );
    expect(canonical.acknowledgements.every(({ applied }) => applied)).toBe(
      true,
    );
    const canonicalPlan = await getPlanByYear(sql, user.id, 2050);
    expect(canonicalPlan).toMatchObject({
      filingStatus: "single",
      spouseHsaEligible: false,
      spouseHsaCatchUpEligible: false,
      primaryHsaFamilyAllocationPpm: 1_000_000,
      spouseHsaFamilyAllocationPpm: 0,
    });
    for (const [index, [field]] of canonicalChanges.entries()) {
      expect(canonicalPlan?.fieldVersions[field]).toMatchObject({
        mutationId: canonicalMutations[index].mutationId,
      });
    }
  });

  it("rejects a stale coupled HSA transition without corrupting versions or copy preconditions", async () => {
    const user = await createUser(
      sql,
      "sync-hsa-stale-coupled@example.com",
      "sync hsa stale coupled password",
    );
    const created = await createPlanWithDefaults(sql, user.id, {
      year: 2051,
      stateCode: "TX",
      filingStatus: "mfj",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "family",
    });
    const staleVersions = structuredClone(created.fieldVersions);
    const now = Date.now();
    const allocationMutations = [
      ["primaryHsaFamilyAllocationPpm", 700_000],
      ["spouseHsaFamilyAllocationPpm", 300_000],
    ] as const;
    await applySyncMutations(
      sql,
      user.id,
      allocationMutations.map(([field, value], index) => ({
        mutationId: `00000000-0000-4000-8000-${String(900 + index).padStart(12, "0")}`,
        planYear: 2051,
        field,
        value,
        updatedAt: new Date(now - 1_000 + index).toISOString(),
        baseVersion: staleVersions[field] ?? null,
      })),
    );
    const afterConcurrentEdit = await getPlanByYear(sql, user.id, 2051);
    if (!afterConcurrentEdit) throw new Error("Expected HSA plan");

    const staleTransition = [
      ["filingStatus", "single"],
      ["spouseHsaEligible", false],
      ["primaryHsaFamilyAllocationPpm", 1_000_000],
      ["spouseHsaFamilyAllocationPpm", 0],
    ] as const;
    const result = await applySyncMutations(
      sql,
      user.id,
      staleTransition.map(([field, value], index) => ({
        mutationId: `00000000-0000-4000-8000-${String(910 + index).padStart(12, "0")}`,
        planYear: 2051,
        field,
        value,
        updatedAt: new Date(now - 2_000 + index).toISOString(),
        baseVersion: staleVersions[field] ?? null,
      })),
    );
    expect(result.acknowledgements).toEqual(
      staleTransition.map((_, index) => ({
        mutationId: `00000000-0000-4000-8000-${String(910 + index).padStart(12, "0")}`,
        applied: false,
        rejected: true,
      })),
    );

    const preserved = await getPlanByYear(sql, user.id, 2051);
    expect(preserved).toMatchObject({
      filingStatus: "mfj",
      spouseHsaEligible: true,
      primaryHsaFamilyAllocationPpm: 700_000,
      spouseHsaFamilyAllocationPpm: 300_000,
      fieldVersions: afterConcurrentEdit.fieldVersions,
      updatedAt: afterConcurrentEdit.updatedAt,
    });
    const copied = await copyPlanToYear(
      sql,
      user.id,
      2051,
      2052,
      afterConcurrentEdit.updatedAt,
      afterConcurrentEdit.fieldVersions,
    );
    expect(copied).toMatchObject({
      primaryHsaFamilyAllocationPpm: 700_000,
      spouseHsaFamilyAllocationPpm: 300_000,
    });
  });
});

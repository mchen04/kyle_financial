import { afterAll, describe, expect, it, vi } from "vitest";
import { syncFieldForTarget } from "@/domain/sync";
import { createUser } from "@/server/auth/repository";
import { getPlanByYear } from "@/server/plans/repository";
import { testSql } from "@/test/database";
import { createPlanWithDefaults } from "@/test/plan-repository";
import { applySyncMutations } from "./repository";

const sql = testSql();

afterAll(async () => {
  await sql.end();
});

describe("offline mutation reconciliation", () => {
  it("accepts an acknowledged legacy mutation after delivery ordering is added", async () => {
    const user = await createUser(
      sql,
      "sync-delivery-upgrade@example.com",
      "sync delivery upgrade password",
    );
    const created = await createPlanWithDefaults(sql, user.id, {
      year: 2044,
      stateCode: "CA",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const mutationId = "00000000-0000-4000-8000-000000000097";
    const intentUpdatedAt = "2026-07-12T00:00:00.000Z";
    const legacy = {
      mutationId,
      planYear: 2044,
      field: "grossSalaryCents" as const,
      value: 12_345_600,
      updatedAt: intentUpdatedAt,
      baseVersion: created.fieldVersions.grossSalaryCents ?? null,
    };

    expect(
      (await applySyncMutations(sql, user.id, [legacy])).acknowledgements,
    ).toEqual([{ mutationId, applied: true }]);

    expect(
      (
        await applySyncMutations(sql, user.id, [
          {
            ...legacy,
            updatedAt: "2099-01-01T00:00:00.001Z",
            intentUpdatedAt,
          },
        ])
      ).acknowledgements,
    ).toEqual([{ mutationId, applied: true }]);
  });

  it("preserves future-skewed hierarchical order across 500-mutation request boundaries", async () => {
    const user = await createUser(
      sql,
      "sync-cross-batch-order@example.com",
      "sync cross batch order password",
    );
    const created = await createPlanWithDefaults(sql, user.id, {
      year: 2045,
      stateCode: "CA",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const benefit = created.benefits[0];
    const entityField = syncFieldForTarget({
      kind: "benefit",
      id: benefit.id,
    });
    const originalVersion = created.fieldVersions[entityField] ?? null;
    const timestamp = (index: number) =>
      new Date(Date.UTC(2099, 0, 1, 0, 0, 0, index)).toISOString();
    const mutationId = (index: number) =>
      `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    const scalarMutation = (index: number) => ({
      mutationId: mutationId(index),
      planYear: 2045,
      field: "grossSalaryCents" as const,
      value: 10_000_000 + index,
      updatedAt: timestamp(index),
    });
    const firstBatch = [
      ...Array.from({ length: 499 }, (_, index) => scalarMutation(index + 1)),
      {
        mutationId: mutationId(500),
        planYear: 2045,
        field: entityField,
        value: { ...benefit, label: "Whole-row intent" },
        updatedAt: timestamp(500),
        baseVersion: originalVersion,
      },
    ];
    const secondBatch = [
      {
        mutationId: mutationId(501),
        planYear: 2045,
        field: `${entityField}:label` as const,
        value: "Later property intent",
        updatedAt: timestamp(501),
        deliveryAfterMutationId: mutationId(500),
        baseVersion: originalVersion,
      },
      ...Array.from({ length: 499 }, (_, index) => scalarMutation(index + 502)),
    ];

    const RealDate = Date;
    class FixedDate extends RealDate {
      constructor(value?: string | number | Date) {
        super(value ?? "2026-07-12T12:00:00.000Z");
      }

      static now(): number {
        return new RealDate("2026-07-12T12:00:00.000Z").getTime();
      }
    }
    vi.stubGlobal("Date", FixedDate);
    try {
      await applySyncMutations(sql, user.id, firstBatch);
      const second = await applySyncMutations(sql, user.id, secondBatch);
      await applySyncMutations(sql, user.id, [scalarMutation(1001)]);

      expect(second.acknowledgements[0]).toEqual({
        mutationId: mutationId(501),
        applied: true,
      });
      expect(
        (await getPlanByYear(sql, user.id, 2045))?.benefits.find(
          ({ id }) => id === benefit.id,
        )?.label,
      ).toBe("Later property intent");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not promote an older future-skewed request that locks after a newer intent", async () => {
    const lockSql = testSql();
    const user = await createUser(
      sql,
      "sync-concurrent-future-order@example.com",
      "sync concurrent future order password",
    );
    await createPlanWithDefaults(sql, user.id, {
      year: 2046,
      stateCode: "CA",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const olderId = "00000000-0000-4000-8000-000000000091";
    const newerId = "00000000-0000-4000-8000-000000000092";
    let releaseOlder: () => void = () => undefined;
    const holdOlder = new Promise<void>((resolve) => {
      releaseOlder = resolve;
    });
    let lockAcquired: () => void = () => undefined;
    const locked = new Promise<void>((resolve) => {
      lockAcquired = resolve;
    });
    const blocker = lockSql.begin(async (transaction) => {
      await transaction`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`${user.id}:${olderId}`}, 0)
        )
      `;
      lockAcquired();
      await holdOlder;
    });
    try {
      await locked;

      const older = applySyncMutations(sql, user.id, [
        {
          mutationId: olderId,
          planYear: 2046,
          field: "grossSalaryCents",
          value: 11_000_000,
          updatedAt: "2099-01-01T00:00:00.001Z",
        },
      ]);
      await applySyncMutations(sql, user.id, [
        {
          mutationId: newerId,
          planYear: 2046,
          field: "grossSalaryCents",
          value: 12_000_000,
          updatedAt: "2099-01-01T00:00:00.002Z",
        },
      ]);
      releaseOlder();
      await Promise.all([blocker, older]);

      expect((await getPlanByYear(sql, user.id, 2046))?.grossSalaryCents).toBe(
        12_000_000,
      );
    } finally {
      releaseOlder();
      await blocker;
      await lockSql.end();
    }
  });

  it("persists the qualified parking benefit accepted by the product schema", async () => {
    const user = await createUser(
      sql,
      "sync-commuter-parking@example.com",
      "sync commuter parking password",
    );
    await createPlanWithDefaults(sql, user.id, {
      year: 2043,
      stateCode: "CA",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const benefitId = "00000000-0000-4000-8000-000000000099";
    const mutationId = "00000000-0000-4000-8000-000000000098";
    const result = await applySyncMutations(sql, user.id, [
      {
        mutationId,
        planYear: 2043,
        field: `benefit:${benefitId}`,
        value: {
          id: benefitId,
          type: "commuterParking",
          label: "Qualified parking benefit",
          amount: { kind: "percent", ratePpm: 0 },
        },
        updatedAt: "2026-07-12T01:00:00.000Z",
      },
    ]);

    expect(result.acknowledgements).toEqual([{ mutationId, applied: true }]);
    expect(
      (await getPlanByYear(sql, user.id, 2043))?.benefits.find(
        ({ id }) => id === benefitId,
      )?.type,
    ).toBe("commuterParking");
  });

  it("replays once, makes duplicates idempotent, and resolves conflicts deterministically", async () => {
    const user = await createUser(
      sql,
      "sync-owner@example.com",
      "sync owner password long",
    );
    await createPlanWithDefaults(sql, user.id, {
      year: 2026,
      stateCode: "CA",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const first = {
      mutationId: "00000000-0000-4000-8000-000000000001",
      planYear: 2026,
      field: "stateCode" as const,
      value: "TX",
      updatedAt: "2026-07-12T01:00:00.000Z",
    };
    expect(
      (await applySyncMutations(sql, user.id, [first])).acknowledgements,
    ).toEqual([{ mutationId: first.mutationId, applied: true }]);
    expect(
      (await applySyncMutations(sql, user.id, [first])).acknowledgements,
    ).toEqual([{ mutationId: first.mutationId, applied: true }]);

    const older = {
      ...first,
      mutationId: "00000000-0000-4000-8000-000000000002",
      value: "NY",
      updatedAt: "2026-07-12T00:00:00.000Z",
    };
    const tieWinner = {
      ...first,
      mutationId: "00000000-0000-4000-8000-000000000003",
      value: "CO",
    };
    expect(
      (await applySyncMutations(sql, user.id, [older, tieWinner]))
        .acknowledgements,
    ).toEqual([
      { mutationId: older.mutationId, applied: false },
      { mutationId: tieWinner.mutationId, applied: true },
    ]);
    expect((await getPlanByYear(sql, user.id, 2026))?.stateCode).toBe("CO");
    const receipts = await sql<{ count: string }[]>`
      SELECT count(*) FROM applied_mutations WHERE user_id = ${user.id}
    `;
    expect(Number(receipts[0].count)).toBe(3);
  });
});

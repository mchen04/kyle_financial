import { afterAll, describe, expect, it } from "vitest";
import { canonicalJson } from "@/domain/sync";
import { syncIntentFingerprint } from "@/domain/sync-decoder";
import { createUser } from "@/server/auth/repository";
import { getPlanByYear } from "@/server/plans/repository";
import { testSql } from "@/test/database";
import { createPlanWithDefaults, replacePlan } from "@/test/plan-repository";
import { applySyncMutations, SyncPlanNotFoundError } from "./repository";

const sql = testSql();

afterAll(async () => {
  await sql.end();
});

describe("offline mutation reconciliation", () => {
  it("cannot target another account's plan", async () => {
    const owner = await createUser(
      sql,
      "sync-a@example.com",
      "sync account a long",
    );
    const outsider = await createUser(
      sql,
      "sync-b@example.com",
      "sync account b long",
    );
    await createPlanWithDefaults(sql, owner.id, {
      year: 2030,
      stateCode: "CA",
      filingStatus: "single",
      grossSalaryCents: 1_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    await expect(
      applySyncMutations(sql, outsider.id, [
        {
          mutationId: "00000000-0000-4000-8000-000000000010",
          planYear: 2030,
          field: "grossSalaryCents",
          value: 1,
          updatedAt: "2026-07-12T01:00:00.000Z",
        },
      ]),
    ).rejects.toBeInstanceOf(SyncPlanNotFoundError);
    expect((await getPlanByYear(sql, owner.id, 2030))?.grossSalaryCents).toBe(
      1_000_000,
    );
  });

  it("rejects unsupported state codes without partially applying them", async () => {
    const user = await createUser(
      sql,
      "sync-invalid-state@example.com",
      "sync invalid state long",
    );
    await createPlanWithDefaults(sql, user.id, {
      year: 2031,
      stateCode: "CA",
      filingStatus: "single",
      grossSalaryCents: 1_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const mutationId = "00000000-0000-4000-8000-000000000011";
    expect(
      (
        await applySyncMutations(sql, user.id, [
          {
            mutationId,
            planYear: 2031,
            field: "stateCode",
            value: "ZZ",
            updatedAt: "2026-07-12T01:00:00.000Z",
          },
        ])
      ).acknowledgements,
    ).toEqual([{ mutationId, applied: false, rejected: true }]);
    expect((await getPlanByYear(sql, user.id, 2031))?.stateCode).toBe("CA");
    const receipts = await sql<{ count: string }[]>`
      SELECT count(*) FROM applied_mutations
      WHERE user_id = ${user.id} AND mutation_id = ${mutationId}
    `;
    expect(Number(receipts[0].count)).toBe(0);
  });

  it("quarantines a malformed item without rolling back valid batch peers", async () => {
    const user = await createUser(
      sql,
      "sync-quarantine@example.com",
      "sync quarantine password",
    );
    const created = await createPlanWithDefaults(sql, user.id, {
      year: 2038,
      stateCode: "TX",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const benefit = created.benefits[0];
    const result = await applySyncMutations(sql, user.id, [
      {
        mutationId: "00000000-0000-4000-8000-000000000080",
        planYear: 2038,
        field: `benefit:${benefit.id}`,
        value: { ...benefit, label: "" },
        updatedAt: "2026-07-12T01:00:00.000Z",
      },
      {
        mutationId: "00000000-0000-4000-8000-000000000081",
        planYear: 2038,
        field: "grossSalaryCents",
        value: 12_000_000,
        updatedAt: "2026-07-12T01:00:00.001Z",
      },
    ]);
    expect(result.acknowledgements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mutationId: "00000000-0000-4000-8000-000000000080",
          rejected: true,
        }),
        expect.objectContaining({
          mutationId: "00000000-0000-4000-8000-000000000081",
          applied: true,
        }),
      ]),
    );
    expect((await getPlanByYear(sql, user.id, 2038))?.grossSalaryCents).toBe(
      12_000_000,
    );
  });

  it("quarantines a malformed envelope without blocking valid peers", async () => {
    const user = await createUser(
      sql,
      "sync-envelope@example.com",
      "sync envelope password",
    );
    await createPlanWithDefaults(sql, user.id, {
      year: 2039,
      stateCode: "TX",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const result = await applySyncMutations(sql, user.id, [
      {
        mutationId: "not-a-uuid",
        planYear: 2039,
        field: "stateCode",
        value: "CA",
        updatedAt: "not-a-date",
      },
      {
        mutationId: "00000000-0000-4000-8000-000000000082",
        planYear: 2039,
        field: "stateCode",
        value: "CO",
        updatedAt: "2026-07-12T01:00:00.000Z",
      },
    ]);
    expect(result.acknowledgements).toEqual(
      expect.arrayContaining([
        { mutationId: "not-a-uuid", applied: false, rejected: true },
        expect.objectContaining({
          mutationId: "00000000-0000-4000-8000-000000000082",
          applied: true,
        }),
      ]),
    );
    expect((await getPlanByYear(sql, user.id, 2039))?.stateCode).toBe("CO");
  });

  it("rejects mutation ID casing aliases within one request batch", async () => {
    const user = await createUser(
      sql,
      "sync-id-alias@example.com",
      "sync id alias password",
    );
    await createPlanWithDefaults(sql, user.id, {
      year: 2041,
      stateCode: "TX",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const mutationId = "f09af018-f6c2-4eb1-9380-123173bd9802";
    const result = await applySyncMutations(sql, user.id, [
      {
        mutationId: mutationId.toUpperCase(),
        planYear: 2041,
        field: "grossSalaryCents",
        value: 11_000_000,
        updatedAt: "2026-07-12T01:00:00.000Z",
      },
      {
        mutationId,
        planYear: 2041,
        field: "grossSalaryCents",
        value: 12_000_000,
        updatedAt: "2026-07-12T01:00:00.001Z",
      },
    ]);

    expect(result.acknowledgements).toEqual([
      { mutationId, applied: false, rejected: true },
      { mutationId, applied: false, rejected: true },
    ]);
    expect((await getPlanByYear(sql, user.id, 2041))?.grossSalaryCents).toBe(
      10_000_000,
    );
  });

  it("applies one canonical copy of identical mutation ID aliases", async () => {
    const user = await createUser(
      sql,
      "sync-identical-id-alias@example.com",
      "sync identical id alias password",
    );
    await createPlanWithDefaults(sql, user.id, {
      year: 2043,
      stateCode: "TX",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const mutationId = "f09af018-f6c2-4eb1-9380-123173bd9804";
    const mutation = {
      mutationId,
      planYear: 2043,
      field: "grossSalaryCents",
      value: 11_000_000,
      updatedAt: "2026-07-12T01:00:00.000Z",
    };
    const result = await applySyncMutations(sql, user.id, [
      { ...mutation, mutationId: mutationId.toUpperCase() },
      mutation,
    ]);

    expect(result.acknowledgements).toEqual([{ mutationId, applied: true }]);
    expect((await getPlanByYear(sql, user.id, 2043))?.grossSalaryCents).toBe(
      11_000_000,
    );
  });

  it("compares duplicate whole-entry intents after value canonicalization", async () => {
    const user = await createUser(
      sql,
      "sync-canonical-value-alias@example.com",
      "sync canonical value alias password",
    );
    await createPlanWithDefaults(sql, user.id, {
      year: 2048,
      stateCode: "TX",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const mutationId = "f09af018-f6c2-4eb1-9380-123173bd9807";
    const expenseId = "a09af018-f6c2-4eb1-9380-123173bd9808";
    const value = {
      id: expenseId,
      name: "Insurance",
      group: "Needs",
      cadence: "monthly",
      amountCents: 50_000,
      sortOrder: 20,
    };
    const envelope = {
      mutationId,
      planYear: 2048,
      field: `expense:${expenseId}`,
      updatedAt: "2026-07-12T01:00:00.000Z",
    };
    const result = await applySyncMutations(sql, user.id, [
      { ...envelope, value: { ...value, id: expenseId.toUpperCase() } },
      { ...envelope, mutationId: mutationId.toUpperCase(), value },
    ]);

    expect(result.acknowledgements).toEqual([{ mutationId, applied: true }]);
    expect(
      (await getPlanByYear(sql, user.id, 2048))?.expenses.find(
        ({ id }) => id === expenseId,
      ),
    ).toMatchObject({ name: "Insurance", amountCents: 50_000 });
  });

  it("rejects valid and malformed values that reuse one mutation ID", async () => {
    const user = await createUser(
      sql,
      "sync-mixed-id-reuse@example.com",
      "sync mixed id reuse password",
    );
    await createPlanWithDefaults(sql, user.id, {
      year: 2046,
      stateCode: "TX",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const mutationId = "f09af018-f6c2-4eb1-9380-123173bd9805";
    const envelope = {
      mutationId,
      planYear: 2046,
      field: "stateCode",
      updatedAt: "2026-07-12T01:00:00.000Z",
    };
    const result = await applySyncMutations(sql, user.id, [
      { ...envelope, value: "ZZ" },
      { ...envelope, mutationId: mutationId.toUpperCase(), value: "CO" },
    ]);

    expect(result.acknowledgements).toEqual([
      { mutationId, applied: false, rejected: true },
      { mutationId, applied: false, rejected: true },
    ]);
    expect((await getPlanByYear(sql, user.id, 2046))?.stateCode).toBe("TX");
  });

  it("finds legacy uppercase receipts by canonical mutation identity", async () => {
    const user = await createUser(
      sql,
      "sync-legacy-receipt@example.com",
      "sync legacy receipt password",
    );
    await createPlanWithDefaults(sql, user.id, {
      year: 2047,
      stateCode: "TX",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const mutationId = "f09af018-f6c2-4eb1-9380-123173bd9806";
    await sql`
      INSERT INTO applied_mutations (user_id, mutation_id, result)
      VALUES (${user.id}, ${mutationId.toUpperCase()}, ${sql.json({ applied: true })})
    `;

    const result = await applySyncMutations(sql, user.id, [
      {
        mutationId,
        planYear: 2047,
        field: "grossSalaryCents",
        value: 12_000_000,
        updatedAt: "2026-07-12T01:00:00.000Z",
      },
    ]);

    expect(result.acknowledgements).toEqual([{ mutationId, applied: true }]);
    expect((await getPlanByYear(sql, user.id, 2047))?.grossSalaryCents).toBe(
      10_000_000,
    );
  });

  it("normalizes pre-canonical receipt fingerprints after key migration", async () => {
    const user = await createUser(
      sql,
      "sync-precanonical-fingerprint@example.com",
      "sync precanonical fingerprint password",
    );
    await createPlanWithDefaults(sql, user.id, {
      year: 2051,
      stateCode: "TX",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const mutationId = "f09af018-f6c2-4eb1-9380-123173bd9813";
    const expenseId = "a09af018-f6c2-4eb1-9380-123173bd9814";
    const historicalEnvelope = {
      mutationId: mutationId.toUpperCase(),
      planYear: 2051,
      field: `expense:${expenseId.toUpperCase()}`,
      value: {
        id: expenseId.toUpperCase(),
        name: " Insurance ",
        group: "Needs",
        cadence: "monthly",
        amountCents: 50_000,
        sortOrder: 20,
      },
      updatedAt: "2026-07-12T01:00:00.000Z",
    };
    await sql`
      INSERT INTO applied_mutations (user_id, mutation_id, result)
      VALUES (
        ${user.id},
        ${mutationId},
        ${sql.json({ applied: true, fingerprint: canonicalJson(historicalEnvelope) })}
      )
    `;

    const result = await applySyncMutations(sql, user.id, [
      {
        ...historicalEnvelope,
        mutationId,
        field: `expense:${expenseId}`,
        value: {
          ...historicalEnvelope.value,
          id: expenseId,
          name: "Insurance",
        },
      },
    ]);

    expect(result.acknowledgements).toEqual([{ mutationId, applied: true }]);
    expect(
      (await getPlanByYear(sql, user.id, 2051))?.expenses.some(
        ({ id }) => id === expenseId,
      ),
    ).toBe(false);
  });

  it("matches receipts issued before legacy base-version repair", async () => {
    const user = await createUser(
      sql,
      "sync-legacy-base-receipt@example.com",
      "sync legacy base receipt password",
    );
    await createPlanWithDefaults(sql, user.id, {
      year: 2049,
      stateCode: "TX",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const mutationId = "f09af018-f6c2-4eb1-9380-123173bd9809";
    const updatedAt = "2026-07-12T01:00:00.000Z";
    const legacyMutation = {
      mutationId,
      planYear: 2049,
      field: "grossSalaryCents" as const,
      value: 12_000_000,
      updatedAt,
      baseVersion: {
        updatedAt: "2026-07-11T01:00:00.000Z",
        mutationId: "legacy-non-uuid-version",
      },
    };
    await sql`
      INSERT INTO applied_mutations (user_id, mutation_id, result)
      VALUES (
        ${user.id},
        ${mutationId},
        ${sql.json({ applied: true, fingerprint: syncIntentFingerprint(legacyMutation) })}
      )
    `;

    const result = await applySyncMutations(sql, user.id, [
      { ...legacyMutation, baseVersion: null },
    ]);

    expect(result.acknowledgements).toEqual([{ mutationId, applied: true }]);
    expect((await getPlanByYear(sql, user.id, 2049))?.grossSalaryCents).toBe(
      10_000_000,
    );
  });

  it("composes delivery and base-version receipt compatibility", async () => {
    const user = await createUser(
      sql,
      "sync-composed-legacy-receipt@example.com",
      "sync composed legacy receipt password",
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
    const mutationId = "f09af018-f6c2-4eb1-9380-123173bd9812";
    const legacyDelivery = {
      mutationId,
      planYear: 2050,
      field: "grossSalaryCents" as const,
      value: 12_000_000,
      updatedAt: "2026-07-12T01:00:01.000Z",
      baseVersion: {
        updatedAt: "2026-07-11T01:00:00.000Z",
        mutationId: "legacy-non-uuid-version",
      },
    };
    await sql`
      INSERT INTO applied_mutations (user_id, mutation_id, result)
      VALUES (
        ${user.id},
        ${mutationId},
        ${sql.json({ applied: true, fingerprint: canonicalJson(legacyDelivery) })}
      )
    `;

    const result = await applySyncMutations(sql, user.id, [
      {
        ...legacyDelivery,
        intentUpdatedAt: "2026-07-12T01:00:00.000Z",
        baseVersion: null,
      },
    ]);

    expect(result.acknowledgements).toEqual([{ mutationId, applied: true }]);
    expect((await getPlanByYear(sql, user.id, 2050))?.grossSalaryCents).toBe(
      10_000_000,
    );
  });

  it("rejects a batch whose final plan violates cross-field invariants", async () => {
    const user = await createUser(
      sql,
      "sync-plan-invariant@example.com",
      "sync plan invariant password",
    );
    await createPlanWithDefaults(sql, user.id, {
      year: 2040,
      stateCode: "TX",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const mutationId = "00000000-0000-4000-8000-000000000083";
    const result = await applySyncMutations(sql, user.id, [
      {
        mutationId,
        planYear: 2040,
        field: "spouseWageIncomeCents",
        value: 1,
        updatedAt: "2026-07-12T01:00:00.000Z",
      },
    ]);
    expect(result.acknowledgements).toEqual([
      { mutationId, applied: false, rejected: true },
    ]);
    expect(
      (await getPlanByYear(sql, user.id, 2040))?.spouseWageIncomeCents,
    ).toBe(0);
  });

  it("validates the committed winners instead of stale no-op payloads", async () => {
    const user = await createUser(
      sql,
      "sync-stale-invariant@example.com",
      "sync stale invariant password",
    );
    await createPlanWithDefaults(sql, user.id, {
      year: 2042,
      stateCode: "TX",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    await applySyncMutations(sql, user.id, [
      {
        mutationId: "00000000-0000-4000-8000-000000000086",
        planYear: 2042,
        field: "spouseWageIncomeCents",
        value: 0,
        updatedAt: "2026-07-12T00:00:00.000Z",
        baseVersion: null,
      },
      {
        mutationId: "00000000-0000-4000-8000-000000000087",
        planYear: 2042,
        field: "stateCode",
        value: "TX",
        updatedAt: "2026-07-12T00:00:00.001Z",
        baseVersion: null,
      },
    ]);
    const current = await getPlanByYear(sql, user.id, 2042);
    const staleId = "00000000-0000-4000-8000-000000000084";
    const validId = "00000000-0000-4000-8000-000000000085";
    const result = await applySyncMutations(sql, user.id, [
      {
        mutationId: staleId,
        planYear: 2042,
        field: "spouseWageIncomeCents",
        value: 1,
        updatedAt: "2000-01-01T00:00:00.000Z",
        baseVersion: null,
      },
      {
        mutationId: validId,
        planYear: 2042,
        field: "stateCode",
        value: "CO",
        updatedAt: new Date().toISOString(),
        baseVersion: current?.fieldVersions.stateCode ?? null,
      },
    ]);
    expect(result.acknowledgements).toEqual(
      expect.arrayContaining([
        { mutationId: staleId, applied: false },
        { mutationId: validId, applied: true },
      ]),
    );
    expect(await getPlanByYear(sql, user.id, 2042)).toMatchObject({
      filingStatus: "single",
      spouseWageIncomeCents: 0,
      stateCode: "CO",
    });
  });

  it("preserves recent edit order while correcting materially skewed clocks", async () => {
    const user = await createUser(
      sql,
      "sync-online-version@example.com",
      "sync online version long",
    );
    const created = await createPlanWithDefaults(sql, user.id, {
      year: 2032,
      stateCode: "TX",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const online = await replacePlan(sql, user.id, 2032, {
      ...created,
      grossSalaryCents: 20_000_000,
    });
    expect(online?.grossSalaryCents).toBe(20_000_000);
    const delayed = {
      mutationId: "00000000-0000-4000-8000-000000000020",
      planYear: 2032,
      field: "grossSalaryCents" as const,
      value: 15_000_000,
      updatedAt: new Date(Date.now() - 1_000).toISOString(),
    };
    expect(
      (await applySyncMutations(sql, user.id, [delayed])).acknowledgements,
    ).toEqual([{ mutationId: delayed.mutationId, applied: false }]);
    expect((await getPlanByYear(sql, user.id, 2032))?.grossSalaryCents).toBe(
      20_000_000,
    );
  });

  it("uses an explicit base version to distinguish slow clocks from stale offline edits", async () => {
    const user = await createUser(
      sql,
      "sync-base-version@example.com",
      "sync base version password",
    );
    const created = await createPlanWithDefaults(sql, user.id, {
      year: 2037,
      stateCode: "TX",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const seeded = {
      mutationId: "00000000-0000-4000-8000-000000000073",
      planYear: 2037,
      field: "grossSalaryCents" as const,
      value: 10_500_000,
      updatedAt: "2025-01-01T00:00:00.000Z",
      baseVersion: null,
    };
    expect(
      (await applySyncMutations(sql, user.id, [seeded])).acknowledgements[0]
        .applied,
    ).toBe(true);
    const afterSeed = await getPlanByYear(sql, user.id, 2037);
    const slowButFresh = {
      mutationId: "00000000-0000-4000-8000-000000000070",
      planYear: 2037,
      field: "grossSalaryCents" as const,
      value: 11_000_000,
      updatedAt: "2000-01-01T00:00:00.000Z",
      baseVersion: afterSeed!.fieldVersions.grossSalaryCents!,
    };
    expect(
      (await applySyncMutations(sql, user.id, [slowButFresh]))
        .acknowledgements[0].applied,
    ).toBe(true);

    const afterFresh = await getPlanByYear(sql, user.id, 2037);
    expect(
      Date.parse(afterFresh!.fieldVersions.grossSalaryCents!.updatedAt),
    ).toBeGreaterThan(
      Date.parse(afterSeed!.fieldVersions.grossSalaryCents!.updatedAt),
    );
    const staleByClock = {
      ...slowButFresh,
      mutationId: "00000000-0000-4000-8000-000000000072",
      value: 12_000_000,
      updatedAt: afterSeed!.fieldVersions.grossSalaryCents!.updatedAt,
    };
    expect(
      (await applySyncMutations(sql, user.id, [staleByClock]))
        .acknowledgements[0].applied,
    ).toBe(false);

    await replacePlan(sql, user.id, 2037, {
      ...created,
      grossSalaryCents: 20_000_000,
    });
    const staleOffline = {
      ...slowButFresh,
      mutationId: "00000000-0000-4000-8000-000000000071",
      value: 15_000_000,
      updatedAt: "2000-01-02T00:00:00.000Z",
      baseVersion: afterFresh?.fieldVersions.grossSalaryCents ?? null,
    };
    expect(
      (await applySyncMutations(sql, user.id, [staleOffline]))
        .acknowledgements[0].applied,
    ).toBe(false);
    expect((await getPlanByYear(sql, user.id, 2037))?.grossSalaryCents).toBe(
      20_000_000,
    );
  });
});

import { afterAll, describe, expect, it } from "vitest";
import { diffPlanMutations } from "@/domain/sync";
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
  it("rejects future-dated actuals at the durable sync boundary", async () => {
    const user = await createUser(
      sql,
      "sync-future-actual@example.com",
      "sync future actual password",
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
    const transactionId = "00000000-0000-4000-8000-000000001090";
    const result = await applySyncMutations(sql, user.id, [
      {
        mutationId: "00000000-0000-4000-8000-000000001091",
        planYear: 2026,
        field: `transaction:${transactionId}`,
        value: {
          id: transactionId,
          categoryId: created.expenses[0].id,
          amountCents: 500,
          title: "Future actual",
          date: "2026-12-31",
          createdAt: "2026-07-24T12:00:00.000Z",
          updatedAt: "2026-07-24T12:00:00.000Z",
        },
        updatedAt: "2026-07-24T12:00:00.000Z",
      },
    ]);

    expect(result.acknowledgements).toEqual([
      {
        mutationId: "00000000-0000-4000-8000-000000001091",
        applied: false,
        rejected: true,
      },
    ]);
    expect((await getPlanByYear(sql, user.id, 2026))?.transactions).toEqual([]);

    const correctionId = "00000000-0000-4000-8000-000000001092";
    expect(
      (
        await applySyncMutations(sql, user.id, [
          {
            mutationId: correctionId,
            planYear: 2026,
            field: `transaction:${transactionId}:date`,
            value: "2026-07-24",
            updatedAt: "2026-07-24T12:01:00.000Z",
          },
        ])
      ).acknowledgements,
    ).toEqual([{ mutationId: correctionId, applied: false }]);

    const replacementId = "00000000-0000-4000-8000-000000001093";
    const replacement = {
      id: transactionId,
      categoryId: created.expenses[0].id,
      amountCents: 500,
      title: "Corrected actual",
      date: "2026-07-24",
      createdAt: "2026-07-24T12:00:00.000Z",
      updatedAt: "2026-07-24T12:01:00.000Z",
    };
    expect(
      (
        await applySyncMutations(sql, user.id, [
          {
            mutationId: replacementId,
            planYear: 2026,
            field: `transaction:${transactionId}`,
            value: replacement,
            updatedAt: "2026-07-24T12:01:00.000Z",
          },
        ])
      ).acknowledgements,
    ).toEqual([{ mutationId: replacementId, applied: true }]);
    expect((await getPlanByYear(sql, user.id, 2026))?.transactions).toEqual([
      replacement,
    ]);
  });

  it("replays an inline category and its transaction exactly once", async () => {
    const user = await createUser(
      sql,
      "sync-inline-category@example.com",
      "sync inline category password",
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
    const category = {
      ...created.expenses[0],
      id: "00000000-0000-4000-8000-000000001101",
      name: "Coffee",
      sortOrder: created.expenses.length,
      guidanceBucket: "wants" as const,
      colorToken: "amber" as const,
    };
    const transaction = {
      id: "00000000-0000-4000-8000-000000001102",
      categoryId: category.id,
      amountCents: 525,
      title: "Latte",
      date: "2026-07-24",
      createdAt: "2026-07-24T12:00:00.000Z",
      updatedAt: "2026-07-24T12:00:00.000Z",
    };
    let mutationSequence = 1103;
    const intentTimestamp = "2026-07-24T12:00:00.000Z";
    const mutations = diffPlanMutations(
      created,
      {
        ...created,
        expenses: [...created.expenses, category],
        transactions: [transaction],
      },
      intentTimestamp,
      () =>
        `00000000-0000-4000-8000-${String(mutationSequence++).padStart(12, "0")}`,
    ).map((mutation, index) => ({
      ...mutation,
      updatedAt: new Date(Date.parse(intentTimestamp) + index).toISOString(),
      intentUpdatedAt: intentTimestamp,
    }));

    expect(mutations.map(({ field }) => field)).toEqual([
      `expense:${category.id}`,
      `transaction:${transaction.id}`,
    ]);
    expect(
      (
        await applySyncMutations(sql, user.id, mutations)
      ).acknowledgements.every(({ applied }) => applied),
    ).toBe(true);
    expect(
      (
        await applySyncMutations(sql, user.id, mutations)
      ).acknowledgements.every(({ applied }) => applied),
    ).toBe(true);

    const restored = await getPlanByYear(sql, user.id, 2026);
    expect(restored?.expenses.filter(({ id }) => id === category.id)).toEqual([
      category,
    ]);
    expect(
      restored?.transactions.filter(({ id }) => id === transaction.id),
    ).toEqual([transaction]);
  });

  it("preserves remote transactions across category replacement and rejects referenced deletion", async () => {
    const user = await createUser(
      sql,
      "sync-category-reference@example.com",
      "sync category reference password",
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
    const transaction = {
      id: "00000000-0000-4000-8000-000000001121",
      categoryId: category.id,
      amountCents: 1_250,
      title: "Remote lunch",
      date: "2026-07-24",
      createdAt: "2026-07-24T12:00:00.000Z",
      updatedAt: "2026-07-24T12:00:00.000Z",
    };
    await applySyncMutations(sql, user.id, [
      {
        mutationId: "00000000-0000-4000-8000-000000001122",
        planYear: 2026,
        field: `transaction:${transaction.id}`,
        value: transaction,
        updatedAt: "2026-07-24T12:00:00.000Z",
      },
    ]);

    const replacementId = "00000000-0000-4000-8000-000000001123";
    expect(
      (
        await applySyncMutations(sql, user.id, [
          {
            mutationId: replacementId,
            planYear: 2026,
            field: `expense:${category.id}`,
            value: { ...category, name: "Updated elsewhere" },
            updatedAt: "2026-07-24T12:01:00.000Z",
          },
        ])
      ).acknowledgements,
    ).toEqual([{ mutationId: replacementId, applied: true }]);
    expect(await getPlanByYear(sql, user.id, 2026)).toMatchObject({
      expenses: expect.arrayContaining([
        expect.objectContaining({ id: category.id, name: "Updated elsewhere" }),
      ]),
      transactions: [transaction],
    });

    const deletionId = "00000000-0000-4000-8000-000000001124";
    expect(
      (
        await applySyncMutations(sql, user.id, [
          {
            mutationId: deletionId,
            planYear: 2026,
            field: `expense:${category.id}`,
            value: null,
            updatedAt: "2026-07-24T12:02:00.000Z",
          },
        ])
      ).acknowledgements,
    ).toEqual([{ mutationId: deletionId, applied: false }]);
    expect(await getPlanByYear(sql, user.id, 2026)).toMatchObject({
      expenses: expect.arrayContaining([
        expect.objectContaining({ id: category.id, name: "Updated elsewhere" }),
      ]),
      transactions: [transaction],
    });

    const correctionId = "00000000-0000-4000-8000-000000001125";
    expect(
      (
        await applySyncMutations(sql, user.id, [
          {
            mutationId: correctionId,
            planYear: 2026,
            field: `expense:${category.id}`,
            value: { ...category, name: "Restored locally" },
            updatedAt: "2026-07-24T12:03:00.000Z",
          },
        ])
      ).acknowledgements,
    ).toEqual([{ mutationId: correctionId, applied: true }]);
    expect(await getPlanByYear(sql, user.id, 2026)).toMatchObject({
      expenses: expect.arrayContaining([
        expect.objectContaining({ id: category.id, name: "Restored locally" }),
      ]),
      transactions: [transaction],
    });
  });

  it("rejects only the referenced deletion, not its whole batch", async () => {
    const user = await createUser(
      sql,
      "sync-batch-survives@example.com",
      "sync batch survives password",
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
    const [referenced, unrelated] = created.expenses;
    await applySyncMutations(sql, user.id, [
      {
        mutationId: "00000000-0000-4000-8000-000000001130",
        planYear: 2026,
        field: `transaction:00000000-0000-4000-8000-000000001131`,
        value: {
          id: "00000000-0000-4000-8000-000000001131",
          categoryId: referenced.id,
          amountCents: 2_500,
          title: "Anchors the category",
          date: "2026-07-24",
          createdAt: "2026-07-24T12:00:00.000Z",
          updatedAt: "2026-07-24T12:00:00.000Z",
        },
        updatedAt: "2026-07-24T12:00:00.000Z",
      },
    ]);

    const deletionId = "00000000-0000-4000-8000-000000001132";
    const renameId = "00000000-0000-4000-8000-000000001133";
    expect(
      (
        await applySyncMutations(sql, user.id, [
          {
            mutationId: deletionId,
            planYear: 2026,
            field: `expense:${referenced.id}`,
            value: null,
            updatedAt: "2026-07-24T12:05:00.000Z",
          },
          {
            mutationId: renameId,
            planYear: 2026,
            field: `expense:${unrelated.id}:name`,
            value: "Survived the batch",
            updatedAt: "2026-07-24T12:05:01.000Z",
          },
        ])
      ).acknowledgements,
    ).toEqual([
      { mutationId: deletionId, applied: false },
      { mutationId: renameId, applied: true },
    ]);

    const plan = await getPlanByYear(sql, user.id, 2026);
    expect(plan?.expenses.find(({ id }) => id === unrelated.id)?.name).toBe(
      "Survived the batch",
    );
    expect(plan?.expenses.some(({ id }) => id === referenced.id)).toBe(true);
  });

  it("refuses an entity id that belongs to another account's plan", async () => {
    const owner = await createUser(
      sql,
      "sync-id-owner@example.com",
      "sync id owner password",
    );
    const stranger = await createUser(
      sql,
      "sync-id-stranger@example.com",
      "sync id stranger password",
    );
    const plan = {
      year: 2026,
      stateCode: "TX" as const,
      filingStatus: "single" as const,
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self" as const,
    };
    const owned = await createPlanWithDefaults(sql, owner.id, plan);
    await createPlanWithDefaults(sql, stranger.id, plan);
    const target = owned.expenses[0];

    const attemptId = "00000000-0000-4000-8000-000000001140";
    expect(
      (
        await applySyncMutations(sql, stranger.id, [
          {
            mutationId: attemptId,
            planYear: 2026,
            field: `expense:${target.id}`,
            value: { ...target, name: "Taken over" },
            updatedAt: "2026-07-24T12:06:00.000Z",
          },
        ])
      ).acknowledgements,
    ).toEqual([{ mutationId: attemptId, applied: false }]);

    const ownerPlan = await getPlanByYear(sql, owner.id, 2026);
    expect(ownerPlan?.expenses.find(({ id }) => id === target.id)?.name).toBe(
      target.name,
    );
  });

  it.each([
    [
      "a transaction created after its category was deleted",
      (
        categoryId: string,
        benefitId: string,
        transactionId: string,
        emptyCategoryId: string,
      ) => [
        {
          mutationId: "00000000-0000-4000-8000-000000001201",
          planYear: 2026,
          field: `expense:${emptyCategoryId}` as const,
          value: null,
          updatedAt: "2026-07-24T12:00:00.000Z",
        },
        {
          mutationId: "00000000-0000-4000-8000-000000001202",
          planYear: 2026,
          field: `transaction:00000000-0000-4000-8000-0000000012a0` as const,
          value: {
            id: "00000000-0000-4000-8000-0000000012a0",
            categoryId: emptyCategoryId,
            amountCents: 500,
            title: "Orphan",
            date: "2026-07-24",
            createdAt: "2026-07-24T12:00:01.000Z",
            updatedAt: "2026-07-24T12:00:01.000Z",
          },
          updatedAt: "2026-07-24T12:00:01.000Z",
        },
      ],
    ],
    [
      "a transaction repointed at a category of no plan",
      (
        categoryId: string,
        benefitId: string,
        transactionId: string,
        emptyCategoryId: string,
      ) => [
        {
          mutationId: "00000000-0000-4000-8000-000000001203",
          planYear: 2026,
          field: `transaction:${transactionId}:categoryId` as const,
          value: "00000000-0000-4000-8000-0000000019ff",
          updatedAt: "2026-07-24T12:00:02.000Z",
        },
      ],
    ],
    [
      "a tax treatment set on a benefit that is not custom",
      (
        categoryId: string,
        benefitId: string,
        transactionId: string,
        emptyCategoryId: string,
      ) => [
        {
          mutationId: "00000000-0000-4000-8000-000000001204",
          planYear: 2026,
          field: `benefit:${benefitId}:customTaxTreatment` as const,
          value: {
            reducesFederalTaxable: true,
            reducesFicaTaxable: false,
            reducesStateTaxable: true,
            reducesTakeHome: true,
            countsAsSavings: true,
            employerSide: false,
          },
          updatedAt: "2026-07-24T12:00:03.000Z",
        },
      ],
    ],
    [
      "a timestamp outside the storable range",
      (
        categoryId: string,
        benefitId: string,
        transactionId: string,
        emptyCategoryId: string,
      ) => [
        {
          mutationId: "00000000-0000-4000-8000-000000001205",
          planYear: 2026,
          field: `transaction:${transactionId}:updatedAt` as const,
          value: "0000-01-01T00:00:00.000Z",
          updatedAt: "2026-07-24T12:00:04.000Z",
        },
      ],
    ],
  ])(
    "rejects %s without condemning the batch, and records a receipt",
    async (label, build) => {
      const slug = label.replaceAll(/[^a-z]+/g, "-");
      const user = await createUser(
        sql,
        `sync-isolated-${slug}@example.com`,
        "sync isolated rejection password",
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
      const [category, bystander, emptyCategory] = created.expenses;
      const benefit = created.benefits.find(({ type }) => type !== "custom");
      expect(benefit).toBeDefined();
      const transactionId = "00000000-0000-4000-8000-000000001200";
      await applySyncMutations(sql, user.id, [
        {
          mutationId: "00000000-0000-4000-8000-0000000011ff",
          planYear: 2026,
          field: `transaction:${transactionId}`,
          value: {
            id: transactionId,
            categoryId: category.id,
            amountCents: 1_000,
            title: "Anchor",
            date: "2026-07-24",
            createdAt: "2026-07-24T11:00:00.000Z",
            updatedAt: "2026-07-24T11:00:00.000Z",
          },
          updatedAt: "2026-07-24T11:00:00.000Z",
        },
      ]);

      const offending = build(
        category.id,
        benefit!.id,
        transactionId,
        emptyCategory.id,
      );
      const bystanderId = "00000000-0000-4000-8000-0000000012ff";
      const response = await applySyncMutations(sql, user.id, [
        ...offending,
        {
          mutationId: bystanderId,
          planYear: 2026,
          field: `expense:${bystander.id}:name`,
          value: "Bystander survived",
          updatedAt: "2026-07-24T12:30:00.000Z",
        },
      ]);

      // No acknowledgement may claim the whole plan year was rejected.
      expect(response.acknowledgements.some(({ rejected }) => rejected)).toBe(
        false,
      );
      expect(
        response.acknowledgements.find(
          ({ mutationId }) => mutationId === bystanderId,
        ),
      ).toEqual({ mutationId: bystanderId, applied: true });

      const plan = await getPlanByYear(sql, user.id, 2026);
      expect(plan?.expenses.find(({ id }) => id === bystander.id)?.name).toBe(
        "Bystander survived",
      );

      // A receipt must exist for every mutation, or the client's outbox can
      // never drain and the account wedges.
      const receipts = await sql<{ mutation_id: string }[]>`
        SELECT mutation_id FROM applied_mutations WHERE user_id = ${user.id}
      `;
      const recorded = new Set(receipts.map(({ mutation_id }) => mutation_id));
      for (const { mutationId } of offending) {
        expect(recorded.has(mutationId)).toBe(true);
      }
    },
  );

  it.each([
    ["filing status, owner, wages", [0, 1, 2]],
    ["owner, filing status, wages", [1, 0, 2]],
    ["wages, owner, filing status", [2, 1, 0]],
  ])(
    "applies a married-filing-jointly exit delivered %s",
    async (label, order) => {
      // One save emits both of these with the same timestamp and random ids, so
      // delivery order is a coin flip. The intermediate state after whichever
      // lands first is self-contradictory — a single filer still owning a
      // spouse benefit — and the second must not be refused for that.
      const user = await createUser(
        sql,
        `sync-mfj-exit-${order.join("")}@example.com`,
        "sync mfj exit order password",
      );
      const created = await createPlanWithDefaults(sql, user.id, {
        year: 2026,
        stateCode: "TX",
        filingStatus: "mfj",
        grossSalaryCents: 10_000_000,
        additionalWageIncomeCents: 0,
        spouseWageIncomeCents: 4_000_000,
        otherOrdinaryIncomeCents: 0,
        hsaCoverage: "self",
      });
      const spouseBenefit = created.benefits[0];
      await applySyncMutations(sql, user.id, [
        {
          mutationId: "00000000-0000-4000-8000-0000000014a0",
          planYear: 2026,
          field: `benefit:${spouseBenefit.id}:owner`,
          value: "spouse",
          updatedAt: "2026-07-24T11:00:00.000Z",
        },
      ]);

      const exit = [
        {
          mutationId: "00000000-0000-4000-8000-0000000014b0",
          planYear: 2026,
          field: "filingStatus" as const,
          value: "single" as const,
          updatedAt: "2026-07-24T12:00:00.000Z",
        },
        {
          mutationId: "00000000-0000-4000-8000-0000000014b1",
          planYear: 2026,
          field: `benefit:${spouseBenefit.id}:owner` as const,
          value: "primary" as const,
          updatedAt: "2026-07-24T12:00:00.000Z",
        },
        {
          mutationId: "00000000-0000-4000-8000-0000000014b2",
          planYear: 2026,
          field: "spouseWageIncomeCents" as const,
          value: 0,
          updatedAt: "2026-07-24T12:00:00.000Z",
        },
      ];
      const response = await applySyncMutations(
        sql,
        user.id,
        order.map((index) => exit[index]),
      );

      expect(response.acknowledgements.some(({ rejected }) => rejected)).toBe(
        false,
      );
      expect(response.acknowledgements.every(({ applied }) => applied)).toBe(
        true,
      );

      const plan = await getPlanByYear(sql, user.id, 2026);
      expect(plan?.filingStatus).toBe("single");
      expect(plan?.spouseWageIncomeCents).toBe(0);
      expect(
        plan?.benefits.find(({ id }) => id === spouseBenefit.id)?.owner,
      ).toBe("primary");

      // Every mutation must leave a receipt, or the outbox cannot drain.
      const receipts = await sql<{ mutation_id: string }[]>`
        SELECT mutation_id FROM applied_mutations WHERE user_id = ${user.id}
      `;
      const recorded = new Set(receipts.map(({ mutation_id }) => mutation_id));
      for (const { mutationId } of exit) {
        expect(recorded.has(mutationId)).toBe(true);
      }
    },
  );

  it("refuses a stale edit alone rather than condemning its plan year", async () => {
    // Two devices: one leaves married-filing-jointly, the other has an older
    // spouse-owner edit still queued. The stale edit cannot be applied — a
    // single filer cannot own a spouse benefit — but refusing the whole year
    // would leave it in the outbox forever, taking every later edit with it.
    const user = await createUser(
      sql,
      "sync-stale-owner@example.com",
      "sync stale owner password",
    );
    const created = await createPlanWithDefaults(sql, user.id, {
      year: 2026,
      stateCode: "TX",
      filingStatus: "mfj",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 4_000_000,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const benefit = created.benefits[0];
    const expense = created.expenses[0];

    await applySyncMutations(sql, user.id, [
      {
        mutationId: "00000000-0000-4000-8000-0000000015a0",
        planYear: 2026,
        field: "filingStatus",
        value: "single",
        updatedAt: "2026-07-24T12:00:00.000Z",
      },
      {
        mutationId: "00000000-0000-4000-8000-0000000015a1",
        planYear: 2026,
        field: "spouseWageIncomeCents",
        value: 0,
        updatedAt: "2026-07-24T12:00:00.000Z",
      },
    ]);

    const staleId = "00000000-0000-4000-8000-0000000015a2";
    const staleResponse = await applySyncMutations(sql, user.id, [
      {
        mutationId: staleId,
        planYear: 2026,
        field: `benefit:${benefit.id}:owner`,
        value: "spouse",
        updatedAt: "2026-07-24T13:00:00.000Z",
      },
    ]);
    expect(staleResponse.acknowledgements).toEqual([
      { mutationId: staleId, applied: false },
    ]);
    expect(
      (
        await sql`
        SELECT mutation_id FROM applied_mutations
        WHERE user_id = ${user.id} AND mutation_id = ${staleId}
      `
      ).length,
    ).toBe(1);

    // The plan year must still accept ordinary work afterwards.
    const laterId = "00000000-0000-4000-8000-0000000015a3";
    expect(
      (
        await applySyncMutations(sql, user.id, [
          {
            mutationId: laterId,
            planYear: 2026,
            field: `expense:${expense.id}:name`,
            value: "Still editable",
            updatedAt: "2026-07-24T14:00:00.000Z",
          },
        ])
      ).acknowledgements,
    ).toEqual([{ mutationId: laterId, applied: true }]);

    const plan = await getPlanByYear(sql, user.id, 2026);
    expect(plan?.filingStatus).toBe("single");
    expect(plan?.benefits.find(({ id }) => id === benefit.id)?.owner).toBe(
      "primary",
    );
    expect(plan?.expenses.find(({ id }) => id === expense.id)?.name).toBe(
      "Still editable",
    );
  });

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

    // Reusing an id for different content is a client fault. It must not be
    // applied, but it also must not abort the batch: throwing here returned a
    // 500, wrote no receipts, and left every innocent mutation travelling with
    // it retrying forever against a request that could only ever fail.
    const reused = { ...later, value: 13_000_000 };
    const bystanderId = "00000000-0000-4000-8000-000000000024";
    const response = await applySyncMutations(sql, user.id, [
      reused,
      {
        mutationId: bystanderId,
        planYear: 2034,
        field: "additionalWageIncomeCents" as const,
        value: 500_000,
        updatedAt: "2034-07-24T12:00:00.000Z",
      },
    ]);
    expect(response.acknowledgements).toEqual(
      expect.arrayContaining([
        { mutationId: reused.mutationId, applied: false },
        { mutationId: bystanderId, applied: true },
      ]),
    );
    expect(response.acknowledgements).toHaveLength(2);

    const merged = await getPlanByYear(sql, user.id, 2034);
    expect(merged?.grossSalaryCents).toBe(12_000_000);
    expect(merged?.additionalWageIncomeCents).toBe(500_000);

    const receipts = await sql<{ mutation_id: string }[]>`
      SELECT mutation_id FROM applied_mutations
      WHERE user_id = ${user.id} AND mutation_id = ${bystanderId}
    `;
    expect(receipts).toHaveLength(1);
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

  it("creates, edits, recategorizes, archives, and deletes actual transactions", async () => {
    const user = await createUser(
      sql,
      "sync-daily-transactions@example.com",
      "sync daily transactions password",
    );
    const created = await createPlanWithDefaults(sql, user.id, {
      year: 2025,
      stateCode: "TX",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const [firstCategory, secondCategory] = created.expenses;
    const transactionId = "00000000-0000-4000-8000-000000001000";
    const actual = {
      id: transactionId,
      categoryId: firstCategory.id,
      amountCents: 12_345,
      title: "Neighborhood market",
      note: "Weekly groceries",
      date: "2025-07-23",
      createdAt: "2026-07-23T12:00:00.000Z",
      updatedAt: "2026-07-23T12:00:00.000Z",
    };
    const createMutation = {
      mutationId: "00000000-0000-4000-8000-000000001001",
      planYear: 2025,
      field: `transaction:${transactionId}`,
      value: actual,
      updatedAt: "2026-07-23T12:00:00.000Z",
    };
    const createResult = await applySyncMutations(sql, user.id, [
      createMutation,
    ]);
    expect(createResult.acknowledgements[0].applied).toBe(true);
    expect((await getPlanByYear(sql, user.id, 2025))?.transactions).toEqual([
      actual,
    ]);
    expect(
      (await applySyncMutations(sql, user.id, [createMutation]))
        .acknowledgements[0].applied,
    ).toBe(true);
    expect(
      (await getPlanByYear(sql, user.id, 2025))?.transactions,
    ).toHaveLength(1);

    const editResult = await applySyncMutations(sql, user.id, [
      {
        mutationId: "00000000-0000-4000-8000-000000001002",
        planYear: 2025,
        field: `expense:${firstCategory.id}:name`,
        value: "Archived groceries",
        updatedAt: "2026-07-23T12:01:00.000Z",
      },
      {
        mutationId: "00000000-0000-4000-8000-000000001003",
        planYear: 2025,
        field: `expense:${firstCategory.id}:archived`,
        value: true,
        updatedAt: "2026-07-23T12:01:01.000Z",
      },
      {
        mutationId: "00000000-0000-4000-8000-000000001004",
        planYear: 2025,
        field: `transaction:${transactionId}:categoryId`,
        value: secondCategory.id,
        updatedAt: "2026-07-23T12:01:02.000Z",
      },
      {
        mutationId: "00000000-0000-4000-8000-000000001005",
        planYear: 2025,
        field: `transaction:${transactionId}:amountCents`,
        value: 22_222,
        updatedAt: "2026-07-23T12:01:03.000Z",
      },
      {
        mutationId: "00000000-0000-4000-8000-000000001006",
        planYear: 2025,
        field: `transaction:${transactionId}:updatedAt`,
        value: "2026-07-23T12:01:03.000Z",
        updatedAt: "2026-07-23T12:01:04.000Z",
      },
    ]);
    expect(editResult.acknowledgements.every(({ applied }) => applied)).toBe(
      true,
    );
    const edited = await getPlanByYear(sql, user.id, 2025);
    expect(
      edited?.expenses.find(({ id }) => id === firstCategory.id),
    ).toMatchObject({ name: "Archived groceries", archived: true });
    expect(edited?.transactions?.[0]).toMatchObject({
      categoryId: secondCategory.id,
      amountCents: 22_222,
    });

    const copied = await copyPlanToYear(
      sql,
      user.id,
      2025,
      2026,
      edited!.updatedAt,
      edited!.fieldVersions,
    );
    expect(copied.transactions).toEqual([]);
    expect(
      copied.expenses.find(({ name }) => name === "Archived groceries"),
    ).toMatchObject({
      colorToken: firstCategory.colorToken,
      archived: true,
    });

    const deletion = await applySyncMutations(sql, user.id, [
      {
        mutationId: "00000000-0000-4000-8000-000000001007",
        planYear: 2025,
        field: `transaction:${transactionId}`,
        value: null,
        updatedAt: "2026-07-23T12:02:00.000Z",
      },
    ]);
    expect(deletion.acknowledgements[0].applied).toBe(true);
    expect((await getPlanByYear(sql, user.id, 2025))?.transactions).toEqual([]);
  });
});

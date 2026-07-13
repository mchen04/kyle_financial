import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { syncFieldForTarget, type SyncMutation } from "@/domain/sync";
import {
  resetOfflineTestState,
  seedRawQueuedMutations,
} from "@/test/fixtures/offline";
import { storedPlan as plan } from "@/test/fixtures/plans";
import {
  cachePlansAndEnqueue,
  cachePlansIfOutboxEmpty,
  cachedPlans,
  compactedMutationBatch,
  enqueueMutations,
  queuedMutations,
  removeMutations,
} from "./database";

afterEach(async () => {
  await resetOfflineTestState();
});

describe("offline intent ordering", () => {
  it("clamps legacy discounts without losing order or replaying dependent receipts", async () => {
    const propertyMutation = {
      mutationId: "00000000-0000-4000-8000-000000000001",
      planYear: 2026,
      field: "benefit:00000000-0000-4000-8000-000000000011:discountRatePpm",
      value: 250_000,
      updatedAt: "2026-07-12T00:00:00.000Z",
    };
    const wholeMutation = {
      mutationId: "00000000-0000-4000-8000-000000000002",
      planYear: 2026,
      field: "benefit:00000000-0000-4000-8000-000000000012",
      value: {
        id: "00000000-0000-4000-8000-000000000012",
        type: "espp",
        label: "Legacy ESPP",
        amount: { kind: "percent", ratePpm: 10_000 },
        discountRatePpm: 200_000,
      },
      updatedAt: "2026-07-12T00:00:01.000Z",
    };
    const followupMutation = {
      mutationId: "00000000-0000-4000-8000-000000000003",
      planYear: 2026,
      field: "benefit:00000000-0000-4000-8000-000000000012:label" as const,
      value: "Employee stock plan",
      updatedAt: "2026-07-12T00:00:02.000Z",
      deliveryUpdatedAt: "2026-07-12T00:00:02.000Z",
      deliveryAfterMutationId: wholeMutation.mutationId,
      deliveryOrderAssigned: true,
    };
    await seedRawQueuedMutations("user-a", [
      propertyMutation,
      wholeMutation,
      followupMutation,
    ]);

    const migrated = await queuedMutations("user-a");
    expect(migrated).toEqual([
      expect.objectContaining({
        mutationId: expect.not.stringMatching(propertyMutation.mutationId),
        planYear: propertyMutation.planYear,
        field: propertyMutation.field,
        value: 150_000,
      }),
      expect.objectContaining({
        mutationId: expect.not.stringMatching(wholeMutation.mutationId),
        planYear: wholeMutation.planYear,
        field: wholeMutation.field,
        value: { ...wholeMutation.value, discountRatePpm: 150_000 },
      }),
      expect.objectContaining({
        mutationId: expect.not.stringMatching(followupMutation.mutationId),
        field: followupMutation.field,
        value: followupMutation.value,
      }),
    ]);
    expect(migrated[0].mutationId).not.toBe(propertyMutation.mutationId);
    expect(migrated[1].mutationId).not.toBe(wholeMutation.mutationId);
    expect(migrated[2].mutationId).not.toBe(followupMutation.mutationId);
    expect(migrated[0].updatedAt).not.toBe(propertyMutation.updatedAt);
    expect(migrated[1].updatedAt).not.toBe(wholeMutation.updatedAt);
    expect(migrated[2].updatedAt).not.toBe(followupMutation.updatedAt);
    const batch = await compactedMutationBatch("user-a");
    expect(batch[2].deliveryAfterMutationId).toBe(migrated[1].mutationId);
  });

  it("places legacy rows before sequenced rows when repairing mixed metadata", async () => {
    const benefitId = "00000000-0000-4000-8000-000000000021";
    const whole = {
      mutationId: "00000000-0000-4000-8000-000000000022",
      planYear: 2026,
      field: `benefit:${benefitId}` as const,
      value: {
        id: benefitId,
        type: "espp",
        label: "Legacy ESPP",
        amount: { kind: "percent", ratePpm: 10_000 },
        discountRatePpm: 200_000,
      },
      updatedAt: "2026-07-12T00:00:00.000Z",
    };
    const property = {
      mutationId: "00000000-0000-4000-8000-000000000023",
      planYear: 2026,
      field: `benefit:${benefitId}:label` as const,
      value: "Later label",
      updatedAt: "2026-07-12T00:00:01.000Z",
      localSequence: 1,
    };
    await seedRawQueuedMutations("user-a", [whole, property]);

    const migrated = await queuedMutations("user-a");
    expect(migrated.map(({ field }) => field)).toEqual([
      whole.field,
      property.field,
    ]);
    expect(migrated[0].mutationId).not.toBe(whole.mutationId);
    expect(migrated[1].mutationId).not.toBe(property.mutationId);
    expect(
      (await compactedMutationBatch("user-a")).map(({ field }) => field),
    ).toEqual([whole.field, property.field]);
  });

  it("rotates dependencies only for the latest whole mutation in the same plan", async () => {
    const sharedId = "00000000-0000-4000-8000-000000000031";
    const supersededId = "00000000-0000-4000-8000-000000000032";
    const version = {
      updatedAt: "2026-07-11T00:00:00.000Z",
      mutationId: "00000000-0000-4000-8000-000000000039",
    };
    const benefit = (id: string, label: string, discountRatePpm: number) => ({
      id,
      type: "espp",
      label,
      amount: { kind: "percent", ratePpm: 10_000 },
      discountRatePpm,
    });
    const rows = [
      {
        mutationId: "00000000-0000-4000-8000-000000000033",
        planYear: 2026,
        field: `benefit:${sharedId}`,
        value: benefit(sharedId, "2026 legacy", 200_000),
        updatedAt: "2026-07-12T00:00:00.000Z",
        localSequence: 1,
      },
      {
        mutationId: "00000000-0000-4000-8000-000000000034",
        planYear: 2027,
        field: `benefit:${sharedId}:label`,
        value: "Independent 2027 label",
        updatedAt: "2026-07-12T00:00:01.000Z",
        localSequence: 2,
        baseVersion: version,
      },
      {
        mutationId: "00000000-0000-4000-8000-000000000035",
        planYear: 2026,
        field: `benefit:${supersededId}`,
        value: benefit(supersededId, "Superseded", 200_000),
        updatedAt: "2026-07-12T00:00:02.000Z",
        localSequence: 3,
      },
      {
        mutationId: "00000000-0000-4000-8000-000000000036",
        planYear: 2026,
        field: `benefit:${supersededId}`,
        value: benefit(supersededId, "Replacement", 100_000),
        updatedAt: "2026-07-12T00:00:03.000Z",
        localSequence: 4,
      },
      {
        mutationId: "00000000-0000-4000-8000-000000000037",
        planYear: 2026,
        field: `benefit:${supersededId}:label`,
        value: "Later local label",
        updatedAt: "2026-07-12T00:00:04.000Z",
        localSequence: 5,
        baseVersion: version,
      },
    ];
    await seedRawQueuedMutations("user-a", rows);

    const migrated = await queuedMutations("user-a");
    expect(migrated[1]).toMatchObject({
      mutationId: rows[1].mutationId,
      baseVersion: version,
    });
    expect(migrated[4]).toMatchObject({
      mutationId: rows[4].mutationId,
      baseVersion: version,
    });
  });

  it("reads queued intent by local sequence instead of UUID key order", async () => {
    const first = {
      mutationId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      planYear: 2026,
      field: "grossSalaryCents" as const,
      value: 20_000_000,
      updatedAt: "2026-07-12T00:00:00.000Z",
    };
    const second = {
      ...first,
      mutationId: "00000000-0000-4000-8000-000000000001",
      value: 30_000_000,
      updatedAt: "2026-07-12T00:00:01.000Z",
    };

    await enqueueMutations("user-a", [first, second]);

    expect(await queuedMutations("user-a")).toEqual([first, second]);
  });

  it("collapses mutation ID casing aliases before IndexedDB admission", async () => {
    const uppercaseId = "F09AF018-F6C2-4EB1-9380-123173BD9802";
    const mutation = {
      mutationId: uppercaseId,
      planYear: 2026,
      field: "grossSalaryCents" as const,
      value: 20_000_000,
      updatedAt: "2026-07-12T00:00:00.000Z",
    };

    await enqueueMutations("user-a", [mutation]);
    await enqueueMutations("user-a", [
      { ...mutation, mutationId: uppercaseId.toLowerCase() },
    ]);

    expect(await queuedMutations("user-a")).toEqual([
      { ...mutation, mutationId: uppercaseId.toLowerCase() },
    ]);
  });

  it("uses decoded value identity when admitting duplicate mutations", async () => {
    const mutationId = "f09af018-f6c2-4eb1-9380-123173bd9810";
    const expenseId = "a09af018-f6c2-4eb1-9380-123173bd9811";
    const envelope = {
      mutationId,
      planYear: 2026,
      field: syncFieldForTarget({ kind: "expense", id: expenseId }),
      updatedAt: "2026-07-12T00:00:00.000Z",
    };
    const value = {
      id: expenseId,
      name: "Insurance",
      group: "Needs",
      cadence: "monthly",
      amountCents: 50_000,
      sortOrder: 20,
    };

    await enqueueMutations("user-a", [
      {
        ...envelope,
        mutationId: mutationId.toUpperCase(),
        value: {
          ...value,
          id: expenseId.toUpperCase(),
          name: " Insurance ",
        },
      },
    ]);
    await enqueueMutations("user-a", [{ ...envelope, value }]);

    expect(await queuedMutations("user-a")).toHaveLength(1);
  });

  it("repairs persisted mutation ID casing aliases", async () => {
    const uppercaseId = "F09AF018-F6C2-4EB1-9380-123173BD9802";
    const mutation = {
      mutationId: uppercaseId,
      planYear: 2026,
      field: "grossSalaryCents",
      value: 20_000_000,
      updatedAt: "2026-07-12T00:00:00.000Z",
      baseVersion: {
        updatedAt: "2026-07-11T00:00:00.000Z",
        mutationId: "legacy-non-uuid-version",
      },
    };
    await seedRawQueuedMutations("user-a", [
      { ...mutation, localSequence: 1 },
      {
        ...mutation,
        mutationId: uppercaseId.toLowerCase(),
        localSequence: 2,
      },
    ]);

    expect(await queuedMutations("user-a")).toEqual([
      {
        ...mutation,
        mutationId: uppercaseId.toLowerCase(),
        baseVersion: null,
      },
    ]);
    expect(await queuedMutations("user-a")).toHaveLength(1);
  });

  it("merges cross-tab field edits into the cached plan", async () => {
    await cachePlansIfOutboxEmpty("user-a", [plan()]);
    const stateMutation = {
      mutationId: "00000000-0000-4000-8000-000000000091",
      planYear: 2026,
      field: "stateCode" as const,
      value: "TX",
      updatedAt: "2026-07-12T01:00:00.000Z",
    };
    await cachePlansAndEnqueue(
      "user-a",
      [{ ...plan(), stateCode: "TX" }],
      [stateMutation],
    );
    await cachePlansAndEnqueue(
      "user-a",
      [{ ...plan(), grossSalaryCents: 12_000_000 }],
      [
        {
          ...stateMutation,
          mutationId: "00000000-0000-4000-8000-000000000092",
          field: "grossSalaryCents",
          value: 12_000_000,
        },
      ],
    );
    expect((await cachedPlans("user-a"))[0]).toMatchObject({
      stateCode: "TX",
      grossSalaryCents: 12_000_000,
    });
  });

  it("uses local admission order while retaining the original timestamp at rest", async () => {
    await cachePlansIfOutboxEmpty("user-a", [plan()]);
    const newer = {
      mutationId: "00000000-0000-4000-8000-000000000093",
      planYear: 2026,
      field: "grossSalaryCents" as const,
      value: 30_000_000,
      updatedAt: "2026-07-12T00:00:02.000Z",
    };
    const older = {
      ...newer,
      mutationId: "00000000-0000-4000-8000-000000000094",
      value: 20_000_000,
      updatedAt: "2026-07-12T00:00:01.000Z",
    };
    await cachePlansAndEnqueue(
      "user-a",
      [{ ...plan(), grossSalaryCents: newer.value }],
      [newer],
    );
    await cachePlansAndEnqueue(
      "user-a",
      [{ ...plan(), grossSalaryCents: older.value }],
      [older],
    );
    expect((await cachedPlans("user-a"))[0].grossSalaryCents).toBe(older.value);
    expect(await queuedMutations("user-a")).toEqual([newer, older]);
    expect(await compactedMutationBatch("user-a")).toEqual([
      {
        ...older,
        updatedAt: "2026-07-12T00:00:02.001Z",
        intentUpdatedAt: older.updatedAt,
      },
    ]);
    expect(await queuedMutations("user-a")).toEqual([older]);
  });

  it("preserves local intent order when the device clock moves backward", async () => {
    await cachePlansIfOutboxEmpty("user-a", [plan()]);
    const skewed = {
      mutationId: "00000000-0000-4000-8000-000000000097",
      planYear: 2026,
      field: "grossSalaryCents" as const,
      value: 20_000_000,
      updatedAt: "2099-01-01T00:00:00.000Z",
    };
    const laterIntent = {
      ...skewed,
      mutationId: "00000000-0000-4000-8000-000000000098",
      value: 30_000_000,
      updatedAt: "2026-07-12T00:00:01.000Z",
    };

    await cachePlansAndEnqueue(
      "user-a",
      [{ ...plan(), grossSalaryCents: skewed.value }],
      [skewed],
    );
    await cachePlansAndEnqueue(
      "user-a",
      [{ ...plan(), grossSalaryCents: laterIntent.value }],
      [laterIntent],
    );

    expect((await cachedPlans("user-a"))[0].grossSalaryCents).toBe(
      laterIntent.value,
    );
    expect(await queuedMutations("user-a")).toEqual([skewed, laterIntent]);
    expect(await compactedMutationBatch("user-a")).toEqual([
      {
        ...laterIntent,
        updatedAt: "2099-01-01T00:00:00.001Z",
        intentUpdatedAt: laterIntent.updatedAt,
      },
    ]);
    expect(await queuedMutations("user-a")).toEqual([laterIntent]);
  });

  it("delivers a later entity property after its whole-item intent when the clock rolls back", async () => {
    const benefitId = "00000000-0000-4000-8000-000000000099";
    const whole = {
      mutationId: "00000000-0000-4000-8000-000000000100",
      planYear: 2026,
      field: syncFieldForTarget({ kind: "benefit", id: benefitId }),
      value: {
        id: benefitId,
        type: "traditional401k" as const,
        label: "Original label",
        amount: { kind: "percent" as const, ratePpm: 10_000 },
      },
      updatedAt: "2099-01-01T00:00:00.000Z",
      baseVersion: null,
    };
    const property = {
      mutationId: "00000000-0000-4000-8000-000000000101",
      planYear: 2026,
      field: syncFieldForTarget({
        kind: "benefit",
        id: benefitId,
        property: "label",
      }),
      value: "Later label",
      updatedAt: "2026-07-12T00:00:01.000Z",
      baseVersion: null,
    };

    await enqueueMutations("user-a", [whole]);
    await enqueueMutations("user-a", [property]);

    const batch = await compactedMutationBatch("user-a");
    expect(batch.map(({ field }) => field)).toEqual([
      whole.field,
      property.field,
    ]);
    expect(batch[1].deliveryAfterMutationId).toBe(whole.mutationId);
    expect(Date.parse(batch[1].updatedAt)).toBeGreaterThan(
      Date.parse(batch[0].updatedAt),
    );
    await removeMutations("user-a", [whole.mutationId]);
    expect(await compactedMutationBatch("user-a")).toEqual([batch[1]]);
  });

  it("drops invalid benefit and expense properties superseded by a later deletion", async () => {
    const cases = [
      {
        propertyField: (id: string) =>
          syncFieldForTarget({ kind: "benefit", id, property: "label" }),
        entityField: (id: string) =>
          syncFieldForTarget({ kind: "benefit", id }),
      },
      {
        propertyField: (id: string) =>
          syncFieldForTarget({ kind: "expense", id, property: "name" }),
        entityField: (id: string) =>
          syncFieldForTarget({ kind: "expense", id }),
      },
    ] as const;

    for (const [index, { entityField, propertyField }] of cases.entries()) {
      const entityId = `00000000-0000-4000-8000-${String(200 + index).padStart(12, "0")}`;
      const invalid: SyncMutation = {
        mutationId: `00000000-0000-4000-8000-${String(210 + index).padStart(12, "0")}`,
        planYear: 2026,
        field: propertyField(entityId),
        value: "",
        updatedAt: "2026-07-12T00:00:00.000Z",
      };
      const deletion: SyncMutation = {
        mutationId: `00000000-0000-4000-8000-${String(220 + index).padStart(12, "0")}`,
        planYear: 2026,
        field: entityField(entityId),
        value: null,
        updatedAt: "2026-07-12T00:00:00.001Z",
      };

      await enqueueMutations("user-a", [invalid, deletion]);
      expect(await compactedMutationBatch("user-a")).toEqual([deletion]);
      expect(await queuedMutations("user-a")).toEqual([deletion]);
      await removeMutations("user-a", [deletion.mutationId]);
      expect(await queuedMutations("user-a")).toEqual([]);
    }
  });

  it("drops invalid properties before replacements but retains later benefit and expense properties", async () => {
    const cases = [
      {
        propertyField: (id: string) =>
          syncFieldForTarget({ kind: "benefit", id, property: "label" }),
        entityField: (id: string) =>
          syncFieldForTarget({ kind: "benefit", id }),
        wholeValue: (id: string) => ({
          id,
          owner: "primary",
          type: "traditional401k",
          label: "Replacement benefit",
          amount: { kind: "percent", ratePpm: 0 },
        }),
        laterValue: "Final benefit",
      },
      {
        propertyField: (id: string) =>
          syncFieldForTarget({ kind: "expense", id, property: "name" }),
        entityField: (id: string) =>
          syncFieldForTarget({ kind: "expense", id }),
        wholeValue: (id: string) => ({
          id,
          name: "Replacement expense",
          group: "Needs",
          cadence: "monthly",
          amountCents: 0,
          sortOrder: 0,
          guidanceBucket: "needs",
        }),
        laterValue: "Final expense",
      },
    ] as const;

    for (const [index, testCase] of cases.entries()) {
      const entityId = `00000000-0000-4000-8000-${String(230 + index).padStart(12, "0")}`;
      const invalid: SyncMutation = {
        mutationId: `00000000-0000-4000-8000-${String(240 + index).padStart(12, "0")}`,
        planYear: 2026,
        field: testCase.propertyField(entityId),
        value: "",
        updatedAt: "2099-01-01T00:00:00.000Z",
      };
      const replacement: SyncMutation = {
        mutationId: `00000000-0000-4000-8000-${String(250 + index).padStart(12, "0")}`,
        planYear: 2026,
        field: testCase.entityField(entityId),
        value: testCase.wholeValue(entityId),
        updatedAt: "2026-07-12T00:00:00.001Z",
      };
      const laterProperty: SyncMutation = {
        mutationId: `00000000-0000-4000-8000-${String(260 + index).padStart(12, "0")}`,
        planYear: 2026,
        field: testCase.propertyField(entityId),
        value: testCase.laterValue,
        updatedAt: "2026-07-12T00:00:00.002Z",
      };

      await enqueueMutations("user-a", [invalid, replacement, laterProperty]);
      const batch = await compactedMutationBatch("user-a");
      expect(batch.map(({ mutationId }) => mutationId)).toEqual([
        replacement.mutationId,
        laterProperty.mutationId,
      ]);
      expect(batch[0].deliveryAfterMutationId).toBeUndefined();
      expect(batch[1].deliveryAfterMutationId).toBe(replacement.mutationId);
      expect(
        (await queuedMutations("user-a")).map(({ mutationId }) => mutationId),
      ).toEqual([replacement.mutationId, laterProperty.mutationId]);
      await removeMutations("user-a", [
        replacement.mutationId,
        laterProperty.mutationId,
      ]);
    }
  });

  it("scopes queued field versions by plan year", async () => {
    await cachePlansIfOutboxEmpty("user-a", [plan(2025), plan(2026)]);
    const template = {
      mutationId: "00000000-0000-4000-8000-000000000095",
      planYear: 2026,
      field: "grossSalaryCents" as const,
      value: 26_000_000,
      updatedAt: "2026-07-12T00:00:02.000Z",
    };
    await cachePlansAndEnqueue(
      "user-a",
      [{ ...plan(2026), grossSalaryCents: 26_000_000 }],
      [template],
    );
    await cachePlansAndEnqueue(
      "user-a",
      [{ ...plan(2025), grossSalaryCents: 25_000_000 }],
      [
        {
          ...template,
          mutationId: "00000000-0000-4000-8000-000000000096",
          planYear: 2025,
          value: 25_000_000,
          updatedAt: "2026-07-12T00:00:01.000Z",
        },
      ],
    );
    expect(
      (await cachedPlans("user-a")).map(({ year, grossSalaryCents }) => [
        year,
        grossSalaryCents,
      ]),
    ).toEqual([
      [2025, 25_000_000],
      [2026, 26_000_000],
    ]);
  });
});

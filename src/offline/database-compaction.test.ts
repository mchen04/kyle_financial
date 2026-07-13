import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { syncFieldForTarget, type SyncMutation } from "@/domain/sync";
import { resetOfflineTestState } from "@/test/fixtures/offline";
import { storedPlan as plan } from "@/test/fixtures/plans";
import {
  cachePlansAndEnqueue,
  cachePlansIfOutboxEmpty,
  cachedPlans,
  compactedMutationBatch,
  enqueueMutations,
  queuedMutations,
  removeMutations,
  startupPlanState,
} from "./database";

afterEach(async () => {
  await resetOfflineTestState();
});

describe("offline mutation compaction", () => {
  it("reads startup cache and queued intent from one account snapshot", async () => {
    const mutation = {
      mutationId: "00000000-0000-4000-8000-000000000005",
      planYear: 2026,
      field: "grossSalaryCents" as const,
      value: 20_000_000,
      updatedAt: "2026-07-12T01:00:00.000Z",
    };
    await cachePlansIfOutboxEmpty("user-a", [plan()]);
    await cachePlansAndEnqueue(
      "user-a",
      [{ ...plan(), grossSalaryCents: mutation.value }],
      [mutation],
    );

    const startup = await startupPlanState("user-a", [
      { ...plan(), stateCode: "TX", updatedAt: "2026-07-12T02:00:00.000Z" },
    ]);

    expect(startup.pendingMutations).toEqual([mutation]);
    expect(startup.cachedPlans[0]).toMatchObject({
      stateCode: "CA",
      grossSalaryCents: mutation.value,
    });
  });

  it("compacts transient field edits and rejects an unresolved empty name", async () => {
    const base = {
      mutationId: "00000000-0000-4000-8000-000000000040",
      planYear: 2026,
      field: syncFieldForTarget({
        kind: "expense",
        id: "f09af018-f6c2-4eb1-9380-123173bd9802",
        property: "name",
      }),
      value: "",
      updatedAt: "2026-07-12T01:00:00.000Z",
    };
    await enqueueMutations("user-a", [base]);
    expect(await compactedMutationBatch("user-a")).toEqual([]);
    const corrected = {
      ...base,
      mutationId: "00000000-0000-4000-8000-000000000041",
      value: "Rent",
      updatedAt: "2026-07-12T01:00:00.001Z",
    };
    await enqueueMutations("user-a", [corrected]);
    expect(await compactedMutationBatch("user-a")).toEqual([corrected]);
    expect(await queuedMutations("user-a")).toEqual([corrected]);
  });

  it("drains a full valid batch even when a later mutation is invalid", async () => {
    const mutations = Array.from({ length: 501 }, (_, index) => ({
      mutationId: `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
      planYear: 2026,
      field: syncFieldForTarget({
        kind: "expense",
        id:
          index === 500
            ? "f09af018-f6c2-4eb1-9380-123173bd9802"
            : `00000000-0000-4000-8000-${String(index + 5_000).padStart(12, "0")}`,
        property: index === 500 ? "name" : "amountCents",
      }),
      value: index === 500 ? "" : 10_000_000 + index,
      updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, index)).toISOString(),
    }));
    await enqueueMutations("user-a", mutations);
    expect(await compactedMutationBatch("user-a")).toHaveLength(500);
  });

  it("keeps dependent plan-invariant transitions in the same bounded batch", async () => {
    const expenses: SyncMutation[] = Array.from({ length: 499 }, (_, index) => {
      const entityId = `00000000-0000-4000-8000-${String(index + 1_000).padStart(12, "0")}`;
      return {
        mutationId: `00000000-0000-4000-8000-${String(index + 2_000).padStart(12, "0")}`,
        planYear: 2026,
        field: syncFieldForTarget({
          kind: "expense",
          id: entityId,
          property: "sortOrder",
        }),
        value: index,
        updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, index)).toISOString(),
      };
    });
    const filingStatus: SyncMutation = {
      mutationId: "00000000-0000-4000-8000-000000003000",
      planYear: 2026,
      field: "filingStatus",
      value: "single",
      updatedAt: "2026-01-01T00:00:00.499Z",
    };
    const spouseWages: SyncMutation = {
      mutationId: "00000000-0000-4000-8000-000000003001",
      planYear: 2026,
      field: "spouseWageIncomeCents",
      value: 0,
      updatedAt: "2026-01-01T00:00:00.500Z",
    };
    const spouseBenefitOwner: SyncMutation = {
      mutationId: "00000000-0000-4000-8000-000000003002",
      planYear: 2026,
      field: syncFieldForTarget({
        kind: "benefit",
        id: "00000000-0000-4000-8000-000000003003",
        property: "owner",
      }),
      value: "primary",
      updatedAt: "2026-01-01T00:00:00.501Z",
    };
    await enqueueMutations("user-a", [
      ...expenses,
      filingStatus,
      spouseWages,
      spouseBenefitOwner,
    ]);

    const first = await compactedMutationBatch("user-a");
    expect(first).toHaveLength(500);
    expect(first).toEqual(
      expect.arrayContaining([filingStatus, spouseWages, spouseBenefitOwner]),
    );
    await removeMutations(
      "user-a",
      first.map(({ mutationId }) => mutationId),
    );
    expect(await compactedMutationBatch("user-a")).toHaveLength(2);
  });

  it("does not turn unrelated benefit edits into an oversized invariant group", async () => {
    const benefits: SyncMutation[] = Array.from({ length: 499 }, (_, index) => {
      const entityId = `00000000-0000-4000-8000-${String(index + 4_000).padStart(12, "0")}`;
      return {
        mutationId: `00000000-0000-4000-8000-${String(index + 5_000).padStart(12, "0")}`,
        planYear: 2027,
        field: syncFieldForTarget({
          kind: "benefit",
          id: entityId,
          property: "label",
        }),
        value: `Benefit ${index}`,
        updatedAt: new Date(Date.UTC(2026, 0, 2, 0, 0, 0, index)).toISOString(),
      };
    });
    const filingStatus: SyncMutation = {
      mutationId: "00000000-0000-4000-8000-000000006000",
      planYear: 2027,
      field: "filingStatus",
      value: "single",
      updatedAt: "2026-01-02T00:00:00.499Z",
    };
    const spouseWages: SyncMutation = {
      mutationId: "00000000-0000-4000-8000-000000006001",
      planYear: 2027,
      field: "spouseWageIncomeCents",
      value: 0,
      updatedAt: "2026-01-02T00:00:00.500Z",
    };
    await enqueueMutations("user-a", [...benefits, filingStatus, spouseWages]);

    const first = await compactedMutationBatch("user-a");
    expect(first).toHaveLength(500);
    expect(first).toEqual(expect.arrayContaining([filingStatus, spouseWages]));
  });

  it("replaces cache only from a fresh read after the outbox is empty", async () => {
    const first = {
      mutationId: "00000000-0000-4000-8000-000000000050",
      planYear: 2026,
      field: "grossSalaryCents" as const,
      value: 11_000_000,
      updatedAt: "2026-07-12T01:00:00.000Z",
    };
    const second = {
      ...first,
      mutationId: "00000000-0000-4000-8000-000000000051",
      field: "stateCode" as const,
      value: "TX",
    };
    await cachePlansAndEnqueue("user-a", [plan()], [first, second]);
    const serverPlan = { ...plan(), grossSalaryCents: 11_000_000 };
    await removeMutations("user-a", [first.mutationId]);
    expect(await cachePlansIfOutboxEmpty("user-a", [serverPlan])).toBeNull();
    expect((await cachedPlans("user-a"))[0].grossSalaryCents).toBe(11_000_000);
    await removeMutations("user-a", [second.mutationId]);
    expect(
      await cachePlansIfOutboxEmpty("user-a", [serverPlan]),
    ).not.toBeNull();
    expect((await cachedPlans("user-a"))[0].grossSalaryCents).toBe(11_000_000);
  });

  it("does not let an older cross-tab response replace a newer cache", async () => {
    const fresh = {
      ...plan(),
      stateCode: "TX" as const,
      updatedAt: "2026-07-12T02:00:00.000Z",
    };
    const stale = {
      ...plan(),
      updatedAt: "2026-07-12T01:00:00.000Z",
    };
    await cachePlansIfOutboxEmpty("user-a", [plan()]);
    expect(await cachePlansIfOutboxEmpty("user-a", [fresh])).not.toBeNull();
    expect(await cachePlansIfOutboxEmpty("user-a", [stale])).not.toBeNull();
    expect((await cachedPlans("user-a"))[0].stateCode).toBe("TX");
  });

  it("merges cache freshness per year instead of by one global timestamp", async () => {
    await cachePlansIfOutboxEmpty("user-a", [
      { ...plan(2025), updatedAt: "2026-07-12T01:00:00.010Z" },
      { ...plan(2026), updatedAt: "2026-07-12T01:00:00.030Z" },
    ]);
    const first = await cachePlansIfOutboxEmpty("user-a", [
      {
        ...plan(2025),
        stateCode: "TX",
        updatedAt: "2026-07-12T01:00:00.020Z",
      },
      {
        ...plan(2026),
        stateCode: "NY",
        updatedAt: "2026-07-12T01:00:00.025Z",
      },
    ]);
    expect(first?.map(({ year, stateCode }) => [year, stateCode])).toEqual([
      [2025, "TX"],
      [2026, "CA"],
    ]);
    const second = await cachePlansIfOutboxEmpty("user-a", [
      { ...plan(2025), updatedAt: "2026-07-12T01:00:00.010Z" },
      {
        ...plan(2026),
        stateCode: "CO",
        updatedAt: "2026-07-12T01:00:00.040Z",
      },
    ]);
    expect(second?.map(({ year, stateCode }) => [year, stateCode])).toEqual([
      [2025, "TX"],
      [2026, "CO"],
    ]);
  });
});

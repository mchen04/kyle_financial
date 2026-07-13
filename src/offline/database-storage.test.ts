import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StoredPlan } from "@/domain/stored-plan";
import { diffPlanMutations, isIncomingVersionNewer } from "@/domain/sync";
import {
  resetOfflineTestState,
  seedRawCachedPlans,
} from "@/test/fixtures/offline";
import { storedPlan as plan } from "@/test/fixtures/plans";
import {
  cachePlansAndEnqueue,
  cachePlansIfOutboxEmpty,
  cachedPlans,
  clearAccountCache,
  clearRememberedUser,
  enqueueMutations,
  lastRememberedUser,
  queuedMutations,
  rememberUser,
  removeMutations,
  withCopyForwardIntentLock,
} from "./database";

afterEach(async () => {
  await resetOfflineTestState();
});

function lockManager(): Pick<LockManager, "request"> {
  const tails = new Map<string, Promise<void>>();
  const request = async <T>(
    name: string,
    optionsOrCallback: LockOptions | LockGrantedCallback<T>,
    maybeCallback?: LockGrantedCallback<T>,
  ): Promise<T> => {
    const callback =
      typeof optionsOrCallback === "function"
        ? optionsOrCallback
        : maybeCallback!;
    const options =
      typeof optionsOrCallback === "function" ? undefined : optionsOrCallback;
    const prior = tails.get(name) ?? Promise.resolve();
    let release: () => void = () => undefined;
    tails.set(
      name,
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    try {
      await Promise.race([
        prior,
        new Promise<never>((_resolve, reject) =>
          options?.signal?.addEventListener(
            "abort",
            () => reject(options.signal?.reason),
            { once: true },
          ),
        ),
      ]);
      options?.signal?.throwIfAborted();
      return await callback({ name, mode: "exclusive" });
    } finally {
      release();
    }
  };
  return {
    request: request as LockManager["request"],
  };
}

describe("account-scoped offline storage", () => {
  it("clamps cached discounts written under the legacy offline schema", async () => {
    await seedRawCachedPlans("user-a", [
      {
        ...plan(),
        benefits: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            type: "espp",
            label: "Legacy ESPP",
            amount: { kind: "percent", ratePpm: 10_000 },
            discountRatePpm: 200_000,
          },
        ],
      },
    ]);

    expect((await cachedPlans("user-a"))[0].benefits[0]).toMatchObject({
      type: "espp",
      discountRatePpm: 150_000,
    });
  });

  it("upgrades legacy cached HSA settings without losing the prior family model", async () => {
    const legacy = {
      ...plan(),
      filingStatus: "mfj" as const,
      hsaCoverage: "family" as const,
    } as Partial<StoredPlan>;
    delete legacy.primaryHsaEligible;
    delete legacy.spouseHsaEligible;
    delete legacy.primaryHsaCatchUpEligible;
    delete legacy.spouseHsaCatchUpEligible;
    delete legacy.primaryHsaFamilyAllocationPpm;
    delete legacy.spouseHsaFamilyAllocationPpm;
    await seedRawCachedPlans("user-a", [legacy]);

    expect((await cachedPlans("user-a"))[0]).toMatchObject({
      primaryHsaEligible: true,
      spouseHsaEligible: true,
      primaryHsaCatchUpEligible: false,
      spouseHsaCatchUpEligible: false,
      primaryHsaFamilyAllocationPpm: 500_000,
      spouseHsaFamilyAllocationPpm: 500_000,
    });
  });

  it("rejects malformed durable plan rows instead of trusting IndexedDB", async () => {
    await seedRawCachedPlans("user-a", [
      { ...plan(), grossSalaryCents: "not-cents" },
    ]);

    await expect(cachedPlans("user-a")).rejects.toThrow();
  });

  it("does not admit a cross-tab intent write while copy-forward is ready", async () => {
    vi.stubGlobal("navigator", { locks: lockManager() });
    const events: string[] = [];
    let releaseCopy: () => void = () => undefined;
    const copyPaused = new Promise<void>((resolve) => {
      releaseCopy = resolve;
    });
    const mutation = {
      mutationId: "00000000-0000-4000-8000-000000000099",
      planYear: 2026,
      field: "grossSalaryCents" as const,
      value: 12_000_000,
      updatedAt: "2026-07-12T01:00:00.000Z",
    };

    const copy = withCopyForwardIntentLock("user-a", async () => {
      events.push("copy-ready");
      await copyPaused;
      events.push("copy-finished");
    });
    await Promise.resolve();
    const write = cachePlansAndEnqueue(
      "user-a",
      [{ ...plan(), grossSalaryCents: 12_000_000 }],
      [mutation],
    ).then(() => events.push("write-admitted"));
    await Promise.resolve();
    expect(events).toEqual(["copy-ready"]);

    releaseCopy();
    await Promise.all([copy, write]);
    expect(events).toEqual(["copy-ready", "copy-finished", "write-admitted"]);
  });

  it("cancels a stale intent before it can acquire the write locks", async () => {
    vi.stubGlobal("navigator", { locks: lockManager() });
    let releaseCopy: () => void = () => undefined;
    const copyPaused = new Promise<void>((resolve) => {
      releaseCopy = resolve;
    });
    const copy = withCopyForwardIntentLock("user-a", () => copyPaused);
    await Promise.resolve();
    const owner = new AbortController();
    const write = cachePlansAndEnqueue(
      "user-a",
      [{ ...plan(), stateCode: "TX" }],
      [
        {
          mutationId: "00000000-0000-4000-8000-000000000098",
          planYear: 2026,
          field: "stateCode",
          value: "TX",
          updatedAt: "2026-07-12T02:00:00.000Z",
        },
      ],
      owner.signal,
    );
    const rejectedWrite = expect(write).rejects.toMatchObject({
      name: "AbortError",
    });

    owner.abort();
    await rejectedWrite;
    releaseCopy();
    await copy;
    expect(await cachedPlans("user-a")).toEqual([]);
  });

  it("caches plans per account and logout removes only that account", async () => {
    await rememberUser({ id: "user-a", email: "a@example.com" });
    await cachePlansIfOutboxEmpty("user-a", [plan()]);
    await cachePlansIfOutboxEmpty("user-b", [plan(2027)]);
    expect(await lastRememberedUser()).toEqual({
      id: "user-a",
      email: "a@example.com",
    });
    expect((await cachedPlans("user-a")).map(({ year }) => year)).toEqual([
      2026,
    ]);
    expect((await cachedPlans("user-b")).map(({ year }) => year)).toEqual([
      2027,
    ]);

    await clearAccountCache("user-a");
    await clearRememberedUser();
    expect(await cachedPlans("user-a")).toEqual([]);
    expect((await cachedPlans("user-b")).map(({ year }) => year)).toEqual([
      2027,
    ]);
    expect(await lastRememberedUser()).toBeNull();
  });

  it("does not let a disposed bootstrap overwrite a newer remembered account", async () => {
    await rememberUser({ id: "user-b", email: "b@example.com" }, true);
    const staleOwner = new AbortController();
    staleOwner.abort();

    await expect(
      rememberUser(
        { id: "user-a", email: "a@example.com" },
        false,
        staleOwner.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(await lastRememberedUser()).toEqual({
      id: "user-b",
      email: "b@example.com",
    });
  });

  it("does not let a queued retry overwrite a newer authenticated account", async () => {
    const ordinaryLocks = lockManager();
    let releaseStaleAccountLock: () => void = () => undefined;
    const staleAccountLock = new Promise<void>((resolve) => {
      releaseStaleAccountLock = resolve;
    });
    const request = async <T>(
      name: string,
      options: LockOptions,
      callback: LockGrantedCallback<T>,
    ): Promise<T> => {
      if (name === "kyle-financial-account-user-a") {
        await Promise.race([
          staleAccountLock,
          new Promise<never>((_resolve, reject) =>
            options.signal?.addEventListener(
              "abort",
              () => reject(options.signal?.reason),
              { once: true },
            ),
          ),
        ]);
      }
      return ordinaryLocks.request(name, options, callback);
    };
    vi.stubGlobal("navigator", {
      locks: { request: request as LockManager["request"] },
    });
    const staleOwner = new AbortController();
    const staleRetry = rememberUser(
      { id: "user-a", email: "a@example.com" },
      true,
      staleOwner.signal,
    );
    const staleResult = expect(staleRetry).rejects.toMatchObject({
      name: "AbortError",
    });
    await Promise.resolve();

    staleOwner.abort();
    await rememberUser({ id: "user-b", email: "b@example.com" }, true);
    releaseStaleAccountLock();

    await staleResult;
    expect(await lastRememberedUser()).toEqual({
      id: "user-b",
      email: "b@example.com",
    });
  });

  it("queues field mutations idempotently and removes acknowledged entries", async () => {
    const before = plan();
    const after = {
      ...before,
      stateCode: "TX" as const,
      grossSalaryCents: 12_000_000,
    };
    let id = 0;
    const mutations = diffPlanMutations(
      before,
      after,
      "2026-07-12T01:00:00.000Z",
      () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    );
    expect(mutations.map(({ field }) => field)).toEqual([
      "stateCode",
      "grossSalaryCents",
    ]);
    await enqueueMutations("user-a", mutations);
    await enqueueMutations("user-a", mutations);
    expect(await queuedMutations("user-a")).toHaveLength(2);
    await removeMutations("user-a", [mutations[0].mutationId]);
    expect((await queuedMutations("user-a")).map(({ field }) => field)).toEqual(
      ["grossSalaryCents"],
    );
  });

  it("diffs every HSA setting as an independently versioned scalar", () => {
    const before = {
      ...plan(),
      fieldVersions: {
        spouseHsaEligible: {
          updatedAt: "2026-07-12T00:00:00.000Z",
          mutationId: "00000000-0000-4000-8000-000000000090",
        },
      },
    };
    const after = {
      ...before,
      filingStatus: "mfj" as const,
      hsaCoverage: "family" as const,
      spouseHsaEligible: true,
      primaryHsaCatchUpEligible: true,
      spouseHsaCatchUpEligible: true,
      primaryHsaFamilyAllocationPpm: 600_000,
      spouseHsaFamilyAllocationPpm: 400_000,
    };
    const mutations = diffPlanMutations(
      before,
      after,
      "2026-07-12T01:00:00.000Z",
      () => crypto.randomUUID(),
    );

    expect(mutations.map(({ field }) => field)).toEqual([
      "filingStatus",
      "hsaCoverage",
      "spouseHsaEligible",
      "primaryHsaCatchUpEligible",
      "spouseHsaCatchUpEligible",
      "primaryHsaFamilyAllocationPpm",
      "spouseHsaFamilyAllocationPpm",
    ]);
    expect(
      mutations.find(({ field }) => field === "spouseHsaEligible")?.baseVersion,
    ).toMatchObject({
      mutationId: "00000000-0000-4000-8000-000000000090",
    });
  });

  it("orders two-device conflicts by timestamp then mutation ID", () => {
    const current = { updatedAt: "2026-07-12T01:00:00.000Z", mutationId: "b" };
    expect(
      isIncomingVersionNewer(
        { updatedAt: "2026-07-12T02:00:00.000Z", mutationId: "a" },
        current,
      ),
    ).toBe(true);
    expect(
      isIncomingVersionNewer(
        { updatedAt: current.updatedAt, mutationId: "c" },
        current,
      ),
    ).toBe(true);
    expect(
      isIncomingVersionNewer(
        { updatedAt: current.updatedAt, mutationId: "a" },
        current,
      ),
    ).toBe(false);
  });

  it("orders equivalent ISO timestamp shapes chronologically", () => {
    const current = { updatedAt: "2026-07-12T01:00:00Z", mutationId: "z" };
    expect(
      isIncomingVersionNewer(
        { updatedAt: "2026-07-12T01:00:00.100Z", mutationId: "a" },
        current,
      ),
    ).toBe(true);
    expect(
      isIncomingVersionNewer(
        { updatedAt: "2026-07-12T00:59:59.999Z", mutationId: "z" },
        current,
      ),
    ).toBe(false);
  });

  it("commits cached plans and outbox mutations atomically", async () => {
    const next = { ...plan(), grossSalaryCents: 12_000_000 };
    const mutation = {
      mutationId: "00000000-0000-4000-8000-000000000030",
      planYear: 2026,
      field: "grossSalaryCents" as const,
      value: 12_000_000,
      updatedAt: "2026-07-12T01:00:00.000Z",
    };
    await cachePlansAndEnqueue("user-a", [next], [mutation]);
    expect((await cachedPlans("user-a"))[0].grossSalaryCents).toBe(12_000_000);
    expect(await queuedMutations("user-a")).toEqual([mutation]);

    await expect(
      cachePlansAndEnqueue(
        "user-a",
        [{ ...next, grossSalaryCents: 13_000_000 }],
        [{ ...mutation, value: 13_000_000 }],
      ),
    ).rejects.toThrow("reused with different content");
    expect((await cachedPlans("user-a"))[0].grossSalaryCents).toBe(12_000_000);
    expect(await queuedMutations("user-a")).toEqual([mutation]);
  });
});

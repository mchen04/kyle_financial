import { describe, expect, it, vi } from "vitest";
import { storedPlan } from "@/test/fixtures/plans";
import {
  authenticationBroadcastTransition,
  cancelAccountPersistenceRetry,
  canPublishPlanSnapshot,
  canConfirmSaved,
  copyForwardIntentSnapshot,
  durableLogoutProblem,
  enqueueSerializedIntent,
  mergePlansWithLocalIntent,
  planIntentForYear,
  prepareCopyForward,
  reconciliationCompletionState,
  reconciliationStateWithPersistencePriority,
  registerPlanWriteFailure,
  removableAcknowledgementIds,
  queueAccountPersistenceRetry,
  replacePlanIntent,
  resolvePlanWriteSuccess,
  runDevicePersistenceRetry,
  shouldEvictAccount,
  shouldInvalidateForAuthentication,
  userWithLatestSession,
} from "./sync-state";

describe("sync durability state", () => {
  it("does not publish a response after a newer intent is accepted or while it is not durable", async () => {
    let currentIntentRevision = 3;
    let durableIntentRevision = 3;
    const capturedIntentRevision = currentIntentRevision;
    let releaseResponse: (() => void) | undefined;
    const response = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });

    currentIntentRevision += 1;
    releaseResponse?.();
    await response;

    expect(
      canPublishPlanSnapshot(
        capturedIntentRevision,
        currentIntentRevision,
        durableIntentRevision,
      ),
    ).toBe(false);
    durableIntentRevision = currentIntentRevision;
    expect(
      canPublishPlanSnapshot(
        capturedIntentRevision,
        currentIntentRevision,
        durableIntentRevision,
      ),
    ).toBe(false);
    expect(
      canPublishPlanSnapshot(
        currentIntentRevision,
        currentIntentRevision,
        durableIntentRevision,
      ),
    ).toBe(true);
  });

  it("retains rejected mutation groups until corrected", () => {
    expect(
      removableAcknowledgementIds([
        { mutationId: "applied" },
        { mutationId: "rejected", rejected: true },
        { mutationId: "conflict", rejected: false },
      ]),
    ).toEqual(["applied", "conflict"]);
  });

  it("keeps a failed local write failed through an empty online reconciliation until persistence succeeds", () => {
    expect(
      reconciliationCompletionState({
        queuedMutationCount: 0,
        volatileWriteFailure: true,
        rejectedWriteFailure: false,
      }),
    ).toBe("local-error");

    expect(
      reconciliationCompletionState({
        queuedMutationCount: 0,
        volatileWriteFailure: false,
        rejectedWriteFailure: false,
      }),
    ).toBe("saved");
  });

  it("does not certify a failed plan year when a different year persists", () => {
    const failedPlanYears = new Set<number>();
    registerPlanWriteFailure(failedPlanYears, 2026);

    const after2027 = resolvePlanWriteSuccess(failedPlanYears, 2027, 0, 2);
    expect(after2027).toEqual({
      volatileWriteFailure: true,
      durableIntentRevision: 0,
    });
    expect(failedPlanYears).toEqual(new Set([2026]));

    const after2026Retry = resolvePlanWriteSuccess(
      failedPlanYears,
      2026,
      after2027.durableIntentRevision,
      2,
    );
    expect(after2026Retry).toEqual({
      volatileWriteFailure: false,
      durableIntentRevision: 2,
    });
    expect(failedPlanYears.size).toBe(0);
  });

  it("reports a durable no-op so a reverted failed year can recover", async () => {
    const persist = vi.fn(async () => undefined);
    const result = await enqueueSerializedIntent(
      Promise.resolve(),
      "original",
      () => "original",
      persist,
    );

    expect(result).toBe("unchanged");
    expect(persist).not.toHaveBeenCalled();
    const failedPlanYears = new Set([2026]);
    expect(resolvePlanWriteSuccess(failedPlanYears, 2026, 0, 1)).toEqual({
      volatileWriteFailure: false,
      durableIntentRevision: 1,
    });
  });

  it("retries failed startup persistence even when the draft needs no write", async () => {
    const events: string[] = [];

    await runDevicePersistenceRetry(
      async () => {
        events.push("startup-persistence");
      },
      () => {
        events.push("draft-persistence");
      },
    );

    expect(events).toEqual(["startup-persistence", "draft-persistence"]);
  });

  it("retries a standalone failed draft write without a startup retry", async () => {
    let draftRetries = 0;

    await runDevicePersistenceRetry(null, () => {
      draftRetries += 1;
    });

    expect(draftRetries).toBe(1);
  });

  it("keeps local persistence failures above reconciliation outcomes", () => {
    for (const candidate of [
      "saving",
      "offline",
      "rejected",
      "sync-error",
    ] as const) {
      expect(
        reconciliationStateWithPersistencePriority({
          candidate,
          volatileWriteFailure: true,
          retryablePersistenceFailure: false,
        }),
      ).toBe("local-error");
      expect(
        reconciliationStateWithPersistencePriority({
          candidate,
          volatileWriteFailure: false,
          retryablePersistenceFailure: true,
        }),
      ).toBe("local-error");
      expect(
        reconciliationStateWithPersistencePriority({
          candidate,
          volatileWriteFailure: false,
          retryablePersistenceFailure: false,
          reconciliationPersistenceFailure: true,
        }),
      ).toBe("local-error");
      expect(
        reconciliationStateWithPersistencePriority({
          candidate,
          volatileWriteFailure: false,
          retryablePersistenceFailure: false,
          rejectedWriteFailure: true,
        }),
      ).toBe("rejected");
    }
    expect(
      reconciliationStateWithPersistencePriority({
        candidate: "offline",
        volatileWriteFailure: true,
        retryablePersistenceFailure: false,
        rejectedWriteFailure: true,
      }),
    ).toBe("local-error");
    expect(
      reconciliationStateWithPersistencePriority({
        candidate: "sync-error",
        volatileWriteFailure: false,
        retryablePersistenceFailure: false,
        rejectedWriteFailure: true,
        syncRequestFailure: true,
      }),
    ).toBe("sync-error");
    expect(
      reconciliationStateWithPersistencePriority({
        candidate: "rejected",
        volatileWriteFailure: false,
        retryablePersistenceFailure: false,
      }),
    ).toBe("rejected");
  });

  it("does not treat incomplete local reconciliation as a failed sync request", () => {
    const candidate = reconciliationCompletionState({
      queuedMutationCount: 1,
      volatileWriteFailure: false,
      rejectedWriteFailure: true,
    });

    expect(candidate).toBe("sync-error");
    expect(
      reconciliationStateWithPersistencePriority({
        candidate,
        volatileWriteFailure: false,
        retryablePersistenceFailure: false,
        rejectedWriteFailure: true,
      }),
    ).toBe("rejected");
  });

  it("keeps the draft retry pending when startup persistence still fails", async () => {
    let retriedDraft = false;

    await expect(
      runDevicePersistenceRetry(
        async () => {
          throw new Error("IndexedDB remains unavailable");
        },
        () => {
          retriedDraft = true;
        },
      ),
    ).rejects.toThrow("IndexedDB remains unavailable");

    expect(retriedDraft).toBe(false);
  });

  it("replaces and cancels persistence retries across account changes", async () => {
    const events: string[] = [];
    const accountA = queueAccountPersistenceRetry(
      null,
      "user-a",
      1,
      async () => {
        events.push("user-a");
      },
      "user-a",
      1,
    );
    const accountB = queueAccountPersistenceRetry(
      accountA,
      "user-b",
      2,
      async () => {
        events.push("user-b");
      },
      "user-b",
      2,
    );

    expect(cancelAccountPersistenceRetry(accountB, "user-a")).toBe(accountB);
    expect(cancelAccountPersistenceRetry(accountB, "user-b")).toBeNull();
    await accountB!.retry();
    expect(events).toEqual(["user-b"]);
  });

  it("does not let a late retry admission from an evicted account replace the active account", () => {
    const accountB = queueAccountPersistenceRetry(
      null,
      "user-b",
      2,
      async () => {},
      "user-b",
      2,
    );
    const lateAccountA = queueAccountPersistenceRetry(
      accountB,
      "user-a",
      1,
      async () => {},
      "user-b",
      2,
    );

    expect(lateAccountA).toBe(accountB);
  });

  it("does not confirm Saved after a rejection or volatile write failure", () => {
    expect(
      canConfirmSaved({
        queuedMutationCount: 0,
        volatileWriteFailure: false,
        rejectedWriteFailure: true,
      }),
    ).toBe(false);
    expect(
      canConfirmSaved({
        queuedMutationCount: 0,
        volatileWriteFailure: true,
        rejectedWriteFailure: false,
      }),
    ).toBe(false);
  });

  it("refuses logout when the displayed draft is not durable", () => {
    expect(
      durableLogoutProblem({
        draftSnapshot: "changed",
        durableSnapshot: "old",
        volatileWriteFailure: false,
        rejectedWriteFailure: false,
      }),
    ).toMatch(/not finished saving/i);
    expect(
      durableLogoutProblem({
        draftSnapshot: "same",
        durableSnapshot: "same",
        volatileWriteFailure: true,
        rejectedWriteFailure: false,
      }),
    ).toMatch(/not finished saving/i);
  });

  it("persists a rapid edit followed by a revert against the latest durable baseline", async () => {
    let durable = "original";
    let releaseFirst: (() => void) | undefined;
    const firstWritePaused = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const transitions: Array<[string, string]> = [];
    let chain: Promise<unknown> = Promise.resolve();

    const enqueue = (intent: string, pause = false) => {
      chain = enqueueSerializedIntent(
        chain,
        intent,
        () => durable,
        async (baseline) => {
          if (pause) await firstWritePaused;
          transitions.push([baseline, intent]);
          durable = intent;
        },
      );
    };

    enqueue("edited", true);
    enqueue("original");
    releaseFirst?.();
    await chain;

    expect(transitions).toEqual([
      ["original", "edited"],
      ["edited", "original"],
    ]);
    expect(durable).toBe("original");
  });

  it("does not manufacture a stale revert when changing years during persistence", async () => {
    type PlanIntent = { year: number; value: string };
    let intents: PlanIntent[] = [
      { year: 2026, value: "old" },
      { year: 2027, value: "other year" },
    ];
    const durable = new Map(intents.map((plan) => [plan.year, plan.value]));
    let releaseFirstWrite: (() => void) | undefined;
    const firstWritePaused = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const transitions: Array<[string, string]> = [];
    let chain: Promise<unknown> = Promise.resolve();

    const edited = { year: 2026, value: "edited" };
    intents = replacePlanIntent(intents, edited);
    chain = enqueueSerializedIntent(
      chain,
      edited.value,
      () => durable.get(edited.year),
      async (baseline) => {
        await firstWritePaused;
        transitions.push([baseline, edited.value]);
        durable.set(edited.year, edited.value);
      },
    );

    expect(planIntentForYear(intents, 2027)?.value).toBe("other year");
    const selectedAfterReturning = planIntentForYear(intents, 2026);
    expect(selectedAfterReturning).toEqual(edited);
    chain = enqueueSerializedIntent(
      chain,
      selectedAfterReturning!.value,
      () => durable.get(2026),
      async (baseline) => {
        transitions.push([baseline, selectedAfterReturning!.value]);
        durable.set(2026, selectedAfterReturning!.value);
      },
    );

    releaseFirstWrite?.();
    await chain;

    expect(transitions).toEqual([["old", "edited"]]);
    expect(durable.get(2026)).toBe("edited");
  });

  it("evicts an account whose offline cache restoration is still in flight", () => {
    expect(shouldEvictAccount(null, "user-a", "user-a")).toBe(true);
    expect(shouldEvictAccount("user-b", null, "user-a")).toBe(false);
  });

  it("preserves queued edits when the same account authenticates in another tab", () => {
    expect(shouldInvalidateForAuthentication("user-a", "user-a")).toBe(false);
    expect(shouldInvalidateForAuthentication("user-a", "user-b")).toBe(true);
    expect(shouldInvalidateForAuthentication(null, "user-a")).toBe(true);
  });

  it("adopts only a valid same-account session identity and replaces close ownership", () => {
    const replaceCloseOwner = vi.fn();
    const user = {
      id: "user-a",
      email: "a@example.com",
      sessionId: "00000000-0000-4000-8000-000000000001",
    };

    expect(
      authenticationBroadcastTransition(
        "user-a",
        user,
        {
          userId: "user-a",
          sessionId: "00000000-0000-4000-8000-000000000002",
        },
        replaceCloseOwner,
      ),
    ).toEqual({
      invalidate: false,
      sessionIdentity: {
        userId: "user-a",
        sessionId: "00000000-0000-4000-8000-000000000002",
      },
      user: {
        ...user,
        sessionId: "00000000-0000-4000-8000-000000000002",
      },
    });
    expect(replaceCloseOwner).toHaveBeenCalledOnce();

    expect(
      authenticationBroadcastTransition(
        "user-a",
        user,
        { userId: "user-a", sessionId: "not-a-session-id" },
        vi.fn(),
      ).user,
    ).toBe(user);
  });

  it("retains a newer same-account session until startup can publish its user", () => {
    const transition = authenticationBroadcastTransition(
      "user-a",
      null,
      {
        userId: "user-a",
        sessionId: "00000000-0000-4000-8000-000000000002",
      },
      vi.fn(),
    );

    expect(transition).toEqual({
      invalidate: false,
      sessionIdentity: {
        userId: "user-a",
        sessionId: "00000000-0000-4000-8000-000000000002",
      },
      user: null,
    });
    expect(
      userWithLatestSession(
        {
          id: "user-a",
          email: "a@example.com",
          sessionId: "00000000-0000-4000-8000-000000000001",
        },
        transition.sessionIdentity ?? null,
      ),
    ).toMatchObject({
      sessionId: "00000000-0000-4000-8000-000000000002",
    });
  });

  it("replays pending fields over fresh server state and keeps copied years", () => {
    const server = [
      storedPlan(2026, { stateCode: "TX", grossSalaryCents: 10_000_000 }),
      storedPlan(2027, { stateCode: "WA" }),
    ];
    const local = [
      storedPlan(2026, { stateCode: "CA", grossSalaryCents: 30_000_000 }),
    ];
    const pending = [
      {
        mutationId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        planYear: 2026,
        field: "grossSalaryCents" as const,
        value: 20_000_000,
        updatedAt: "2026-07-12T01:00:00.000Z",
      },
      {
        mutationId: "00000000-0000-4000-8000-000000000081",
        planYear: 2026,
        field: "grossSalaryCents" as const,
        value: 30_000_000,
        updatedAt: "2026-07-12T01:00:01.000Z",
      },
    ];

    const merged = mergePlansWithLocalIntent(server, local, pending);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({
      year: 2026,
      stateCode: "TX",
      grossSalaryCents: 30_000_000,
    });
    expect(merged[1]).toMatchObject({ year: 2027, stateCode: "WA" });
  });

  it("compares copy-forward intent independently from refreshed sync metadata", () => {
    const displayed = {
      year: 2026,
      value: "edited source",
      updatedAt: "2026-07-12T01:00:00.000Z",
      fieldVersions: {},
    };
    const reconciled = {
      ...displayed,
      updatedAt: "2026-07-12T01:00:01.000Z",
      fieldVersions: {
        value: { updatedAt: "2026-07-12T01:00:01.000Z", mutationId: "m1" },
      },
    };

    expect(copyForwardIntentSnapshot(displayed)).toBe(
      copyForwardIntentSnapshot(reconciled),
    );
    expect(
      copyForwardIntentSnapshot({ ...reconciled, value: "remote source" }),
    ).not.toBe(copyForwardIntentSnapshot(displayed));
  });

  it("delivers the displayed source intent before allowing copy-forward", async () => {
    let releaseLocalWrite: (() => void) | undefined;
    const localWrites = new Promise<void>((resolve) => {
      releaseLocalWrite = resolve;
    });
    const events: string[] = [];

    const preflight = prepareCopyForward({
      localWrites,
      durabilityProblem: () => null,
      reconcile: async () => {
        events.push("reconciled");
      },
      queuedMutationCount: async () => 0,
    }).then(() => events.push("copy-ready"));

    await Promise.resolve();
    expect(events).toEqual([]);
    releaseLocalWrite?.();
    await preflight;
    expect(events).toEqual(["reconciled", "copy-ready"]);
  });

  it("refuses copy-forward when reconciliation rejects the source intent", async () => {
    let rejected = false;
    await expect(
      prepareCopyForward({
        localWrites: Promise.resolve(),
        durabilityProblem: () =>
          rejected ? "The source change was rejected." : null,
        reconcile: async () => {
          rejected = true;
        },
        queuedMutationCount: async () => 0,
      }),
    ).rejects.toThrow("source change was rejected");
  });
});

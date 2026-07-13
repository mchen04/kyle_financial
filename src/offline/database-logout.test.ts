import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestRemoteAccountClosure } from "@/components/account-closure";
import { authenticationBroadcastTransition } from "@/components/sync-state";
import {
  resetOfflineTestState,
  seedRawCachedPlans,
} from "@/test/fixtures/offline";
import { storedPlan as plan } from "@/test/fixtures/plans";
import {
  cachePlansAndEnqueue,
  cachePlansIfOutboxEmpty,
  cachedPlans,
  lastRememberedUser,
  rememberUser,
  restorableCachedPlans,
  safelyCloseAccount,
} from "./database";

afterEach(async () => {
  await resetOfflineTestState();
  vi.unstubAllGlobals();
});

function lockManager(): Pick<LockManager, "request"> {
  const tails = new Map<string, Promise<void>>();
  const request = async <T>(
    name: string,
    options: LockOptions,
    callback: LockGrantedCallback<T>,
  ): Promise<T> => {
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
          options.signal?.addEventListener(
            "abort",
            () => reject(options.signal?.reason),
            { once: true },
          ),
        ),
      ]);
      options.signal?.throwIfAborted();
      return await callback({ name, mode: "exclusive" });
    } finally {
      release();
    }
  };
  return { request: request as LockManager["request"] };
}

async function safelyLogoutAccount(
  userId: string,
  revokeSession: () => Promise<void>,
): Promise<boolean> {
  return (
    await safelyCloseAccount(userId, "logout", async () => {
      await revokeSession();
      return { status: "confirmed" };
    })
  ).cleanupComplete;
}

describe("offline account logout", () => {
  it("marks logout under the account lock so another tab cannot recreate data", async () => {
    await rememberUser({ id: "user-a", email: "a@example.com" });
    await cachePlansIfOutboxEmpty("user-a", [plan()]);
    await safelyLogoutAccount("user-a", async () => undefined);
    expect(
      await rememberUser({ id: "user-a", email: "stale@example.com" }),
    ).toBe(false);
    await expect(
      cachePlansAndEnqueue(
        "user-a",
        [plan()],
        [
          {
            mutationId: "00000000-0000-4000-8000-000000000090",
            planYear: 2026,
            field: "stateCode",
            value: "TX",
            updatedAt: "2026-07-12T03:00:00.000Z",
          },
        ],
      ),
    ).rejects.toThrow("logged out in another tab");
    expect(await cachedPlans("user-a")).toEqual([]);
  });

  it("refuses offline restoration when stale records remain behind a logout tombstone", async () => {
    await rememberUser({ id: "user-a", email: "a@example.com" }, true);
    await cachePlansIfOutboxEmpty("user-a", [plan()]);
    expect(await safelyLogoutAccount("user-a", async () => undefined)).toBe(
      true,
    );
    await seedRawCachedPlans("user-a", [plan()]);
    expect(await restorableCachedPlans("user-a")).toBeNull();
  });

  it("does not clear another account remembered by a concurrent tab", async () => {
    await cachePlansIfOutboxEmpty("user-a", [plan()]);
    await rememberUser({ id: "user-b", email: "b@example.com" }, true);

    await safelyLogoutAccount("user-a", async () => undefined);

    expect(await lastRememberedUser()).toEqual({
      id: "user-b",
      email: "b@example.com",
    });
  });

  it("keeps a successful logout terminal across queued closes and stale writes", async () => {
    vi.stubGlobal("navigator", { locks: lockManager() });
    await rememberUser({ id: "user-a", email: "a@example.com" }, true);
    await cachePlansIfOutboxEmpty("user-a", [plan()]);
    let releaseFirstClose: () => void = () => undefined;
    const firstClosePaused = new Promise<void>((resolve) => {
      releaseFirstClose = resolve;
    });
    let firstCloseStarted: () => void = () => undefined;
    const firstCloseEntered = new Promise<void>((resolve) => {
      firstCloseStarted = resolve;
    });
    let revocations = 0;
    const firstClose = safelyLogoutAccount("user-a", async () => {
      revocations += 1;
      firstCloseStarted();
      await firstClosePaused;
    });
    await firstCloseEntered;
    const secondClose = safelyLogoutAccount("user-a", async () => {
      revocations += 1;
      throw new Error("The session was already revoked");
    });
    const staleWrite = cachePlansAndEnqueue(
      "user-a",
      [{ ...plan(), stateCode: "TX" }],
      [
        {
          mutationId: "00000000-0000-4000-8000-000000000091",
          planYear: 2026,
          field: "stateCode",
          value: "TX",
          updatedAt: "2026-07-12T04:00:00.000Z",
        },
      ],
    );

    releaseFirstClose();
    await expect(Promise.all([firstClose, secondClose])).resolves.toEqual([
      true,
      true,
    ]);
    await expect(staleWrite).rejects.toThrow("logged out in another tab");
    expect(revocations).toBe(1);
    expect(await cachedPlans("user-a")).toEqual([]);
    expect(await lastRememberedUser()).toBeNull();
  });

  it("cancels a queued close when same-account authentication replaces its session", async () => {
    vi.stubGlobal("navigator", { locks: lockManager() });
    const oldUser = {
      id: "user-a",
      email: "a@example.com",
      sessionId: "00000000-0000-4000-8000-000000000001",
    };
    await rememberUser(oldUser, true);
    let releaseHeldLock: () => void = () => undefined;
    const heldLock = new Promise<void>((resolve) => {
      releaseHeldLock = resolve;
    });
    let markLockEntered: () => void = () => undefined;
    const lockEntered = new Promise<void>((resolve) => {
      markLockEntered = resolve;
    });
    const holder = navigator.locks.request(
      "kyle-financial-account-user-a",
      { mode: "exclusive" },
      async () => {
        markLockEntered();
        await heldLock;
      },
    );
    await lockEntered;

    const closeOwner = new AbortController();
    let remoteOperations = 0;
    const close = safelyCloseAccount(
      "user-a",
      "logout",
      async () => {
        remoteOperations += 1;
        return { status: "confirmed" };
      },
      closeOwner.signal,
    );
    const transition = authenticationBroadcastTransition(
      "user-a",
      oldUser,
      {
        userId: "user-a",
        sessionId: "00000000-0000-4000-8000-000000000002",
      },
      () =>
        closeOwner.abort(
          new DOMException(
            "A newer authentication replaced this request.",
            "AbortError",
          ),
        ),
    );

    await expect(close).rejects.toMatchObject({ name: "AbortError" });
    expect(transition).toMatchObject({
      invalidate: false,
      user: {
        sessionId: "00000000-0000-4000-8000-000000000002",
      },
    });
    expect(remoteOperations).toBe(0);
    releaseHeldLock();
    await holder;
  });

  it("cancels a granted close before remote dispatch when authentication replaces it", async () => {
    let resumeGrantedCallback: () => void = () => undefined;
    const grantedCallbackPaused = new Promise<void>((resolve) => {
      resumeGrantedCallback = resolve;
    });
    let markGranted: () => void = () => undefined;
    const granted = new Promise<void>((resolve) => {
      markGranted = resolve;
    });
    const oldUser = {
      id: "user-a",
      email: "a@example.com",
      sessionId: "00000000-0000-4000-8000-000000000001",
    };
    await rememberUser(oldUser, true);
    vi.stubGlobal("navigator", {
      locks: {
        request: async <T>(
          name: string,
          _options: LockOptions,
          callback: LockGrantedCallback<T>,
        ) => {
          markGranted();
          await grantedCallbackPaused;
          return callback({ name, mode: "exclusive" });
        },
      },
    });
    const closeOwner = new AbortController();
    let remoteOperations = 0;
    const close = safelyCloseAccount(
      "user-a",
      "logout",
      async () => {
        remoteOperations += 1;
        return { status: "confirmed" };
      },
      closeOwner.signal,
    );
    await granted;

    closeOwner.abort(
      new DOMException(
        "A newer authentication replaced this request.",
        "AbortError",
      ),
    );
    resumeGrantedCallback();

    await expect(close).rejects.toMatchObject({ name: "AbortError" });
    expect(remoteOperations).toBe(0);
    expect(await lastRememberedUser()).toEqual(oldUser);
  });

  it("preserves the account when a delayed broadcast leaves a stale close session", async () => {
    const oldUser = {
      id: "user-a",
      email: "a@example.com",
      sessionId: "00000000-0000-4000-8000-000000000001",
    };
    await rememberUser(oldUser, true);
    await cachePlansIfOutboxEmpty("user-a", [plan()]);
    const currentServerSession = "00000000-0000-4000-8000-000000000002";
    let remoteMutated = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        if (headers.get("X-Kyle-Session-Id") !== currentServerSession)
          return Response.json(
            { error: "The active session changed in another tab." },
            { status: 409 },
          );
        remoteMutated = true;
        return Response.json({ ok: true });
      }),
    );

    await expect(
      safelyCloseAccount("user-a", "delete", () =>
        requestRemoteAccountClosure(
          oldUser,
          "delete",
          new AbortController().signal,
        ),
      ),
    ).rejects.toThrow("active session changed");
    expect(remoteMutated).toBe(false);
    expect(await lastRememberedUser()).toEqual(oldUser);
    expect(await restorableCachedPlans("user-a")).toHaveLength(1);
  });

  it("keeps local data protected when the remote close result is indeterminate", async () => {
    await rememberUser({ id: "user-a", email: "a@example.com" }, true);
    await cachePlansIfOutboxEmpty("user-a", [plan()]);
    let remoteCommitted = false;

    const result = await safelyCloseAccount("user-a", "logout", async () => {
      remoteCommitted = true;
      throw new TypeError("The response was lost after commit");
    });

    expect(result).toEqual({
      cleanupComplete: true,
      remoteStatus: "indeterminate",
    });
    expect(remoteCommitted).toBe(true);
    expect(await lastRememberedUser()).toBeNull();
    expect(await restorableCachedPlans("user-a")).toBeNull();
    expect(await cachedPlans("user-a")).toEqual([]);
    const retryRejection = new Error("The session is already gone");
    await expect(
      safelyCloseAccount("user-a", "logout", async () => ({
        status: "rejected",
        error: retryRejection,
      })),
    ).rejects.toBe(retryRejection);
    expect(
      await rememberUser({ id: "user-a", email: "stale@example.com" }),
    ).toBe(false);
  });

  it("does not let a logout terminal claim that deletion succeeded", async () => {
    await rememberUser({ id: "user-a", email: "a@example.com" }, true);
    await safelyCloseAccount("user-a", "logout", async () => ({
      status: "confirmed",
    }));
    let deletionAttempted = false;

    await expect(
      safelyCloseAccount("user-a", "delete", async () => {
        deletionAttempted = true;
        return { status: "confirmed" };
      }),
    ).rejects.toThrow("Sign in again before deleting");
    expect(deletionAttempted).toBe(false);
  });

  it("allows a deletion terminal to satisfy a later logout without another request", async () => {
    await rememberUser({ id: "user-a", email: "a@example.com" }, true);
    const remoteOperations: string[] = [];
    await safelyCloseAccount("user-a", "delete", async () => {
      remoteOperations.push("delete");
      return { status: "confirmed" };
    });

    const logout = await safelyCloseAccount("user-a", "logout", async () => {
      remoteOperations.push("logout");
      return { status: "confirmed" };
    });
    expect(logout.remoteStatus).toBe("confirmed");
    expect(remoteOperations).toEqual(["delete"]);
  });

  it("rolls back a new marker only for a definitive remote rejection", async () => {
    await rememberUser({ id: "user-a", email: "a@example.com" }, true);
    await cachePlansIfOutboxEmpty("user-a", [plan()]);
    const rejection = new Error("The active account changed in another tab");

    await expect(
      safelyCloseAccount("user-a", "logout", async () => ({
        status: "rejected",
        error: rejection,
      })),
    ).rejects.toBe(rejection);
    expect(await lastRememberedUser()).toEqual({
      id: "user-a",
      email: "a@example.com",
    });
    expect(await restorableCachedPlans("user-a")).toHaveLength(1);
  });
});

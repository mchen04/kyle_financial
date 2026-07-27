/**
 * The other half of the durability guarantee: what the *next* launch does with
 * what a dying document parked.
 *
 * `unload-flush.test.ts` proves the mutation is on disk after a failed flush.
 * That is worth nothing on its own — the round-3 bug was an edit that existed
 * somewhere nobody read. So these tests assert the drain: the journal reaches
 * the real outbox, the startup state reports it as pending intent, and the
 * journal is emptied only once the outbox transaction has committed.
 *
 * Node environment, like every other offline test, with `localStorage` supplied
 * as the platform would: jsdom brings a `window`, and a `window` without
 * `navigator.locks` is exactly the browser the account lock refuses to run in.
 */

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { diffPlanMutations, type SyncMutation } from "@/domain/sync";
import { resetOfflineTestState } from "@/test/fixtures/offline";
import { storedPlan } from "@/test/fixtures/plans";
import { mergePlansWithLocalIntent } from "@/components/sync-state";
import { queuedMutations, startupPlanState } from "./database";
import {
  discardUnloadJournal,
  pendingUnloadJournal,
  recordUnloadJournal,
} from "./unload-journal";

const USER = "user-a";
const CATEGORY_ID = "00000000-0000-4000-8000-000000000003";
const JOURNAL_KEY = `kyle-financial-unload:${USER}`;

/** `localStorage`, played straight: synchronous, string-keyed, string-valued. */
function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, String(value));
    },
    removeItem: (key) => {
      entries.delete(key);
    },
    clear: () => entries.clear(),
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(async () => {
  // `resetOfflineTestState` unstubs globals, so the journal goes with it.
  await resetOfflineTestState();
});

function category(name: string, amountCents = 60_000) {
  return {
    id: CATEGORY_ID,
    name,
    group: "Needs" as const,
    cadence: "monthly" as const,
    amountCents,
    sortOrder: 0,
    guidanceBucket: "needs" as const,
    colorToken: "blue" as const,
    archived: false,
  };
}

/** The mutations `unflushedIntentMutations` would have handed the flush. */
function renameMutations(from: string, to: string): SyncMutation[] {
  let id = 0;
  return diffPlanMutations(
    storedPlan(2026, { expenses: [category(from)] }),
    storedPlan(2026, { expenses: [category(to)] }),
    "2026-07-12T00:00:30.000Z",
    () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
  );
}

describe("the launch after a document that ended mid-edit", () => {
  it("moves the journal into the outbox and reports it as pending intent", async () => {
    const server = [storedPlan(2026, { expenses: [category("Groceries")] })];
    const parked = renameMutations("Groceries", "Supermarket");
    expect(recordUnloadJournal(USER, parked)).toBe(true);

    const startup = await startupPlanState(USER, server);

    expect(startup.pendingMutations).toEqual(parked);
    expect(await queuedMutations(USER)).toEqual(parked);
  });

  /** The value the reader typed is what the surface shows on the next launch. */
  it("puts the edit back on screen through the ordinary local-intent merge", async () => {
    const server = [storedPlan(2026, { expenses: [category("Groceries")] })];
    recordUnloadJournal(USER, renameMutations("Groceries", "Supermarket"));

    const startup = await startupPlanState(USER, server);
    const merged = mergePlansWithLocalIntent(
      server,
      startup.cachedPlans,
      startup.pendingMutations,
    );

    expect(merged[0].expenses[0].name).toBe("Supermarket");
  });

  it("empties the journal once the outbox holds it", async () => {
    recordUnloadJournal(USER, renameMutations("Groceries", "Supermarket"));

    await startupPlanState(USER, [
      storedPlan(2026, { expenses: [category("Groceries")] }),
    ]);

    expect(pendingUnloadJournal(USER).mutations).toEqual([]);
  });

  /**
   * Draining twice must not duplicate. The outbox keys by `mutationId`, so a
   * journal that survived a failed drain and is taken again is a no-op — which
   * is what makes clearing it *after* the transaction commits the safe order.
   */
  it("is idempotent when the same journal is drained twice", async () => {
    const server = [storedPlan(2026, { expenses: [category("Groceries")] })];
    const parked = renameMutations("Groceries", "Supermarket");
    recordUnloadJournal(USER, parked);

    await startupPlanState(USER, server);
    recordUnloadJournal(USER, parked);
    await startupPlanState(USER, server);

    expect(await queuedMutations(USER)).toEqual(parked);
  });

  it("leaves a launch with no journal exactly as it was", async () => {
    const server = [storedPlan(2026, { expenses: [category("Groceries")] })];

    const startup = await startupPlanState(USER, server);

    expect(startup.pendingMutations).toEqual([]);
    expect(startup.cachedPlans[0].expenses[0].name).toBe("Groceries");
  });
});

describe("the journal itself", () => {
  it("round-trips mutations byte-for-byte", () => {
    const parked = renameMutations("Groceries", "Supermarket");

    recordUnloadJournal(USER, parked);

    expect(pendingUnloadJournal(USER).mutations).toEqual(parked);
  });

  /**
   * Safari with storage blocked throws on the *property*, not the call, so
   * every entry point has to survive reading it. A browser with no synchronous
   * durable store must degrade to the old best-effort flush, never throw inside
   * a `pagehide` handler — an exception there would take the `keepalive` POST
   * down with it and lose the edit twice over.
   */
  it("reports failure rather than throwing when there is no durable store", () => {
    const parked = renameMutations("Groceries", "Supermarket");
    vi.stubGlobal("localStorage", {
      get getItem(): never {
        throw new DOMException("denied", "SecurityError");
      },
    });

    expect(recordUnloadJournal(USER, parked)).toBe(false);
    expect(pendingUnloadJournal(USER).mutations).toEqual([]);
    expect(() => discardUnloadJournal(USER)).not.toThrow();
  });

  it("reports failure rather than throwing when the quota refuses the write", () => {
    const parked = renameMutations("Groceries", "Supermarket");
    vi.stubGlobal("localStorage", {
      ...memoryStorage(),
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    });

    expect(recordUnloadJournal(USER, parked)).toBe(false);
  });

  /**
   * A value nothing can parse is an edit that is already gone. It used to be
   * swallowed and left in place: no mutations, no notice, and the bytes still
   * squatting in the quota for the next writer to fail against.
   */
  it("removes a journal some other writer corrupted, and says so", () => {
    localStorage.setItem(JOURNAL_KEY, "{not json");

    const read = pendingUnloadJournal(USER);

    expect(read.mutations).toEqual([]);
    expect(read.unreadable).toBe(true);
    expect(localStorage.getItem(JOURNAL_KEY)).toBeNull();
  });
});

/**
 * The quota path, which is the one place a park can decide what to destroy.
 *
 * It used to re-write the new mutations alone and return `true`: every entry
 * another tab had parked deleted, deterministically, no race required, and the
 * honesty path skipped because the call reported success. That is the exact
 * invariant `dropJournalledMutations` takes ids for, violated from the other
 * side, so these assertions are on `localStorage` contents rather than on any
 * return value alone — the bytes are the thing that was being lost.
 */
describe("a park that runs out of quota", () => {
  /** A mutation `recordUnloadJournal` in this document never handed over. */
  function foreignEntry(mutationId: string, cents: number): SyncMutation {
    return {
      mutationId,
      planYear: 2026,
      field: "grossSalaryCents",
      value: cents,
      updatedAt: "2026-07-12T00:00:10.000Z",
      baseVersion: null,
    };
  }

  const parkedIds = () =>
    pendingUnloadJournal(USER).mutations.map(({ mutationId }) => mutationId);

  /**
   * A store already holding `parked`, that takes a journal of up to `limit`
   * entries and throws `QuotaExceededError` on anything longer: a journal that
   * has grown to the edge of what the origin is allowed.
   */
  function quotaCappedStorage(
    limit: number,
    parked: readonly SyncMutation[],
  ): Storage {
    const real = memoryStorage();
    real.setItem(
      JOURNAL_KEY,
      JSON.stringify({
        parkedAt: new Date().toISOString(),
        mutations: parked,
      }),
    );
    return {
      get length() {
        return real.length;
      },
      key: (index) => real.key(index),
      clear: () => real.clear(),
      getItem: (key) => real.getItem(key),
      removeItem: (key) => real.removeItem(key),
      setItem: (key, value) => {
        const entries: unknown[] =
          key === JOURNAL_KEY
            ? (JSON.parse(String(value)).mutations ?? [])
            : [];
        if (entries.length > limit)
          throw new DOMException("quota", "QuotaExceededError");
        real.setItem(key, String(value));
      },
    };
  }

  const FOREIGN = "00000000-0000-4000-8000-0000000000f1";
  const OURS_OLD = "00000000-0000-4000-8000-0000000000a1";

  it("refuses rather than deleting the only entry another tab parked", () => {
    const ours = renameMutations("Groceries", "TAB-B-PARKED");
    vi.stubGlobal(
      "localStorage",
      quotaCappedStorage(1, [foreignEntry(FOREIGN, 11_100_000)]),
    );
    // Precondition: the foreign entry is genuinely parked, and the store
    // genuinely refuses a two-entry journal.
    expect(parkedIds()).toEqual([FOREIGN]);

    // Nothing of ours is parked, so there is nothing this document may evict.
    expect(recordUnloadJournal(USER, ours, new Set())).toBe(false);
    expect(parkedIds()).toEqual([FOREIGN]);
  });

  /**
   * When there *is* something of ours to give up, the eviction takes it and the
   * park succeeds — the foreign entry is never the thing that pays.
   */
  it("evicts this document's own oldest entry and keeps the foreign one", () => {
    const ours = renameMutations("Groceries", "TAB-B-NEWEST");
    vi.stubGlobal(
      "localStorage",
      quotaCappedStorage(2, [
        foreignEntry(OURS_OLD, 22_200_000),
        foreignEntry(FOREIGN, 11_100_000),
      ]),
    );
    expect(parkedIds()).toEqual([OURS_OLD, FOREIGN]);

    expect(recordUnloadJournal(USER, ours, new Set([OURS_OLD]))).toBe(true);
    expect(parkedIds()).toEqual([FOREIGN, ours[0].mutationId]);
  });

  /**
   * A `setItem` that returns without throwing is only a claim. The caller is
   * about to tell the reader the edit is parked on the strength of it, so the
   * value is read straight back and a disagreement is reported as a failure.
   */
  it("reports failure when the store accepts the write and does not keep it", () => {
    const ours = renameMutations("Groceries", "NEVER-LANDED");
    vi.stubGlobal("localStorage", {
      ...memoryStorage(),
      setItem: () => {},
    });

    expect(recordUnloadJournal(USER, ours)).toBe(false);
  });
});

/**
 * Blocked storage is a property of the context, not an event, so a launch can
 * ask about it up front — which is what makes the blocked case honestly
 * reportable at all. The signal a dying document raises is published into
 * memory that dies with it.
 */
describe("whether there is anywhere to park at all", () => {
  it("is reported by a launch whose storage property throws", async () => {
    vi.stubGlobal("localStorage", {
      get getItem(): never {
        throw new DOMException("denied", "SecurityError");
      },
    });

    const startup = await startupPlanState(USER, []);

    expect(startup.parkingUnavailable).toBe(true);
  });

  /** Reads fine, refuses every write: as unable to carry an edit as a throw. */
  it("is reported by a launch whose storage reads but refuses to write", async () => {
    vi.stubGlobal("localStorage", {
      ...memoryStorage(),
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    });

    const startup = await startupPlanState(USER, []);

    expect(startup.parkingUnavailable).toBe(true);
  });

  it("is not reported by a launch whose storage takes a write", async () => {
    const startup = await startupPlanState(USER, []);

    expect(startup.parkingUnavailable).toBe(false);
  });

  it("leaves nothing behind that a later launch could read as parked work", async () => {
    await startupPlanState(USER, []);

    expect(localStorage.getItem("kyle-financial-unload-probe")).toBeNull();
    expect(localStorage.length).toBe(0);
  });
});

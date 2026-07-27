/** @vitest-environment jsdom */

/**
 * What the reader is left holding when the unload flush does not land.
 *
 * Every assertion here is about persistence, never about the DOM. Three rounds
 * of DOM-level assertions went green over three real bugs, and the defect this
 * file exists for is invisible at that level by construction: the document is
 * gone, the chip that lied about it is gone with it, and the only question left
 * is whether the bytes are anywhere a later launch can reach.
 *
 * `fetch` is stubbed rather than injected, so these run the shipping request —
 * `keepalive`, headers, body and all — and the failure modes are the two the
 * audit reproduced against a reverse proxy: a refused server (`503`) and a
 * destroyed connection (a rejected promise, which is what an offline device
 * gives a `keepalive` POST).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncFieldForTarget, type SyncMutation } from "@/domain/sync";
import {
  discardUnloadJournal,
  pendingUnloadJournal,
  recordUnloadJournal,
} from "@/offline/unload-journal";
import { hasDurabilityGap, publishUndurableUnloadIntent } from "./sync-state";
import { flushUnloadIntent, UNLOAD_FLUSH_BUDGET_BYTES } from "./unload-flush";

const ACCOUNT = "account-1";
const PLAN_YEAR = 2026;
const NAME_FIELD = syncFieldForTarget({
  kind: "expense",
  id: "00000000-0000-4000-8000-000000000003",
  property: "name",
});

function mutation(index: number, value: unknown = "Supermarket"): SyncMutation {
  return {
    mutationId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    planYear: PLAN_YEAR,
    field: NAME_FIELD,
    value,
    updatedAt: "2026-07-12T00:00:00.000Z",
    baseVersion: null,
  };
}

/** The bytes the browser would actually be asked to keep alive. */
function bodyBytes(body: unknown): number {
  return new TextEncoder().encode(String(body)).length;
}

interface FlushAttempt {
  url: string;
  keepalive: boolean;
  accountId: string | undefined;
  mutations: SyncMutation[];
  bytes: number;
}

let attempts: FlushAttempt[];

function stubFetch(respond: () => Promise<Response>) {
  attempts = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    attempts.push({
      url,
      keepalive: init.keepalive === true,
      accountId: (init.headers as Record<string, string>)["X-Kyle-Account-Id"],
      mutations: JSON.parse(String(init.body)).mutations,
      bytes: bodyBytes(init.body),
    });
    return respond();
  });
}

beforeEach(() => {
  discardUnloadJournal(ACCOUNT);
  publishUndurableUnloadIntent(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  discardUnloadJournal(ACCOUNT);
  publishUndurableUnloadIntent(false);
});

describe("a flush the network refuses still leaves the edit recoverable", () => {
  /**
   * N3 as the audit reproduced it, minus the browser: the connection is
   * destroyed at the moment of unload, so the `keepalive` POST never completes
   * and nobody is alive to retry it. Before this wave the mutation existed
   * nowhere afterwards — "on the server: no | in the outbox: no | on screen:
   * no" — while the chip read `Saved`.
   */
  it("journals the mutation when the connection is destroyed", () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    flushUnloadIntent(ACCOUNT, [mutation(1)]);

    expect(pendingUnloadJournal(ACCOUNT).mutations).toEqual([mutation(1)]);
  });

  it("journals the mutation when the server refuses the request", () => {
    stubFetch(() => Promise.resolve(new Response("{}", { status: 503 })));

    flushUnloadIntent(ACCOUNT, [mutation(1)]);

    expect(pendingUnloadJournal(ACCOUNT).mutations).toEqual([mutation(1)]);
  });

  /**
   * Ordering is the whole guarantee. An `await`ed IndexedDB transaction cannot
   * finish inside `pagehide`, and neither can anything that waits on the
   * response: the durable write has to be on disk *before* the request is even
   * handed to the browser, whatever the network then does. So this reads the
   * journal from inside `fetch` itself, which is the earliest moment anything
   * downstream of the durable write can observe.
   */
  it("has already journalled before the request is even attempted", () => {
    const journalAtRequestTime: SyncMutation[][] = [];
    vi.stubGlobal("fetch", () => {
      journalAtRequestTime.push(pendingUnloadJournal(ACCOUNT).mutations);
      return Promise.reject(new TypeError("Failed to fetch"));
    });

    flushUnloadIntent(ACCOUNT, [mutation(1)]);

    expect(journalAtRequestTime).toEqual([[mutation(1)]]);
    expect(pendingUnloadJournal(ACCOUNT).mutations).toEqual([mutation(1)]);
  });

  /** A second ending before any launch drains the first must not erase it. */
  it("keeps an earlier unload's edit when a second unload lands on top", () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    flushUnloadIntent(ACCOUNT, [mutation(1, "Supermarket")]);
    flushUnloadIntent(ACCOUNT, [mutation(2, 41_000)]);

    expect(pendingUnloadJournal(ACCOUNT).mutations).toEqual([
      mutation(1, "Supermarket"),
      mutation(2, 41_000),
    ]);
  });

  it("still hands the bytes to the network as the fast path", () => {
    stubFetch(() => Promise.resolve(new Response("{}", { status: 200 })));

    flushUnloadIntent(ACCOUNT, [mutation(1)]);

    expect(attempts).toHaveLength(1);
    expect(attempts[0].url).toBe("/api/sync");
    expect(attempts[0].keepalive).toBe(true);
    expect(attempts[0].accountId).toBe(ACCOUNT);
    expect(attempts[0].mutations).toEqual([mutation(1)]);
  });

  it("does nothing at all when there is no edit to carry", () => {
    stubFetch(() => Promise.resolve(new Response("{}", { status: 200 })));

    flushUnloadIntent(ACCOUNT, []);

    expect(attempts).toEqual([]);
    expect(pendingUnloadJournal(ACCOUNT).mutations).toEqual([]);
  });
});

describe("the flush is budgeted in bytes, because the browser's cap is bytes", () => {
  /**
   * N4. Measured against the audit's reverse proxy, both engines, identical
   * thresholds: a 60 KB `keepalive` body arrives, a 66 KB one silently sends
   * *nothing* — the request is dropped whole, and `.catch(() => {})` swallows
   * the absence. The guard that shipped counted mutations (`slice(0, 500)`),
   * which at the measured 210 B/mutation is ~103 KB, 1.6x past the cap.
   */
  const REAL_MUTATION_BYTES = 210;

  function padded(index: number, bytes: number): SyncMutation {
    const base = mutation(index, "");
    const overhead = new TextEncoder().encode(JSON.stringify(base)).length;
    return mutation(index, "x".repeat(Math.max(0, bytes - overhead)));
  }

  /** As many realistically-sized mutations as a stalled session accumulates. */
  function realisticMutations(count: number): SyncMutation[] {
    return Array.from({ length: count }, (_, index) =>
      padded(index + 1, REAL_MUTATION_BYTES),
    );
  }

  /** How many realistic mutations the budget is worth, envelope included. */
  const budgetedCount = Math.floor(
    (UNLOAD_FLUSH_BUDGET_BYTES - '{"mutations":[]}'.length) /
      (REAL_MUTATION_BYTES + 1),
  );

  /**
   * The cap applies to every `keepalive` body the document has in flight, not
   * to this one request, so the budget has to sit well below 65 536 rather than
   * just beneath it. Driven through the shipping app, Chromium delivered
   * 46 530 B and dropped 47 997 B whole.
   */
  it("keeps the budget under the smallest body ever observed to be dropped", () => {
    expect(UNLOAD_FLUSH_BUDGET_BYTES).toBeLessThan(46_530);
  });

  it("sends a body just under the budget whole", () => {
    stubFetch(() => Promise.resolve(new Response("{}", { status: 200 })));
    const mutations = realisticMutations(budgetedCount);
    const wholeBody = bodyBytes(JSON.stringify({ mutations }));
    expect(wholeBody).toBeLessThanOrEqual(UNLOAD_FLUSH_BUDGET_BYTES);

    flushUnloadIntent(ACCOUNT, mutations);

    expect(attempts).toHaveLength(1);
    expect(attempts[0].bytes).toBe(wholeBody);
    expect(attempts[0].mutations).toHaveLength(budgetedCount);
  });

  /** One more than fits: the body must shrink, not cross the line. */
  it("stops one short rather than sending a body over the budget", () => {
    stubFetch(() => Promise.resolve(new Response("{}", { status: 200 })));
    const mutations = realisticMutations(budgetedCount + 1);

    flushUnloadIntent(ACCOUNT, mutations);

    expect(attempts[0].mutations).toHaveLength(budgetedCount);
    expect(attempts[0].bytes).toBeLessThanOrEqual(UNLOAD_FLUSH_BUDGET_BYTES);
    expect(pendingUnloadJournal(ACCOUNT).mutations).toHaveLength(
      budgetedCount + 1,
    );
  });

  /**
   * The count guard let 500 through — ~103 KB, which arrives as nothing. The
   * byte guard must instead send a body the browser will carry, and the
   * remainder may not be dropped: it goes to the durable path, which is the
   * whole point of N3.
   */
  it("never puts a body over the budget on the wire, at 500 mutations", () => {
    stubFetch(() => Promise.resolve(new Response("{}", { status: 200 })));
    const mutations = realisticMutations(500);
    expect(bodyBytes(JSON.stringify({ mutations }))).toBeGreaterThan(64 * 1024);

    flushUnloadIntent(ACCOUNT, mutations);

    expect(attempts).toHaveLength(1);
    expect(attempts[0].bytes).toBeLessThanOrEqual(UNLOAD_FLUSH_BUDGET_BYTES);
  });

  it("journals every mutation the wire could not carry", () => {
    stubFetch(() => Promise.resolve(new Response("{}", { status: 200 })));
    const mutations = realisticMutations(500);

    flushUnloadIntent(ACCOUNT, mutations);

    const journalled = pendingUnloadJournal(ACCOUNT).mutations;
    expect(journalled).toHaveLength(500);
    const sentIds = new Set(
      attempts[0].mutations.map(({ mutationId }) => mutationId),
    );
    const deferred = mutations.filter(
      ({ mutationId }) => !sentIds.has(mutationId),
    );
    expect(deferred.length).toBeGreaterThan(0);
    for (const dropped of deferred) expect(journalled).toContainEqual(dropped);
  });

  /**
   * A single mutation nothing can carry — a whole benefit or expense row
   * replaced wholesale — must not take the flush down with it. Nothing goes on
   * the wire and everything goes to the journal, which is the honest outcome.
   */
  it("sends nothing and journals everything when one mutation exceeds the budget", () => {
    stubFetch(() => Promise.resolve(new Response("{}", { status: 200 })));
    const enormous = padded(1, UNLOAD_FLUSH_BUDGET_BYTES + 5_000);

    flushUnloadIntent(ACCOUNT, [enormous]);

    expect(attempts).toEqual([]);
    expect(pendingUnloadJournal(ACCOUNT).mutations).toEqual([enormous]);
  });
});

/**
 * The half of the guarantee `localStorage` cannot always deliver.
 *
 * The journal is the only durable carrier a dying document has, so a browser
 * that refuses it — storage partitioned away, storage disabled, quota full —
 * leaves the edit riding on a `keepalive` POST nobody is alive to read the
 * answer to. Wave 11 already computed that fact and then discarded it: the
 * boolean `recordUnloadJournal` returns was dropped on the floor at the call
 * site, and the chip went on reading `Saved` over an edit that reached no
 * buffer, no journal, no outbox and no server. The audit measured it lost 3/3.
 *
 * There is no third carrier to invent. What there is, is the truth: when the
 * park did not happen, the session must stop claiming the edit is safe.
 */
describe("a flush with nowhere durable to park the edit", () => {
  function blockedStorage(): Storage {
    return {
      get getItem(): never {
        throw new DOMException("denied", "SecurityError");
      },
    } as unknown as Storage;
  }

  function quotaExhaustedStorage(): Storage {
    return {
      ...localStorage,
      getItem: () => null,
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
      removeItem: () => {},
    } as unknown as Storage;
  }

  /**
   * The invariant, in one line: an edit handed to the flush is either on disk
   * or the session knows it is not. Never lost *and* reported saved.
   */
  it("reports the edit as undurable when storage is blocked", () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    vi.stubGlobal("localStorage", blockedStorage());

    flushUnloadIntent(ACCOUNT, [mutation(1)]);

    expect(pendingUnloadJournal(ACCOUNT).mutations).toEqual([]);
    expect(hasDurabilityGap()).toBe(true);
  });

  it("reports the edit as undurable when the quota refuses the write", () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    vi.stubGlobal("localStorage", quotaExhaustedStorage());

    flushUnloadIntent(ACCOUNT, [mutation(1)]);

    expect(hasDurabilityGap()).toBe(true);
  });

  /**
   * A store that still takes a short journal and refuses a longer one — a
   * journal that has grown to the edge of the origin's allowance, which is what
   * "quota exceeded" looks like in the field far more often than a store that
   * refuses everything.
   */
  function journalCappedStorage(limit: number): Storage {
    const real = localStorage;
    return {
      get length() {
        return real.length;
      },
      key: (index) => real.key(index),
      clear: () => real.clear(),
      getItem: (key) => real.getItem(key),
      removeItem: (key) => real.removeItem(key),
      setItem: (key, value) => {
        const entries: unknown[] = JSON.parse(String(value)).mutations ?? [];
        if (entries.length > limit)
          throw new DOMException("quota", "QuotaExceededError");
        real.setItem(key, String(value));
      },
    };
  }

  /**
   * The quota path is the one place a park chooses what to destroy, and it used
   * to choose another tab's edit — re-writing the new mutations alone, deleting
   * every foreign entry, and returning success so this signal never fired.
   */
  it("keeps another tab's parked edit rather than clobbering it for room", () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    // An id no flush in this file has ever parked, so it is foreign to this
    // document in the sense the eviction policy actually uses.
    const foreign = mutation(424_242, "OTHER-TAB");
    recordUnloadJournal(ACCOUNT, [foreign]);
    expect(pendingUnloadJournal(ACCOUNT).mutations).toEqual([foreign]);
    vi.stubGlobal("localStorage", journalCappedStorage(1));

    flushUnloadIntent(ACCOUNT, [mutation(1)]);

    expect(pendingUnloadJournal(ACCOUNT).mutations).toEqual([foreign]);
    expect(hasDurabilityGap()).toBe(true);
  });

  /**
   * Our own earlier entry is a different matter: this document is still alive
   * and still holds it, so it is the cheapest thing in the journal to give up.
   */
  it("gives up its own earlier entry to make room, and stays durable", () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    flushUnloadIntent(ACCOUNT, [mutation(1, "OURS-EARLIER")]);
    expect(pendingUnloadJournal(ACCOUNT).mutations).toEqual([
      mutation(1, "OURS-EARLIER"),
    ]);
    vi.stubGlobal("localStorage", journalCappedStorage(1));

    flushUnloadIntent(ACCOUNT, [mutation(2, "OURS-NEWEST")]);

    expect(pendingUnloadJournal(ACCOUNT).mutations).toEqual([
      mutation(2, "OURS-NEWEST"),
    ]);
    expect(hasDurabilityGap()).toBe(false);
  });

  /**
   * A landed POST is not a durable carrier: it is fire-and-forget, the document
   * is gone before any response arrives, and the audit's own transcript shows
   * the request dropped at the socket with the page none the wiser.
   */
  it("reports the edit as undurable even when the wire accepted it", () => {
    stubFetch(() => Promise.resolve(new Response("{}", { status: 200 })));
    vi.stubGlobal("localStorage", blockedStorage());

    flushUnloadIntent(ACCOUNT, [mutation(1)]);

    expect(attempts).toHaveLength(1);
    expect(hasDurabilityGap()).toBe(true);
  });

  it("claims nothing about durability when the park succeeded", () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    flushUnloadIntent(ACCOUNT, [mutation(1)]);

    expect(pendingUnloadJournal(ACCOUNT).mutations).toEqual([mutation(1)]);
    expect(hasDurabilityGap()).toBe(false);
  });
});

/**
 * A `pagehide` the document survives is the ordinary case on the shipping
 * target, not the exception: iOS backgrounds a PWA by firing `pagehide` and
 * then keeps the process alive. Wave 11 left the journal armed through every
 * one of those cycles, which is what made the ordering blocker reachable
 * without anything exotic happening at all.
 *
 * The release is scoped to what *this* document parked. Another tab's parked
 * edit has never been adopted by anyone and is not this document's to discard.
 */
describe("a document that survives the ending it flushed for", () => {
  it("releases what it parked once the document comes back", () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    flushUnloadIntent(ACCOUNT, [mutation(1)]);
    expect(pendingUnloadJournal(ACCOUNT).mutations).toEqual([mutation(1)]);

    window.dispatchEvent(new Event("pageshow"));

    expect(pendingUnloadJournal(ACCOUNT).mutations).toEqual([]);
  });

  it("leaves an entry another document parked exactly where it was", () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    recordUnloadJournal(ACCOUNT, [mutation(9, "OTHER-TAB")]);
    flushUnloadIntent(ACCOUNT, [mutation(1)]);

    window.dispatchEvent(new Event("pageshow"));

    expect(pendingUnloadJournal(ACCOUNT).mutations).toEqual([
      mutation(9, "OTHER-TAB"),
    ]);
  });

  /** Re-arming: a second ending parks again, and a second survival releases. */
  it("re-arms and releases again across a second ending", () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    flushUnloadIntent(ACCOUNT, [mutation(1)]);
    window.dispatchEvent(new Event("pageshow"));

    flushUnloadIntent(ACCOUNT, [mutation(2, 41_000)]);
    expect(pendingUnloadJournal(ACCOUNT).mutations).toEqual([
      mutation(2, 41_000),
    ]);
    window.dispatchEvent(new Event("pageshow"));

    expect(pendingUnloadJournal(ACCOUNT).mutations).toEqual([]);
  });
});

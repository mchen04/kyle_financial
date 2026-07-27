/**
 * Where a journalled edit lands in the order the *server* judges by.
 *
 * The journal is written by a document that is already dying, so everything in
 * it is older than whatever the surviving session has queued since. Adoption
 * therefore has one job beyond durability: it must not turn old intent into the
 * newest write. The audit found it doing exactly that — an adopted entry was
 * appended at the outbox tail and stamped one millisecond past the newest
 * delivery, so a rename the reader had *just* committed in another tab was
 * overwritten by a rename a closed tab had parked minutes earlier.
 *
 * These tests are read from Postgres, not from the outbox: the client pipeline
 * runs for real (journal → `startupPlanState` → `compactedMutationBatch`) and
 * the batch it produces is handed to the real `applySyncMutations`, so the
 * assertion is the row the database ends up holding. That is the only oracle
 * that can see this defect at all — every intermediate layer looked correct
 * while the server ended on the stale value.
 *
 * Node environment with `localStorage` supplied, like the other offline tests.
 */

import "fake-indexeddb/auto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { syncFieldForTarget, type SyncMutation } from "@/domain/sync";
import { createUser } from "@/server/auth/repository";
import { getPlanByYear } from "@/server/plans/repository";
import { applySyncMutations } from "@/server/sync/repository";
import { testSql } from "@/test/database";
import { createPlanWithDefaults } from "@/test/plan-repository";
import { resetOfflineTestState } from "@/test/fixtures/offline";
import { compactedMutationBatch, enqueueMutations } from "./outbox";
import { startupPlanState } from "./plan-cache";
import {
  pendingUnloadJournal,
  recordUnloadJournal,
  UNLOAD_JOURNAL_MAX_AGE_MS,
} from "./unload-journal";

const sql = testSql();

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
  await resetOfflineTestState(["user-a"]);
});

afterAll(async () => {
  await sql.end();
});

const PLAN_YEAR = 2046;
const USER = "user-a";
/** Old intent, parked by a tab that closed. */
const TAB_B_AT = "2026-07-12T00:00:20.808Z";
/** Newer intent, gesture-committed in a tab that was still open. */
const TAB_A_AT = "2026-07-12T00:00:22.842Z";

let nextId = 0;
function mutationId(): string {
  return `00000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`;
}

async function seedServerPlan() {
  const user = await createUser(
    sql,
    `journal-order-${++nextId}@example.com`,
    "journal ordering password",
  );
  const plan = await createPlanWithDefaults(sql, user.id, {
    year: PLAN_YEAR,
    stateCode: "CA",
    filingStatus: "single",
    grossSalaryCents: 10_000_000,
    additionalWageIncomeCents: 0,
    spouseWageIncomeCents: 0,
    otherOrdinaryIncomeCents: 0,
    hsaCoverage: "self",
  });
  return { user, plan, categoryId: plan.expenses[0].id };
}

function rename(
  categoryId: string,
  value: string,
  updatedAt: string,
): SyncMutation {
  return {
    mutationId: mutationId(),
    planYear: PLAN_YEAR,
    field: syncFieldForTarget({
      kind: "expense",
      id: categoryId,
      property: "name",
    }),
    value,
    updatedAt,
    baseVersion: null,
  };
}

async function serverCategoryName(userId: string, categoryId: string) {
  const plan = await getPlanByYear(sql, userId, PLAN_YEAR);
  return plan?.expenses.find(({ id }) => id === categoryId)?.name;
}

describe("a journalled edit against a newer edit the session already queued", () => {
  /**
   * The blocker, reduced to two ordinary tabs and no synthetic events. Tab B
   * closed holding "TAB-B-STALE"; tab A then committed "TAB-A-NEWEST" by
   * gesture and queued it. The next launch adopts the journal, and the server
   * has to finish on the edit the reader made most recently.
   */
  it("lets the newer queued edit win at the server after the journal is adopted", async () => {
    const { user, plan, categoryId } = await seedServerPlan();
    expect(await serverCategoryName(user.id, categoryId)).toBe(
      plan.expenses[0].name,
    );

    recordUnloadJournal(USER, [rename(categoryId, "TAB-B-STALE", TAB_B_AT)]);
    await enqueueMutations(USER, [
      rename(categoryId, "TAB-A-NEWEST", TAB_A_AT),
    ]);

    await startupPlanState(USER, []);
    const batch = await compactedMutationBatch(USER);
    await applySyncMutations(sql, user.id, batch);

    expect(await serverCategoryName(user.id, categoryId)).toBe("TAB-A-NEWEST");
  });

  /**
   * The mechanism, stated directly: no adopted entry may be delivered with a
   * timestamp newer than an edit that was made after it. The audit read
   * `delivered=…22.843Z intent=…20.808Z` off the wire — a stale intent handed
   * to the server one millisecond past the reader's newest edit.
   */
  it("never delivers the adopted entry newer than the edit that followed it", async () => {
    const { categoryId } = await seedServerPlan();
    recordUnloadJournal(USER, [rename(categoryId, "TAB-B-STALE", TAB_B_AT)]);
    await enqueueMutations(USER, [
      rename(categoryId, "TAB-A-NEWEST", TAB_A_AT),
    ]);

    await startupPlanState(USER, []);
    const batch = await compactedMutationBatch(USER);

    const stale = batch.filter(({ value }) => value === "TAB-B-STALE");
    const newest = batch.find(({ value }) => value === "TAB-A-NEWEST");
    expect(newest?.updatedAt).toBe(TAB_A_AT);
    for (const entry of stale)
      expect(Date.parse(entry.updatedAt)).toBeLessThan(Date.parse(TAB_A_AT));
  });

  /** The reader's own screen must agree with the server about which is newer. */
  it("orders the adopted entry before the newer edit in the pending intent", async () => {
    const { categoryId } = await seedServerPlan();
    recordUnloadJournal(USER, [rename(categoryId, "TAB-B-STALE", TAB_B_AT)]);
    await enqueueMutations(USER, [
      rename(categoryId, "TAB-A-NEWEST", TAB_A_AT),
    ]);

    const startup = await startupPlanState(USER, []);

    expect(startup.pendingMutations.map(({ value }) => value)).toEqual([
      "TAB-B-STALE",
      "TAB-A-NEWEST",
    ]);
  });

  /**
   * The journal is not always the older side. An edit parked after everything
   * already queued is the newest thing the reader did, and it still has to win.
   */
  it("still lets a journalled edit win when it is the newest intent", async () => {
    const { user, categoryId } = await seedServerPlan();
    await enqueueMutations(USER, [
      rename(categoryId, "QUEUED-OLDER", TAB_B_AT),
    ]);
    recordUnloadJournal(USER, [rename(categoryId, "PARKED-NEWEST", TAB_A_AT)]);

    await startupPlanState(USER, []);
    await applySyncMutations(sql, user.id, await compactedMutationBatch(USER));

    expect(await serverCategoryName(user.id, categoryId)).toBe("PARKED-NEWEST");
  });

  /**
   * Re-sending is what makes the journal safe to write unconditionally: the
   * keepalive copy and the journalled copy share a `mutationId`, and the
   * server's receipt table applies it once however many times it arrives.
   */
  it("applies the same adopted mutation once however often it is re-sent", async () => {
    const { user, categoryId } = await seedServerPlan();
    recordUnloadJournal(USER, [rename(categoryId, "PARKED-ONCE", TAB_B_AT)]);

    await startupPlanState(USER, []);
    const batch = await compactedMutationBatch(USER);
    for (let attempt = 0; attempt < 3; attempt += 1)
      await applySyncMutations(sql, user.id, batch);

    expect(await serverCategoryName(user.id, categoryId)).toBe("PARKED-ONCE");
  });
});

describe("the journal's lifetime", () => {
  it("is emptied once the outbox holds what it carried", async () => {
    const { categoryId } = await seedServerPlan();
    recordUnloadJournal(USER, [rename(categoryId, "CARRIED", TAB_B_AT)]);

    await startupPlanState(USER, []);

    expect(pendingUnloadJournal(USER).mutations).toEqual([]);
  });

  /**
   * A journal nothing ever drained must not sit in `localStorage` forever
   * waiting to ambush a launch months later. The clock runs from the park: the
   * carry it exists for takes seconds.
   */
  it("drops a journal parked longer ago than its lifetime, and removes the value", () => {
    const stale: SyncMutation = {
      mutationId: mutationId(),
      planYear: PLAN_YEAR,
      field: "grossSalaryCents",
      value: 12_345_600,
      updatedAt: TAB_B_AT,
      baseVersion: null,
    };
    localStorage.setItem(
      `kyle-financial-unload:${USER}`,
      JSON.stringify({
        parkedAt: new Date(
          Date.now() - UNLOAD_JOURNAL_MAX_AGE_MS - 1_000,
        ).toISOString(),
        mutations: [stale],
      }),
    );

    expect(pendingUnloadJournal(USER).mutations).toEqual([]);
    expect(localStorage.getItem(`kyle-financial-unload:${USER}`)).toBeNull();
  });

  it("keeps a journal parked inside its lifetime", () => {
    const fresh: SyncMutation = {
      mutationId: mutationId(),
      planYear: PLAN_YEAR,
      field: "grossSalaryCents",
      value: 12_345_600,
      updatedAt: TAB_B_AT,
      baseVersion: null,
    };
    localStorage.setItem(
      `kyle-financial-unload:${USER}`,
      JSON.stringify({
        parkedAt: new Date(
          Date.now() - UNLOAD_JOURNAL_MAX_AGE_MS + 60_000,
        ).toISOString(),
        mutations: [fresh],
      }),
    );

    expect(pendingUnloadJournal(USER).mutations).toEqual([fresh]);
  });

  /**
   * A value that cannot be parsed is an edit that is already lost. Leaving it
   * in place squats in the quota and hides the loss; the launch has to remove
   * it and say so, so the chip cannot go on reading `Saved` over it.
   */
  it("removes a corrupt value and reports the journal as unreadable", async () => {
    localStorage.setItem(`kyle-financial-unload:${USER}`, "{not json");

    const read = pendingUnloadJournal(USER);

    expect(read.mutations).toEqual([]);
    expect(read.unreadable).toBe(true);
    expect(localStorage.getItem(`kyle-financial-unload:${USER}`)).toBeNull();
  });

  it("reports an unreadable journal through the launch that found it", async () => {
    localStorage.setItem(`kyle-financial-unload:${USER}`, "{not json");

    const startup = await startupPlanState(USER, []);

    expect(startup.unreadableJournal).toBe(true);
  });

  it("reports nothing unreadable on an ordinary launch", async () => {
    const startup = await startupPlanState(USER, []);

    expect(startup.unreadableJournal).toBe(false);
  });
});

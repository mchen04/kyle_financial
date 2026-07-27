import { z } from "zod";
import { syncMutationSchema, type SyncMutation } from "@/domain/sync";

/**
 * The one durable write a dying document can still make.
 *
 * Everything this app normally persists with is asynchronous: the outbox
 * transaction sits behind two Web Locks and an IndexedDB commit, and `pagehide`
 * outlives none of it. That left the unload flush's `keepalive` POST as the sole
 * carrier of a just-committed edit, so a refused server or a dropped connection
 * at the instant of a pull-to-refresh lost the edit outright — not on the
 * server, not in the outbox, not on screen.
 *
 * `localStorage` is the exception the platform gives us: it is *synchronous*, so
 * the bytes are committed before the handler returns, and it survives the
 * document and the process. It is deliberately not a second source of truth —
 * it is a one-hop parking space between a `pagehide` and the next launch, which
 * moves everything it finds into the real outbox before anything reads a plan.
 *
 * Re-sending is safe, which is what makes "journal everything, send what fits"
 * the right shape: a mutation is keyed by its own id and the server's receipt
 * table applies it once however many copies arrive. The journal may therefore be
 * written unconditionally and the `keepalive` POST demoted to a best-effort
 * accelerator.
 *
 * **One hop, and only one.** Everything below exists to keep it that way. An
 * entry that outlives the hop it was written for stops being a rescue and
 * becomes a landmine: wave 11 had no way at all to clear the journal short of a
 * launch draining it, so every iOS background/resume cycle — which fires
 * `pagehide` and then keeps the process running — left a parked edit armed to
 * detonate at the next launch against work the reader had done since. The
 * lifetime is bounded from three directions now: the launch that adopts the
 * entries clears them, the document that survives releases what it parked (see
 * `dropJournalledMutations`), and anything that escapes both ages out here.
 */

/**
 * How long a parked journal stays credible, measured from the park.
 *
 * The journey it exists for — `pagehide`, relaunch, adoption — takes seconds. A
 * day is therefore enormous slack for the honest case and still short enough
 * that a journal no launch ever drained cannot resurface against a week of
 * later edits.
 *
 * The clock is the moment of the park, not the mutation's `updatedAt`. Those
 * are different questions: `updatedAt` is when the reader made the edit, which
 * the ordering model needs and which a device with a wrong clock or a plan
 * restored from a cache can date well before the park. Age is about how long
 * the *parking space* has been occupied, and only the writer knows that.
 */
export const UNLOAD_JOURNAL_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

function journalKey(userId: string): string {
  return `kyle-financial-unload:${userId}`;
}

/**
 * `localStorage` throws on access, not just on use, in a document whose storage
 * is partitioned away or disabled. Every entry point therefore goes through
 * here, and a browser that has no synchronous durable store degrades to the
 * old best-effort behaviour rather than throwing inside a `pagehide` handler.
 */
function journalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * What a previous document left behind, and whether any of it was destroyed on
 * the way.
 *
 * `unreadable` is the half wave 11 had no word for. A truncated or corrupt
 * value is an edit that is already lost — the parse yields nothing, and the
 * launch that finds it has no way to recover the bytes. Returning an empty list
 * and saying nothing let the chip go on reading `Saved` over it, which is
 * exactly the lie the journal was built to end.
 */
export interface UnloadJournalRead {
  mutations: SyncMutation[];
  unreadable: boolean;
}

/** A parked journal as it sits in storage: when it was parked, and what for. */
const journalEnvelopeSchema = z.object({
  parkedAt: z.iso.datetime(),
  mutations: z.array(z.unknown()),
});

interface ParkedJournal extends UnloadJournalRead {
  parkedAt: string;
}

function readJournal(userId: string, now: number): ParkedJournal {
  const empty = { mutations: [], unreadable: false, parkedAt: "" };
  const storage = journalStorage();
  let raw: string | null = null;
  try {
    raw = storage?.getItem(journalKey(userId)) ?? null;
  } catch {
    return empty;
  }
  if (!raw) return empty;
  const parked = parseJournal(raw);
  if (!parked) {
    // A journal that cannot be read is a journal that cannot be trusted. It is
    // also not a journal anything can ever do anything with, so it is removed
    // rather than left to squat in the quota until the next quota failure.
    removeJournal(storage, userId);
    return { mutations: [], unreadable: true, parkedAt: "" };
  }
  // Ageing out is silent, unlike a value that could not be parsed. It can only
  // happen to a journal no launch reached for a whole day, which means the app
  // was never opened in that time — an entry that was going to be adopted has
  // been adopted long before this, so there is no live edit here to report.
  if (now - Date.parse(parked.parkedAt) > UNLOAD_JOURNAL_MAX_AGE_MS) {
    removeJournal(storage, userId);
    return empty;
  }
  if (parked.lostEntries)
    writeJournal(userId, parked.mutations, parked.parkedAt);
  return {
    mutations: parked.mutations,
    unreadable: parked.lostEntries,
    parkedAt: parked.parkedAt,
  };
}

/**
 * The readable half of a journal value, and whether there was an unreadable
 * half. A value that is not an envelope at all is `null` — nothing survived. An
 * envelope holding entries the schema refuses keeps the rest: an edit that can
 * still be recovered is worth more than tidiness, and the entries that were
 * refused are still a loss the reader has to be told about.
 */
function parseJournal(raw: string): {
  mutations: SyncMutation[];
  lostEntries: boolean;
  parkedAt: string;
} | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const envelope = journalEnvelopeSchema.safeParse(parsed);
  if (!envelope.success) return null;
  const mutations = envelope.data.mutations.flatMap((entry) => {
    const mutation = syncMutationSchema.safeParse(entry);
    return mutation.success ? [mutation.data] : [];
  });
  return {
    mutations,
    lostEntries: mutations.length !== envelope.data.mutations.length,
    parkedAt: envelope.data.parkedAt,
  };
}

function removeJournal(storage: Storage | null, userId: string): void {
  try {
    storage?.removeItem(journalKey(userId));
  } catch {
    // Nothing else to try. A value that can be neither read nor removed is
    // re-read as unreadable on the next launch, which is already the honest
    // answer; it cannot become a mutation.
  }
}

/**
 * Parks `mutations` where the next launch will find them, and reports whether
 * the parking succeeded — the caller has no other way to know that the edit it
 * is about to hand to the network has a fallback at all.
 *
 * Existing entries are kept: two `pagehide`s without an intervening launch (a
 * backgrounded PWA woken and killed again) must not lose the first one.
 *
 * `ownParkedIds` is what this document itself has parked and not yet released,
 * and it is the only basis anything here has for telling its own entries from
 * another tab's. It matters when the quota refuses the appended write. The
 * shape that fix used to take was to re-write the new mutations *alone*, which
 * deleted every entry any other tab had parked and still returned `true`, so
 * the honesty path never fired — the same silent loss the id-scoped release in
 * `dropJournalledMutations` exists to prevent, arrived at from the other side.
 *
 * What the quota path does instead: drop *our own* oldest entries, one at a
 * time, until what is left fits. Our own older entry is the cheapest thing in
 * the journal to lose — this document is still alive and still holds it, either
 * in the outbox already or in the very `mutations` being parked now, because
 * the flush re-derives them from what the device has not stored. Another tab's
 * entry has no such second copy anywhere. If nothing of ours is left to evict
 * and the write still will not fit, we say so (`false`) rather than clobber:
 * the reader is told their edit is unsaved, which is true, instead of being
 * told it is parked while someone else's is destroyed to make room.
 *
 * Defaulting to "nothing of ours is parked" is deliberately the conservative
 * answer: a caller that cannot say which entries are its own evicts none.
 */
export function recordUnloadJournal(
  userId: string,
  mutations: readonly SyncMutation[],
  ownParkedIds: ReadonlySet<string> = new Set(),
): boolean {
  if (mutations.length === 0) return false;
  const ourIds = new Set(mutations.map(({ mutationId }) => mutationId));
  const attempt = () =>
    parkWithoutClobbering(userId, mutations, {
      ourIds,
      evictable: ownParkedIds,
    });
  // `raced` is another document's write landing on top of ours between our
  // `setItem` and the read that verified it. Merging again picks their entry up
  // and puts ours back. A second failure is reported rather than retried
  // forever: a `pagehide` handler is not somewhere to spin.
  const first = attempt();
  if (first !== "raced") return first === "parked";
  return attempt() === "parked";
}

/**
 * What became of one attempt to park. `refused` is the store saying no — quota
 * or blocked; `raced` is the store saying yes and then not holding what it was
 * given, which on this API is indistinguishable from another document writing
 * over us immediately afterwards. They are separated because only the first is
 * worth evicting for and only the second is worth retrying.
 */
type ParkOutcome = "parked" | "raced" | "refused";

function parkWithoutClobbering(
  userId: string,
  mutations: readonly SyncMutation[],
  ids: { ourIds: ReadonlySet<string>; evictable: ReadonlySet<string> },
): ParkOutcome {
  const parkedAt = new Date().toISOString();
  // Read as late as possible before the write. Everything between this call and
  // the `setItem` below is the window another document can write into unseen,
  // and a synchronous `localStorage` offers nothing that closes it — no
  // compare-and-swap, no lock, no transaction.
  const existing = readJournal(userId, Date.now()).mutations.filter(
    ({ mutationId }) => !ids.ourIds.has(mutationId),
  );
  const evictableCount = existing.filter(({ mutationId }) =>
    ids.evictable.has(mutationId),
  ).length;
  for (let evicted = 0; ; evicted += 1) {
    const outcome = writeVerified(
      userId,
      [...withoutOwnOldest(existing, evicted, ids.evictable), ...mutations],
      parkedAt,
      ids.ourIds,
    );
    if (outcome !== "refused" || evicted >= evictableCount) return outcome;
  }
}

/** Drops this document's `count` oldest entries, keeping every foreign one. */
function withoutOwnOldest(
  entries: readonly SyncMutation[],
  count: number,
  evictable: ReadonlySet<string>,
): SyncMutation[] {
  let remaining = count;
  return entries.filter(({ mutationId }) => {
    if (remaining === 0 || !evictable.has(mutationId)) return true;
    remaining -= 1;
    return false;
  });
}

/**
 * Writes, then reads straight back.
 *
 * A `setItem` that returns without throwing is still only a claim, and the
 * caller is about to tell the reader their edit is safe on the strength of it.
 * The read-back is the one check this API affords: it catches a store that
 * accepted the value and did not keep it, and it catches another document
 * whose own park landed on top of ours in the interval.
 */
function writeVerified(
  userId: string,
  mutations: readonly SyncMutation[],
  parkedAt: string,
  ourIds: ReadonlySet<string>,
): ParkOutcome {
  if (!writeJournal(userId, mutations, parkedAt)) return "refused";
  const landed = new Set(
    readJournal(userId, Date.now()).mutations.map(
      ({ mutationId }) => mutationId,
    ),
  );
  return [...ourIds].every((id) => landed.has(id)) ? "parked" : "raced";
}

function writeJournal(
  userId: string,
  mutations: readonly SyncMutation[],
  parkedAt: string,
): boolean {
  try {
    const storage = journalStorage();
    if (!storage) return false;
    if (mutations.length === 0) {
      storage.removeItem(journalKey(userId));
      return true;
    }
    storage.setItem(
      journalKey(userId),
      JSON.stringify({ parkedAt, mutations }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * The one key the journal writes that is not a journal: a value written and
 * removed inside a single call, so it can never be mistaken for parked work.
 */
const PARKING_PROBE_KEY = "kyle-financial-unload-probe";

/**
 * Whether this document has a durable parking space at all.
 *
 * This is the only thing about the unload path that is knowable *before* the
 * unload, and not knowing it was the whole of the blocked-storage lie. The
 * failure signal a dying document raises is published into module memory that
 * dies with the document — there is no render left to show it and nothing on
 * disk to leave behind — and the next launch then read blocked storage as
 * "nothing was parked" rather than "nothing could have been", and asserted
 * `Saved` over an edit that reached no journal, no outbox and no server.
 *
 * Blocked storage is not a transient: it is a property of the context (Safari
 * with "Block All Cookies", a partitioned third-party frame, some enterprise
 * profiles) and it holds for the whole session. So a launch can ask once, up
 * front, and a session that gets `false` can decline to make the claim at all.
 *
 * Asking means writing, not just reading. `localStorage` can throw on the
 * property, on `getItem`, or only on `setItem` when the quota is full, and it
 * is the `setItem` that the park depends on — a store that reads fine and
 * refuses every write is exactly as unable to carry an edit as one that throws
 * on sight.
 */
export function canParkDurably(): boolean {
  const storage = journalStorage();
  if (!storage) return false;
  try {
    storage.setItem(PARKING_PROBE_KEY, "1");
    const kept = storage.getItem(PARKING_PROBE_KEY) === "1";
    storage.removeItem(PARKING_PROBE_KEY);
    return kept;
  } catch {
    return false;
  }
}

/** What a previous document ended holding, for this launch to take over. */
export function pendingUnloadJournal(userId: string): UnloadJournalRead {
  const { mutations, unreadable } = readJournal(userId, Date.now());
  return { mutations, unreadable };
}

/** Called only once the outbox has the mutations, never before. */
export function discardUnloadJournal(userId: string): void {
  removeJournal(journalStorage(), userId);
}

/**
 * Releases exactly the entries one document parked, leaving anyone else's.
 *
 * A document that comes back from the ending it flushed for — bfcache, or an
 * iOS PWA resumed after the `pagehide` that backgrounded it — still holds its
 * edit in memory and still has the ordinary write path underneath it, so its
 * own parked copy has nothing left to rescue. Another tab's parked copy has
 * never been adopted by anyone and is emphatically not this document's to
 * throw away, which is why this takes ids rather than clearing the key.
 */
export function dropJournalledMutations(
  userId: string,
  mutationIds: ReadonlySet<string>,
): void {
  if (mutationIds.size === 0) return;
  const parked = readJournal(userId, Date.now());
  const kept = parked.mutations.filter(
    ({ mutationId }) => !mutationIds.has(mutationId),
  );
  if (kept.length !== parked.mutations.length)
    writeJournal(userId, kept, parked.parkedAt);
}

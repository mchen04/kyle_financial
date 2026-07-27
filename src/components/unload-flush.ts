import { SYNC_BATCH_SIZE, type SyncMutation } from "@/domain/sync";
import {
  dropJournalledMutations,
  recordUnloadJournal,
} from "@/offline/unload-journal";
import { registerDocumentSurvival } from "./document-exit";
import { publishUndurableUnloadIntent } from "./sync-state";

/**
 * Browsers cap the *bytes* of all in-flight `keepalive` bodies at 64 KB and drop
 * a request over it whole — not truncated, not partial, nothing arrives, and a
 * fire-and-forget `.catch()` swallows the absence. Measured against a recording
 * reverse proxy, WebKit and Chromium identical: 60 000 B arrived, 66 000 B sent
 * nothing.
 *
 * The guard this replaces counted mutations (`slice(0, 500)`). At the measured
 * 210 B per real mutation that is ~103 KB, 1.6x past the cap, so the guard fired
 * at 500 while the browser had already stopped sending at ~312 — and truncated
 * silently above 500 on top of that. A count cannot express a byte limit: one
 * whole-row mutation can outweigh a hundred scalar ones.
 *
 * The headroom is not decoration, and it is measured rather than guessed. The
 * cap is on *all* in-flight `keepalive` bodies from the document, not on this
 * one request, so a real unloading page never gets the whole 64 KB. Driven
 * through the shipping app against a recording proxy, Chromium delivered
 * 46 530 B and dropped 47 997 B whole; an isolated page with no other traffic
 * delivered 59 966 B. The budget sits below the lowest figure that has ever
 * been observed to work, because being wrong in the other direction means the
 * request silently never happened.
 *
 * Erring low is close to free: whatever does not fit goes to the journal, which
 * costs the reader one sync round trip on the next launch and cannot cost them
 * the edit.
 */
export const UNLOAD_FLUSH_BUDGET_BYTES = 40_000;

const encoder = new TextEncoder();

function byteLength(json: string): number {
  return encoder.encode(json).length;
}

/**
 * Splits `mutations` at the last one whose serialized body still fits the
 * budget, measuring the body the request will actually carry rather than
 * estimating it: `{"mutations":[` … `]}` plus one separator per element after
 * the first. A single mutation larger than the whole budget yields an empty
 * `sent` — nothing goes on the wire, and the caller is told exactly what did not
 * fit rather than discovering it as silence.
 */
export function budgetedMutationFlush(
  mutations: readonly SyncMutation[],
  budgetBytes = UNLOAD_FLUSH_BUDGET_BYTES,
): { sent: SyncMutation[]; deferred: SyncMutation[] } {
  let used = byteLength(JSON.stringify({ mutations: [] }));
  let fitted = 0;
  while (fitted < Math.min(mutations.length, SYNC_BATCH_SIZE)) {
    const cost =
      byteLength(JSON.stringify(mutations[fitted])) + (fitted > 0 ? 1 : 0);
    if (used + cost > budgetBytes) break;
    used += cost;
    fitted += 1;
  }
  return {
    sent: mutations.slice(0, fitted),
    deferred: mutations.slice(fitted),
  };
}

/**
 * What this document has parked and not yet handed back, per account.
 *
 * A `pagehide` is a prediction, and on the shipping target it is wrong
 * constantly: iOS backgrounds a PWA by firing it and then keeps the process
 * running, and bfcache does the same on every back navigation. A document that
 * comes back still holds its edit in memory with the whole ordinary write path
 * underneath it, so its parked copy has nothing left to rescue — and leaving it
 * parked is precisely what armed a stale entry to be adopted at the next launch
 * and overwrite work the reader did in between.
 *
 * Only the ids *this* document wrote are released. Another tab's parked edit
 * has never been adopted by anyone and is not this document's to discard, and
 * clearing the key wholesale would lose it.
 */
const parkedIntent = new Map<
  string,
  { mutationIds: Set<string>; release: () => void }
>();

function holdParkedIntent(
  accountId: string,
  mutations: readonly SyncMutation[],
): void {
  const held = parkedIntent.get(accountId) ?? {
    mutationIds: new Set<string>(),
    release: registerDocumentSurvival(() => releaseParkedIntent(accountId)),
  };
  for (const { mutationId } of mutations) held.mutationIds.add(mutationId);
  parkedIntent.set(accountId, held);
}

function releaseParkedIntent(accountId: string): void {
  const held = parkedIntent.get(accountId);
  if (!held) return;
  parkedIntent.delete(accountId);
  held.release();
  dropJournalledMutations(accountId, held.mutationIds);
}

/**
 * The last thing this document does with the reader's edit.
 *
 * Two carriers, in this order, and the order is the guarantee. First the
 * journal: a synchronous `localStorage` write that is on disk before this
 * function returns, which the next launch drains into the outbox. Only then the
 * `keepalive` POST, which is now an *accelerator* — it saves the edit a round
 * trip when the network is healthy, and costs nothing when it is not.
 *
 * It used to be the other way round, which is to say there was only the POST.
 * With the server refusing or the connection dropped at the instant of a
 * pull-to-refresh the edit was then on no server, in no outbox, in no database
 * and on no screen, under a chip reading `Saved`. The ordinary path survives the
 * identical failure because it reaches durable storage first and drains when the
 * network returns; this is that same shape, compressed into the one synchronous
 * write a `pagehide` handler has time for.
 *
 * Everything is journalled, including what goes on the wire. Re-sending is free:
 * a mutation is keyed by its own id and judged by field version, so the copy the
 * outbox drains later is acknowledged and not applied. Journalling only the
 * remainder would instead mean betting the reader's edit on a response nobody is
 * alive to read.
 */
export function flushUnloadIntent(
  accountId: string,
  mutations: readonly SyncMutation[],
): void {
  if (mutations.length === 0) return;
  // What this document has parked and not released is exactly what a quota
  // failure is allowed to evict. Everything else in the journal belongs to
  // another tab, which has no second copy of it anywhere.
  const ownParked = parkedIntent.get(accountId)?.mutationIds ?? new Set();
  if (recordUnloadJournal(accountId, mutations, ownParked))
    holdParkedIntent(accountId, mutations);
  // A `keepalive` POST is not a carrier. It is fire-and-forget by construction:
  // the document is gone before any response arrives, and the audit watched one
  // die at the socket with the page none the wiser. So the park is the whole
  // question, and a park that did not happen is an edit the session has to stop
  // claiming is safe — see `publishUndurableUnloadIntent`.
  else publishUndurableUnloadIntent(true);
  const { sent } = budgetedMutationFlush(mutations);
  if (sent.length === 0) return;
  void fetch("/api/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Kyle-Account-Id": accountId,
    },
    body: JSON.stringify({ mutations: sent }),
    keepalive: true,
    // A `pagehide` that ends in bfcache leaves this page alive to see the
    // rejection, and an unhandled one is a console error over an attempt that
    // was always best-effort — the journal is what makes it safe to be.
  }).catch(() => {});
}

/**
 * The two ways this document ends without React ever unmounting the tree, and
 * the order the halves of a save have to happen in when it does.
 *
 * `visibilitychange` → hidden is a backgrounded PWA. The document may survive
 * it, so committing the open buffer is all that is needed here: the ordinary
 * write path still has time to reach IndexedDB and, 650 ms later, the server.
 * It is not, however, an ending the reader chose — on iOS it is the *first*
 * event of a teardown, fired before `pagehide` and before the process is
 * killed, so it is announced to buffers as a document ending like any other.
 * Calling it a gesture meant the one field that refuses an empty commit on
 * teardown never saw the teardown at all: the buffer had already been
 * committed, and cleared, by the time `pagehide` arrived.
 *
 * `pagehide` is the document going away — reload, pull-to-refresh, tab close,
 * iOS killing a backgrounded app. It fires on all of those in both engines and
 * `visibilitychange` fires on none of them, which is why a reload used to eat a
 * buffered rename outright. Nothing asynchronous outlives it: not the 650 ms
 * sync debounce, not an IndexedDB write queued behind two Web Locks. A commit
 * on this path therefore has to be followed, in the same turn, by a flush that
 * hands the bytes to the browser rather than scheduling work the document will
 * not live to run.
 *
 * `pageshow`, and visibility returning, are the third thing this module is for.
 * A `pagehide` is a *prediction* that the document is ending, and on the
 * shipping target it is wrong constantly: iOS backgrounds a PWA by firing it
 * and then keeps the process alive, and bfcache does the same on every back
 * navigation. Whatever the flush parked for a document that then comes back is
 * owed to nobody, and leaving it parked is what armed the journal to overwrite
 * the reader's later work at the next launch.
 *
 * `beforeunload` is deliberately absent. iOS Safari — the shipping target —
 * fires it unreliably, merely registering it costs bfcache eligibility, and it
 * arrives on nothing `pagehide` does not already cover.
 *
 * Ordering is the reason both listeners live in one module. Editors and the
 * sync engine registering their own `addEventListener` would run in
 * registration order, which puts the session-long sync listener ahead of an
 * editor that opened a second ago — the flush would read the buffer as it was
 * before the commit it is there to rescue.
 */

type Unregister = () => void;

/**
 * How an edit ended, from the point of view of a field deciding what the ending
 * *meant*. Almost nothing cares: a value the reader typed is the same value
 * however they left. The distinction exists for the one thing a value cannot
 * express, which is its own absence — see `restoreOnEmpty` in
 * `buffered-text-input`.
 *
 * `"gesture"` is every ending the reader performed and can see the result of:
 * blur, Return, and navigating off the surface. `"document-end"` is the
 * document being taken away underneath the edit, which the reader did not
 * choose to mean anything — a pull-to-refresh is what people do when something
 * looks wrong, and backgrounding is what happens to them when they are
 * interrupted. Both document-level events report it.
 */
export type BufferedEditEnding = "gesture" | "document-end";

/** Editors holding an uncommitted buffer. Each entry commits its own edit. */
const openBufferedEdits = new Set<(ending: BufferedEditEnding) => void>();
/** Whatever has to reach persistence synchronously once the buffers commit. */
const unloadIntentFlushes = new Set<() => void>();
/** Whatever a document that came back has to undo about its own ending. */
const documentSurvivals = new Set<() => void>();
const bufferedEditListeners = new Set<() => void>();

let listeningToDocument = false;

function commitOpenBufferedEdits(ending: BufferedEditEnding): void {
  // A copy: `commit` empties its own buffer and unregisters on the next render,
  // and a set mutated mid-iteration would skip a neighbouring editor.
  for (const commit of [...openBufferedEdits]) commit(ending);
}

function onVisibilityChange(): void {
  if (document.visibilityState === "hidden") {
    commitOpenBufferedEdits("document-end");
    return;
  }
  announceDocumentSurvival();
}

function flushBeforeUnload(): void {
  commitOpenBufferedEdits("document-end");
  for (const flush of [...unloadIntentFlushes]) flush();
}

function announceDocumentSurvival(): void {
  for (const survived of [...documentSurvivals]) survived();
}

function syncDocumentListeners(): void {
  const needed =
    openBufferedEdits.size + unloadIntentFlushes.size + documentSurvivals.size >
    0;
  if (needed === listeningToDocument || typeof window === "undefined") return;
  listeningToDocument = needed;
  if (needed) {
    window.addEventListener("pagehide", flushBeforeUnload);
    window.addEventListener("pageshow", announceDocumentSurvival);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return;
  }
  window.removeEventListener("pagehide", flushBeforeUnload);
  window.removeEventListener("pageshow", announceDocumentSurvival);
  document.removeEventListener("visibilitychange", onVisibilityChange);
}

function register<T>(registry: Set<T>, entry: T, notify: boolean): Unregister {
  registry.add(entry);
  syncDocumentListeners();
  if (notify) for (const listener of [...bufferedEditListeners]) listener();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    registry.delete(entry);
    syncDocumentListeners();
    if (notify) for (const listener of [...bufferedEditListeners]) listener();
  };
}

/**
 * Declares that this editor is holding an edit nothing else knows about, and
 * hands over the commit that ends it. Unregistering is what "the buffer closed"
 * means, so it is also what tells the status chip the edit is no longer pending.
 */
export function registerBufferedEdit(
  commit: (ending: BufferedEditEnding) => void,
): Unregister {
  return register(openBufferedEdits, commit, true);
}

/** Registers work that must reach persistence while the document unloads. */
export function registerUnloadIntentFlush(flush: () => void): Unregister {
  return register(unloadIntentFlushes, flush, false);
}

/**
 * Registers work owed to the discovery that the document did *not* end after
 * all — a bfcache restore, or an iOS PWA resumed after the `pagehide` that
 * backgrounded it. Whatever a flush handed to storage on the way out is now
 * back under the running session's ordinary write path.
 */
export function registerDocumentSurvival(survived: () => void): Unregister {
  return register(documentSurvivals, survived, false);
}

/** Whether any editor is holding work that has not been committed anywhere. */
export function hasOpenBufferedEdit(): boolean {
  return openBufferedEdits.size > 0;
}

export function subscribeToBufferedEdits(listener: () => void): Unregister {
  bufferedEditListeners.add(listener);
  return () => bufferedEditListeners.delete(listener);
}

/** No buffered edit is ever open on the server, so nothing is ever pending. */
export function noBufferedEditOnServer(): false {
  return false;
}

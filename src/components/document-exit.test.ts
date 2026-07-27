/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";
import {
  hasOpenBufferedEdit,
  registerBufferedEdit,
  registerDocumentSurvival,
  registerUnloadIntentFlush,
  subscribeToBufferedEdits,
} from "./document-exit";

const released: Array<() => void> = [];

function keep(unregister: () => void): () => void {
  released.push(unregister);
  return unregister;
}

afterEach(() => {
  while (released.length > 0) released.pop()?.();
});

function hide(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("the endings a document has that React never sees", () => {
  it("commits every open buffer before the flush reads what they wrote", () => {
    const order: string[] = [];
    // Registered first, exactly as the session-long sync engine is: order must
    // come from the phase, not from who called addEventListener earlier.
    keep(registerUnloadIntentFlush(() => order.push("flush")));
    keep(registerBufferedEdit(() => order.push("commit-a")));
    keep(registerBufferedEdit(() => order.push("commit-b")));

    window.dispatchEvent(new Event("pagehide"));

    expect(order).toEqual(["commit-a", "commit-b", "flush"]);
  });

  it("commits on a hidden document but does not flush it", () => {
    const order: string[] = [];
    keep(registerUnloadIntentFlush(() => order.push("flush")));
    keep(registerBufferedEdit(() => order.push("commit")));

    hide("hidden");

    expect(order).toEqual(["commit"]);
  });

  /**
   * The one thing a commit is allowed to know about how it was reached. A field
   * whose empty box means "unset" and whose unset is unrecoverable declines the
   * ending it did not choose — and only that one.
   *
   * Backgrounding is not an ending the reader chose. iOS fires
   * `visibilitychange` → hidden *before* `pagehide` and then kills the process,
   * so treating the first of the pair as a gesture handed the refusal a buffer
   * that had already been committed away: the audit measured Starting savings
   * going to `undefined` on the shipping target's main teardown path while the
   * `pagehide`-only ordering it was tested against preserved it.
   */
  it("tells each commit that the document is being destroyed, on either ending", () => {
    const endings: string[] = [];
    keep(registerBufferedEdit((ending) => endings.push(ending)));

    hide("hidden");
    window.dispatchEvent(new Event("pagehide"));

    expect(endings).toEqual(["document-end", "document-end"]);
  });

  /**
   * The journal a flush parks is only owed to a document that does not come
   * back. `pageshow` is the browser saying it did — bfcache restore, or an iOS
   * PWA resumed after the `pagehide` that backgrounded it — and everything the
   * flush parked belongs to the running session's ordinary write path again.
   */
  it("announces a document that came back after the ending it flushed for", () => {
    const survived: string[] = [];
    keep(registerDocumentSurvival(() => survived.push("pageshow")));

    window.dispatchEvent(new Event("pagehide"));
    window.dispatchEvent(new Event("pageshow"));

    expect(survived).toEqual(["pageshow"]);
  });

  it("announces a document that came back through visibility alone", () => {
    const survived: string[] = [];
    keep(registerDocumentSurvival(() => survived.push("visible")));

    hide("hidden");
    hide("visible");

    expect(survived).toEqual(["visible"]);
  });

  it("stops announcing survival once the registration is released", () => {
    const survived: string[] = [];
    registerDocumentSurvival(() => survived.push("pageshow"))();

    window.dispatchEvent(new Event("pageshow"));

    expect(survived).toEqual([]);
  });

  it("ignores a visibility change back to visible", () => {
    const order: string[] = [];
    keep(registerBufferedEdit(() => order.push("commit")));

    hide("visible");

    expect(order).toEqual([]);
  });

  it("commits a later editor the first one unregistered mid-flush", () => {
    const order: string[] = [];
    let releaseSecond = () => {};
    keep(
      registerBufferedEdit(() => {
        order.push("first");
        releaseSecond();
      }),
    );
    releaseSecond = keep(registerBufferedEdit(() => order.push("second")));

    window.dispatchEvent(new Event("pagehide"));

    expect(order).toEqual(["first", "second"]);
  });

  it("stops listening once the last registration is released", () => {
    const order: string[] = [];
    const release = registerBufferedEdit(() => order.push("commit"));
    release();
    release();

    window.dispatchEvent(new Event("pagehide"));

    expect(order).toEqual([]);
  });

  it("reports an open buffer to whoever is watching the status", () => {
    const seen: boolean[] = [];
    keep(subscribeToBufferedEdits(() => seen.push(hasOpenBufferedEdit())));

    expect(hasOpenBufferedEdit()).toBe(false);
    const release = registerBufferedEdit(() => {});
    expect(hasOpenBufferedEdit()).toBe(true);
    release();

    expect(seen).toEqual([true, false]);
    expect(hasOpenBufferedEdit()).toBe(false);
  });
});

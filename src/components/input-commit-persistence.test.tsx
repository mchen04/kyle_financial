/** @vitest-environment jsdom */

/**
 * What reached the database, not what the box was showing.
 *
 * `input-clearability.test.tsx` inspects the rendered value and the drafts a
 * local-state parent accepted. Both were green while a backspaced category name
 * was being written to the server one truncated prefix at a time, because
 * neither can see a write: a DOM assertion is structurally blind to a defect
 * whose entire symptom is what was persisted, and "the accepted list never
 * contains an empty string" is satisfied by a list of `"G"`, `"Gr"`, `"Gro"`.
 *
 * So these tests do not assert on the DOM alone. Every draft the surface emits
 * is pushed through the real client-to-server pipeline — `diffPlanMutations`,
 * `JSON.stringify` (the wire), `decodeSyncMutation`, `applyDecodedSyncMutation`
 * — and `persistence.server` is therefore the plan the database would be
 * holding at that instant. The assertions that matter are taken *during* the
 * edit, while the box is empty and the header says "Saved".
 */

import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BudgetCategory } from "@/domain/budget";
import { calculatePlan, type PlanResult } from "@/domain/tax/engine";
import { diffPlanMutations, type SyncMutation } from "@/domain/sync";
import {
  applyDecodedSyncMutation,
  decodeSyncMutation,
} from "@/domain/sync-decoder";
import { storedPlan } from "@/test/fixtures/plans";
import { PlanHub } from "./cockpit-plan-surfaces";
import { ManageCategoriesSurface } from "./cockpit-category-settings";
import { BenefitsScreen } from "./benefits-screen";
import { acceptCalculablePlanDraft, type StoredPlan } from "./plan-types";

const CATEGORY_ID = "00000000-0000-4000-8000-000000000003";
const BENEFIT_ID = "00000000-0000-4000-8000-000000000002";
const TODAY = "2026-07-12";

function category(overrides: Partial<BudgetCategory> = {}): BudgetCategory {
  return {
    id: CATEGORY_ID,
    name: "Groceries",
    group: "Needs",
    cadence: "monthly",
    amountCents: 60_000,
    sortOrder: 0,
    guidanceBucket: "needs",
    colorToken: "blue",
    archived: false,
    ...overrides,
  };
}

/**
 * The persistence layer, played straight. `accept` runs the same three steps
 * `persistPlanIntent` runs — diff the accepted draft against what is already
 * stored, put the mutations on the wire, decode and apply them — so `server` is
 * the row the database would hold and `deviceSaveFailed` is the "Device save
 * failed" banner: a mutation the decoder refuses is exactly what aborts the
 * IndexedDB transaction and flips `saveState` to `local-error`.
 */
class Persistence {
  server: StoredPlan;
  readonly writes: SyncMutation[] = [];
  deviceSaveFailed = false;
  private nextId = 0;

  constructor(initial: StoredPlan) {
    this.server = initial;
  }

  accept(draft: StoredPlan) {
    const mutations = diffPlanMutations(
      this.server,
      draft,
      new Date(Date.UTC(2026, 6, 12, this.nextId)).toISOString(),
      () =>
        `00000000-0000-4000-8000-${String(++this.nextId).padStart(12, "0")}`,
    );
    for (const mutation of mutations) {
      const onTheWire = JSON.parse(JSON.stringify(mutation)) as SyncMutation;
      try {
        this.server = applyDecodedSyncMutation(
          this.server,
          decodeSyncMutation(onTheWire),
        );
      } catch {
        this.deviceSaveFailed = true;
        return;
      }
      this.writes.push(onTheWire);
    }
  }

  /** Every value that has been written to the field, in order. */
  writtenValues(field: string): unknown[] {
    return this.writes
      .filter((mutation) => mutation.field === field)
      .map((mutation) => mutation.value);
  }
}

const nameField = `expense:${CATEGORY_ID}:name`;

/** Types `value` into the field the way a keystroke reaches React. */
function fill(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Types a whole word one keystroke at a time, from wherever the box is now. */
function type(input: HTMLInputElement, word: string) {
  for (let kept = 1; kept <= word.length; kept += 1)
    fill(input, word.slice(0, kept));
}

/** React 19 wires `onBlur` to the bubbling `focusout`, not `blur`. */
function blur(input: HTMLInputElement) {
  act(() => {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

/**
 * Return / Done on the iOS keyboard. It ends the edit for the reader and it
 * does **not** blur the field, so a commit hung only on blur never runs.
 */
function pressEnter(input: HTMLInputElement) {
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
}

function deleteEveryCharacter(input: HTMLInputElement): string {
  for (let guard = input.value.length; guard > 0; guard -= 1) {
    const next = input.value.slice(0, -1);
    fill(input, next);
    if (input.value !== next) break;
  }
  return input.value;
}

/** Cmd-Z. An undo reaches React as an ordinary input event. */
const undoTo = fill;

function inputLabelled(container: HTMLElement, text: string): HTMLInputElement {
  const found = [...container.querySelectorAll("input")].find(
    (input) =>
      input.getAttribute("aria-label") === text ||
      input.closest("label")?.textContent?.includes(text),
  );
  if (!found) throw new Error(`No input labelled ${text}`);
  return found;
}

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function Gated({
  initialPlan,
  persistence,
  errors,
  children,
}: {
  initialPlan: StoredPlan;
  persistence: Persistence;
  errors: string[];
  children: (
    plan: StoredPlan,
    result: PlanResult,
    onDraft: (plan: StoredPlan) => void,
  ) => ReactNode;
}) {
  const [plan, setPlan] = useState(initialPlan);
  const onDraft = (next: StoredPlan) => {
    const error = acceptCalculablePlanDraft(next, (approved) => {
      setPlan(approved);
      persistence.accept(approved);
    });
    if (error) errors.push(error);
  };
  return children(plan, calculatePlan(plan), onDraft);
}

describe("an edit reaches the persistence layer once, at its end", () => {
  let container: HTMLDivElement;
  let root: Root;
  let errors: string[];

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    errors = [];
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function render(node: ReactNode) {
    act(() => root.render(node));
  }

  /**
   * The document ending. Measured on a real `page.reload()` in both engines, on
   * an iPhone-emulated context: the document is handed `beforeunload` and
   * `pagehide`, and **no `visibilitychange` at all**. `pagehide` is therefore
   * the only signal that arrives on the gesture this app's own comments call
   * constant, and it is the one the buffer has to end on.
   *
   * This used to be a comment on `afterReloadFrom` asserting the opposite —
   * "nothing but an already-persisted value can survive this" — which is how a
   * green suite sat on top of a reload silently discarding a rename.
   */
  function unload() {
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
  }

  /** Backgrounding, which is a different event and does not end the document. */
  function hideDocument() {
    const visibility = (state: "hidden" | "visible") =>
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => state,
      });
    act(() => {
      visibility("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    visibility("visible");
  }

  /**
   * The page coming back: rebuilt from whatever persistence was holding at the
   * moment it was torn down. The reloaded tree is a fresh one, so this can only
   * ever show what actually reached the server.
   */
  function afterReloadFrom(plan: StoredPlan, name: string): string {
    const reloadContainer = document.createElement("div");
    document.body.append(reloadContainer);
    const reloadRoot = createRoot(reloadContainer);
    act(() =>
      reloadRoot.render(
        <ManageCategoriesSurface
          plan={plan}
          onDraft={() => {}}
          onBack={() => {}}
        />,
      ),
    );
    click(reloadContainer.querySelector('[aria-expanded="false"]')!);
    const value = inputLabelled(reloadContainer, `${name} name`).value;
    act(() => reloadRoot.unmount());
    reloadContainer.remove();
    return value;
  }

  /** The same rebuild for the one field whose loss has no undo. */
  function afterReloadFromPlan(plan: StoredPlan): string {
    const reloadContainer = document.createElement("div");
    document.body.append(reloadContainer);
    const reloadRoot = createRoot(reloadContainer);
    act(() =>
      reloadRoot.render(
        <PlanHub
          today={TODAY}
          plan={plan}
          result={calculatePlan(plan)}
          onScreen={() => {}}
          onDraft={() => {}}
        />,
      ),
    );
    const value = reloadContainer.querySelector<HTMLInputElement>(
      'input[placeholder="Optional"]',
    )!.value;
    act(() => reloadRoot.unmount());
    reloadContainer.remove();
    return value;
  }

  describe("Manage categories → Name", () => {
    function openEditor(persistence: Persistence, name = "Groceries") {
      render(
        <Gated
          initialPlan={persistence.server}
          persistence={persistence}
          errors={errors}
        >
          {(current, _result, onDraft) => (
            <ManageCategoriesSurface
              plan={current}
              onDraft={onDraft}
              onBack={() => {}}
            />
          )}
        </Gated>,
      );
      click(container.querySelector('[aria-expanded="false"]')!);
      return inputLabelled(container, `${name} name`);
    }

    function freshPersistence(name = "Groceries") {
      return new Persistence(
        storedPlan(2026, { expenses: [category({ name })] }),
      );
    }

    it("writes nothing at all while the name is being backspaced away", () => {
      const persistence = freshPersistence();
      const input = openEditor(persistence);

      expect(deleteEveryCharacter(input)).toBe("");

      expect(persistence.writes).toEqual([]);
      expect(persistence.server.expenses[0].name).toBe("Groceries");
    });

    it("writes the finished name once, not every prefix of it", () => {
      const persistence = freshPersistence();
      const input = openEditor(persistence);

      fill(input, "");
      type(input, "Gym");
      expect(persistence.writes).toEqual([]);

      blur(input);

      expect(persistence.writtenValues(nameField)).toEqual(["Gym"]);
      expect(persistence.server.expenses[0].name).toBe("Gym");
      expect(errors).toEqual([]);
    });

    it("commits on Return without a blur, and restores the emptied name", () => {
      const persistence = freshPersistence();
      const input = openEditor(persistence);

      deleteEveryCharacter(input);
      pressEnter(input);

      expect(persistence.writes).toEqual([]);
      expect(persistence.server.expenses[0].name).toBe("Groceries");
      expect(input.value).toBe("Groceries");
    });

    it("commits a rename on Return without a blur", () => {
      const persistence = freshPersistence();
      const input = openEditor(persistence);

      fill(input, "");
      type(input, "Gym");
      pressEnter(input);

      expect(persistence.writtenValues(nameField)).toEqual(["Gym"]);
      expect(persistence.server.expenses[0].name).toBe("Gym");

      blur(input);
      expect(persistence.writtenValues(nameField)).toEqual(["Gym"]);
    });

    it("leaves the pre-edit name on the server when the page reloads mid-edit", () => {
      const persistence = freshPersistence();
      const input = openEditor(persistence);

      expect(deleteEveryCharacter(input)).toBe("");
      unload();
      const reloadedFrom = persistence.server;

      expect(persistence.writes).toEqual([]);
      expect(reloadedFrom.expenses[0].name).toBe("Groceries");
      expect(afterReloadFrom(reloadedFrom, "Groceries")).toBe("Groceries");
    });

    /**
     * This test used to assert the opposite: that a reload mid-rename left
     * `Groceries` on the server, i.e. that the reader's typing was correctly
     * thrown away. That was never a requirement — it was the buffering change's
     * accepted collateral, written down as intent, and it is why the suite
     * stayed green over a reload eating a rename. What a reload owes the reader
     * is the same thing a blur owes them: the edit they finished.
     */
    it("commits the typed name when the document unloads mid-rename", () => {
      const persistence = freshPersistence();
      const input = openEditor(persistence);

      fill(input, "");
      type(input, "Gym");
      expect(persistence.server.expenses[0].name).toBe("Groceries");

      unload();

      expect(persistence.writtenValues(nameField)).toEqual(["Gym"]);
      expect(persistence.server.expenses[0].name).toBe("Gym");
      expect(afterReloadFrom(persistence.server, "Gym")).toBe("Gym");
      expect(errors).toEqual([]);
    });

    it("commits the typed name when the app is backgrounded mid-rename", () => {
      const persistence = freshPersistence();
      const input = openEditor(persistence);

      fill(input, "");
      type(input, "Gym");

      hideDocument();

      expect(persistence.writtenValues(nameField)).toEqual(["Gym"]);
      expect(persistence.server.expenses[0].name).toBe("Gym");
    });

    it("writes once when a blur and an unload land on the same edit", () => {
      const persistence = freshPersistence();
      const input = openEditor(persistence);

      fill(input, "");
      type(input, "Gym");
      blur(input);
      unload();

      expect(persistence.writtenValues(nameField)).toEqual(["Gym"]);
      expect(persistence.server.expenses[0].name).toBe("Gym");
    });

    it("writes nothing when the document unloads with no edit open", () => {
      const persistence = freshPersistence();
      openEditor(persistence);

      unload();

      expect(persistence.writes).toEqual([]);
      expect(persistence.server.expenses[0].name).toBe("Groceries");
    });

    it("commits the edit when the surface is navigated away from", () => {
      const persistence = freshPersistence();
      const input = openEditor(persistence);

      fill(input, "");
      type(input, "Gym");
      render(<p>Budget</p>);

      expect(persistence.writtenValues(nameField)).toEqual(["Gym"]);
      expect(persistence.server.expenses[0].name).toBe("Gym");
      expect(errors).toEqual([]);
    });

    it("writes nothing when the surface is navigated away from an emptied name", () => {
      const persistence = freshPersistence();
      const input = openEditor(persistence);

      deleteEveryCharacter(input);
      render(<p>Budget</p>);

      expect(persistence.writes).toEqual([]);
      expect(persistence.server.expenses[0].name).toBe("Groceries");
    });

    it("writes nothing when an undo walks the name back to where it started", () => {
      const persistence = freshPersistence();
      const input = openEditor(persistence);

      deleteEveryCharacter(input);
      for (let kept = 1; kept <= "Groceries".length; kept += 1)
        undoTo(input, "Groceries".slice(0, kept));

      expect(persistence.writes).toEqual([]);

      blur(input);

      expect(persistence.writes).toEqual([]);
      expect(persistence.server.expenses[0].name).toBe("Groceries");
    });

    it("writes nothing while select-all and Delete leaves the box empty", () => {
      const persistence = freshPersistence();
      const input = openEditor(persistence);

      input.setSelectionRange(0, input.value.length);
      fill(input, "");

      expect(input.value).toBe("");
      expect(persistence.writes).toEqual([]);
      expect(persistence.server.expenses[0].name).toBe("Groceries");

      type(input, "Gym");

      expect(persistence.writes).toEqual([]);

      blur(input);

      expect(persistence.writtenValues(nameField)).toEqual(["Gym"]);
      expect(persistence.server.expenses[0].name).toBe("Gym");
    });

    it("writes nothing while a cut in two bites empties the box", () => {
      const persistence = freshPersistence();
      const input = openEditor(persistence);

      act(() => {
        input.dispatchEvent(new Event("cut", { bubbles: true }));
      });
      fill(input, "Groc");
      act(() => {
        input.dispatchEvent(new Event("cut", { bubbles: true }));
      });
      fill(input, "");

      expect(persistence.writes).toEqual([]);
      expect(persistence.server.expenses[0].name).toBe("Groceries");
    });

    it("never puts a prefix of the seeded name on a new category", () => {
      const persistence = new Persistence(storedPlan(2026, { expenses: [] }));
      render(
        <Gated
          initialPlan={persistence.server}
          persistence={persistence}
          errors={errors}
        >
          {(current, _result, onDraft) => (
            <ManageCategoriesSurface
              plan={current}
              onDraft={onDraft}
              onBack={() => {}}
            />
          )}
        </Gated>,
      );
      click(
        [...container.querySelectorAll("button")].find((button) =>
          button.textContent?.includes("Add category"),
        )!,
      );
      click(container.querySelector('[aria-expanded="false"]')!);
      const input = inputLabelled(container, "New category name");
      const seededId = persistence.server.expenses[0].id;

      expect(deleteEveryCharacter(input)).toBe("");
      expect(persistence.server.expenses[0].name).toBe("New category");
      type(input, "Gym");
      blur(input);

      expect(persistence.writtenValues(`expense:${seededId}:name`)).toEqual([
        "Gym",
      ]);
      expect(persistence.server.expenses[0].name).toBe("Gym");
      expect(errors).toEqual([]);
    });
  });

  describe("Plan → Starting savings", () => {
    function openPlanHub(persistence: Persistence) {
      render(
        <Gated
          initialPlan={persistence.server}
          persistence={persistence}
          errors={errors}
        >
          {(current, result, onDraft) => (
            <PlanHub
              today={TODAY}
              plan={current}
              result={result}
              onScreen={() => {}}
              onDraft={onDraft}
            />
          )}
        </Gated>,
      );
      return container.querySelector<HTMLInputElement>(
        'input[placeholder="Optional"]',
      )!;
    }

    function freshPersistence(startingSavingsCents: number | undefined) {
      return new Persistence(
        storedPlan(2026, {
          expenses: [category()],
          ...(startingSavingsCents === undefined
            ? {}
            : { startingSavingsCents }),
        }),
      );
    }

    it("clears to unset without ever writing a truncated balance", () => {
      const persistence = freshPersistence(2_850_000);
      const input = openPlanHub(persistence);

      expect(input.value).toBe("28500");
      expect(deleteEveryCharacter(input)).toBe("");

      expect(persistence.writes).toEqual([]);
      expect(persistence.server.startingSavingsCents).toBe(2_850_000);

      blur(input);

      expect(persistence.writtenValues("startingSavingsCents")).toEqual([null]);
      expect(persistence.server.startingSavingsCents).toBeUndefined();
      expect(persistence.deviceSaveFailed).toBe(false);
      expect(errors).toEqual([]);
      expect(input.value).toBe("");
    });

    it("survives a reload after being cleared, still unset", () => {
      const persistence = freshPersistence(2_850_000);
      const input = openPlanHub(persistence);

      deleteEveryCharacter(input);
      blur(input);

      expect(persistence.server.startingSavingsCents).toBeUndefined();
    });

    /**
     * The one place consistency is the wrong tie-breaker.
     *
     * Every other buffered commit carries a value the reader affirmatively
     * produced. An empty box carries the *absence* of one, and it is
     * indistinguishable from a reader who selected-all, was interrupted, and
     * pulled to refresh — which is not a save gesture, it is what people do when
     * something looks wrong. The harm is one-directional: refusing costs a
     * reader who meant it one extra tap, accepting destroys the anchor figure
     * every projection on the screen is measured from, silently and with no
     * undo. That is the same figure Blocker 2 corrupted.
     *
     * So the refusal is scoped to exactly the ending the reader did not choose
     * to mean anything. Blur, Return and unmount are endings they performed, and
     * they still commit unset — see the three tests below.
     */
    it("refuses to unset the balance when the document is torn down", () => {
      const persistence = freshPersistence(2_850_000);
      const input = openPlanHub(persistence);

      deleteEveryCharacter(input);
      expect(persistence.writes).toEqual([]);
      expect(persistence.server.startingSavingsCents).toBe(2_850_000);

      unload();

      expect(persistence.writes).toEqual([]);
      expect(persistence.server.startingSavingsCents).toBe(2_850_000);
      expect(persistence.deviceSaveFailed).toBe(false);
      expect(errors).toEqual([]);
      expect(afterReloadFromPlan(persistence.server)).toBe("28500");
    });

    /**
     * Blocker 2 was `$28,500` becoming `$2.00` and the header reading "Device
     * save failed". The refusal must not smuggle any of that back in: nothing at
     * all reaches the wire, so there is no truncated prefix to arrive and no
     * mutation for the decoder to refuse.
     */
    it("writes no prefix of the balance on the refused teardown", () => {
      const persistence = freshPersistence(2_850_000);
      const input = openPlanHub(persistence);

      for (let kept = input.value.length; kept >= 0; kept -= 1) {
        fill(input, input.value.slice(0, -1));
        expect(persistence.writtenValues("startingSavingsCents")).toEqual([]);
      }
      unload();

      expect(persistence.writtenValues("startingSavingsCents")).toEqual([]);
      expect(persistence.server.startingSavingsCents).toBe(2_850_000);
      expect(persistence.deviceSaveFailed).toBe(false);
    });

    /**
     * A *typed* balance is an affirmative value, so teardown carries it exactly
     * as before. Only the empty commit is refused, and only here.
     */
    it("still commits a typed balance on the same teardown", () => {
      const persistence = freshPersistence(2_850_000);
      const input = openPlanHub(persistence);

      deleteEveryCharacter(input);
      type(input, "31000");

      unload();

      expect(persistence.writtenValues("startingSavingsCents")).toEqual([
        3_100_000,
      ]);
      expect(persistence.server.startingSavingsCents).toBe(3_100_000);
    });

    it("commits unset on blur, which the reader performed", () => {
      const persistence = freshPersistence(2_850_000);
      const input = openPlanHub(persistence);

      deleteEveryCharacter(input);
      blur(input);

      expect(persistence.writtenValues("startingSavingsCents")).toEqual([null]);
      expect(persistence.server.startingSavingsCents).toBeUndefined();
    });

    it("commits unset on Return, which the reader performed", () => {
      const persistence = freshPersistence(2_850_000);
      const input = openPlanHub(persistence);

      deleteEveryCharacter(input);
      pressEnter(input);

      expect(persistence.writtenValues("startingSavingsCents")).toEqual([null]);
      expect(persistence.server.startingSavingsCents).toBeUndefined();
    });

    it("commits unset on unmount, which the reader performed", () => {
      const persistence = freshPersistence(2_850_000);
      const input = openPlanHub(persistence);

      deleteEveryCharacter(input);
      render(<p>Budget</p>);

      expect(persistence.writtenValues("startingSavingsCents")).toEqual([null]);
      expect(persistence.server.startingSavingsCents).toBeUndefined();
    });

    /**
     * Backgrounding was treated as an ending the reader performed, on the
     * reasoning that the document survives it. On the shipping target it does
     * not: iOS fires `visibilitychange` → hidden, *then* `pagehide`, and then
     * kills the process. The audit ran that real order and watched the balance
     * go to `undefined` — the refusal above was never consulted, because the
     * buffer had already been committed away by the first event of the pair.
     *
     * Being interrupted *is* backgrounding. So the refusal is keyed to the
     * document ending, whichever of the two events announces it first.
     */
    it("refuses to unset the balance when the app is backgrounded", () => {
      const persistence = freshPersistence(2_850_000);
      const input = openPlanHub(persistence);

      deleteEveryCharacter(input);
      hideDocument();

      expect(persistence.writtenValues("startingSavingsCents")).toEqual([]);
      expect(persistence.server.startingSavingsCents).toBe(2_850_000);
    });

    /**
     * The real iOS sequence, in the real order. `pagehide` alone was already
     * refused before this wave; the pair was not, and the pair is what the
     * shipping target actually sends.
     */
    it("refuses the empty commit when visibilitychange arrives before pagehide", () => {
      const persistence = freshPersistence(2_850_000);
      const input = openPlanHub(persistence);

      deleteEveryCharacter(input);
      hideDocument();
      unload();

      expect(persistence.writtenValues("startingSavingsCents")).toEqual([]);
      expect(persistence.server.startingSavingsCents).toBe(2_850_000);
      expect(persistence.deviceSaveFailed).toBe(false);
      expect(afterReloadFromPlan(persistence.server)).toBe("28500");
    });

    /** A typed balance still travels on that same pair of events. */
    it("still commits a typed balance across the backgrounding pair", () => {
      const persistence = freshPersistence(2_850_000);
      const input = openPlanHub(persistence);

      deleteEveryCharacter(input);
      type(input, "31000");
      hideDocument();
      unload();

      expect(persistence.writtenValues("startingSavingsCents")).toEqual([
        3_100_000,
      ]);
      expect(persistence.server.startingSavingsCents).toBe(3_100_000);
    });

    /**
     * N1, exactly as it was measured: `99000` typed into Starting savings, never
     * blurred, then `page.reload()`. The server was unchanged afterwards and the
     * header said "Saved" throughout.
     */
    it("commits a typed balance when the document unloads mid-entry", () => {
      const persistence = freshPersistence(undefined);
      const input = openPlanHub(persistence);

      type(input, "99000");
      expect(persistence.writes).toEqual([]);
      expect(persistence.server.startingSavingsCents).toBeUndefined();

      unload();

      expect(persistence.writtenValues("startingSavingsCents")).toEqual([
        9_900_000,
      ]);
      expect(persistence.server.startingSavingsCents).toBe(9_900_000);
      expect(persistence.deviceSaveFailed).toBe(false);
      expect(errors).toEqual([]);
    });

    it("writes a typed balance once, at the end", () => {
      const persistence = freshPersistence(undefined);
      const input = openPlanHub(persistence);

      expect(input.value).toBe("");
      type(input, "28500");
      expect(persistence.writes).toEqual([]);

      blur(input);

      expect(persistence.writtenValues("startingSavingsCents")).toEqual([
        2_850_000,
      ]);
      expect(persistence.server.startingSavingsCents).toBe(2_850_000);
      expect(persistence.deviceSaveFailed).toBe(false);
    });

    it("clears to unset on Return without a blur", () => {
      const persistence = freshPersistence(2_850_000);
      const input = openPlanHub(persistence);

      deleteEveryCharacter(input);
      pressEnter(input);

      expect(persistence.server.startingSavingsCents).toBeUndefined();
      expect(persistence.deviceSaveFailed).toBe(false);
    });
  });

  describe("Benefits → Discount % (a number field)", () => {
    function openBenefits(persistence: Persistence) {
      render(
        <Gated
          initialPlan={persistence.server}
          persistence={persistence}
          errors={errors}
        >
          {(current, result, onDraft) => (
            <BenefitsScreen draft={current} result={result} onDraft={onDraft} />
          )}
        </Gated>,
      );
      return inputLabelled(container, "Discount %");
    }

    function freshPersistence() {
      return new Persistence(
        storedPlan(2026, {
          expenses: [category()],
          benefits: [
            {
              id: BENEFIT_ID,
              type: "espp",
              label: "ESPP",
              amount: { kind: "percent", ratePpm: 100_000 },
              discountRatePpm: 150_000,
            },
          ],
        }),
      );
    }

    /**
     * NEW-4. A `type=number` input reports `value === ""` for the intermediate
     * `"12."`, so the decimal point arrives at React looking exactly like an
     * emptied field. Nothing may be suppressed and nothing may be written: the
     * box shows what the browser reported, and the one write happens at the
     * end, with the point intact.
     */
    it("does not swallow the decimal point or write a rounded prefix", () => {
      const persistence = freshPersistence();
      const input = openBenefits(persistence);
      const field = `benefit:${BENEFIT_ID}:discountRatePpm`;

      fill(input, "");
      fill(input, "1");
      fill(input, "12");
      fill(input, ""); // the browser's reading of "12."
      expect(input.value).toBe("");
      fill(input, "12.5");

      expect(persistence.writes).toEqual([]);

      blur(input);

      expect(persistence.writtenValues(field)).toEqual([125_000]);
      expect(persistence.server.benefits[0].discountRatePpm).toBe(125_000);
      expect(errors).toEqual([]);
    });

    it("commits a discount typed but never blurred when the document ends", () => {
      const persistence = freshPersistence();
      const input = openBenefits(persistence);
      const field = `benefit:${BENEFIT_ID}:discountRatePpm`;

      fill(input, "");
      fill(input, "12.5");
      expect(persistence.writes).toEqual([]);

      unload();

      expect(persistence.writtenValues(field)).toEqual([125_000]);
      expect(persistence.server.benefits[0].discountRatePpm).toBe(125_000);
      expect(errors).toEqual([]);
    });

    it("restores the discount when it is committed empty", () => {
      const persistence = freshPersistence();
      const input = openBenefits(persistence);

      expect(deleteEveryCharacter(input)).toBe("");
      expect(persistence.writes).toEqual([]);

      blur(input);

      expect(persistence.writes).toEqual([]);
      expect(persistence.server.benefits[0].discountRatePpm).toBe(150_000);
      expect(input.value).toBe("15");
    });
  });
});

/** @vitest-environment jsdom */

/**
 * Two things a reader could not read off the screen.
 *
 * P1 — "not sure where funding variance value of 7k comes from?". The figure is
 * right: seven elapsed months of a $1,000/mo saving allocation that has never
 * been funded. What the Plan hub never said is that the term covers only the
 * elapsed months while "Planned total" is the full year, that it is about
 * saving categories, or which direction the sign runs. These tests hold the
 * period and the direction on both observed terms, and leave the arithmetic
 * exactly where it was.
 *
 * P1b — the period and the direction still did not say how the figure is BUILT.
 * Each variance now prints its own two operands, and the tests below hold both
 * the exact strings and the arithmetic tie: the printed pair must subtract to
 * the printed total, so the derivation can never drift away from the figure it
 * claims to explain.
 *
 * B2 — "separate 'wants' and down arrow in boxes". The bucket and the chevron
 * are given their own containers, which must stay a *visual* split: one button
 * per row, with the aria contract that makes a whole-row disclosure legible to
 * a screen reader untouched, and no interactive element nested in another.
 *
 * B2b — the row's `aria-label` overrides its contents, so the bucket chip was
 * announced to nobody: the split promoted the bucket to a visual box and left
 * it unavailable to AT. The bucket must be in the row's accessible name.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BudgetCategory } from "@/domain/budget";
import { calculatePlan } from "@/domain/tax/engine";
import { storedPlan } from "@/test/fixtures/plans";
import { ManageCategoriesSurface } from "./cockpit-category-settings";
import { PlanHub } from "./cockpit-plan-surfaces";

const TODAY = "2026-07-26";

function category(overrides: Partial<BudgetCategory> = {}): BudgetCategory {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Brokerage investing",
    group: "Saving",
    cadence: "monthly",
    amountCents: 100_000,
    sortOrder: 0,
    guidanceBucket: "saving",
    colorToken: "blue",
    archived: false,
    ...overrides,
  };
}

/** Dollars-and-cents back to signed cents, so a printed string can be summed. */
function centsFromPrinted(printed: string): number {
  const match = /^([-+]?)\$([\d,]+)\.(\d\d)$/.exec(printed.trim());
  if (!match) throw new Error(`Not a printed money value: ${printed}`);
  const magnitude =
    Number(match[2].replaceAll(",", "")) * 100 + Number(match[3]);
  return match[1] === "-" ? -magnitude : magnitude;
}

/**
 * The two operands off a term's derivation line, e.g.
 * `planned $7,000.00 · funded $0.00` -> `{ planned: 700_000, second: 0 }`.
 */
function derivation(box: HTMLElement): { planned: number; second: number } {
  const line = box.querySelector("dt small[data-derivation]")?.textContent;
  if (!line) throw new Error("Term has no derivation line");
  const match = /^planned (\S+) · (?:funded|spent) (\S+)$/.exec(line);
  if (!match) throw new Error(`Unreadable derivation line: ${line}`);
  return {
    planned: centsFromPrinted(match[1]),
    second: centsFromPrinted(match[2]),
  };
}

/** The term box whose label starts with `label`, from the projection list. */
function term(container: HTMLElement, label: string): HTMLElement {
  const found = [...container.querySelectorAll("dt")].find((element) =>
    element.firstChild?.textContent?.startsWith(label),
  );
  if (!found) throw new Error(`No projection term labelled ${label}`);
  const box = found.parentElement;
  if (!box) throw new Error(`Term ${label} has no container`);
  return box;
}

describe("surface legibility", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  describe("P1 · Plan hub funding variance", () => {
    function renderHub() {
      const plan = storedPlan(2026, {
        expenses: [
          category(),
          category({
            id: "00000000-0000-4000-8000-000000000002",
            name: "Rent",
            group: "Home",
            guidanceBucket: "needs",
            amountCents: 50_000,
            sortOrder: 1,
          }),
        ],
      });
      act(() => {
        root.render(
          <PlanHub
            today={TODAY}
            plan={plan}
            result={calculatePlan(plan)}
            onScreen={vi.fn()}
            onDraft={vi.fn()}
          />,
        );
      });
    }

    it("names the quantity, its period, and its direction on the funding term", () => {
      renderHub();
      const funding = term(container, "Saving funding variance");

      // The reported figure, unchanged: 7 elapsed months x $1,000 unfunded.
      expect(funding.querySelector("dd")?.textContent).toBe("-$7,000.00");
      expect(funding.querySelector("dt small")?.textContent).toBe(
        "Jan–Jul · under-funded",
      );
    });

    it("states the same period on the spending term, with its own direction", () => {
      renderHub();
      const spending = term(container, "Spending variance");

      expect(spending.querySelector("dt small")?.textContent).toBe(
        "Jan–Jul · spent under plan",
      );
    });

    // P1b. The user asked where 7k comes from. Period and direction answer
    // "which months" and "which way"; only these two operands answer "how".
    it("shows the funding term's own two operands, which subtract to it", () => {
      renderHub();
      const funding = term(container, "Saving funding variance");

      // $1,000/mo of saving allocation across the seven elapsed months, none of
      // it funded — the whole of the -$7,000.00 below, in the two figures the
      // subtraction is made of.
      expect(
        funding.querySelector("dt small[data-derivation]")?.textContent,
      ).toBe("planned $7,000.00 · funded $0.00");

      // And the pair must reconcile with the printed total, not merely sit
      // beside it: funded - planned is what the variance is defined as.
      const { planned, second: funded } = derivation(funding);
      expect(planned).toBe(700_000);
      expect(funded).toBe(0);
      expect(funded - planned).toBe(
        centsFromPrinted(funding.querySelector("dd")?.textContent ?? ""),
      );
    });

    it("shows the spending term's operands too, in its own sign convention", () => {
      renderHub();
      const spending = term(container, "Spending variance");

      // Rent at $500/mo across the same seven elapsed months, none of it spent.
      expect(
        spending.querySelector("dt small[data-derivation]")?.textContent,
      ).toBe("planned $3,500.00 · spent $0.00");

      // Spending variance runs the other way round — planned minus actual — so
      // the tie is the mirror of the funding term's, and under-spending is a
      // positive contribution.
      const { planned, second: spent } = derivation(spending);
      expect(planned).toBe(350_000);
      expect(spent).toBe(0);
      expect(planned - spent).toBe(
        centsFromPrinted(spending.querySelector("dd")?.textContent ?? ""),
      );
    });

    it("separates the elapsed-month variances from the full-year planned total", () => {
      renderHub();
      const planned = term(container, "Planned total");
      const note = [...container.querySelectorAll("p")].find((element) =>
        element.textContent?.includes("Planned total is"),
      );

      // The full-year term carries no period line; the note draws the contrast.
      expect(planned.querySelector("dt small")).toBeNull();
      expect(note?.textContent).toContain("for the whole year");
      expect(note?.textContent).toContain("Both variances cover Jan–Jul only");
      expect(note?.textContent).toContain("Negative is behind plan");
    });
  });

  describe("B2 · manage-categories bucket and disclosure", () => {
    function renderRow(overrides: Partial<BudgetCategory> = {}) {
      const plan = storedPlan(2026, {
        expenses: [
          category({ name: "Vacation", guidanceBucket: "wants", ...overrides }),
        ],
      });
      act(() => {
        root.render(
          <ManageCategoriesSurface
            plan={plan}
            onDraft={vi.fn()}
            onBack={vi.fn()}
          />,
        );
      });
      const row = container.querySelector<HTMLButtonElement>("[aria-expanded]");
      if (!row) throw new Error("No disclosure row rendered");
      return row;
    }

    it("gives the bucket and the chevron each their own container", () => {
      const row = renderRow();
      const chip = row.querySelector("em");
      const disclosure = row.querySelector("span");

      expect(chip?.textContent).toBe("Wants");
      // The chevron is boxed, and the box is neither the chip nor the row: a
      // bare `<svg>` sibling is the defect this asserts against.
      expect(disclosure?.querySelector("svg")?.tagName).toBe("svg");
      expect(chip?.querySelector("svg")).toBeNull();
      expect(row.querySelector(":scope > svg")).toBeNull();
    });

    it("keeps the row one button with its disclosure contract intact", () => {
      const row = renderRow();

      expect(row.tagName).toBe("BUTTON");
      // Boxing is visual only: no second control, and none nested in the row.
      expect(container.querySelectorAll("[aria-expanded]")).toHaveLength(1);
      expect(row.querySelectorAll("button, a, input, select")).toHaveLength(0);
      expect(row.getAttribute("aria-expanded")).toBe("false");
      expect(row.getAttribute("aria-controls")).toBe(
        "category-editor-00000000-0000-4000-8000-000000000001",
      );
      expect(row.getAttribute("aria-label")).toBe(
        "Rename, recolour, reorder, or archive Vacation, Wants",
      );
    });

    // B2b. `aria-label` replaces a button's contents wholesale, so every fact
    // the row renders has to be restated in it or it is announced to nobody.
    // The chip was the fact this round promoted to a visual box.
    it("announces the bucket the chip shows, in the row's accessible name", () => {
      const row = renderRow();
      const name = row.getAttribute("aria-label") ?? "";

      // The exact name, not merely "contains Wants": the bucket has to arrive
      // as its own comma-separated fact, next to the category it describes.
      expect(name).toBe(
        "Rename, recolour, reorder, or archive Vacation, Wants",
      );
      // And it must agree with what a sighted reader is looking at.
      expect(row.querySelector("em")?.textContent).toBe("Wants");
    });

    it("announces each of the three buckets, and the archived state", () => {
      for (const [bucket, label] of [
        ["needs", "Needs"],
        ["wants", "Wants"],
        ["saving", "Saving"],
      ] as const) {
        const row = renderRow({ guidanceBucket: bucket });
        expect(row.getAttribute("aria-label")).toBe(
          `Rename, recolour, reorder, or archive Vacation, ${label}`,
        );
      }

      // Archived is the row's second visible fact and rides in the same chip,
      // so it is announced too — spelled, not punctuated with a middle dot.
      const archived = renderRow({ archived: true });
      expect(archived.querySelector("em")?.textContent).toBe(
        "Wants · Archived",
      );
      expect(archived.getAttribute("aria-label")).toBe(
        "Rename, recolour, reorder, or archive Vacation, Wants, archived",
      );
    });
  });
});

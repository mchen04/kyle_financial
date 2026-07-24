/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storedPlan } from "@/test/fixtures/plans";
import { FastLogSheet } from "./fast-log-sheet";

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function fill(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("Fast Log provisional categories", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("discards an inline category when Fast Log closes before save", () => {
    const plan = storedPlan();
    const onClose = vi.fn();
    const onDraft = vi.fn();

    act(() => {
      root.render(
        <FastLogSheet
          today="2026-07-24"
          plan={plan}
          state={{}}
          onClose={onClose}
          onDraft={onDraft}
          onSaved={vi.fn()}
          onDeleted={vi.fn()}
        />,
      );
    });

    click(
      [...container.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("Create category"),
      )!,
    );
    const categoryInput = [...container.querySelectorAll("input")].find(
      (input) => input.closest("label")?.textContent?.includes("New category"),
    )!;
    fill(categoryInput, "Coffee");
    click(
      [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Create",
      )!,
    );

    expect(
      [...container.querySelectorAll("option")].some(
        (option) => option.textContent === "Coffee",
      ),
    ).toBe(true);

    click(container.querySelector('[aria-label="Close Fast Log"]')!);

    expect(onClose).toHaveBeenCalledOnce();
    expect(onDraft).not.toHaveBeenCalled();
    expect(plan.expenses).toEqual([]);
  });
});

/** @vitest-environment jsdom */

/**
 * The reader has to be able to empty a field. Deleting the last character of a
 * name used to be impossible: `acceptCalculablePlanDraft` ran the commit-time
 * name schema on every keystroke, refused the transiently-empty draft, and
 * React restored the character that had just been deleted.
 *
 * These tests hold the two halves apart. Emptying the box while editing is
 * always legal. The commit policy — empty is never persisted, and an edit that
 * ends empty leaves the field on the value it had — is asserted separately, and
 * the persistence rejection itself is left exactly as strict as it was.
 *
 * Everything here reads the rendered value and the drafts a local-state parent
 * accepted, which is why it stayed green through two rounds of a live data-loss
 * defect: neither can see a *write*. What was persisted, and when, is asserted
 * in `input-commit-persistence.test.tsx`, and that is where any new case about
 * commit timing belongs.
 */

import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BudgetCategory } from "@/domain/budget";
import { calculatePlan, type PlanResult } from "@/domain/tax/engine";
import { storedPlan } from "@/test/fixtures/plans";
import { BenefitsScreen } from "./benefits-screen";
import { BufferedTextInput } from "./buffered-text-input";
import { ManageCategoriesSurface } from "./cockpit-category-settings";
import { ExpenseLedger } from "./expense-ledger";
import { PlanAssumptions } from "./plan-assumptions";
import { acceptCalculablePlanDraft, type StoredPlan } from "./plan-types";

const CATEGORY_ID = "00000000-0000-4000-8000-000000000003";
const BENEFIT_ID = "00000000-0000-4000-8000-000000000002";

function category(overrides: Partial<BudgetCategory> = {}): BudgetCategory {
  return {
    id: CATEGORY_ID,
    name: "Rent",
    group: "Home",
    cadence: "monthly",
    amountCents: 200_000,
    sortOrder: 0,
    guidanceBucket: "needs",
    colorToken: "blue",
    archived: false,
    ...overrides,
  };
}

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

/** React 19 wires `onBlur` to the bubbling `focusout`, not `blur`. */
function blur(input: HTMLInputElement) {
  act(() => {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

/**
 * Presses Backspace until the field is empty or refuses to shrink, and answers
 * with what is left in the box. Against the defect this returns the character
 * that could not be deleted (or the `"0"` a numeric field refilled itself
 * with), which is exactly the failure the reader reported.
 */
function deleteEveryCharacter(input: HTMLInputElement): string {
  for (let guard = input.value.length; guard > 0; guard -= 1) {
    const next = input.value.slice(0, -1);
    fill(input, next);
    if (input.value !== next) break;
  }
  return input.value;
}

/** Select-all then Delete: the whole value leaves in one keystroke. */
function selectAllAndDelete(input: HTMLInputElement) {
  input.setSelectionRange(0, input.value.length);
  fill(input, "");
}

/**
 * Cmd-X on a selection: the clipboard event fires and React then sees whatever
 * the box was left holding. Cutting a name away in two bites is the route that
 * empties a field through several intermediate values without ever pressing
 * Backspace.
 */
function cutTo(input: HTMLInputElement, remaining: string) {
  act(() => {
    input.dispatchEvent(new Event("cut", { bubbles: true }));
  });
  fill(input, remaining);
}

/**
 * A clear driven by code rather than by a key — a "clear" affordance, an
 * autofill retraction, a password manager wiping the box. It reaches React
 * exactly as `fill` does, with no keystroke of its own.
 */
function programmaticallyClear(input: HTMLInputElement) {
  fill(input, "");
}

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

/**
 * The real gate from `plan-workspace.tsx`: every draft a surface emits is run
 * through `acceptCalculablePlanDraft`, and only an accepted draft becomes state.
 */
function Gated({
  initialPlan,
  accepted,
  errors,
  children,
}: {
  initialPlan: StoredPlan;
  accepted: StoredPlan[];
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
      accepted.push(approved);
      setPlan(approved);
    });
    if (error) errors.push(error);
  };
  return children(plan, calculatePlan(plan), onDraft);
}

describe("clearing a field", () => {
  let container: HTMLDivElement;
  let root: Root;
  let accepted: StoredPlan[];
  let errors: string[];

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    accepted = [];
    errors = [];
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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

  function render(node: ReactNode) {
    act(() => root.render(node));
  }

  function everyAcceptedName(): string[] {
    return accepted.flatMap((plan) => [
      ...plan.expenses.flatMap(({ name, group }) => [name, group]),
      ...plan.benefits.map(({ label }) => label),
    ]);
  }

  /**
   * What the persistence layer is actually holding: the last draft the gate
   * approved, or — when nothing was ever approved — the name the plan started
   * with. The rendered input value is not evidence on its own, because the
   * defect committed and synced the wrong name while the box looked settled.
   */
  function committedExpenseName(initialName: string): string {
    return accepted.at(-1)?.expenses[0].name ?? initialName;
  }

  function openCategoryEditor(name = "Rent") {
    render(
      <Gated
        initialPlan={storedPlan(2026, { expenses: [category({ name })] })}
        accepted={accepted}
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

  function renderLedger(name = "Rent") {
    render(
      <Gated
        initialPlan={storedPlan(2026, { expenses: [category({ name })] })}
        accepted={accepted}
        errors={errors}
      >
        {(current, result, onDraft) => (
          <ExpenseLedger draft={current} result={result} onDraft={onDraft} />
        )}
      </Gated>,
    );
  }

  describe("Manage categories → Name (the reported field)", () => {
    it("lets the reader delete every character, including the last one", () => {
      const input = openCategoryEditor();

      expect(input.value).toBe("Rent");
      expect(deleteEveryCharacter(input)).toBe("");
    });

    it("empties in one stroke when the reader selects all and deletes", () => {
      const input = openCategoryEditor();

      fill(input, "");

      expect(input.value).toBe("");
    });

    it("never persists an empty name, and never cries that the change failed", () => {
      const input = openCategoryEditor();

      deleteEveryCharacter(input);
      fill(input, "   ");

      expect(input.value).toBe("   ");
      expect(everyAcceptedName()).not.toContain("");
      expect(errors).toEqual([]);
    });

    it("restores the previous name when the field is committed empty", () => {
      const input = openCategoryEditor();

      fill(input, "");
      blur(input);

      expect(input.value).toBe("Rent");
      expect(accepted).toEqual([]);
      expect(errors).toEqual([]);
    });

    it("commits a replacement typed after the field was cleared", () => {
      const input = openCategoryEditor();

      fill(input, "");
      fill(input, "Housing");
      blur(input);

      expect(input.value).toBe("Housing");
      expect(accepted.at(-1)?.expenses[0].name).toBe("Housing");
      expect(errors).toEqual([]);
    });

    it("clears a freshly added category down to nothing", () => {
      const input = openCategoryEditor("New category");

      expect(deleteEveryCharacter(input)).toBe("");
      expect(errors).toEqual([]);
    });
  });

  describe("expense ledger", () => {
    it("clears the expense name without raising a save error", () => {
      renderLedger();
      const input = inputLabelled(container, "Expense name");

      expect(deleteEveryCharacter(input)).toBe("");
      expect(errors).toEqual([]);
      expect(everyAcceptedName()).not.toContain("");

      blur(input);
      // Not "R", and not by putting anything back: nothing on the way down was
      // committed, so "Rent" is simply still the value the field holds.
      expect(committedExpenseName("Rent")).toBe("Rent");
      expect(input.value).toBe("Rent");
    });

    it("clears the group without raising a save error", () => {
      renderLedger();
      click(
        container.querySelector(
          '[aria-label="Category, cadence, and order for Rent"]',
        )!,
      );
      const input = inputLabelled(container, "Rent group");

      fill(input, "");

      expect(input.value).toBe("");
      expect(errors).toEqual([]);

      blur(input);
      expect(input.value).toBe("Home");
    });
  });

  describe("benefits", () => {
    function renderBenefits() {
      render(
        <Gated
          initialPlan={storedPlan(2026, {
            benefits: [
              {
                id: BENEFIT_ID,
                type: "espp",
                label: "ESPP",
                amount: { kind: "percent", ratePpm: 100_000 },
                discountRatePpm: 150_000,
              },
            ],
          })}
          accepted={accepted}
          errors={errors}
        >
          {(current, result, onDraft) => (
            <BenefitsScreen draft={current} result={result} onDraft={onDraft} />
          )}
        </Gated>,
      );
    }

    it("clears the benefit name without raising a save error", () => {
      renderBenefits();
      const input = inputLabelled(container, "Benefit name");

      fill(input, "");

      expect(input.value).toBe("");
      expect(errors).toEqual([]);
      expect(everyAcceptedName()).not.toContain("");

      blur(input);
      expect(input.value).toBe("ESPP");
    });

    it("clears the ESPP discount instead of refilling it with 0", () => {
      renderBenefits();
      const input = inputLabelled(container, "Discount %");

      expect(input.value).toBe("15");
      expect(deleteEveryCharacter(input)).toBe("");
      expect(errors).toEqual([]);
    });

    it("never commits 0 for an emptied ESPP discount", () => {
      renderBenefits();
      const input = inputLabelled(container, "Discount %");

      fill(input, "");
      blur(input);

      expect(input.value).toBe("15");
      expect(
        accepted.map((plan) => plan.benefits[0].discountRatePpm),
      ).not.toContain(0);
    });
  });

  describe("plan details → primary share of the family HSA limit", () => {
    function renderAssumptions() {
      render(
        <Gated
          initialPlan={storedPlan(2026, {
            filingStatus: "mfj",
            hsaCoverage: "family",
            primaryHsaEligible: true,
            spouseHsaEligible: true,
            spouseWageIncomeCents: 5_000_000,
            primaryHsaFamilyAllocationPpm: 500_000,
            spouseHsaFamilyAllocationPpm: 500_000,
          })}
          accepted={accepted}
          errors={errors}
        >
          {(current, result, onDraft) => (
            <PlanAssumptions
              draft={current}
              result={result}
              onDraft={onDraft}
              onHsaAllocationIntent={() => {}}
            />
          )}
        </Gated>,
      );
      return inputLabelled(container, "Agreed primary share");
    }

    it("clears instead of refilling itself with 0", () => {
      const input = renderAssumptions();

      expect(input.value).toBe("50");
      expect(deleteEveryCharacter(input)).toBe("");
      expect(errors).toEqual([]);
    });

    it("never hands the whole family limit to the spouse mid-edit", () => {
      const input = renderAssumptions();

      fill(input, "");
      blur(input);

      expect(input.value).toBe("50");
      expect(
        accepted.map((plan) => plan.spouseHsaFamilyAllocationPpm),
      ).not.toContain(1_000_000);
    });
  });

  /**
   * An edit that ends empty leaves the field exactly where it started, whatever
   * route emptied it — backspace, selection, cut, code, whitespace. Each case
   * asserts the persisted name as well as the rendered one, because the defect
   * these were written against left a truncated name in the database while the
   * box looked settled and the header said "Saved".
   */
  describe("an empty blur leaves the value the edit began from", () => {
    it("restores the pre-edit category name after backspacing every character", () => {
      const input = openCategoryEditor("Groceries2");

      expect(deleteEveryCharacter(input)).toBe("");
      blur(input);

      expect(committedExpenseName("Groceries2")).toBe("Groceries2");
      expect(input.value).toBe("Groceries2");
      expect(errors).toEqual([]);
    });

    it("restores the pre-edit expense name after backspacing every character", () => {
      renderLedger("Groceries2");
      const input = inputLabelled(container, "Expense name");

      expect(deleteEveryCharacter(input)).toBe("");
      blur(input);

      expect(committedExpenseName("Groceries2")).toBe("Groceries2");
      expect(input.value).toBe("Groceries2");
      expect(errors).toEqual([]);
    });

    it("restores the pre-edit name when a revision is selected and deleted", () => {
      const input = openCategoryEditor("Groceries2");

      fill(input, "Groceries2 weekly");
      selectAllAndDelete(input);
      blur(input);

      expect(committedExpenseName("Groceries2")).toBe("Groceries2");
      expect(input.value).toBe("Groceries2");
      expect(errors).toEqual([]);
    });

    it("restores the pre-edit name when the value is cut away in two bites", () => {
      const input = openCategoryEditor("Groceries2");

      cutTo(input, "Groc");
      cutTo(input, "");
      blur(input);

      expect(committedExpenseName("Groceries2")).toBe("Groceries2");
      expect(input.value).toBe("Groceries2");
      expect(errors).toEqual([]);
    });

    it("restores the pre-edit name when a draft is cleared programmatically", () => {
      const input = openCategoryEditor("Groceries2");

      fill(input, "Groceries2 draft");
      programmaticallyClear(input);
      blur(input);

      expect(committedExpenseName("Groceries2")).toBe("Groceries2");
      expect(input.value).toBe("Groceries2");
      expect(errors).toEqual([]);
    });

    it("restores the pre-edit name behind a whitespace-only draft", () => {
      const input = openCategoryEditor("Groceries2");

      deleteEveryCharacter(input);
      fill(input, "   ");
      blur(input);

      expect(committedExpenseName("Groceries2")).toBe("Groceries2");
      expect(input.value).toBe("Groceries2");
      expect(errors).toEqual([]);
    });

    it("restores where the latest edit began, not where the first one did", () => {
      const input = openCategoryEditor("Groceries2");

      fill(input, "Utilities");
      blur(input);
      expect(committedExpenseName("Groceries2")).toBe("Utilities");

      expect(deleteEveryCharacter(input)).toBe("");
      blur(input);

      expect(committedExpenseName("Groceries2")).toBe("Utilities");
      expect(input.value).toBe("Utilities");
      expect(errors).toEqual([]);
    });

    it("still goes fully blank at every keystroke of the deletion", () => {
      const input = openCategoryEditor("Groceries2");

      for (let kept = "Groceries2".length - 1; kept >= 0; kept -= 1) {
        fill(input, "Groceries2".slice(0, kept));
        expect(input.value).toBe("Groceries2".slice(0, kept));
      }
      expect(errors).toEqual([]);
    });

    it("leaves empty committable on a field that has not opted in", () => {
      const committed: string[] = [];
      function StartingSavings() {
        const [value, setValue] = useState("120");
        return (
          <BufferedTextInput
            aria-label="Starting savings"
            value={value}
            onValue={(next) => {
              committed.push(next);
              setValue(next);
            }}
          />
        );
      }
      render(<StartingSavings />);
      const input = inputLabelled(container, "Starting savings");

      expect(deleteEveryCharacter(input)).toBe("");
      blur(input);

      expect(input.value).toBe("");
      expect(committed.at(-1)).toBe("");
    });
  });

  it("still refuses to persist an empty name", () => {
    const forwardForPersistence = vi.fn();
    const plan = storedPlan(2026, { expenses: [category({ name: "" })] });

    expect(acceptCalculablePlanDraft(plan, forwardForPersistence)).toMatch(
      /Names and groups must contain 1 to 100 characters/,
    );
    expect(forwardForPersistence).not.toHaveBeenCalled();
  });
});

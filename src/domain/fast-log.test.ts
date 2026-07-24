import { describe, expect, it } from "vitest";
import type { BudgetCategory, TransactionEntry } from "./budget";
import {
  actualExpenseDateError,
  commitFastLogEntry,
  deleteFastLogEntry,
  fastLogCategoryOptions,
  fastLogDeleteTransition,
  fastLogEditTransition,
  fastLogSaveTransition,
  maximumActualExpenseDate,
  planYearHasStarted,
  rankFastLogCategories,
  undoFastLogEntry,
} from "./fast-log";
import { storedPlan } from "@/test/fixtures/plans";

const category: BudgetCategory = {
  id: "00000000-0000-4000-8000-000000000101",
  name: "Coffee",
  group: "Everyday",
  cadence: "monthly",
  amountCents: 0,
  sortOrder: 0,
  guidanceBucket: "wants",
  colorToken: "amber",
  archived: false,
};

function transaction(
  id: string,
  title: string,
  categoryId = category.id,
): TransactionEntry {
  return {
    id,
    categoryId,
    amountCents: 500,
    title,
    date: "2026-07-24",
    createdAt: "2026-07-24T12:00:00.000Z",
    updatedAt: "2026-07-24T12:00:00.000Z",
  };
}

describe("Fast Log plan transitions", () => {
  it("keeps actual expenses at or before local today", () => {
    expect(planYearHasStarted(2027, "2026-07-24")).toBe(false);
    expect(planYearHasStarted(2026, "2026-07-24")).toBe(true);
    expect(maximumActualExpenseDate(2025, "2026-07-24")).toBe("2025-12-31");
    expect(maximumActualExpenseDate(2026, "2026-07-24")).toBe("2026-07-24");
    expect(actualExpenseDateError("2026-07-25", 2026, "2026-07-24")).toBe(
      "Actual expenses cannot be dated in the future.",
    );
    expect(actualExpenseDateError("2026-07-24", 2026, "2026-07-24")).toBeNull();
  });

  it("ranks active categories by recency before unused plan order", () => {
    const categories: BudgetCategory[] = [
      { ...category, id: "unused-first", sortOrder: 0 },
      { ...category, id: "frequent", sortOrder: 1 },
      { ...category, id: "recent", sortOrder: 2 },
      { ...category, id: "unused-last", sortOrder: 3 },
      { ...category, id: "archived", sortOrder: 4, archived: true },
    ];
    const transactions = [
      {
        ...transaction("frequent-1", "First", "frequent"),
        date: "2026-07-20",
      },
      {
        ...transaction("frequent-2", "Second", "frequent"),
        date: "2026-07-20",
      },
      {
        ...transaction("recent-1", "Recent", "recent"),
        date: "2026-07-23",
      },
      transaction("archived-1", "Archived", "archived"),
    ];

    expect(
      rankFastLogCategories(categories, transactions).map(({ id }) => id),
    ).toEqual(["recent", "frequent", "unused-first", "unused-last"]);
  });

  it("uses frequency before plan order when recency matches", () => {
    const categories: BudgetCategory[] = [
      { ...category, id: "single", sortOrder: 0 },
      { ...category, id: "frequent", sortOrder: 1 },
    ];
    const transactions = [
      transaction("single-1", "Single", "single"),
      transaction("frequent-1", "First", "frequent"),
      transaction("frequent-2", "Second", "frequent"),
    ];

    expect(
      rankFastLogCategories(categories, transactions).map(({ id }) => id),
    ).toEqual(["frequent", "single"]);
  });

  it("keeps an archived category available only for its existing edit", () => {
    const archived = { ...category, id: "archived", archived: true };
    const categories = [category, archived];

    expect(
      fastLogCategoryOptions(categories, [], archived.id).map(({ id }) => id),
    ).toEqual(["archived", category.id]);
    expect(fastLogCategoryOptions(categories, []).map(({ id }) => id)).toEqual([
      category.id,
    ]);
  });

  it("commits a provisional category and expense in one plan transition", () => {
    const plan = storedPlan();
    const entry = transaction("00000000-0000-4000-8000-000000000201", "Latte");

    const next = commitFastLogEntry(plan, entry, category);

    expect(next.expenses).toContainEqual(category);
    expect(next.transactions).toContainEqual(entry);
    expect(plan.expenses).toEqual([]);
    expect(plan.transactions).toEqual([]);
  });

  it("carries each prior save into save-and-add-another", () => {
    const plan = storedPlan();
    const first = transaction("00000000-0000-4000-8000-000000000201", "Latte");
    const second = transaction("00000000-0000-4000-8000-000000000202", "Tea");

    const afterFirst = commitFastLogEntry(plan, first, category);
    const afterSecond = commitFastLogEntry(afterFirst, second);

    expect(afterSecond.expenses).toEqual([category]);
    expect(afterSecond.transactions).toEqual([first, second]);
  });

  it("replaces edits by ID without duplicating transactions", () => {
    const original = transaction(
      "00000000-0000-4000-8000-000000000201",
      "Latte",
    );
    const plan = storedPlan(2026, {
      expenses: [category],
      transactions: [original],
    });

    const next = commitFastLogEntry(plan, { ...original, title: "Coffee" });

    expect(next.transactions).toEqual([{ ...original, title: "Coffee" }]);
  });

  it("captures the latest reconciled preimage for edit Undo", () => {
    const opened = transaction(
      "00000000-0000-4000-8000-000000000201",
      "Opened title",
    );
    const remote = {
      ...opened,
      title: "Remote correction",
      updatedAt: "2026-07-24T12:01:00.000Z",
    };
    const local = {
      ...opened,
      title: "Local correction",
      updatedAt: "2026-07-24T12:02:00.000Z",
    };
    const latest = storedPlan(2026, {
      expenses: [category],
      transactions: [remote],
    });

    const transition = fastLogSaveTransition(latest, local, null, true);
    if (!transition) throw new Error("Expected an edit transition");
    const undone = undoFastLogEntry(
      transition.nextPlan,
      transition.before,
      transition.after,
    );

    expect(transition.before).toEqual(remote);
    expect(undone.transactions).toEqual([remote]);
  });

  it("rebases only dirty edit fields onto a concurrent correction", () => {
    const opened = {
      ...transaction("00000000-0000-4000-8000-000000000201", "Opened title"),
      note: "Opened note",
    };
    const remote = {
      ...opened,
      note: "Remote note",
      updatedAt: "2026-07-24T12:01:00.000Z",
    };
    const latest = storedPlan(2026, {
      expenses: [category],
      transactions: [remote],
    });

    const transition = fastLogEditTransition(
      latest,
      opened.id,
      { title: "Local title" },
      "2026-07-24T12:02:00.000Z",
    );

    expect(transition?.before).toEqual(remote);
    expect(transition?.after).toMatchObject({
      title: "Local title",
      note: "Remote note",
      updatedAt: "2026-07-24T12:02:00.000Z",
    });
  });

  it("does not recreate a transaction deleted while its edit form was open", () => {
    const opened = transaction(
      "00000000-0000-4000-8000-000000000201",
      "Opened title",
    );
    const edited = {
      ...opened,
      title: "Local correction",
      updatedAt: "2026-07-24T12:02:00.000Z",
    };
    const latest = storedPlan(2026, {
      expenses: [category],
      transactions: [],
    });

    expect(fastLogSaveTransition(latest, edited, null, true)).toBeNull();
  });

  it("does not resurrect a transaction deleted while its editor was open", () => {
    const latest = storedPlan(2026, {
      expenses: [category],
      transactions: [],
    });

    expect(
      fastLogDeleteTransition(latest, "00000000-0000-4000-8000-000000000201"),
    ).toBeNull();
  });

  it("undoes one transaction without replacing concurrently reconciled peers", () => {
    const entry = transaction("00000000-0000-4000-8000-000000000201", "Latte");
    const remote = transaction(
      "00000000-0000-4000-8000-000000000202",
      "Remote",
    );
    const plan = storedPlan(2026, {
      expenses: [category],
      transactions: [entry],
    });

    const deleted = deleteFastLogEntry(plan, entry.id);
    const reconciled = { ...deleted, transactions: [remote] };
    const restored = undoFastLogEntry(reconciled, entry, null);

    expect(deleted.transactions).toEqual([]);
    expect(restored.transactions).toEqual([remote, entry]);
  });

  it("does not undo over a same-timestamp reconciliation of the same transaction", () => {
    const before = transaction("00000000-0000-4000-8000-000000000201", "Latte");
    const after = {
      ...before,
      title: "Coffee",
      updatedAt: "2026-07-24T12:01:00.000Z",
    };
    const remote = {
      ...after,
      title: "Remote correction",
    };
    const plan = storedPlan(2026, {
      expenses: [category],
      transactions: [remote],
    });

    expect(undoFastLogEntry(plan, before, after)).toBe(plan);
  });
});

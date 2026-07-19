import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { guidanceBucket, type ExpenseEntry } from "@/domain/budget";
import type { PlanResult } from "@/domain/tax/engine";
import { BufferedTextInput } from "./buffered-text-input";
import { isUnusedDefaultExpense } from "./expense-visibility";
import { centsFromInput, money, type StoredPlan } from "./plan-types";
import styles from "./plan.module.css";

export function ExpenseLedger({
  draft,
  result,
  onDraft,
}: {
  draft: StoredPlan;
  result: PlanResult;
  onDraft: (plan: StoredPlan) => void;
}) {
  const [expandedUnusedYears, setExpandedUnusedYears] = useState<
    Record<number, boolean>
  >({});
  const [openDetailIds, setOpenDetailIds] = useState<Record<string, boolean>>(
    {},
  );
  const toggleDetails = (id: string) =>
    setOpenDetailIds((current) => ({ ...current, [id]: !current[id] }));
  const showUnusedExpenses = Boolean(expandedUnusedYears[draft.year]);
  const unusedExpenses = draft.expenses.filter(isUnusedDefaultExpense);
  const renderedExpenses = showUnusedExpenses
    ? draft.expenses
    : draft.expenses.filter((expense) => !isUnusedDefaultExpense(expense));
  const updateExpense = (id: string, change: Partial<ExpenseEntry>) =>
    onDraft({
      ...draft,
      expenses: draft.expenses.map((entry) =>
        entry.id === id ? { ...entry, ...change } : entry,
      ),
    });

  function addExpense() {
    onDraft({
      ...draft,
      expenses: [
        ...draft.expenses,
        {
          id: crypto.randomUUID(),
          name: "New expense",
          group: "Other",
          cadence: "monthly",
          amountCents: 0,
          sortOrder: draft.expenses.length,
          guidanceBucket: "wants",
        },
      ],
    });
  }

  function moveExpense(index: number, direction: -1 | 1) {
    const next = [...draft.expenses];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onDraft({
      ...draft,
      expenses: next.map((entry, sortOrder) => ({ ...entry, sortOrder })),
    });
  }

  return (
    <section className={styles.ledgerCard} aria-labelledby="expenses-title">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Your planned life</p>
          <h1 id="expenses-title">Monthly expense ledger</h1>
        </div>
        <button className={styles.addButton} onClick={addExpense}>
          <Plus size={17} /> Add expense
        </button>
      </div>
      <div className={styles.ledgerTotal}>
        <span>Planned expenses · {draft.expenses.length} categories</span>
        <strong>{money(result.expensesMonthlyCents, 2)} / month</strong>
      </div>
      <p className={styles.ledgerHint}>
        Type an amount on any row. Tap <ChevronDown size={13} aria-hidden /> to
        edit its details or remove it.
      </p>
      {unusedExpenses.length > 0 && (
        <button
          className={styles.unusedExpensesButton}
          type="button"
          aria-expanded={showUnusedExpenses}
          aria-controls="expense-rows"
          onClick={() =>
            setExpandedUnusedYears((current) => ({
              ...current,
              [draft.year]: !showUnusedExpenses,
            }))
          }
        >
          {showUnusedExpenses ? "Hide" : "Show"} {unusedExpenses.length} unused
          categor{unusedExpenses.length === 1 ? "y" : "ies"}
        </button>
      )}
      <div className={styles.expenseList} id="expense-rows">
        {renderedExpenses.map((expense) => {
          const index = draft.expenses.findIndex(({ id }) => id === expense.id);
          const detailsOpen = Boolean(openDetailIds[expense.id]);
          return (
            <div className={styles.expenseRow} key={expense.id}>
              <div className={styles.expensePrimary}>
                <BufferedTextInput
                  className={styles.expenseName}
                  aria-label="Expense name"
                  value={expense.name}
                  maxLength={100}
                  onValue={(name) => updateExpense(expense.id, { name })}
                />
                <label className={styles.moneyInput}>
                  <span>$</span>
                  <input
                    aria-label={`${expense.name} ${expense.cadence} amount`}
                    type="number"
                    min="0"
                    step="1"
                    inputMode="decimal"
                    value={expense.amountCents / 100 || ""}
                    placeholder="0"
                    onChange={(event) =>
                      updateExpense(expense.id, {
                        amountCents: centsFromInput(event.target.value),
                      })
                    }
                  />
                </label>
                <button
                  className={styles.detailsToggle}
                  aria-label={`Category, cadence, and order for ${expense.name}`}
                  aria-expanded={detailsOpen}
                  aria-controls={`expense-details-${expense.id}`}
                  data-active={detailsOpen}
                  onClick={() => toggleDetails(expense.id)}
                >
                  <ChevronDown size={18} />
                </button>
              </div>
              {detailsOpen && (
                <div
                  className={styles.expenseSecondary}
                  id={`expense-details-${expense.id}`}
                >
                  <label className={styles.detailField}>
                    <span>Group</span>
                    <BufferedTextInput
                      className={styles.expenseGroup}
                      aria-label={`${expense.name} group`}
                      value={expense.group}
                      maxLength={100}
                      onValue={(group) => updateExpense(expense.id, { group })}
                    />
                  </label>
                  <label className={styles.detailField}>
                    <span>Type</span>
                    <select
                      aria-label={`${expense.name} guidance bucket`}
                      value={guidanceBucket(expense)}
                      onChange={(event) =>
                        updateExpense(expense.id, {
                          guidanceBucket: event.target
                            .value as ExpenseEntry["guidanceBucket"],
                        })
                      }
                    >
                      <option value="needs">Need</option>
                      <option value="wants">Want</option>
                      <option value="saving">Saving / investing</option>
                    </select>
                  </label>
                  <label className={styles.detailField}>
                    <span>Timing</span>
                    <select
                      aria-label={`${expense.name} cadence`}
                      value={expense.cadence}
                      onChange={(event) =>
                        updateExpense(expense.id, {
                          cadence: event.target
                            .value as ExpenseEntry["cadence"],
                        })
                      }
                    >
                      <option value="monthly">monthly</option>
                      <option value="yearly">yearly ÷ 12</option>
                    </select>
                  </label>
                  <div className={styles.detailField}>
                    <span>Order</span>
                    <div className={styles.reorderButtons}>
                      <button
                        aria-label={`Move ${expense.name} up`}
                        onClick={() => moveExpense(index, -1)}
                        disabled={index === 0}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        aria-label={`Move ${expense.name} down`}
                        onClick={() => moveExpense(index, 1)}
                        disabled={index === draft.expenses.length - 1}
                      >
                        <ArrowDown size={15} />
                      </button>
                    </div>
                  </div>
                  <div className={styles.detailField}>
                    <span>Remove</span>
                    <button
                      className={styles.iconButton}
                      aria-label={`Delete ${expense.name}`}
                      onClick={() =>
                        onDraft({
                          ...draft,
                          expenses: draft.expenses
                            .filter(({ id }) => id !== expense.id)
                            .map((entry, sortOrder) => ({
                              ...entry,
                              sortOrder,
                            })),
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

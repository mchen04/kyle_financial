"use client";

import { Check, Plus, X } from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";
import {
  createBudgetCategory,
  type BudgetCategory,
  type TransactionEntry,
} from "@/domain/budget";
import {
  actualExpenseDateError,
  fastLogCategoryOptions,
  fastLogDeleteTransition,
  fastLogEditTransition,
  fastLogSaveTransition,
  maximumActualExpenseDate,
  type FastLogEditPatch,
  type FastLogTransition,
} from "@/domain/fast-log";
import { localDateBelongsToYear } from "@/domain/local-calendar-date";
import styles from "./fast-log-sheet.module.css";
import { centsFromInput, type StoredPlan } from "./plan-types";

export interface FastLogState {
  transactionId?: string;
}

function newCategory(plan: StoredPlan): BudgetCategory {
  return createBudgetCategory(crypto.randomUUID(), plan.expenses.length);
}

export function FastLogSheet({
  today,
  plan,
  state,
  onClose,
  onDraft,
  onSaved,
  onDeleted,
}: {
  today: string;
  plan: StoredPlan;
  state: FastLogState;
  onClose: () => void;
  onDraft: (
    update: (latestPlan: StoredPlan) => FastLogTransition | null,
  ) => FastLogTransition | null;
  onSaved: (
    transaction: TransactionEntry,
    previousTransaction: TransactionEntry | null,
  ) => void;
  onDeleted: (transaction: TransactionEntry) => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const categorySelectRef = useRef<HTMLSelectElement>(null);
  const newCategoryInputRef = useRef<HTMLInputElement>(null);
  const maximumDate = maximumActualExpenseDate(plan.year, today);
  const [workingPlan, setWorkingPlan] = useState(plan);
  const existing = workingPlan.transactions.find(
    ({ id }) => id === state.transactionId,
  );
  const [createdCategory, setCreatedCategory] = useState<BudgetCategory | null>(
    null,
  );
  const available = fastLogCategoryOptions(
    [
      ...new Map(
        [
          ...workingPlan.expenses,
          ...(createdCategory ? [createdCategory] : []),
        ].map((category) => [category.id, category]),
      ).values(),
    ],
    workingPlan.transactions,
    existing?.categoryId,
  );
  const [amount, setAmount] = useState(
    existing ? (existing.amountCents / 100).toString() : "",
  );
  const [categoryId, setCategoryId] = useState(
    existing?.categoryId ?? available[0]?.id ?? "",
  );
  const [title, setTitle] = useState(existing?.title ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [date, setDate] = useState(
    existing?.date ??
      (localDateBelongsToYear(today, plan.year) ? today : `${plan.year}-01-01`),
  );
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [dirtyFields, setDirtyFields] = useState<
    Partial<Record<keyof FastLogEditPatch, true>>
  >({});
  const markDirty = (field: keyof FastLogEditPatch) =>
    setDirtyFields((current) => ({ ...current, [field]: true }));
  const save = (addAnother = false) => {
    setConfirmation("");
    const amountCents = centsFromInput(amount);
    if (amountCents <= 0) return setError("Enter an amount greater than zero.");
    if (!categoryId) return setError("Choose a category.");
    if (!title.trim()) return setError("Add a short title.");
    const dateError = actualExpenseDateError(date, plan.year, today);
    if (dateError) return setError(dateError);
    const now = new Date().toISOString();
    const transaction: TransactionEntry = {
      id: existing?.id ?? crypto.randomUUID(),
      categoryId,
      amountCents,
      title: title.trim(),
      ...(note.trim() ? { note: note.trim() } : {}),
      date,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const editPatch: FastLogEditPatch = {
      ...(dirtyFields.categoryId ? { categoryId } : {}),
      ...(dirtyFields.amountCents ? { amountCents } : {}),
      ...(dirtyFields.title ? { title: title.trim() } : {}),
      ...(dirtyFields.note
        ? { note: note.trim() ? note.trim() : undefined }
        : {}),
      ...(dirtyFields.date ? { date } : {}),
    };
    const transition = onDraft((latestPlan) =>
      existing
        ? fastLogEditTransition(
            latestPlan,
            existing.id,
            editPatch,
            now,
            createdCategory,
          )
        : fastLogSaveTransition(latestPlan, transaction, createdCategory),
    );
    if (!transition) {
      setError(
        "This expense was deleted on another device. Close Fast Log to refresh.",
      );
      return;
    }
    setWorkingPlan(transition.nextPlan);
    if (!transition.after) return;
    if (addAnother) {
      setCreatedCategory(null);
      setAmount("");
      setTitle("");
      setNote("");
      setDirtyFields({});
      setError("");
      setConfirmation("Expense saved. Add another when ready.");
      return;
    }
    onSaved(transition.after, transition.before);
    onClose();
  };
  const createCategory = () => {
    if (!categoryName.trim()) return;
    const category = {
      ...newCategory(workingPlan),
      name: categoryName.trim(),
    };
    setCreatedCategory(category);
    setCategoryId(category.id);
    markDirty("categoryId");
    setCategoryName("");
    setAddingCategory(false);
    requestAnimationFrame(() => categorySelectRef.current?.focus());
  };
  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ) ?? []),
    ].filter((element) => element.getClientRects().length > 0);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return (
    <div className={styles.sheetBackdrop} onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fast-log-title"
        onKeyDown={handleDialogKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className={styles.eyebrow}>One clean entry</p>
            <h2 id="fast-log-title">
              {existing ? "Edit expense" : "Fast Log"}
            </h2>
          </div>
          <button aria-label="Close Fast Log" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className={styles.sheetFields}>
          <label className={styles.amountField}>
            Amount
            <span>
              $
              <input
                autoFocus
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(event) => {
                  setConfirmation("");
                  setAmount(event.target.value);
                  markDirty("amountCents");
                }}
              />
            </span>
          </label>
          <label>
            Category
            <select
              ref={categorySelectRef}
              value={categoryId}
              onChange={(event) => {
                setConfirmation("");
                setCategoryId(event.target.value);
                markDirty("categoryId");
              }}
            >
              <option value="" disabled>
                Choose category
              </option>
              {available.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {category.archived ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </label>
          {addingCategory ? (
            <div className={styles.inlineCategory}>
              <label>
                New category
                <input
                  ref={newCategoryInputRef}
                  value={categoryName}
                  maxLength={100}
                  onChange={(event) => {
                    setConfirmation("");
                    setCategoryName(event.target.value);
                  }}
                />
              </label>
              <button onClick={createCategory}>Create</button>
            </div>
          ) : (
            <button
              className={styles.inlineAction}
              onClick={() => {
                setConfirmation("");
                setAddingCategory(true);
                requestAnimationFrame(() =>
                  newCategoryInputRef.current?.focus(),
                );
              }}
            >
              <Plus /> Create category without losing this expense
            </button>
          )}
          <label>
            What was it?
            <input
              value={title}
              maxLength={100}
              placeholder="Groceries"
              onChange={(event) => {
                setConfirmation("");
                setTitle(event.target.value);
                markDirty("title");
              }}
            />
          </label>
          <label>
            Date
            <input
              type="date"
              value={date}
              min={`${plan.year}-01-01`}
              max={maximumDate}
              onChange={(event) => {
                setConfirmation("");
                setDate(event.target.value);
                markDirty("date");
              }}
            />
          </label>
          <label>
            Note <small>Optional</small>
            <input
              value={note}
              maxLength={500}
              onChange={(event) => {
                setConfirmation("");
                setNote(event.target.value);
                markDirty("note");
              }}
            />
          </label>
        </div>
        <p className={styles.sheetScrollCue}>
          Scroll form for the optional note ↓
        </p>
        {error && (
          <p className={styles.formError} role="alert">
            {error}
          </p>
        )}
        {confirmation && (
          <p className={styles.formStatus} role="status">
            {confirmation}
          </p>
        )}
        <footer>
          {existing && (
            <button
              className={styles.dangerButton}
              onClick={() => {
                const transition = onDraft((latestPlan) =>
                  fastLogDeleteTransition(latestPlan, existing.id),
                );
                if (transition?.before) {
                  setWorkingPlan(transition.nextPlan);
                  onDeleted(transition.before);
                }
                onClose();
              }}
            >
              Delete
            </button>
          )}
          {!existing && (
            <button
              className={styles.secondaryAction}
              aria-label="Save and add another"
              onClick={() => save(true)}
            >
              <span className={styles.sheetActionFull}>Save & add another</span>
              <span className={styles.sheetActionShort}>Save & new</span>
            </button>
          )}
          <button
            className={styles.primaryAction}
            aria-label="Save expense"
            onClick={() => save(false)}
          >
            <Check /> Save expense
          </button>
        </footer>
      </section>
    </div>
  );
}

"use client";

import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import {
  addBudgetCategory,
  CATEGORY_COLOR_TOKENS,
  guidanceBucket,
  moveActiveBudgetCategory,
  patchBudgetCategory,
  type BudgetCategory,
  type CategoryColorToken,
  type GuidanceBucket,
} from "@/domain/budget";
import { centsFromInput, type StoredPlan } from "./plan-types";
import { BackPage } from "./cockpit-back-page";
import { BufferedTextInput } from "./buffered-text-input";
import styles from "./cockpit-category-settings.module.css";

const BUCKET_LABELS: Record<GuidanceBucket, string> = {
  needs: "Needs",
  wants: "Wants",
  saving: "Saving",
};

export function EditBudgetSurface({
  plan,
  onDraft,
  onBack,
}: {
  plan: StoredPlan;
  onDraft: (plan: StoredPlan) => void;
  onBack: () => void;
}) {
  const update = (id: string, value: string) => {
    onDraft({
      ...plan,
      expenses: plan.expenses.map((category) =>
        category.id === id
          ? { ...category, amountCents: centsFromInput(value) }
          : category,
      ),
    });
  };
  return (
    <BackPage title="Edit monthly budget" onBack={onBack}>
      <p className={styles.pageIntro}>Annual categories remain annual.</p>
      <section className={styles.formList}>
        {plan.expenses
          .filter(({ archived }) => !archived)
          .map((category) => (
            <label key={category.id} className={styles.amountRow}>
              <span>
                <strong>{category.name}</strong>
                <small>
                  {BUCKET_LABELS[guidanceBucket(category)]} · {category.cadence}
                </small>
              </span>
              <span>
                $
                <BufferedTextInput
                  inputMode="decimal"
                  value={(category.amountCents / 100).toString()}
                  onValue={(value) => update(category.id, value)}
                  aria-label={`${category.name} planned amount`}
                />
              </span>
            </label>
          ))}
      </section>
    </BackPage>
  );
}

export function ManageCategoriesSurface({
  plan,
  onDraft,
  onBack,
}: {
  plan: StoredPlan;
  onDraft: (plan: StoredPlan) => void;
  onBack: () => void;
}) {
  const sorted = plan.expenses.toSorted(
    (left, right) =>
      Number(left.archived) - Number(right.archived) ||
      left.sortOrder - right.sortOrder,
  );
  const patch = (id: string, values: Partial<BudgetCategory>) =>
    onDraft({
      ...plan,
      expenses: patchBudgetCategory(plan.expenses, id, values),
    });
  const move = (id: string, direction: -1 | 1) =>
    onDraft({
      ...plan,
      expenses: moveActiveBudgetCategory(plan.expenses, id, direction),
    });
  return (
    <BackPage title="Manage categories" onBack={onBack}>
      <div className={styles.toolbar}>
        <p>Archiving keeps the category&apos;s history.</p>
        <button
          onClick={() =>
            onDraft({
              ...plan,
              expenses: addBudgetCategory(plan.expenses, crypto.randomUUID()),
            })
          }
        >
          <Plus /> Add category
        </button>
      </div>
      <section className={styles.formList}>
        {sorted.map((category) => (
          <div
            className={styles.manageRow}
            key={category.id}
            data-archived={category.archived}
          >
            <i data-color={category.colorToken} aria-hidden="true" />
            <label>
              <span className={styles.srOnly}>Category name</span>
              <input
                value={category.name}
                maxLength={100}
                onChange={(event) =>
                  patch(category.id, { name: event.target.value })
                }
              />
            </label>
            <select
              aria-label={`${category.name} type`}
              value={guidanceBucket(category)}
              onChange={(event) =>
                patch(category.id, {
                  guidanceBucket: event.target.value as GuidanceBucket,
                  group: BUCKET_LABELS[event.target.value as GuidanceBucket],
                })
              }
            >
              {Object.entries(BUCKET_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label={`${category.name} color`}
              value={category.colorToken}
              onChange={(event) =>
                patch(category.id, {
                  colorToken: event.target.value as CategoryColorToken,
                })
              }
            >
              {CATEGORY_COLOR_TOKENS.map((color) => (
                <option key={color}>{color}</option>
              ))}
            </select>
            <div className={styles.reorderButtons}>
              <button
                aria-label={`Move ${category.name} up`}
                disabled={category.archived}
                onClick={() => move(category.id, -1)}
              >
                <ArrowUp />
              </button>
              <button
                aria-label={`Move ${category.name} down`}
                disabled={category.archived}
                onClick={() => move(category.id, 1)}
              >
                <ArrowDown />
              </button>
            </div>
            <button
              className={styles.archiveButton}
              onClick={() =>
                patch(category.id, { archived: !category.archived })
              }
            >
              {category.archived ? "Reactivate" : "Archive"}
            </button>
          </div>
        ))}
      </section>
    </BackPage>
  );
}

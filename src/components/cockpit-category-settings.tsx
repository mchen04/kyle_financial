"use client";

import { ArrowDown, ArrowUp, ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
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
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
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
        <p>Tap a category to rename, recolour, reorder, or archive it.</p>
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
        {sorted.map((category) => {
          const open = Boolean(openIds[category.id]);
          return (
            <div
              className={styles.manageItem}
              key={category.id}
              data-archived={category.archived}
            >
              {/* C1/C5. The collapsed row is the same 48px row every other list
                  in this app uses — colour dot, name, and the two facts that
                  distinguish one category from another — so twelve categories
                  read on one screen where five used to. It states everything it
                  contains: the name, the colour (as the dot itself), the type,
                  and, when it applies, that the category is archived. Only the
                  controls are behind the disclosure, and the disclosure is
                  labelled with what it opens. */}
              <button
                type="button"
                className={styles.manageRow}
                aria-expanded={open}
                aria-controls={`category-editor-${category.id}`}
                aria-label={`Rename, recolour, reorder, or archive ${category.name}`}
                onClick={() =>
                  setOpenIds((current) => ({
                    ...current,
                    [category.id]: !current[category.id],
                  }))
                }
              >
                <i data-color={category.colorToken} aria-hidden="true" />
                <strong>{category.name}</strong>
                <em>
                  {BUCKET_LABELS[guidanceBucket(category)]}
                  {category.archived ? " · Archived" : ""}
                </em>
                <ChevronDown />
              </button>
              {open && (
                <div
                  className={styles.manageEditor}
                  id={`category-editor-${category.id}`}
                >
                  <label className={styles.editorField}>
                    <span>Name</span>
                    <input
                      aria-label={`${category.name} name`}
                      value={category.name}
                      maxLength={100}
                      onChange={(event) =>
                        patch(category.id, { name: event.target.value })
                      }
                    />
                  </label>
                  <label className={styles.editorField}>
                    <span>Type</span>
                    <select
                      aria-label={`${category.name} type`}
                      value={guidanceBucket(category)}
                      onChange={(event) =>
                        patch(category.id, {
                          guidanceBucket: event.target.value as GuidanceBucket,
                          group:
                            BUCKET_LABELS[event.target.value as GuidanceBucket],
                        })
                      }
                    >
                      {Object.entries(BUCKET_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.editorField}>
                    <span>Colour</span>
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
                  </label>
                  <div className={styles.editorField}>
                    <span>Order</span>
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
                  </div>
                  <div className={styles.editorField}>
                    <span>History</span>
                    <button
                      className={styles.archiveButton}
                      onClick={() =>
                        patch(category.id, { archived: !category.archived })
                      }
                    >
                      {category.archived ? "Reactivate" : "Archive"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>
    </BackPage>
  );
}

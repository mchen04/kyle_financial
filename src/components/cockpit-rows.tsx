import { ChevronRight } from "lucide-react";
import type { BudgetCategory, TransactionEntry } from "@/domain/budget";
import type { CategoryRollup } from "@/domain/daily-money";
import { money } from "./plan-types";
import styles from "./cockpit-shared.module.css";

export function Metric({
  label,
  value,
  signed = false,
}: {
  label: string;
  value: number;
  signed?: boolean;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd data-negative={value < 0}>
        {signed && value > 0 ? "+" : ""}
        {money(value)}
      </dd>
    </div>
  );
}

export function CategoryRow({
  item,
  onClick,
}: {
  item: CategoryRollup;
  onClick?: () => void;
}) {
  // One phrasing for both period phases. A future period simply reads
  // "$0 spent of $240" / "$240 remaining", which is what the rollup says, and
  // keeps the row's line box identical when the selected month steps forward.
  // Every figure lives in one fixed-width column so a change in digit count
  // cannot re-flow the category name, and the row keeps the same height in
  // every period phase. "spent"/"funded" is dropped from the ratio because
  // "remaining"/"left to fund" beside it already carries that distinction.
  const content = (
    <>
      <i data-color={item.category.colorToken} aria-hidden="true" />
      <span>
        <strong>{item.category.name}</strong>
      </span>
      <span className={styles.rowFigures}>
        <small>
          {money(item.actualCents)} of {money(item.allocatedCents)}
        </small>
        <em data-negative={item.remainingCents < 0}>
          {item.remainingCents < 0
            ? // Over budget is the attention signal the surface must not bury,
              // so the row says "over" instead of a negative "remaining".
              `${money(Math.abs(item.remainingCents))} over`
            : `${money(item.remainingCents)} ${item.remainingLabel}`}
        </em>
      </span>
      {onClick && <ChevronRight />}
    </>
  );
  return onClick ? (
    <button className={styles.categoryRow} onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className={styles.categoryRow}>{content}</div>
  );
}

export function TransactionRows({
  transactions,
  categories,
  onEdit,
}: {
  transactions: readonly TransactionEntry[];
  categories: readonly BudgetCategory[];
  onEdit: (id: string) => void;
}) {
  const byId = new Map(categories.map((category) => [category.id, category]));
  return (
    <div className={styles.transactionRows}>
      {transactions.map((transaction) => {
        const category = byId.get(transaction.categoryId);
        return (
          <button
            key={transaction.id}
            className={styles.transactionRow}
            onClick={() => onEdit(transaction.id)}
          >
            <i
              data-color={category?.colorToken ?? "slate"}
              aria-hidden="true"
            />
            <span>
              <strong>{transaction.title}</strong>
              <small>
                {category?.name ?? "Archived category"} · {transaction.date}
              </small>
              {transaction.note && (
                <small className={styles.transactionNote}>
                  {transaction.note}
                </small>
              )}
            </span>
            <em>{money(transaction.amountCents)}</em>
            <ChevronRight />
          </button>
        );
      })}
    </div>
  );
}

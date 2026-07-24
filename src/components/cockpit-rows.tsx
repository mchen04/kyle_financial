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
  unstarted = false,
}: {
  item: CategoryRollup;
  onClick?: () => void;
  unstarted?: boolean;
}) {
  const content = (
    <>
      <i data-color={item.category.colorToken} aria-hidden="true" />
      <span>
        <strong>{item.category.name}</strong>
        <small>
          {unstarted ? (
            <>{money(item.allocatedCents)} planned for this period</>
          ) : (
            <>
              {money(item.actualCents)} {item.actualLabel} of{" "}
              {money(item.allocatedCents)}
            </>
          )}
        </small>
      </span>
      <em data-negative={!unstarted && item.remainingCents < 0}>
        {money(unstarted ? item.allocatedCents : item.remainingCents)}{" "}
        {unstarted ? "allocated" : item.remainingLabel}
      </em>
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

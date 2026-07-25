import { CalendarDays, ChevronRight } from "lucide-react";
import type { BudgetCategory, TransactionEntry } from "@/domain/budget";
import {
  periodLabel,
  type CategoryRollup,
  type SelectedPeriod,
} from "@/domain/daily-money";
import { money } from "./plan-types";
import styles from "./cockpit-shared.module.css";

// Monthly wrap is reachable from Home and from Activity. C12 wants a labeled
// 48px row carrying its own summary value rather than a bare chevron, and it
// has to be the same row on both surfaces, so there is one definition of it.
export function MonthlyWrapRow({
  period,
  unstarted,
  onOpen,
}: {
  period: SelectedPeriod;
  unstarted: boolean;
  onOpen: () => void;
}) {
  return (
    <div className={styles.rowGroup}>
      <button
        className={styles.navRow}
        onClick={onOpen}
        disabled={period.kind !== "month" || unstarted}
      >
        <CalendarDays />
        <strong>Monthly wrap</strong>
        <em>
          {unstarted
            ? "Starts with the period"
            : period.kind === "month"
              ? periodLabel(period)
              : "Choose a month"}
        </em>
        <ChevronRight />
      </button>
    </div>
  );
}

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

// Activity used to carry the day in a section heading above each date's rows.
// C2 caps a surface at five section headers and gives a group of fewer than
// three rows no header at all, and a month of expenses is two dozen such
// groups, so the day rides on the row instead. Weekday is kept because the
// heading carried it.
const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

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
            // Stable hook for the density harness's long-list exemption: CSS
            // module class names are hashed, so the chrome-above-the-first-row
            // measurement needs a selector the build cannot rename. Costs 0px.
            data-density-row="transaction"
            // A noted transaction is a three-line block, which C3 sets at 1.5
            // leading and C1 (three-line rung) sizes at 80px. Declaring the
            // line count on the row is what lets the stylesheet pick the rung
            // instead of letting the height fall out of whatever the text did.
            data-lines={transaction.note ? "3" : "2"}
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
                {category?.name ?? "Archived category"} ·{" "}
                {DAY_FORMAT.format(new Date(`${transaction.date}T00:00:00Z`))}
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

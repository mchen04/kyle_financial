"use client";

import {
  CalendarDays,
  ChevronRight,
  CirclePlus,
  Plus,
  Search,
} from "lucide-react";
import { useState } from "react";
import {
  observedTransactionsThrough,
  periodLabel,
  rollupBudget,
  transactionIsInPeriod,
  type SelectedPeriod,
  unobservedTransactionsAfter,
} from "@/domain/daily-money";
import { BackPage } from "./cockpit-back-page";
import { PeriodControl } from "./cockpit-period-control";
import { selectedPeriodPhase } from "./cockpit-period-phase";
import { Metric, TransactionRows } from "./cockpit-rows";
import { money, type StoredPlan } from "./plan-types";
import styles from "./cockpit-shared.module.css";

export function ActivitySurface({
  today,
  plan,
  period,
  onPeriod,
  onEdit,
  onWrap,
  onFastLog,
}: {
  today: string;
  plan: StoredPlan;
  period: SelectedPeriod;
  onPeriod: (period: SelectedPeriod) => void;
  onEdit: (id: string) => void;
  onWrap: () => void;
  onFastLog?: () => void;
}) {
  const unstarted = selectedPeriodPhase(period, today) === "future";
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [visibleLimit, setVisibleLimit] = useState(100);
  const categories = plan.expenses;
  const observedTransactions = observedTransactionsThrough(
    plan.transactions,
    today,
  );
  const futureTransactions = unobservedTransactionsAfter(
    plan.transactions,
    today,
  ).toSorted((left, right) => right.date.localeCompare(left.date));
  const periodTransactions = observedTransactions.filter((transaction) =>
    transactionIsInPeriod(transaction, period),
  );
  const periodTotalCents = periodTransactions.reduce(
    (total, transaction) => total + transaction.amountCents,
    0,
  );
  const transactions = periodTransactions
    .filter(
      (transaction) =>
        categoryId === "all" || transaction.categoryId === categoryId,
    )
    .filter((transaction) => {
      const haystack =
        `${transaction.title} ${transaction.note ?? ""}`.toLowerCase();
      return haystack.includes(query.trim().toLowerCase());
    })
    .toSorted(
      (left, right) =>
        right.date.localeCompare(left.date) ||
        right.updatedAt.localeCompare(left.updatedAt),
    );
  const visibleTransactions = transactions.slice(0, visibleLimit);
  return (
    <div className={`${styles.surfaceStack} ${styles.activitySurface}`}>
      <header className={styles.surfaceHeader}>
        <div>
          <h1>Activity</h1>
          {/* C5: the period total is two facts nobody acts on, so it is one
              line under the heading rather than a bordered summary card. The
              period itself is named by the control beside it. */}
          <span className={styles.activityTotal}>
            {money(periodTotalCents)} · {periodTransactions.length}{" "}
            {periodTransactions.length === 1 ? "expense" : "expenses"}
          </span>
        </div>
        <PeriodControl period={period} today={today} onPeriod={onPeriod} />
      </header>
      {/* "What did I overspend on last month?" is a retrospective question, and
          a fresh reader reads that as a history question and taps Activity. The
          wrap is not removed from Home; this is a second path to the same
          surface, above a list that can run to hundreds of rows, carrying its
          own summary value rather than a bare chevron (C12). */}
      <div className={styles.rowGroup}>
        <button
          className={styles.navRow}
          onClick={onWrap}
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
      {futureTransactions.length > 0 && (
        <section
          className={styles.panel}
          aria-labelledby="future-actuals-title"
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Needs correction</p>
              <h2 id="future-actuals-title">Future-dated expenses</h2>
            </div>
          </div>
          <p className={styles.pageIntro}>
            These entries are excluded from every money total. Correct the date
            or delete the entry.
          </p>
          <TransactionRows
            transactions={futureTransactions}
            categories={categories}
            onEdit={onEdit}
          />
        </section>
      )}
      <div className={styles.filters}>
        <label>
          <Search />
          <span className={styles.srOnly}>Search activity</span>
          <input
            type="search"
            value={query}
            placeholder="Search expenses"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          <span className={styles.srOnly}>Filter by category</span>
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.archived ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      {/* C2: this list spanned 24 date headings inside 24 bordered panels,
          against a maximum of 5 section headers per surface and a rule that a
          group of fewer than 3 rows gets no header at all. The day now rides on
          each row, so the list is one hairline-separated group (C4). */}
      {transactions.length ? (
        <div className={styles.activityGroups}>
          <TransactionRows
            transactions={visibleTransactions}
            categories={categories}
            onEdit={onEdit}
          />
          {visibleTransactions.length < transactions.length && (
            <button
              className={styles.loadMore}
              onClick={() => setVisibleLimit((current) => current + 100)}
            >
              Load 100 more
              <small>
                {transactions.length - visibleTransactions.length} remaining
              </small>
            </button>
          )}
        </div>
      ) : (
        <section className={styles.emptyHero}>
          <CirclePlus />
          <h2>No matching expenses</h2>
          <p>
            {onFastLog
              ? "Tap + to log one now, or change the period and filters."
              : "Actual expense logging opens when this plan year begins."}
          </p>
          {onFastLog && (
            <button onClick={onFastLog}>
              <Plus /> Fast Log
            </button>
          )}
        </section>
      )}
    </div>
  );
}

export function CategoryDetailSurface({
  today,
  plan,
  categoryId,
  period,
  onBack,
  onEdit,
}: {
  today: string;
  plan: StoredPlan;
  categoryId: string;
  period: SelectedPeriod;
  onBack: () => void;
  onEdit: (id: string) => void;
}) {
  const observedTransactions = observedTransactionsThrough(
    plan.transactions,
    today,
  );
  const rollup = rollupBudget(plan.expenses, observedTransactions, period);
  const item = rollup.categories.find(
    ({ category }) => category.id === categoryId,
  );
  if (!item)
    return (
      <BackPage title="Category unavailable" onBack={onBack}>
        <p>This category is no longer available in the plan.</p>
      </BackPage>
    );
  const transactions = observedTransactions
    .filter(
      (transaction) =>
        transaction.categoryId === categoryId &&
        transactionIsInPeriod(transaction, period),
    )
    .toSorted((left, right) => right.date.localeCompare(left.date));
  return (
    <BackPage title={item.category.name} onBack={onBack}>
      <div className={styles.detailMetrics}>
        <Metric label="Allocated" value={item.allocatedCents} />
        <Metric label={item.actualLabel} value={item.actualCents} />
        <Metric label={item.remainingLabel} value={item.remainingCents} />
      </div>
      <section className={styles.panel}>
        <p className={styles.eyebrow}>{periodLabel(period)}</p>
        {transactions.length ? (
          <TransactionRows
            transactions={transactions}
            categories={[item.category]}
            onEdit={onEdit}
          />
        ) : (
          <p className={styles.emptyState}>No activity in this period.</p>
        )}
      </section>
    </BackPage>
  );
}

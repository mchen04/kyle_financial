"use client";

import { CirclePlus, Plus, Search } from "lucide-react";
import { useState } from "react";
import type { TransactionEntry } from "@/domain/budget";
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
import { Metric, TransactionRows } from "./cockpit-rows";
import { money, type StoredPlan } from "./plan-types";
import styles from "./cockpit-shared.module.css";

export function ActivitySurface({
  today,
  plan,
  period,
  onPeriod,
  onEdit,
  onFastLog,
}: {
  today: string;
  plan: StoredPlan;
  period: SelectedPeriod;
  onPeriod: (period: SelectedPeriod) => void;
  onEdit: (id: string) => void;
  onFastLog?: () => void;
}) {
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
  const groups = visibleTransactions.reduce((grouped, transaction) => {
    const entries = grouped.get(transaction.date) ?? [];
    entries.push(transaction);
    grouped.set(transaction.date, entries);
    return grouped;
  }, new Map<string, TransactionEntry[]>());
  return (
    <div className={styles.surfaceStack}>
      <header className={styles.surfaceHeader}>
        <div>
          <p className={styles.eyebrow}>Activity</p>
          <h1>Find and fix expenses.</h1>
        </div>
        <PeriodControl period={period} today={today} onPeriod={onPeriod} />
      </header>
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
      <section
        className={`${styles.panel} ${styles.activitySummary}`}
        aria-label={`${periodLabel(period)} activity total`}
      >
        <div>
          <p className={styles.eyebrow}>{periodLabel(period)} total</p>
          <strong>{money(periodTotalCents)}</strong>
        </div>
        <span>
          {periodTransactions.length}{" "}
          {periodTransactions.length === 1 ? "expense" : "expenses"}
        </span>
      </section>
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
      {transactions.length ? (
        <div className={styles.activityGroups}>
          {[...groups].map(([date, items]) => (
            <section className={styles.panel} key={date}>
              <h2 className={styles.dateHeading}>
                {new Intl.DateTimeFormat("en-US", {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                }).format(new Date(`${date}T00:00:00Z`))}
              </h2>
              <TransactionRows
                transactions={items}
                categories={categories}
                onEdit={onEdit}
              />
            </section>
          ))}
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

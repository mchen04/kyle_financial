import { annualExpenseAmount } from "@/domain/budget";
import {
  allocateDisplayedPercentageTenths,
  allocatePiePercentages,
} from "@/domain/daily-money";
import styles from "./plan-allocation-chart.module.css";
import { money, type StoredPlan } from "./plan-types";

export function PlanAllocationChart({ plan }: { plan: StoredPlan }) {
  const categories = plan.expenses
    .filter((category) => annualExpenseAmount(category) > 0)
    .toSorted(
      (left, right) =>
        annualExpenseAmount(right) - annualExpenseAmount(left) ||
        left.sortOrder - right.sortOrder,
    );
  const allocations = allocatePiePercentages(
    categories.map((category) => ({
      id: category.id,
      valueCents: annualExpenseAmount(category),
    })),
  );
  const allocationsWithOffsets = allocations.map((allocation, index) => ({
    ...allocation,
    offset: allocations
      .slice(0, index)
      .reduce((sum, previous) => sum + previous.percentagePpm / 10_000, 0),
  }));
  const displayedPercentageTenths =
    allocateDisplayedPercentageTenths(allocations);
  const displayedPercentage = (id: string) =>
    ((displayedPercentageTenths.get(id) ?? 0) / 10).toFixed(1);
  return (
    <figure className={styles.allocationFigure}>
      <div className={styles.chartFrame}>
        <svg
          className={styles.allocationChart}
          viewBox="0 0 42 42"
          role="img"
          aria-labelledby="allocation-chart-title allocation-chart-description"
        >
          <title id="allocation-chart-title">
            Annual planned allocation by category
          </title>
          <desc id="allocation-chart-description">
            {allocations.length === 0
              ? "No category has a planned amount."
              : allocations
                  .map((allocation) => {
                    const category = categories.find(
                      ({ id }) => id === allocation.id,
                    );
                    return `${category?.name}: ${displayedPercentage(allocation.id)} percent`;
                  })
                  .join(". ")}
          </desc>
          <circle
            className={styles.chartTrack}
            cx="21"
            cy="21"
            r="15.9155"
            pathLength="100"
          />
          {allocationsWithOffsets.map((allocation) => {
            const category = categories.find(({ id }) => id === allocation.id);
            const percentage = allocation.percentagePpm / 10_000;
            return (
              <circle
                key={allocation.id}
                className={styles.chartSegment}
                data-color={category?.colorToken ?? "slate"}
                cx="21"
                cy="21"
                r="15.9155"
                pathLength="100"
                strokeDasharray={`${percentage} ${100 - percentage}`}
                strokeDashoffset={-allocation.offset}
              />
            );
          })}
        </svg>
        <div className={styles.chartCenter} aria-hidden="true">
          <strong>
            {money(allocations.reduce((sum, item) => sum + item.valueCents, 0))}
          </strong>
          <span>planned / year</span>
        </div>
      </div>
      <figcaption>
        <strong>Where the annual plan goes</strong>
        <span>Exact allocations, not actual spending.</span>
      </figcaption>
      <ul className={styles.chartLegend}>
        {allocations.map((allocation) => {
          const category = categories.find(({ id }) => id === allocation.id)!;
          return (
            <li key={allocation.id}>
              <i data-color={category.colorToken} aria-hidden="true" />
              <span>{category.name}</span>
              <strong>{money(allocation.valueCents)}</strong>
              <small>{displayedPercentage(allocation.id)}%</small>
            </li>
          );
        })}
      </ul>
      {allocations.length === 0 && (
        <p className={styles.emptyCompact}>
          Add a planned amount to a category to build this allocation.
        </p>
      )}
    </figure>
  );
}

import type { ExpenseEntry, TransactionEntry } from "@/domain/budget";
import {
  calculateAnnualSavingsProjection,
  calculateSavingsImpact,
  observedTransactionsThrough,
  rollupBudget,
  type AnnualSavingsSources,
  type SelectedPeriod,
} from "@/domain/daily-money";
import { monthlyWrapPhase } from "./cockpit-copy";
import { selectedPeriodPhase } from "./cockpit-period-phase";

export function homeSavingsImpactCents(
  categories: readonly ExpenseEntry[],
  transactions: readonly TransactionEntry[],
  period: SelectedPeriod,
  sources: AnnualSavingsSources,
  today: string,
): number {
  const observedTransactions = observedTransactionsThrough(transactions, today);
  const selectedBudget = rollupBudget(categories, observedTransactions, period);
  const selectedImpact = calculateSavingsImpact(selectedBudget, sources);
  const currentYear = Number(today.slice(0, 4));

  if (
    period.year > currentYear ||
    (period.kind === "month" &&
      monthlyWrapPhase(period.year, period.month, today) === "future")
  ) {
    return selectedImpact.plannedSavingsChangeCents;
  }
  if (period.kind !== "year" || period.year < currentYear) {
    return selectedImpact.projectedSavingsChangeCents;
  }

  const observedBudget = rollupBudget(categories, observedTransactions, {
    kind: "ytd",
    year: period.year,
    throughDate: today,
  });
  return calculateAnnualSavingsProjection(
    selectedBudget,
    observedBudget,
    sources,
  ).projectedSavingsChangeCents;
}

export function homeSavingsImpactLabel(
  period: SelectedPeriod,
  today: string,
): string {
  const currentYear = Number(today.slice(0, 4));
  const unstarted = selectedPeriodPhase(period, today) === "future";
  if (unstarted) return "Planned savings";
  if (period.kind === "year" && period.year === currentYear)
    return "Projected savings";
  return "Savings impact";
}

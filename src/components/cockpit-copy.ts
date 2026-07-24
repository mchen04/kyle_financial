export type MonthlyWrapPhase = "past" | "current" | "future";

export function monthlyWrapPhase(
  year: number,
  month: number,
  today: string,
): MonthlyWrapPhase {
  return selectedPeriodPhase({ kind: "month", year, month }, today);
}

export function wrapBalanceCopy(
  safeToSpendCents: number,
  phase: MonthlyWrapPhase,
): { label: string; valueCents: number } {
  const overBudget = safeToSpendCents < 0;
  return {
    label:
      phase === "future"
        ? "Forecast not started"
        : phase === "current"
          ? `Live preview · ${overBudget ? "over budget" : "currently unspent"}`
          : overBudget
            ? "Over budget"
            : "Under budget",
    valueCents: safeToSpendCents,
  };
}
import { selectedPeriodPhase } from "./cockpit-period-phase";

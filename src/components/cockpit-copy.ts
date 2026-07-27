export type MonthlyWrapPhase = "past" | "current" | "future";

const MONTH_ABBREVIATIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * The months a plan year's observed variances actually cover.
 *
 * P1: the Plan hub stacks a full-year planned total next to variances measured
 * year-to-date, and named the period on neither, so a reader had no way to tell
 * that -$7,000 was seven months of an unfunded $1,000/mo saving category. The
 * period is a fact of the rollup: a plan for the current year is observed
 * `{kind:"ytd", throughDate: today}`, whose month count is the whole of the
 * in-progress month, and a finished year is observed end to end.
 */
export function observedPeriodLabel(planYear: number, today: string): string {
  const current = parseLocalCalendarDate(today);
  const throughMonth = planYear === current.year ? current.month : 12;
  const through = MONTH_ABBREVIATIONS[throughMonth - 1];
  return throughMonth === 1 ? through : `${MONTH_ABBREVIATIONS[0]}–${through}`;
}

/**
 * Which side of plan a variance fell on, in words, because the sign alone does
 * not say it — and the two terms do not even share a convention. Spending
 * variance is planned minus actual, so positive means less was spent than
 * planned; saving funding variance is actual minus planned, so positive means
 * more was funded. Both raise the projection when positive.
 */
export function varianceDirectionCopy(
  term: "spending" | "savingFunding",
  valueCents: number,
): string {
  if (valueCents === 0) return "on plan";
  if (term === "spending")
    return valueCents > 0 ? "spent under plan" : "spent over plan";
  return valueCents > 0 ? "over-funded" : "under-funded";
}

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
          ? // D4: the same quantity Home and Budget name "left to spend".
            `Live preview · ${overBudget ? "over budget" : "left to spend"}`
          : overBudget
            ? "Over budget"
            : "Under budget",
    valueCents: safeToSpendCents,
  };
}
import { parseLocalCalendarDate } from "@/domain/local-calendar-date";
import { selectedPeriodPhase } from "./cockpit-period-phase";

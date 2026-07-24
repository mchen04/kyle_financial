import type { SelectedPeriod } from "@/domain/daily-money";

export type PeriodPhase = "past" | "current" | "future";

export function selectedPeriodPhase(
  period: SelectedPeriod,
  today: string,
): PeriodPhase {
  const currentYear = Number(today.slice(0, 4));
  if (period.year < currentYear) return "past";
  if (period.year > currentYear) return "future";
  if (period.kind !== "month") return "current";
  const selectedMonth = `${period.year}-${String(period.month).padStart(2, "0")}`;
  const currentMonth = today.slice(0, 7);
  if (selectedMonth < currentMonth) return "past";
  if (selectedMonth > currentMonth) return "future";
  return "current";
}

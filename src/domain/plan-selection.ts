import { currentLocalDate } from "./daily-money";

export function shouldFollowTodayYear(
  selectedYear: number,
  today: string,
): boolean {
  return selectedYear === Number(today.slice(0, 4));
}

export interface TodayYearIntent {
  accountId: string;
  accountGeneration: number;
  followToday: boolean;
}

export function shouldFollowTodayForSession(
  intent: TodayYearIntent | null,
  accountId: string | undefined,
  accountGeneration: number,
): boolean {
  return (
    !intent ||
    intent.accountId !== accountId ||
    intent.accountGeneration !== accountGeneration ||
    intent.followToday
  );
}

export function defaultPlanForToday<T extends { year: number }>(
  plans: readonly T[],
  today = currentLocalDate(),
): T | null {
  const currentYear = Number(today.slice(0, 4));
  const ordered = plans.toSorted((left, right) => left.year - right.year);
  return (
    ordered.find(({ year }) => year === currentYear) ??
    ordered.filter(({ year }) => year < currentYear).at(-1) ??
    ordered.at(0) ??
    null
  );
}

export function planForFollowedYear<T extends { year: number }>(
  plans: readonly T[],
  selectedYear: number | undefined,
  today: string,
): T | null {
  const currentYear = Number(today.slice(0, 4));
  if (selectedYear === undefined || selectedYear === currentYear) return null;
  return plans.find(({ year }) => year === currentYear) ?? null;
}

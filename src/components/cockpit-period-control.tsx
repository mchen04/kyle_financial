"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  currentLocalDate,
  type AnnualSavingsSources,
  type SelectedPeriod,
} from "@/domain/daily-money";
import {
  localDateBelongsToYear,
  parseLocalCalendarDate,
} from "@/domain/local-calendar-date";
import type { PlanResult } from "@/domain/tax/engine";
import styles from "./cockpit-shared.module.css";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function initialMonth(year: number, today = currentLocalDate()): number {
  const current = parseLocalCalendarDate(today);
  return current.year === year ? current.month : 1;
}

export function initialPeriod(
  year: number,
  today = currentLocalDate(),
): SelectedPeriod {
  return { kind: "month", year, month: initialMonth(year, today) };
}

export function periodForYear(
  period: SelectedPeriod,
  year: number,
  today = currentLocalDate(),
): SelectedPeriod {
  if (period.year === year) return period;
  return initialPeriod(year, today);
}

export function advanceFollowedPeriod(
  period: SelectedPeriod,
  priorToday: string,
  today: string,
  planYear: number,
): SelectedPeriod {
  const prior = parseLocalCalendarDate(priorToday);
  const current = parseLocalCalendarDate(today);
  if (planYear !== current.year) return period;
  if (
    period.kind === "month" &&
    period.year === prior.year &&
    period.month === prior.month
  )
    return { kind: "month", year: current.year, month: current.month };
  if (period.kind === "ytd" && period.throughDate === priorToday)
    return { kind: "ytd", year: current.year, throughDate: today };
  return period;
}

export function savingsSources(result: PlanResult): AnnualSavingsSources {
  return {
    cashSavingsAnnualCents: result.cashSavingsAnnualCents,
    payrollSavingsAnnualCents: result.payrollSavingsAnnualCents,
    employerSavingsAnnualCents: result.employerSavingsAnnualCents,
  };
}

/**
 * The plan years the reader can switch between, and the switch itself. The
 * cockpit surfaces own this control (H3): the year picker used to live in the
 * top bar, two containers away from the month picker, which is why one reader
 * read the two halves of "which month of which year" as unrelated settings.
 * Screens with no reporting period still take it from the top bar — see
 * `periodScreens` in `plan-workspace.tsx`.
 */
export interface PlanYearChoice {
  years: number[];
  onYear: (year: number) => void;
}

export function PeriodControl({
  period,
  today,
  planYear,
  onPeriod,
}: {
  period: SelectedPeriod;
  today: string;
  planYear: PlanYearChoice;
  onPeriod: (period: SelectedPeriod) => void;
}) {
  const futureYear = period.year > Number(today.slice(0, 4));
  const changeMonth = (delta: number) => {
    if (period.kind !== "month") return;
    const date = new Date(Date.UTC(period.year, period.month - 1 + delta, 1));
    if (date.getUTCFullYear() !== period.year) return;
    onPeriod({
      kind: "month",
      year: period.year,
      month: date.getUTCMonth() + 1,
    });
  };
  return (
    <div className={styles.periodControl}>
      <div className={styles.periodTabs} aria-label="Reporting period">
        <button
          aria-pressed={period.kind === "month"}
          onClick={() =>
            onPeriod({
              kind: "month",
              year: period.year,
              month:
                period.kind === "month"
                  ? period.month
                  : initialMonth(period.year, today),
            })
          }
        >
          Month
        </button>
        <button
          aria-pressed={period.kind === "ytd"}
          disabled={futureYear}
          onClick={() => {
            onPeriod({
              kind: "ytd",
              year: period.year,
              throughDate: localDateBelongsToYear(today, period.year)
                ? today
                : `${period.year}-12-31`,
            });
          }}
        >
          YTD
        </button>
        <button
          aria-pressed={period.kind === "year"}
          onClick={() => onPeriod({ kind: "year", year: period.year })}
        >
          Year
        </button>
      </div>
      {/* H2/H3: one row, and nothing on it but the two halves of "which month
          of which year". The period-kind tabs above have the row before it. */}
      <div className={styles.periodRange}>
        {period.kind === "month" && (
          <div className={styles.monthStepper}>
            <button
              aria-label="Previous month"
              disabled={period.month === 1}
              onClick={() => changeMonth(-1)}
            >
              <ChevronLeft />
            </button>
            <select
              aria-label="Month"
              value={period.month}
              onChange={(event) =>
                onPeriod({
                  kind: "month",
                  year: period.year,
                  month: Number(event.target.value),
                })
              }
            >
              {MONTH_NAMES.map((month, index) => (
                // Abbreviated, and without the year, so the picker and both
                // stepper arrows fit their row at 360px wide without clipping.
                // The year is the same on all twelve options — this control
                // only ever steps within `period.year` — so printing it twelve
                // times bought nothing and cost the 35px that left the native
                // arrow overlapping the label at 360px (D2). The year is chosen
                // by the chip immediately to the right of this stepper, on the
                // same row, so it is never off screen while a month is picked.
                <option key={month} value={index + 1}>
                  {month.slice(0, 3)}
                </option>
              ))}
            </select>
            <button
              aria-label="Next month"
              disabled={period.month === 12}
              onClick={() => changeMonth(1)}
            >
              <ChevronRight />
            </button>
          </div>
        )}
        <select
          className={styles.yearSelect}
          aria-label="Plan year"
          value={period.year}
          onChange={(event) => planYear.onYear(Number(event.target.value))}
        >
          {planYear.years.map((year) => (
            <option key={year}>{year}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

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

export function PeriodControl({
  period,
  today,
  onPeriod,
}: {
  period: SelectedPeriod;
  today: string;
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
              // Abbreviated, and without the year, so the picker, the period
              // tabs, and both stepper arrows share one 44px row at 360px wide
              // without clipping. The year is the same on all twelve options —
              // this control only ever steps within `period.year` — so printing
              // it twelve times bought nothing and cost the 35px that left the
              // native arrow overlapping the label at 360px (D2). The year
              // itself is unchanged and still on screen, in the top bar's year
              // picker, which is visible on every surface.
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
    </div>
  );
}

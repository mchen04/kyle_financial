export interface LocalCalendarDateParts {
  year: number;
  month: number;
  day: number;
}

const maximumUtcOffsetHours = 14;

export function parseLocalCalendarDate(value: string): LocalCalendarDateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError("Date must use YYYY-MM-DD");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12)
    throw new RangeError("Month must be between 1 and 12");
  const maximumDay = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1];
  if (day < 1 || day > maximumDay)
    throw new RangeError("Date must be a real local calendar day");
  return { year, month, day };
}

export function isLocalCalendarDate(value: string): boolean {
  try {
    parseLocalCalendarDate(value);
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

export function localDateBelongsToYear(value: string, year: number): boolean {
  return (
    isLocalCalendarDate(value) && parseLocalCalendarDate(value).year === year
  );
}

export function localCalendarDate(
  year: number,
  month: number,
  day: number,
): string {
  const value = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  parseLocalCalendarDate(value);
  return value;
}

export function actualDateIsAdmissible(
  value: string,
  now = new Date(),
): boolean {
  const latestWorldDate = new Date(
    now.getTime() + maximumUtcOffsetHours * 60 * 60 * 1_000,
  ).toISOString();
  return isLocalCalendarDate(value) && value <= latestWorldDate.slice(0, 10);
}

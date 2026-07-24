import { describe, expect, it } from "vitest";
import {
  actualDateIsAdmissible,
  isLocalCalendarDate,
  localCalendarDate,
  localDateBelongsToYear,
  parseLocalCalendarDate,
} from "./local-calendar-date";

describe("local calendar dates", () => {
  it("accepts every legitimate local today but no date beyond UTC+14", () => {
    const now = new Date("2026-07-24T12:00:00.000Z");
    expect(actualDateIsAdmissible("2026-07-24", now)).toBe(true);
    expect(actualDateIsAdmissible("2026-07-25", now)).toBe(true);
    expect(actualDateIsAdmissible("2026-07-26", now)).toBe(false);
  });

  it("parses real calendar days without applying a timezone", () => {
    expect(parseLocalCalendarDate("2024-02-29")).toEqual({
      year: 2024,
      month: 2,
      day: 29,
    });
    expect(localCalendarDate(2026, 7, 4)).toBe("2026-07-04");
  });

  it.each(["", "2026-2-01", "2026-02-29", "2026-04-31", "2026-13-01"])(
    "rejects invalid date %j",
    (value) => {
      expect(isLocalCalendarDate(value)).toBe(false);
      expect(() => parseLocalCalendarDate(value)).toThrow(RangeError);
    },
  );

  it("owns the plan-year membership invariant", () => {
    expect(localDateBelongsToYear("2026-12-31", 2026)).toBe(true);
    expect(localDateBelongsToYear("2027-01-01", 2026)).toBe(false);
    expect(localDateBelongsToYear("2026-02-29", 2026)).toBe(false);
  });
});

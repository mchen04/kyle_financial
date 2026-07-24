import { describe, expect, it } from "vitest";
import { millisecondsUntilNextLocalDay } from "./use-local-calendar-day";

describe("local calendar day clock", () => {
  it("schedules just after the next local midnight", () => {
    const now = new Date(2026, 6, 24, 23, 59, 59, 900);
    expect(millisecondsUntilNextLocalDay(now)).toBe(150);
  });
});

import { describe, expect, it } from "vitest";
import {
  defaultPlanForToday,
  planForFollowedYear,
  shouldFollowTodayForSession,
  shouldFollowTodayYear,
} from "./plan-selection";

describe("default plan selection", () => {
  it("returns the current plan even when a future copy exists", () => {
    expect(
      defaultPlanForToday(
        [{ year: 2027 }, { year: 2025 }, { year: 2026 }],
        "2026-07-24",
      ),
    ).toEqual({ year: 2026 });
  });

  it("falls back to the nearest past plan, then the nearest future plan", () => {
    expect(
      defaultPlanForToday([{ year: 2027 }, { year: 2024 }], "2026-07-24"),
    ).toEqual({ year: 2024 });
    expect(
      defaultPlanForToday([{ year: 2028 }, { year: 2027 }], "2026-07-24"),
    ).toEqual({ year: 2027 });
    expect(defaultPlanForToday([], "2026-07-24")).toBeNull();
  });

  it("advances a followed plan across every New Year", () => {
    const plans = [{ year: 2026 }, { year: 2027 }, { year: 2028 }];
    expect(planForFollowedYear(plans, 2026, "2027-01-01")).toEqual({
      year: 2027,
    });
    expect(planForFollowedYear(plans, 2027, "2028-01-01")).toEqual({
      year: 2028,
    });
    expect(planForFollowedYear(plans, 2028, "2028-01-01")).toBeNull();
  });

  it("treats copy-forward targets as deliberate selections", () => {
    expect(shouldFollowTodayYear(2027, "2026-07-24")).toBe(false);
    expect(shouldFollowTodayYear(2026, "2026-07-24")).toBe(true);
  });

  it("resets year intent when the same account starts a new session", () => {
    const intent = {
      accountId: "account-a",
      accountGeneration: 4,
      followToday: false,
    };
    expect(shouldFollowTodayForSession(intent, "account-a", 4)).toBe(false);
    expect(shouldFollowTodayForSession(intent, "account-a", 5)).toBe(true);
  });
});

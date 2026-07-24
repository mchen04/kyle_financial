import { describe, expect, it } from "vitest";
import { monthlyWrapPhase, wrapBalanceCopy } from "./cockpit-copy";

describe("Monthly Wrap balance copy", () => {
  it("keeps a live over-budget amount negative and labels it honestly", () => {
    expect(wrapBalanceCopy(-4_500, "current")).toEqual({
      label: "Live preview · over budget",
      valueCents: -4_500,
    });
  });

  it("distinguishes live remaining money from a completed-month win", () => {
    expect(wrapBalanceCopy(4_500, "current").label).toBe(
      "Live preview · currently unspent",
    );
    expect(wrapBalanceCopy(4_500, "past").label).toBe("Under budget");
  });

  it("classifies past, current, and future months without time-zone drift", () => {
    expect(monthlyWrapPhase(2026, 6, "2026-07-24")).toBe("past");
    expect(monthlyWrapPhase(2026, 7, "2026-07-24")).toBe("current");
    expect(monthlyWrapPhase(2026, 8, "2026-07-24")).toBe("future");
    expect(wrapBalanceCopy(4_500, "future")).toEqual({
      label: "Forecast not started",
      valueCents: 4_500,
    });
  });
});

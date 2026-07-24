import { describe, expect, it } from "vitest";
import { selectedPeriodPhase } from "./cockpit-period-phase";

describe("selected period phase", () => {
  it("classifies months and annual periods from one local-date policy", () => {
    expect(
      selectedPeriodPhase(
        { kind: "month", year: 2026, month: 6 },
        "2026-07-24",
      ),
    ).toBe("past");
    expect(
      selectedPeriodPhase(
        { kind: "month", year: 2026, month: 7 },
        "2026-07-24",
      ),
    ).toBe("current");
    expect(
      selectedPeriodPhase(
        { kind: "month", year: 2026, month: 8 },
        "2026-07-24",
      ),
    ).toBe("future");
    expect(
      selectedPeriodPhase({ kind: "year", year: 2027 }, "2026-07-24"),
    ).toBe("future");
  });
});

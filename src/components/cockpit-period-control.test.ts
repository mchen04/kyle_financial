import { describe, expect, it } from "vitest";
import {
  advanceFollowedPeriod,
  initialPeriod,
  periodForYear,
} from "./cockpit-period-control";

describe("reactive reporting period", () => {
  it("uses the supplied local day for current-plan defaults", () => {
    expect(initialPeriod(2026, "2026-07-24")).toEqual({
      kind: "month",
      year: 2026,
      month: 7,
    });
    expect(
      periodForYear(
        { kind: "month", year: 2025, month: 12 },
        2026,
        "2026-07-24",
      ),
    ).toEqual({ kind: "month", year: 2026, month: 7 });
  });

  it("advances only periods that were following the prior local day", () => {
    expect(
      advanceFollowedPeriod(
        { kind: "month", year: 2026, month: 7 },
        "2026-07-31",
        "2026-08-01",
        2026,
      ),
    ).toEqual({ kind: "month", year: 2026, month: 8 });
    expect(
      advanceFollowedPeriod(
        { kind: "ytd", year: 2026, throughDate: "2026-07-31" },
        "2026-07-31",
        "2026-08-01",
        2026,
      ),
    ).toEqual({ kind: "ytd", year: 2026, throughDate: "2026-08-01" });
    expect(
      advanceFollowedPeriod(
        { kind: "month", year: 2026, month: 6 },
        "2026-07-31",
        "2026-08-01",
        2026,
      ),
    ).toEqual({ kind: "month", year: 2026, month: 6 });
  });
});

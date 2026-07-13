import { describe, expect, it } from "vitest";
import { DEFAULT_BENEFITS } from "./defaults";

describe("new-plan benefit defaults", () => {
  it("does not assume employee elections or employer contributions", () => {
    expect(DEFAULT_BENEFITS).not.toHaveLength(0);
    for (const benefit of DEFAULT_BENEFITS) {
      const amount = benefit.amount;
      expect(amount.kind === "percent" ? amount.ratePpm : amount.cents).toBe(0);
    }
  });
});

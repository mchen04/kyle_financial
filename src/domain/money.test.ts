import { describe, expect, it } from "vitest";
import { divideAnnualForMonthly, multiplyByRate } from "./money";

describe("integer money rules", () => {
  it("rounds percentage results half away from zero", () => {
    expect(multiplyByRate(1, 500_000)).toBe(1);
    expect(multiplyByRate(-1, 500_000)).toBe(-1);
    expect(multiplyByRate(10_001, 100_000)).toBe(1_000);
  });

  it("rounds annual monthly views half away from zero", () => {
    expect(divideAnnualForMonthly(6)).toBe(1);
    expect(divideAnnualForMonthly(-6)).toBe(-1);
    expect(divideAnnualForMonthly(5)).toBe(0);
  });
});

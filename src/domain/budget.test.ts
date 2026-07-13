import { describe, expect, it } from "vitest";
import { normalizedHsaPlanSettings } from "./budget";

describe("HSA plan settings", () => {
  it("preserves explicit spouse eligibility for MFJ self-only coverage", () => {
    expect(
      normalizedHsaPlanSettings({
        filingStatus: "mfj",
        hsaCoverage: "self",
        primaryHsaEligible: true,
        spouseHsaEligible: true,
        primaryHsaCatchUpEligible: true,
        spouseHsaCatchUpEligible: true,
        primaryHsaFamilyAllocationPpm: 500_000,
        spouseHsaFamilyAllocationPpm: 500_000,
      }),
    ).toEqual({
      primaryHsaEligible: true,
      spouseHsaEligible: true,
      primaryHsaCatchUpEligible: true,
      spouseHsaCatchUpEligible: true,
      primaryHsaFamilyAllocationPpm: 1_000_000,
      spouseHsaFamilyAllocationPpm: 0,
    });
  });

  it("removes catch-up eligibility from an ineligible owner and non-MFJ spouse", () => {
    expect(
      normalizedHsaPlanSettings({
        filingStatus: "single",
        hsaCoverage: "self",
        primaryHsaEligible: false,
        spouseHsaEligible: true,
        primaryHsaCatchUpEligible: true,
        spouseHsaCatchUpEligible: true,
      }),
    ).toMatchObject({
      primaryHsaEligible: false,
      spouseHsaEligible: false,
      primaryHsaCatchUpEligible: false,
      spouseHsaCatchUpEligible: false,
    });
  });
});

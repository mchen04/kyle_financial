import { describe, expect, it } from "vitest";
import {
  hsaCoverageChange,
  hsaEligibilityChange,
  isHsaEligibilityWarning,
  showsHsaFamilyAllocation,
  showsHsaCatchUpEligibility,
  showsSpouseHsaEligibility,
} from "./hsa-controls";

const marriedFamilyPlan = {
  filingStatus: "mfj" as const,
  hsaCoverage: "family" as const,
  primaryHsaEligible: true,
  spouseHsaEligible: true,
  primaryHsaCatchUpEligible: false,
  spouseHsaCatchUpEligible: false,
  primaryHsaFamilyAllocationPpm: 600_000,
  spouseHsaFamilyAllocationPpm: 400_000,
};

describe("HSA controls", () => {
  it("shows spouse eligibility for every married filing jointly plan", () => {
    expect(
      showsSpouseHsaEligibility({ filingStatus: "mfj", hsaCoverage: "self" }),
    ).toBe(true);
    expect(
      showsSpouseHsaEligibility({ filingStatus: "mfj", hsaCoverage: "family" }),
    ).toBe(true);
    expect(
      showsSpouseHsaEligibility({
        filingStatus: "single",
        hsaCoverage: "family",
      }),
    ).toBe(false);
  });

  it("keeps family allocation controls family-only", () => {
    expect(showsHsaFamilyAllocation(marriedFamilyPlan)).toBe(true);
    expect(
      showsHsaFamilyAllocation({
        ...marriedFamilyPlan,
        hsaCoverage: "self",
      }),
    ).toBe(false);
  });

  it("preserves both eligibility choices when family coverage becomes self-only", () => {
    expect(hsaCoverageChange(marriedFamilyPlan, "self")).toEqual({
      hsaCoverage: "self",
      primaryHsaEligible: true,
      spouseHsaEligible: true,
      primaryHsaCatchUpEligible: false,
      spouseHsaCatchUpEligible: false,
      primaryHsaFamilyAllocationPpm: 1_000_000,
      spouseHsaFamilyAllocationPpm: 0,
    });
  });

  it("canonicalizes a family cap to the sole eligible spouse", () => {
    expect(
      hsaCoverageChange(
        {
          ...marriedFamilyPlan,
          hsaCoverage: "self",
          primaryHsaEligible: false,
          primaryHsaFamilyAllocationPpm: 1_000_000,
          spouseHsaFamilyAllocationPpm: 0,
        },
        "family",
      ),
    ).toEqual({
      hsaCoverage: "family",
      primaryHsaEligible: false,
      spouseHsaEligible: true,
      primaryHsaCatchUpEligible: false,
      spouseHsaCatchUpEligible: false,
      primaryHsaFamilyAllocationPpm: 0,
      spouseHsaFamilyAllocationPpm: 1_000_000,
    });
  });

  it("shows age-55 catch-up choices only for HSA-eligible owners", () => {
    expect(showsHsaCatchUpEligibility(marriedFamilyPlan, "primary")).toBe(true);
    expect(showsHsaCatchUpEligibility(marriedFamilyPlan, "spouse")).toBe(true);
    expect(
      showsHsaCatchUpEligibility(
        { ...marriedFamilyPlan, spouseHsaEligible: false },
        "spouse",
      ),
    ).toBe(false);
    expect(
      showsHsaCatchUpEligibility(
        { ...marriedFamilyPlan, filingStatus: "single" },
        "spouse",
      ),
    ).toBe(false);
  });

  it("clears an owner's catch-up choice when HSA eligibility is removed", () => {
    expect(
      hsaEligibilityChange(
        {
          ...marriedFamilyPlan,
          spouseHsaCatchUpEligible: true,
        },
        "spouse",
        false,
      ),
    ).toMatchObject({
      spouseHsaEligible: false,
      spouseHsaCatchUpEligible: false,
    });
  });

  it("restores a remembered agreement after family coverage is re-enabled", () => {
    const remembered = {
      primaryHsaFamilyAllocationPpm: 600_000,
      spouseHsaFamilyAllocationPpm: 400_000,
    };
    expect(
      hsaCoverageChange(
        {
          ...marriedFamilyPlan,
          hsaCoverage: "self",
          primaryHsaFamilyAllocationPpm: 1_000_000,
          spouseHsaFamilyAllocationPpm: 0,
        },
        "family",
        remembered,
      ),
    ).toMatchObject(remembered);
  });

  it("restores a remembered agreement when both spouses become eligible again", () => {
    const remembered = {
      primaryHsaFamilyAllocationPpm: 600_000,
      spouseHsaFamilyAllocationPpm: 400_000,
    };
    const spouseDisabled = hsaEligibilityChange(
      marriedFamilyPlan,
      "spouse",
      false,
      remembered,
    );
    expect(spouseDisabled).toMatchObject({
      primaryHsaEligible: true,
      spouseHsaEligible: false,
      primaryHsaFamilyAllocationPpm: 1_000_000,
      spouseHsaFamilyAllocationPpm: 0,
    });
    expect(
      hsaEligibilityChange(
        {
          ...marriedFamilyPlan,
          ...spouseDisabled,
        },
        "spouse",
        true,
        remembered,
      ),
    ).toMatchObject({
      primaryHsaEligible: true,
      spouseHsaEligible: true,
      ...remembered,
    });
  });

  it("recognizes every zero-exclusion HSA warning", () => {
    expect(isHsaEligibilityWarning("hsa-eligibility")).toBe(true);
    expect(isHsaEligibilityWarning("hsa-owner-ineligible")).toBe(true);
    expect(isHsaEligibilityWarning("hsa-owner-ineligible-spouse")).toBe(true);
    expect(isHsaEligibilityWarning("hsa-limit-family")).toBe(false);
  });
});

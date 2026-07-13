import type { BenefitEntry } from "@/domain/benefits";
import type { PlanInput } from "@/domain/budget";
import type { StoredPlan } from "@/domain/stored-plan";

export function planInput(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    year: 2026,
    grossSalaryCents: 10_000_000,
    additionalWageIncomeCents: 0,
    spouseWageIncomeCents: 0,
    otherOrdinaryIncomeCents: 0,
    filingStatus: "single",
    stateCode: "TX",
    hsaCoverage: "self",
    primaryHsaEligible: true,
    spouseHsaEligible: false,
    primaryHsaCatchUpEligible: false,
    spouseHsaCatchUpEligible: false,
    primaryHsaFamilyAllocationPpm: 1_000_000,
    spouseHsaFamilyAllocationPpm: 0,
    benefits: [],
    expenses: [],
    ...overrides,
  };
}

export function benefitEntry(
  overrides: Partial<BenefitEntry> = {},
): BenefitEntry {
  return {
    id: "benefit",
    type: "traditional401k",
    label: "401(k)",
    amount: { kind: "fixedAnnual", cents: 1_000_000 },
    ...overrides,
  };
}

export function storedPlan(
  year = 2026,
  overrides: Partial<StoredPlan> = {},
): StoredPlan {
  return {
    id: "f09af018-f6c2-4eb1-9380-123173bd9802",
    ...planInput({ year, stateCode: "CA" }),
    updatedAt: "2026-07-12T00:00:00.000Z",
    fieldVersions: {},
    ...overrides,
  };
}

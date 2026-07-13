import {
  normalizedHsaPlanSettings,
  type HsaPlanSettings,
  type PlanInput,
} from "@/domain/budget";

type HsaControlPlan = Pick<PlanInput, "filingStatus" | "hsaCoverage"> &
  HsaPlanSettings;

export type HsaFamilyAllocation = Pick<
  HsaPlanSettings,
  "primaryHsaFamilyAllocationPpm" | "spouseHsaFamilyAllocationPpm"
>;

function validFamilyAllocation(
  allocation: HsaFamilyAllocation | undefined,
): HsaFamilyAllocation | undefined {
  if (
    !allocation ||
    !Number.isSafeInteger(allocation.primaryHsaFamilyAllocationPpm) ||
    !Number.isSafeInteger(allocation.spouseHsaFamilyAllocationPpm) ||
    allocation.primaryHsaFamilyAllocationPpm < 0 ||
    allocation.spouseHsaFamilyAllocationPpm < 0 ||
    allocation.primaryHsaFamilyAllocationPpm +
      allocation.spouseHsaFamilyAllocationPpm !==
      1_000_000
  )
    return undefined;
  return allocation;
}

export function currentHsaFamilyAllocation(
  plan: HsaControlPlan,
): HsaFamilyAllocation | undefined {
  if (!showsHsaFamilyAllocation(plan)) return undefined;
  return validFamilyAllocation(plan);
}

export function showsSpouseHsaEligibility(
  plan: Pick<PlanInput, "filingStatus" | "hsaCoverage">,
): boolean {
  return plan.filingStatus === "mfj";
}

export function showsHsaFamilyAllocation(plan: HsaControlPlan): boolean {
  return (
    plan.filingStatus === "mfj" &&
    plan.hsaCoverage === "family" &&
    plan.primaryHsaEligible &&
    plan.spouseHsaEligible
  );
}

export function showsHsaCatchUpEligibility(
  plan: HsaControlPlan,
  owner: "primary" | "spouse",
): boolean {
  return owner === "primary"
    ? plan.primaryHsaEligible
    : plan.filingStatus === "mfj" && plan.spouseHsaEligible;
}

export function hsaCoverageChange(
  plan: HsaControlPlan,
  hsaCoverage: PlanInput["hsaCoverage"],
  preferredFamilyAllocation?: HsaFamilyAllocation,
): Pick<HsaControlPlan, "hsaCoverage" | keyof HsaPlanSettings> {
  const useFamilyAllocation =
    hsaCoverage === "family" &&
    plan.filingStatus === "mfj" &&
    plan.primaryHsaEligible &&
    plan.spouseHsaEligible;
  const normalized = normalizedHsaPlanSettings({ ...plan, hsaCoverage });
  const familyAllocation = validFamilyAllocation(preferredFamilyAllocation) ??
    currentHsaFamilyAllocation(plan) ?? {
      primaryHsaFamilyAllocationPpm: 500_000,
      spouseHsaFamilyAllocationPpm: 500_000,
    };
  return {
    hsaCoverage,
    primaryHsaEligible: normalized.primaryHsaEligible,
    spouseHsaEligible: normalized.spouseHsaEligible,
    primaryHsaCatchUpEligible: normalized.primaryHsaCatchUpEligible,
    spouseHsaCatchUpEligible: normalized.spouseHsaCatchUpEligible,
    primaryHsaFamilyAllocationPpm: useFamilyAllocation
      ? familyAllocation.primaryHsaFamilyAllocationPpm
      : normalized.primaryHsaFamilyAllocationPpm,
    spouseHsaFamilyAllocationPpm: useFamilyAllocation
      ? familyAllocation.spouseHsaFamilyAllocationPpm
      : normalized.spouseHsaFamilyAllocationPpm,
  };
}

export function hsaEligibilityChange(
  plan: HsaControlPlan,
  owner: "primary" | "spouse",
  eligible: boolean,
  preferredFamilyAllocation?: HsaFamilyAllocation,
): HsaPlanSettings {
  const primaryHsaEligible =
    owner === "primary" ? eligible : plan.primaryHsaEligible;
  const spouseHsaEligible =
    owner === "spouse" ? eligible : plan.spouseHsaEligible;
  const normalized = normalizedHsaPlanSettings({
    ...plan,
    primaryHsaEligible,
    spouseHsaEligible,
  });
  if (
    plan.filingStatus !== "mfj" ||
    plan.hsaCoverage !== "family" ||
    !primaryHsaEligible ||
    !spouseHsaEligible
  )
    return normalized;
  const allocation = validFamilyAllocation(preferredFamilyAllocation) ??
    currentHsaFamilyAllocation(plan) ?? {
      primaryHsaFamilyAllocationPpm: 500_000,
      spouseHsaFamilyAllocationPpm: 500_000,
    };
  return { ...normalized, ...allocation };
}

export function isHsaEligibilityWarning(code: string): boolean {
  return (
    code === "hsa-eligibility" ||
    (code.startsWith("hsa-") && code.includes("ineligible"))
  );
}

import type { BenefitEntry } from "../benefits";
import { normalizedHsaPlanSettings, type PlanInput } from "../budget";
import type { BenefitResult } from "./plan-result";
import type { selectTaxTable } from "./table-registry";

type TaxLimits = ReturnType<typeof selectTaxTable>["table"]["limits"];
type HsaSettings = ReturnType<typeof normalizedHsaPlanSettings>;

export function hsaFamilyShares(
  limitCents: number,
  settings: HsaSettings,
): { primary: number; spouse: number } {
  if (
    settings.primaryHsaFamilyAllocationPpm +
      settings.spouseHsaFamilyAllocationPpm ===
    0
  )
    return { primary: 0, spouse: 0 };
  const primary = Number(
    (BigInt(limitCents) * BigInt(settings.primaryHsaFamilyAllocationPpm)) /
      1_000_000n,
  );
  return { primary, spouse: limitCents - primary };
}

export function hsaCatchUpForOwner(
  owner: "primary" | "spouse",
  settings: HsaSettings,
  catchUpLimitCents: number,
): number {
  const eligible =
    settings[
      owner === "primary"
        ? "primaryHsaCatchUpEligible"
        : "spouseHsaCatchUpEligible"
    ];
  return eligible ? catchUpLimitCents : 0;
}

export function eligibleBenefitAmounts(
  plan: PlanInput,
  benefits: BenefitResult[],
  limits: TaxLimits,
): number[] {
  const hsaSettings = normalizedHsaPlanSettings(plan);
  const eligible = benefits.map(({ annualAmountCents }) => annualAmountCents);
  const ownerOf = ({ entry }: BenefitResult) => entry.owner ?? "primary";
  const stableOrder = (
    leftIndex: number,
    rightIndex: number,
    typePriority: Partial<Record<BenefitEntry["type"], number>>,
  ) => {
    const left = benefits[leftIndex];
    const right = benefits[rightIndex];
    return (
      (typePriority[left.entry.type] ?? 0) -
        (typePriority[right.entry.type] ?? 0) ||
      ownerOf(left).localeCompare(ownerOf(right)) ||
      left.entry.type.localeCompare(right.entry.type) ||
      left.entry.id.localeCompare(right.entry.id) ||
      left.entry.label.localeCompare(right.entry.label) ||
      left.annualAmountCents - right.annualAmountCents
    );
  };
  const cap = (
    predicate: (benefit: BenefitResult) => boolean,
    limitCents: number,
    typePriority: Partial<Record<BenefitEntry["type"], number>> = {},
    intersectsExistingLimit = false,
  ) => {
    const indices = benefits
      .map((benefit, index) => ({ benefit, index }))
      .filter(({ benefit }) => predicate(benefit))
      .map(({ index }) => index)
      .sort((left, right) => stableOrder(left, right, typePriority));
    let remainingCents = Math.max(0, limitCents);
    for (const index of indices) {
      const amountCents = Math.min(
        benefits[index].annualAmountCents,
        remainingCents,
      );
      eligible[index] = intersectsExistingLimit
        ? Math.min(eligible[index], amountCents)
        : amountCents;
      remainingCents -= amountCents;
    }
  };

  const owners =
    plan.filingStatus === "mfj"
      ? (["primary", "spouse"] as const)
      : (["primary"] as const);
  for (const owner of owners) {
    cap(
      (benefit) =>
        ownerOf(benefit) === owner &&
        ["traditional401k", "roth401k"].includes(benefit.entry.type),
      limits.employee401k.cents,
      { traditional401k: 0, roth401k: 1 },
    );
    cap(
      (benefit) =>
        ownerOf(benefit) === owner &&
        ["traditional401k", "roth401k", "employer401kMatch"].includes(
          benefit.entry.type,
        ),
      limits.definedContributionPlan.cents,
      { employer401kMatch: 0, traditional401k: 1, roth401k: 2 },
      true,
    );
    cap(
      (benefit) =>
        ownerOf(benefit) === owner && benefit.entry.type === "healthFsa",
      limits.healthFsa.cents,
    );
    for (const type of ["commuter", "commuterParking"] as const) {
      cap(
        (benefit) => ownerOf(benefit) === owner && benefit.entry.type === type,
        limits.commuterMonthly.cents * 12,
      );
    }
  }

  const hasGeneralHealthFsa = benefits.some(
    ({ entry, annualAmountCents }) =>
      entry.type === "healthFsa" && annualAmountCents > 0,
  );
  const hsaLimitCents = hasGeneralHealthFsa
    ? 0
    : plan.hsaCoverage === "family"
      ? limits.hsaFamily.cents
      : limits.hsaSelf.cents;
  if (plan.hsaCoverage === "family") {
    if (plan.filingStatus === "mfj") {
      const familyShares = hsaFamilyShares(hsaLimitCents, hsaSettings);
      for (const owner of owners) {
        cap(
          (benefit) =>
            ownerOf(benefit) === owner &&
            ["hsa", "employerHsa"].includes(benefit.entry.type),
          familyShares[owner] +
            hsaCatchUpForOwner(
              owner,
              hsaSettings,
              hsaLimitCents === 0 ? 0 : limits.hsaCatchUp.cents,
            ),
          { hsa: 0, employerHsa: 1 },
        );
      }
    } else {
      cap(
        ({ entry }) => ["hsa", "employerHsa"].includes(entry.type),
        hsaSettings.primaryHsaEligible
          ? hsaLimitCents +
              hsaCatchUpForOwner(
                "primary",
                hsaSettings,
                hsaLimitCents === 0 ? 0 : limits.hsaCatchUp.cents,
              )
          : 0,
        { hsa: 0, employerHsa: 1 },
      );
    }
  } else {
    for (const owner of owners) {
      cap(
        (benefit) =>
          ownerOf(benefit) === owner &&
          ["hsa", "employerHsa"].includes(benefit.entry.type),
        hsaSettings[
          owner === "primary" ? "primaryHsaEligible" : "spouseHsaEligible"
        ]
          ? hsaLimitCents +
              hsaCatchUpForOwner(
                owner,
                hsaSettings,
                hsaLimitCents === 0 ? 0 : limits.hsaCatchUp.cents,
              )
          : 0,
        { hsa: 0, employerHsa: 1 },
      );
    }
  }

  const dependentCareEarnedIncomeLimitCents =
    plan.filingStatus === "mfj"
      ? Math.min(
          plan.grossSalaryCents + plan.additionalWageIncomeCents,
          plan.spouseWageIncomeCents,
        )
      : plan.grossSalaryCents + plan.additionalWageIncomeCents;
  cap(
    ({ entry }) => entry.type === "dependentCareFsa",
    Math.min(
      limits.dependentCareFsa.cents,
      dependentCareEarnedIncomeLimitCents,
    ),
  );

  return eligible;
}

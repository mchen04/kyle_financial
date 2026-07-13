import type { BenefitEntry } from "../benefits";
import { normalizedHsaPlanSettings, type PlanInput } from "../budget";
import { sumCents } from "../money";
import { hsaCatchUpForOwner, hsaFamilyShares } from "./benefit-limits";
import type { BenefitResult, LimitWarning } from "./plan-result";
import type { selectTaxTable } from "./table-registry";

export function warningsFor(
  plan: PlanInput,
  benefits: BenefitResult[],
  limits: ReturnType<typeof selectTaxTable>["table"]["limits"],
  taxYear: number,
  grossIncomeCents: number,
  totalTaxCents: number,
  primaryPaycheckDeductionsCents: number,
  spousePaycheckDeductionsCents: number,
  primaryWageIncomeCents: number,
  spouseWageIncomeCents: number,
  primaryPayrollCapacityCents: number,
  spousePayrollCapacityCents: number,
): LimitWarning[] {
  const hsaSettings = normalizedHsaPlanSettings(plan);
  const amountFor = (...types: BenefitEntry["type"][]) =>
    sumCents(
      benefits
        .filter(({ entry }) => types.includes(entry.type))
        .map(({ annualAmountCents }) => annualAmountCents),
    );
  const amountForOwner = (
    owner: NonNullable<BenefitEntry["owner"]>,
    ...types: BenefitEntry["type"][]
  ) =>
    sumCents(
      benefits
        .filter(
          ({ entry }) =>
            (entry.owner ?? "primary") === owner && types.includes(entry.type),
        )
        .map(({ annualAmountCents }) => annualAmountCents),
    );
  const warnings: LimitWarning[] = [];
  const add = (
    code: string,
    label: string,
    actualCents: number,
    limitCents: number,
    catchUpTreatment?: "included" | "unmodeled",
  ) => {
    if (actualCents > limitCents) {
      const thresholdDescription =
        catchUpTreatment === "included"
          ? "planning limit, including any selected age-55 HSA catch-up"
          : catchUpTreatment === "unmodeled"
            ? "base planning limit before any eligible catch-up"
            : "planning limit";
      const unmodeledDetails =
        catchUpTreatment === "included"
          ? "partial-year eligibility, corrective distributions, plan remedies, and excess-contribution taxes are not modeled"
          : "eligible catch-ups, corrective distributions, plan remedies, and excess-contribution taxes are not modeled";
      warnings.push({
        code,
        message: `The entered amount for ${label} is above the ${taxYear} ${thresholdDescription}. The estimate keeps the full entered amount but limits the tax exclusion; ${unmodeledDetails}.`,
        actualCents,
        limitCents,
      });
    }
  };

  const hsaContributionsCents = amountFor("hsa", "employerHsa");
  const hasGeneralHealthFsa = amountFor("healthFsa") > 0;
  if (hsaContributionsCents > 0 && hasGeneralHealthFsa) {
    warnings.push({
      code: "hsa-eligibility",
      message:
        "A general Health FSA usually makes HSA contributions ineligible unless the FSA is limited-purpose or post-deductible. This estimate keeps every entered amount but grants no HSA federal, FICA, or state tax exclusion; corrective distributions and excess-contribution taxes are not modeled.",
      actualCents: hsaContributionsCents,
      limitCents: 0,
    });
  }

  const owners =
    plan.filingStatus === "mfj"
      ? (["primary", "spouse"] as const)
      : (["primary"] as const);
  for (const owner of owners) {
    const eligible =
      hsaSettings[
        owner === "primary" ? "primaryHsaEligible" : "spouseHsaEligible"
      ];
    const contributions = amountForOwner(owner, "hsa", "employerHsa");
    if (!eligible && contributions > 0) {
      warnings.push({
        code:
          owner === "primary"
            ? "hsa-owner-ineligible"
            : "hsa-owner-ineligible-spouse",
        message: `The ${owner} owner is marked ineligible for HSA contributions. The estimate keeps every entered amount but grants no HSA federal, FICA, or state tax exclusion; corrective distributions and excess-contribution taxes are not modeled.`,
        actualCents: contributions,
        limitCents: 0,
      });
    }
  }
  for (const owner of owners) {
    const ownerLabel = owner === "primary" ? "primary" : "spouse";
    add(
      owner === "primary" ? "401k-limit" : "401k-limit-spouse",
      `${ownerLabel} Traditional and Roth 401(k) contributions`,
      amountForOwner(owner, "traditional401k", "roth401k"),
      limits.employee401k.cents,
      "unmodeled",
    );
    add(
      owner === "primary"
        ? "defined-contribution-limit"
        : "defined-contribution-limit-spouse",
      `${ownerLabel} employee and employer 401(k) contributions`,
      amountForOwner(owner, "traditional401k", "roth401k", "employer401kMatch"),
      limits.definedContributionPlan.cents,
      "unmodeled",
    );
    add(
      owner === "primary" ? "health-fsa-limit" : "health-fsa-limit-spouse",
      `${ownerLabel} Health FSA contributions`,
      amountForOwner(owner, "healthFsa"),
      limits.healthFsa.cents,
    );
    add(
      owner === "primary" ? "commuter-limit" : "commuter-limit-spouse",
      `${ownerLabel} transit contributions`,
      amountForOwner(owner, "commuter"),
      limits.commuterMonthly.cents * 12,
    );
    add(
      owner === "primary"
        ? "commuter-parking-limit"
        : "commuter-parking-limit-spouse",
      `${ownerLabel} qualified parking contributions`,
      amountForOwner(owner, "commuterParking"),
      limits.commuterMonthly.cents * 12,
    );
  }
  if (plan.hsaCoverage === "family") {
    add(
      "hsa-limit-family",
      "household employee and employer HSA contributions",
      amountFor("hsa", "employerHsa"),
      limits.hsaFamily.cents +
        hsaCatchUpForOwner("primary", hsaSettings, limits.hsaCatchUp.cents) +
        hsaCatchUpForOwner("spouse", hsaSettings, limits.hsaCatchUp.cents),
      "included",
    );
    if (plan.filingStatus === "mfj") {
      const familyShares = hsaFamilyShares(limits.hsaFamily.cents, hsaSettings);
      for (const owner of owners) {
        const eligible =
          hsaSettings[
            owner === "primary" ? "primaryHsaEligible" : "spouseHsaEligible"
          ];
        if (!eligible) continue;
        add(
          owner === "primary"
            ? "hsa-limit-family-primary"
            : "hsa-limit-family-spouse",
          `${owner} employee and employer HSA contributions under the selected married-family allocation`,
          amountForOwner(owner, "hsa", "employerHsa"),
          familyShares[owner] +
            hsaCatchUpForOwner(owner, hsaSettings, limits.hsaCatchUp.cents),
          "included",
        );
      }
    }
  } else {
    for (const owner of owners) {
      const eligible =
        hsaSettings[
          owner === "primary" ? "primaryHsaEligible" : "spouseHsaEligible"
        ];
      if (!eligible) continue;
      add(
        owner === "primary" ? "hsa-limit" : "hsa-limit-spouse",
        `${owner} employee and employer HSA contributions`,
        amountForOwner(owner, "hsa", "employerHsa"),
        limits.hsaSelf.cents +
          hsaCatchUpForOwner(owner, hsaSettings, limits.hsaCatchUp.cents),
        "included",
      );
    }
  }
  add(
    "dependent-care-fsa-limit",
    "Dependent-care FSA contributions",
    amountFor("dependentCareFsa"),
    limits.dependentCareFsa.cents,
  );
  for (const owner of owners) {
    let esppGrantValue = 0n;
    for (const benefit of benefits.filter(
      ({ entry }) =>
        entry.type === "espp" && (entry.owner ?? "primary") === owner,
    )) {
      const discount = benefit.entry.discountRatePpm ?? 0;
      esppGrantValue +=
        discount >= 1_000_000
          ? BigInt(Number.MAX_SAFE_INTEGER)
          : (BigInt(benefit.annualAmountCents) * 1_000_000n) /
            BigInt(1_000_000 - discount);
    }
    add(
      owner === "primary" ? "espp-limit" : "espp-limit-spouse",
      `${owner} ESPP grant-date fair market value`,
      Number(
        esppGrantValue > BigInt(Number.MAX_SAFE_INTEGER)
          ? BigInt(Number.MAX_SAFE_INTEGER)
          : esppGrantValue,
      ),
      limits.esppGrantValue.cents,
    );
  }
  const availableAfterTaxCents = Math.max(0, grossIncomeCents - totalTaxCents);
  const infeasibleOwner = [
    {
      label: "Primary payroll",
      actual: primaryPaycheckDeductionsCents,
      limit: Math.min(primaryPayrollCapacityCents, availableAfterTaxCents),
    },
    {
      label: "Spouse payroll",
      actual: spousePaycheckDeductionsCents,
      limit: Math.min(spousePayrollCapacityCents, availableAfterTaxCents),
    },
  ].find(({ actual, limit }) => actual > limit);
  if (infeasibleOwner) {
    warnings.push({
      code: "paycheck-feasibility",
      message: `${infeasibleOwner.label} deductions exceed the wages available to fund them. The estimate still uses every entered amount so you can see the full gap.`,
      actualCents: infeasibleOwner.actual,
      limitCents: infeasibleOwner.limit,
    });
  }
  if (
    primaryPaycheckDeductionsCents + spousePaycheckDeductionsCents >
      availableAfterTaxCents &&
    !warnings.some(({ code }) => code === "paycheck-feasibility")
  ) {
    warnings.push({
      code: "paycheck-feasibility",
      message:
        "Combined payroll deductions exceed household wages available after estimated tax. The estimate still uses every entered amount so you can see the full gap.",
      actualCents:
        primaryPaycheckDeductionsCents + spousePaycheckDeductionsCents,
      limitCents: availableAfterTaxCents,
    });
  }
  const dependentCareCents = amountFor("dependentCareFsa");
  if (
    plan.filingStatus === "mfj" &&
    dependentCareCents > Math.min(primaryWageIncomeCents, spouseWageIncomeCents)
  ) {
    warnings.push({
      code: "dependent-care-earned-income",
      message:
        "Dependent-care FSA tax exclusion is generally limited by the lower-earning spouse. The estimate keeps the full entered amount but caps the exclusion; student, incapacitated-spouse, and plan-correction exceptions are not modeled.",
      actualCents: dependentCareCents,
      limitCents: Math.min(primaryWageIncomeCents, spouseWageIncomeCents),
    });
  }
  return warnings;
}

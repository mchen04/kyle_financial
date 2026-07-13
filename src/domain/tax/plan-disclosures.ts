import { normalizedHsaPlanSettings, type PlanInput } from "../budget";
import type { BenefitTaxabilityStage } from "./benefit-taxability-stage";
import type { BenefitResult } from "./plan-result";
import type { TaxTable } from "./types";

export function noticesForPlan(
  plan: PlanInput,
  benefits: BenefitResult[],
  table: TaxTable,
  taxability: BenefitTaxabilityStage,
): string[] {
  const hsaSettings = normalizedHsaPlanSettings(plan);
  const hasActiveBenefit = (...types: BenefitResult["entry"]["type"][]) =>
    benefits.some(
      ({ entry, annualAmountCents }) =>
        annualAmountCents > 0 && types.includes(entry.type),
    );

  return [
    ...(hasActiveBenefit(
      "healthFsa",
      "dependentCareFsa",
      "commuter",
      "commuterParking",
    )
      ? [
          "Payroll reimbursement accounts are funding sources. Exclude reimbursed spending from the expense ledger to avoid counting it twice.",
        ]
      : []),
    ...(taxability.hasHsaContribution && !taxability.hsaEligibilityConflict
      ? [
          "HSA tax treatment uses each owner's selected eligibility under a qualifying HDHP for the modeled contribution period and assumes no other disqualifying health coverage.",
        ]
      : []),
    ...(taxability.hasHsaContribution &&
    plan.filingStatus === "mfj" &&
    plan.hsaCoverage === "family"
      ? [
          `The family HSA contribution limit is allocated ${hsaSettings.primaryHsaFamilyAllocationPpm / 10_000}% to the primary owner and ${hsaSettings.spouseHsaFamilyAllocationPpm / 10_000}% to the spouse. Within each spouse's share, the estimate applies the eligible exclusion to employee HSA entries first, then employer HSA entries.`,
        ]
      : []),
    ...(taxability.hasHsaContribution &&
    (hsaSettings.primaryHsaCatchUpEligible ||
      hsaSettings.spouseHsaCatchUpEligible)
      ? [
          `The selected age-55 HSA catch-up adds $${table.limits.hsaCatchUp.cents / 100} only to each qualifying owner's limit and is not divided under the family allocation. Each spouse's catch-up must go to that spouse's own HSA.`,
        ]
      : []),
    ...(hasActiveBenefit("hsa") && hasActiveBenefit("employerHsa")
      ? [
          "When employee and employer HSA entries share a contribution limit, the estimate applies the eligible exclusion to employee HSA entries first, then employer HSA entries. Any remaining employer amount is treated as excess and added back to applicable taxable income and wages.",
        ]
      : []),
    ...(hasActiveBenefit("espp")
      ? [
          "ESPP discount value is a planning illustration. It does not model lookback pricing, grant dates, or separate employer plans.",
        ]
      : []),
    ...(hasActiveBenefit("commuter", "commuterParking")
      ? [
          "Transit and parking limits are modeled as annualized monthly limits because month-by-month elections are not inputs.",
        ]
      : []),
    ...(hasActiveBenefit(
      "traditional401k",
      "roth401k",
      "employer401kMatch",
      "healthFsa",
    )
      ? [
          "Participant limits are aggregated per payroll owner because separate unrelated employer/plan scopes are not inputs.",
        ]
      : []),
  ];
}

import type { BenefitEntry } from "../benefits";
import type { PlanInput } from "../budget";
import { multiplyByRate, sumCents } from "../money";
import type { BenefitTaxabilityStage } from "./benefit-taxability-stage";
import {
  calculateProgressiveTax,
  type BracketTax,
} from "./calculate-progressive-tax";
import type { BenefitResult } from "./plan-result";
import type { StateTaxEntry, TaxTable } from "./types";

export interface TaxCalculationStage {
  federalCitations: string[];
  federalTaxableIncomeCents: number;
  stateTaxableIncomeCents: number;
  ficaTaxableWagesCents: number;
  federalBracketTaxes: BracketTax[];
  federalIncomeTaxCents: number;
  socialSecurityTaxCents: number;
  medicareTaxCents: number;
  additionalMedicareTaxCents: number;
  ficaTaxCents: number;
  stateIncomeTaxCents: number;
  totalTaxCents: number;
  primaryPayrollCapacityCents: number;
  spousePayrollCapacityCents: number;
}

function federalCitationsFor(
  plan: PlanInput,
  benefits: BenefitResult[],
  table: TaxTable,
): string[] {
  const federalSchedule = table.federal[plan.filingStatus];
  const activeBenefitTypes = new Set(
    benefits
      .filter(({ annualAmountCents }) => annualAmountCents > 0)
      .map(({ entry }) => entry.type),
  );
  const activeLimitCitations = [
    ...(["traditional401k", "roth401k", "employer401kMatch"].some((type) =>
      activeBenefitTypes.has(type as BenefitEntry["type"]),
    )
      ? [
          ...table.limits.employee401k.citations,
          ...table.limits.definedContributionPlan.citations,
        ]
      : []),
    ...(["hsa", "employerHsa"].some((type) =>
      activeBenefitTypes.has(type as BenefitEntry["type"]),
    )
      ? [
          ...table.limits.hsaSelf.citations,
          ...table.limits.hsaFamily.citations,
          ...table.limits.hsaCatchUp.citations,
        ]
      : []),
    ...(activeBenefitTypes.has("healthFsa")
      ? table.limits.healthFsa.citations
      : []),
    ...(activeBenefitTypes.has("dependentCareFsa")
      ? table.limits.dependentCareFsa.citations
      : []),
    ...(["commuter", "commuterParking"].some((type) =>
      activeBenefitTypes.has(type as BenefitEntry["type"]),
    )
      ? table.limits.commuterMonthly.citations
      : []),
    ...(activeBenefitTypes.has("espp")
      ? table.limits.esppGrantValue.citations
      : []),
  ];
  return [
    ...new Set([
      ...federalSchedule.citations,
      ...federalSchedule.brackets.flatMap(({ citations }) => citations),
      ...table.fica.citations,
      ...benefits
        .filter(({ annualAmountCents }) => annualAmountCents > 0)
        .flatMap(({ entry }) =>
          entry.type === "custom"
            ? []
            : table.benefitTreatmentCitations[entry.type],
        ),
      ...activeLimitCitations,
    ]),
  ];
}

export function calculateTaxStage(
  plan: PlanInput,
  benefits: BenefitResult[],
  grossIncomeCents: number,
  primaryWageIncomeCents: number,
  taxability: BenefitTaxabilityStage,
  table: TaxTable,
  state: StateTaxEntry,
): TaxCalculationStage {
  const federalSchedule = table.federal[plan.filingStatus];
  const federalTaxableIncomeCents = Math.max(
    0,
    grossIncomeCents +
      taxability.federalTaxableAdditionsCents -
      taxability.federalPreTaxCents -
      federalSchedule.standardDeductionCents,
  );
  const federal = calculateProgressiveTax(
    federalTaxableIncomeCents,
    federalSchedule.brackets,
  );
  const primaryFicaWagesCents = Math.max(
    0,
    primaryWageIncomeCents +
      taxability.taxablePrimaryEmployerHsaCents -
      taxability.primaryFicaPreTaxCents,
  );
  const spouseFicaWagesCents = Math.max(
    0,
    plan.spouseWageIncomeCents +
      taxability.taxableSpouseEmployerHsaCents -
      taxability.spouseFicaPreTaxCents,
  );
  const ficaTaxableWagesCents = sumCents([
    primaryFicaWagesCents,
    spouseFicaWagesCents,
  ]);
  const primarySocialSecurityTaxCents = multiplyByRate(
    Math.min(primaryFicaWagesCents, table.fica.socialSecurityWageBaseCents),
    table.fica.socialSecurityRatePpm,
  );
  const spouseSocialSecurityTaxCents = multiplyByRate(
    Math.min(spouseFicaWagesCents, table.fica.socialSecurityWageBaseCents),
    table.fica.socialSecurityRatePpm,
  );
  const socialSecurityTaxCents = sumCents([
    primarySocialSecurityTaxCents,
    spouseSocialSecurityTaxCents,
  ]);
  const primaryMedicareTaxCents = multiplyByRate(
    primaryFicaWagesCents,
    table.fica.medicareRatePpm,
  );
  const spouseMedicareTaxCents = multiplyByRate(
    spouseFicaWagesCents,
    table.fica.medicareRatePpm,
  );
  const medicareTaxCents = sumCents([
    primaryMedicareTaxCents,
    spouseMedicareTaxCents,
  ]);
  const additionalMedicareTaxCents = multiplyByRate(
    Math.max(
      0,
      ficaTaxableWagesCents -
        table.fica.additionalMedicareThresholdCents[plan.filingStatus],
    ),
    table.fica.additionalMedicareRatePpm,
  );
  const primaryAdditionalMedicareWithholdingCents = multiplyByRate(
    Math.max(
      0,
      primaryFicaWagesCents -
        table.fica.additionalMedicareWithholdingThresholdCents,
    ),
    table.fica.additionalMedicareRatePpm,
  );
  const spouseAdditionalMedicareWithholdingCents = multiplyByRate(
    Math.max(
      0,
      spouseFicaWagesCents -
        table.fica.additionalMedicareWithholdingThresholdCents,
    ),
    table.fica.additionalMedicareRatePpm,
  );
  const ficaTaxCents = sumCents([
    socialSecurityTaxCents,
    medicareTaxCents,
    additionalMedicareTaxCents,
  ]);
  const stateSchedule = state.filingStatuses[plan.filingStatus];
  const stateTaxableIncomeCents = Math.max(
    0,
    grossIncomeCents +
      taxability.stateTaxableAdditionsCents -
      taxability.statePreTaxCents -
      stateSchedule.standardDeductionCents -
      (stateSchedule.personalExemptionCents ?? 0),
  );
  const stateIncomeTaxCents = calculateProgressiveTax(
    stateTaxableIncomeCents,
    stateSchedule.brackets,
  ).totalTaxCents;
  const totalTaxCents = sumCents([
    federal.totalTaxCents,
    ficaTaxCents,
    stateIncomeTaxCents,
  ]);

  return {
    federalCitations: federalCitationsFor(plan, benefits, table),
    federalTaxableIncomeCents,
    stateTaxableIncomeCents,
    ficaTaxableWagesCents,
    federalBracketTaxes: federal.brackets,
    federalIncomeTaxCents: federal.totalTaxCents,
    socialSecurityTaxCents,
    medicareTaxCents,
    additionalMedicareTaxCents,
    ficaTaxCents,
    stateIncomeTaxCents,
    totalTaxCents,
    primaryPayrollCapacityCents: Math.max(
      0,
      primaryWageIncomeCents -
        primarySocialSecurityTaxCents -
        primaryMedicareTaxCents -
        primaryAdditionalMedicareWithholdingCents,
    ),
    spousePayrollCapacityCents: Math.max(
      0,
      plan.spouseWageIncomeCents -
        spouseSocialSecurityTaxCents -
        spouseMedicareTaxCents -
        spouseAdditionalMedicareWithholdingCents,
    ),
  };
}

import {
  treatmentFor,
  type BenefitEntry,
  type TaxTreatment,
} from "../benefits";
import type { PlanInput } from "../budget";
import { sumCents } from "../money";
import { eligibleBenefitAmounts } from "./benefit-limits";
import type { BenefitResult } from "./plan-result";
import type { StateTaxEntry, TaxTable } from "./types";

export interface BenefitTaxabilityStage {
  hasHsaContribution: boolean;
  hsaEligibilityConflict: boolean;
  federalPreTaxCents: number;
  statePreTaxCents: number;
  stateTaxableAdditionsCents: number;
  taxablePrimaryEmployerHsaCents: number;
  taxableSpouseEmployerHsaCents: number;
  federalTaxableAdditionsCents: number;
  primaryFicaPreTaxCents: number;
  spouseFicaPreTaxCents: number;
  primaryPaycheckDeductionsCents: number;
  spousePaycheckDeductionsCents: number;
  paycheckDeductionsCents: number;
}

function sumBenefits(
  benefits: BenefitResult[],
  predicate: (entry: BenefitEntry) => boolean,
): number {
  return sumCents(
    benefits
      .filter(({ entry }) => predicate(entry))
      .map(({ annualAmountCents }) => annualAmountCents),
  );
}

export function calculateBenefitTaxability(
  plan: PlanInput,
  benefits: BenefitResult[],
  table: TaxTable,
  state: StateTaxEntry,
): BenefitTaxabilityStage {
  const hasGeneralHealthFsa = benefits.some(
    ({ entry, annualAmountCents }) =>
      entry.type === "healthFsa" && annualAmountCents > 0,
  );
  const hasHsaContribution = benefits.some(
    ({ entry, annualAmountCents }) =>
      ["hsa", "employerHsa"].includes(entry.type) && annualAmountCents > 0,
  );
  const hsaEligibilityConflict = hasGeneralHealthFsa && hasHsaContribution;
  const eligibleAmounts = eligibleBenefitAmounts(plan, benefits, table.limits);
  const sumEligibleBenefits = (
    predicate: (entry: BenefitEntry) => boolean,
  ): number =>
    sumCents(
      benefits.flatMap(({ entry }, index) =>
        predicate(entry) ? [eligibleAmounts[index]] : [],
      ),
    );
  const effectiveTreatmentFor = (entry: BenefitEntry): TaxTreatment => {
    const treatment = treatmentFor(entry);
    if (!hsaEligibilityConflict || !["hsa", "employerHsa"].includes(entry.type))
      return treatment;
    return {
      ...treatment,
      reducesFederalTaxable: false,
      reducesFicaTaxable: false,
      reducesStateTaxable: false,
    };
  };

  const federalPreTaxCents = sumEligibleBenefits(
    (entry) => effectiveTreatmentFor(entry).reducesFederalTaxable,
  );
  const statePreTaxCents = sumEligibleBenefits((entry) => {
    if (hsaEligibilityConflict && ["hsa", "employerHsa"].includes(entry.type))
      return false;
    return (
      state.benefitStateTaxOverrides?.[entry.type] ??
      effectiveTreatmentFor(entry).reducesStateTaxable
    );
  });
  const stateTaxableAdditionsCents = sumCents(
    benefits.flatMap(({ entry, annualAmountCents }, index) => {
      if (entry.type !== "employerHsa") return [];
      const stateExcludesEmployerHsa =
        state.benefitStateTaxOverrides?.employerHsa !== false;
      return [
        stateExcludesEmployerHsa
          ? annualAmountCents - eligibleAmounts[index]
          : annualAmountCents,
      ];
    }),
  );
  const taxablePrimaryEmployerHsaCents = sumCents(
    benefits.flatMap(({ entry, annualAmountCents }, index) =>
      entry.type === "employerHsa" && entry.owner !== "spouse"
        ? [annualAmountCents - eligibleAmounts[index]]
        : [],
    ),
  );
  const taxableSpouseEmployerHsaCents = sumCents(
    benefits.flatMap(({ entry, annualAmountCents }, index) =>
      entry.type === "employerHsa" && entry.owner === "spouse"
        ? [annualAmountCents - eligibleAmounts[index]]
        : [],
    ),
  );
  const primaryPaycheckDeductionsCents = sumBenefits(
    benefits,
    (entry) => entry.owner !== "spouse" && treatmentFor(entry).reducesTakeHome,
  );
  const spousePaycheckDeductionsCents = sumBenefits(
    benefits,
    (entry) => entry.owner === "spouse" && treatmentFor(entry).reducesTakeHome,
  );

  return {
    hasHsaContribution,
    hsaEligibilityConflict,
    federalPreTaxCents,
    statePreTaxCents,
    stateTaxableAdditionsCents,
    taxablePrimaryEmployerHsaCents,
    taxableSpouseEmployerHsaCents,
    federalTaxableAdditionsCents: sumCents([
      taxablePrimaryEmployerHsaCents,
      taxableSpouseEmployerHsaCents,
    ]),
    primaryFicaPreTaxCents: sumEligibleBenefits(
      (entry) =>
        entry.owner !== "spouse" &&
        effectiveTreatmentFor(entry).reducesFicaTaxable,
    ),
    spouseFicaPreTaxCents: sumEligibleBenefits(
      (entry) =>
        entry.owner === "spouse" &&
        effectiveTreatmentFor(entry).reducesFicaTaxable,
    ),
    primaryPaycheckDeductionsCents,
    spousePaycheckDeductionsCents,
    paycheckDeductionsCents: sumCents([
      primaryPaycheckDeductionsCents,
      spousePaycheckDeductionsCents,
    ]),
  };
}

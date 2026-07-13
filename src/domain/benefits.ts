import { multiplyByRate } from "./money";

export const BUILT_IN_BENEFIT_TYPES = [
  "traditional401k",
  "roth401k",
  "employer401kMatch",
  "espp",
  "hsa",
  "employerHsa",
  "healthFsa",
  "dependentCareFsa",
  "section125Premium",
  "commuter",
  "commuterParking",
  "lifeDisabilityInsurance",
] as const;

export const BENEFIT_TYPES = [...BUILT_IN_BENEFIT_TYPES, "custom"] as const;

export type BenefitType = (typeof BENEFIT_TYPES)[number];

export type ConfiguredAmount =
  | { kind: "percent"; ratePpm: number }
  | { kind: "fixedAnnual"; cents: number }
  | { kind: "fixedMonthly"; cents: number };

export interface TaxTreatment {
  reducesFederalTaxable: boolean;
  reducesFicaTaxable: boolean;
  reducesStateTaxable: boolean;
  reducesTakeHome: boolean;
  countsAsSavings: boolean;
  employerSide: boolean;
}

export interface BenefitEntry {
  id: string;
  owner?: "primary" | "spouse";
  type: BenefitType;
  label: string;
  amount: ConfiguredAmount;
  discountRatePpm?: number;
  customTaxTreatment?: TaxTreatment;
}

export const BENEFIT_TREATMENTS: Record<
  Exclude<BenefitType, "custom">,
  TaxTreatment
> = {
  traditional401k: {
    reducesFederalTaxable: true,
    reducesFicaTaxable: false,
    reducesStateTaxable: true,
    reducesTakeHome: true,
    countsAsSavings: true,
    employerSide: false,
  },
  roth401k: {
    reducesFederalTaxable: false,
    reducesFicaTaxable: false,
    reducesStateTaxable: false,
    reducesTakeHome: true,
    countsAsSavings: true,
    employerSide: false,
  },
  employer401kMatch: {
    reducesFederalTaxable: false,
    reducesFicaTaxable: false,
    reducesStateTaxable: false,
    reducesTakeHome: false,
    countsAsSavings: true,
    employerSide: true,
  },
  espp: {
    reducesFederalTaxable: false,
    reducesFicaTaxable: false,
    reducesStateTaxable: false,
    reducesTakeHome: true,
    countsAsSavings: true,
    employerSide: false,
  },
  hsa: {
    reducesFederalTaxable: true,
    reducesFicaTaxable: true,
    reducesStateTaxable: true,
    reducesTakeHome: true,
    countsAsSavings: true,
    employerSide: false,
  },
  employerHsa: {
    reducesFederalTaxable: false,
    reducesFicaTaxable: false,
    reducesStateTaxable: false,
    reducesTakeHome: false,
    countsAsSavings: true,
    employerSide: true,
  },
  healthFsa: {
    reducesFederalTaxable: true,
    reducesFicaTaxable: true,
    reducesStateTaxable: true,
    reducesTakeHome: true,
    countsAsSavings: false,
    employerSide: false,
  },
  dependentCareFsa: {
    reducesFederalTaxable: true,
    reducesFicaTaxable: true,
    reducesStateTaxable: true,
    reducesTakeHome: true,
    countsAsSavings: false,
    employerSide: false,
  },
  section125Premium: {
    reducesFederalTaxable: true,
    reducesFicaTaxable: true,
    reducesStateTaxable: true,
    reducesTakeHome: true,
    countsAsSavings: false,
    employerSide: false,
  },
  commuter: {
    reducesFederalTaxable: true,
    reducesFicaTaxable: true,
    reducesStateTaxable: true,
    reducesTakeHome: true,
    countsAsSavings: false,
    employerSide: false,
  },
  commuterParking: {
    reducesFederalTaxable: true,
    reducesFicaTaxable: true,
    reducesStateTaxable: true,
    reducesTakeHome: true,
    countsAsSavings: false,
    employerSide: false,
  },
  lifeDisabilityInsurance: {
    reducesFederalTaxable: false,
    reducesFicaTaxable: false,
    reducesStateTaxable: false,
    reducesTakeHome: true,
    countsAsSavings: false,
    employerSide: false,
  },
};

export function annualBenefitAmount(
  amount: ConfiguredAmount,
  grossIncomeCents: number,
): number {
  switch (amount.kind) {
    case "percent":
      return multiplyByRate(grossIncomeCents, amount.ratePpm);
    case "fixedAnnual":
      return amount.cents;
    case "fixedMonthly":
      return amount.cents * 12;
  }
}

export function treatmentFor(entry: BenefitEntry): TaxTreatment {
  if (entry.type === "custom") {
    if (!entry.customTaxTreatment) {
      throw new Error(
        `Custom benefit ${entry.id} is missing its tax treatment`,
      );
    }
    return entry.customTaxTreatment;
  }
  return BENEFIT_TREATMENTS[entry.type];
}

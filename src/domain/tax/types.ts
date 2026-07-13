import type { BenefitType } from "../benefits";
import type { StateCode } from "./jurisdictions";

export type FilingStatus = "single" | "mfj" | "hoh";

export interface TaxBracket {
  thresholdCents: number;
  ratePpm: number;
  citations: string[];
}

export interface FilingSchedule {
  standardDeductionCents: number;
  personalExemptionCents?: number;
  citations: string[];
  brackets: TaxBracket[];
}

export interface CitedLimit {
  cents: number;
  citations: string[];
}

export interface StateTaxEntry {
  code: StateCode;
  name: string;
  approximation: string;
  citations: string[];
  benefitStateTaxOverrides?: Partial<Record<BenefitType, boolean>>;
  filingStatuses: Record<FilingStatus, FilingSchedule>;
}

export interface TaxTable {
  year: number;
  sources: Record<string, { label: string; url: string }>;
  benefitTreatmentCitations: Record<Exclude<BenefitType, "custom">, string[]>;
  federal: Record<FilingStatus, FilingSchedule>;
  fica: {
    socialSecurityRatePpm: number;
    socialSecurityWageBaseCents: number;
    medicareRatePpm: number;
    additionalMedicareRatePpm: number;
    additionalMedicareWithholdingThresholdCents: number;
    additionalMedicareThresholdCents: Record<FilingStatus, number>;
    citations: string[];
  };
  limits: {
    employee401k: CitedLimit;
    definedContributionPlan: CitedLimit;
    hsaSelf: CitedLimit;
    hsaFamily: CitedLimit;
    hsaCatchUp: CitedLimit;
    healthFsa: CitedLimit;
    dependentCareFsa: CitedLimit;
    commuterMonthly: CitedLimit;
    esppGrantValue: CitedLimit;
  };
  states: Record<StateCode, StateTaxEntry>;
}

export interface TaxTableSelection {
  table: TaxTable;
  requestedYear: number;
  appliedYear: number;
  isFallback: boolean;
  usesFutureTable: boolean;
}

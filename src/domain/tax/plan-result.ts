import type { BenefitEntry } from "../benefits";
import { sumCents } from "../money";
import type { BracketTax } from "./calculate-progressive-tax";

export interface BenefitResult {
  entry: BenefitEntry;
  annualAmountCents: number;
  impliedEsppDiscountGainCents: number;
}

export function sumBenefits(
  benefits: BenefitResult[],
  predicate: (entry: BenefitEntry) => boolean,
): number {
  return sumCents(
    benefits
      .filter(({ entry }) => predicate(entry))
      .map(({ annualAmountCents }) => annualAmountCents),
  );
}

export interface LimitWarning {
  code: string;
  message: string;
  actualCents: number;
  limitCents: number;
}

export interface PlanResult {
  requestedTaxYear: number;
  appliedTaxYear: number;
  usesFallbackTaxTable: boolean;
  usesFutureTaxTable: boolean;
  federalApproximation: string;
  federalCitations: string[];
  stateApproximation: string;
  stateCitations: string[];
  grossIncomeCents: number;
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
  paycheckDeductionsAnnualCents: number;
  fundablePaycheckDeductionsAnnualCents: number;
  primaryPaycheckDeductionsAnnualCents: number;
  spousePaycheckDeductionsAnnualCents: number;
  isPayrollFeasible: boolean;
  infeasiblePayrollOwner: "primary" | "spouse" | "household" | null;
  takeHomeAnnualCents: number;
  takeHomeMonthlyCents: number;
  expensesAnnualCents: number;
  expensesMonthlyCents: number;
  needsExpensesAnnualCents: number;
  wantsExpensesAnnualCents: number;
  plannedInvestmentAnnualCents: number;
  cashSavingsAnnualCents: number;
  savingsMonthlyCents: number;
  payrollSavingsAnnualCents: number;
  employerSavingsAnnualCents: number;
  totalSavedAnnualCents: number;
  cashSavingsRateGrossPpm: number;
  cashSavingsRateNetPpm: number;
  benefits: BenefitResult[];
  warnings: LimitWarning[];
  notices: string[];
  accountingDifferenceCents: number;
}

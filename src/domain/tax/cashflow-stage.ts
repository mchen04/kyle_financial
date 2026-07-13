import { treatmentFor, type BenefitEntry } from "../benefits";
import type { PlanInput } from "../budget";
import { divideAnnualForMonthly, sumCents } from "../money";
import type { BenefitTaxabilityStage } from "./benefit-taxability-stage";
import type { BenefitResult } from "./plan-result";
import { calculateExpenseStage, ratioPpm } from "./plan-stages";
import type { TaxCalculationStage } from "./tax-calculation-stage";

export interface CashflowStage {
  fundablePaycheckDeductionsAnnualCents: number;
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

export function calculateCashflowStage(
  plan: PlanInput,
  benefits: BenefitResult[],
  grossIncomeCents: number,
  taxability: BenefitTaxabilityStage,
  taxes: TaxCalculationStage,
): CashflowStage {
  const takeHomeAnnualCents =
    grossIncomeCents - taxes.totalTaxCents - taxability.paycheckDeductionsCents;
  const expenseStage = calculateExpenseStage(plan);
  const takeHomeMonthlyCents = divideAnnualForMonthly(takeHomeAnnualCents);
  const cashSavingsAnnualCents =
    takeHomeAnnualCents - expenseStage.expensesAnnualCents;
  const payrollSavingsAnnualCents = sumBenefits(benefits, (entry) => {
    const treatment = treatmentFor(entry);
    return treatment.countsAsSavings && !treatment.employerSide;
  });
  const employerSavingsAnnualCents = sumBenefits(
    benefits,
    (entry) => treatmentFor(entry).employerSide,
  );
  const primaryPayrollFeasible =
    taxability.primaryPaycheckDeductionsCents <=
    taxes.primaryPayrollCapacityCents;
  const spousePayrollFeasible =
    taxability.spousePaycheckDeductionsCents <=
    taxes.spousePayrollCapacityCents;
  const householdPayrollFeasible = takeHomeAnnualCents >= 0;

  return {
    fundablePaycheckDeductionsAnnualCents: Math.min(
      Math.max(0, grossIncomeCents - taxes.totalTaxCents),
      sumCents([
        Math.min(
          taxability.primaryPaycheckDeductionsCents,
          taxes.primaryPayrollCapacityCents,
        ),
        Math.min(
          taxability.spousePaycheckDeductionsCents,
          taxes.spousePayrollCapacityCents,
        ),
      ]),
    ),
    isPayrollFeasible:
      householdPayrollFeasible &&
      primaryPayrollFeasible &&
      spousePayrollFeasible,
    infeasiblePayrollOwner: !primaryPayrollFeasible
      ? "primary"
      : !spousePayrollFeasible
        ? "spouse"
        : !householdPayrollFeasible
          ? "household"
          : null,
    takeHomeAnnualCents,
    takeHomeMonthlyCents,
    ...expenseStage,
    cashSavingsAnnualCents,
    savingsMonthlyCents:
      takeHomeMonthlyCents - expenseStage.expensesMonthlyCents,
    payrollSavingsAnnualCents,
    employerSavingsAnnualCents,
    totalSavedAnnualCents: sumCents([
      cashSavingsAnnualCents,
      payrollSavingsAnnualCents,
      employerSavingsAnnualCents,
      expenseStage.plannedInvestmentAnnualCents,
    ]),
    cashSavingsRateGrossPpm: ratioPpm(cashSavingsAnnualCents, grossIncomeCents),
    cashSavingsRateNetPpm:
      takeHomeAnnualCents > 0
        ? ratioPpm(cashSavingsAnnualCents, takeHomeAnnualCents)
        : 0,
  };
}

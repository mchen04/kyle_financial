import type { PlanInput } from "../budget";
import { calculateBenefitTaxability } from "./benefit-taxability-stage";
import { calculateCashflowStage } from "./cashflow-stage";
import { warningsFor } from "./limit-warnings";
import { noticesForPlan } from "./plan-disclosures";
import type { PlanResult } from "./plan-result";
import { materializeIncomeAndBenefits, validatePlanInput } from "./plan-stages";
import { selectTaxTable } from "./table-registry";
import { calculateTaxStage } from "./tax-calculation-stage";

export type { BenefitResult, LimitWarning, PlanResult } from "./plan-result";

export function calculatePlan(plan: PlanInput): PlanResult {
  validatePlanInput(plan);
  const selection = selectTaxTable(plan.year);
  const { table } = selection;
  const state = table.states[plan.stateCode];
  if (!state) throw new Error(`Unsupported state code: ${plan.stateCode}`);

  const income = materializeIncomeAndBenefits(plan);
  const taxability = calculateBenefitTaxability(
    plan,
    income.benefits,
    table,
    state,
  );
  const taxes = calculateTaxStage(
    plan,
    income.benefits,
    income.grossIncomeCents,
    income.primaryWageIncomeCents,
    taxability,
    table,
    state,
  );
  const cashflow = calculateCashflowStage(
    plan,
    income.benefits,
    income.grossIncomeCents,
    taxability,
    taxes,
  );
  const {
    primaryPayrollCapacityCents,
    spousePayrollCapacityCents,
    ...taxResult
  } = taxes;

  return {
    requestedTaxYear: plan.year,
    appliedTaxYear: selection.appliedYear,
    usesFallbackTaxTable: selection.isFallback,
    usesFutureTaxTable: selection.usesFutureTable,
    federalApproximation:
      "Federal estimate assumes ordinary wage/non-wage income, the standard deduction, no credits or dependents, and no self-employment or preferential capital-gains tax.",
    stateApproximation: `${state.approximation}${plan.filingStatus === "hoh" ? " Head of household uses the published Single state schedule as a visible proxy because the consolidated source does not provide HOH columns." : ""} Benefit tax treatment follows federal defaults except where a state override is cited.`,
    stateCitations: state.citations,
    grossIncomeCents: income.grossIncomeCents,
    ...taxResult,
    paycheckDeductionsAnnualCents: taxability.paycheckDeductionsCents,
    primaryPaycheckDeductionsAnnualCents:
      taxability.primaryPaycheckDeductionsCents,
    spousePaycheckDeductionsAnnualCents:
      taxability.spousePaycheckDeductionsCents,
    ...cashflow,
    benefits: income.benefits,
    warnings: warningsFor(
      plan,
      income.benefits,
      table.limits,
      selection.appliedYear,
      income.grossIncomeCents,
      taxes.totalTaxCents,
      taxability.primaryPaycheckDeductionsCents,
      taxability.spousePaycheckDeductionsCents,
      income.primaryWageIncomeCents,
      plan.spouseWageIncomeCents,
      primaryPayrollCapacityCents,
      spousePayrollCapacityCents,
    ),
    notices: noticesForPlan(plan, income.benefits, table, taxability),
    accountingDifferenceCents:
      income.grossIncomeCents -
      taxes.totalTaxCents -
      taxability.paycheckDeductionsCents -
      cashflow.takeHomeAnnualCents,
  };
}

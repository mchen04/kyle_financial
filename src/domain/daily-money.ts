import {
  annualExpenseAmount,
  canonicalBudgetCategory,
  guidanceBucket,
  type BudgetCategory,
  type ExpenseEntry,
  type TransactionEntry,
} from "./budget";
import {
  localCalendarDate,
  parseLocalCalendarDate,
} from "./local-calendar-date";
import { assertCents, sumCents } from "./money";

export type SelectedPeriod =
  | { kind: "month"; year: number; month: number }
  | { kind: "ytd"; year: number; throughDate: string }
  | { kind: "year"; year: number };

export interface CategoryRollup {
  category: BudgetCategory;
  allocatedCents: number;
  actualCents: number;
  remainingCents: number;
  actualLabel: "spent" | "funded";
  remainingLabel: "remaining" | "left to fund";
}

export interface BudgetRollup {
  period: SelectedPeriod;
  categories: CategoryRollup[];
  allocatedCents: number;
  actualCents: number;
  remainingCents: number;
  spendingAllocatedCents: number;
  spendingActualCents: number;
  spendingRemainingCents: number;
  savingAllocatedCents: number;
  savingActualCents: number;
  savingRemainingCents: number;
  safeToSpendCents: number;
}

export interface AnnualSavingsSources {
  cashSavingsAnnualCents: number;
  payrollSavingsAnnualCents: number;
  employerSavingsAnnualCents: number;
}

export interface SavingsImpact {
  plannedCashSavingsCents: number;
  payrollSavingsCents: number;
  employerSavingsCents: number;
  plannedSavingAllocationCents: number;
  actualSavingFundingCents: number;
  spendingVarianceCents: number;
  savingFundingVarianceCents: number;
  plannedSavingsChangeCents: number;
  projectedSavingsChangeCents: number;
  startingSavingsCents?: number;
  projectedEndingSavingsCents?: number;
}

export interface AnnualSavingsProjection {
  plannedSavingsChangeCents: number;
  observedSpendingVarianceCents: number;
  observedSavingFundingVarianceCents: number;
  projectedSavingsChangeCents: number;
  startingSavingsCents?: number;
  projectedEndingSavingsCents?: number;
}

export interface MonthlyWrap {
  period: Extract<SelectedPeriod, { kind: "month" }>;
  budget: BudgetRollup;
  underBudget: CategoryRollup[];
  overBudget: CategoryRollup[];
  onBudget: CategoryRollup[];
  savings: SavingsImpact;
}

export interface PieAllocation {
  id: string;
  valueCents: number;
  percentagePpm: number;
}

function assertMonth(month: number): void {
  if (!Number.isInteger(month) || month < 1 || month > 12)
    throw new RangeError("Month must be between 1 and 12");
}

export function localDate(year: number, month: number, day: number): string {
  return localCalendarDate(year, month, day);
}

export function currentLocalDate(now = new Date()): string {
  return localDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function observedTransactionsThrough(
  transactions: readonly TransactionEntry[],
  throughDate: string,
): TransactionEntry[] {
  parseLocalCalendarDate(throughDate);
  return transactions.filter(({ date }) => date <= throughDate);
}

export function unobservedTransactionsAfter(
  transactions: readonly TransactionEntry[],
  throughDate: string,
): TransactionEntry[] {
  parseLocalCalendarDate(throughDate);
  return transactions.filter(({ date }) => date > throughDate);
}

export function periodLabel(period: SelectedPeriod): string {
  switch (period.kind) {
    case "month":
      assertMonth(period.month);
      return new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(period.year, period.month - 1, 1)));
    case "ytd":
      return `${period.year} year to date through ${period.throughDate}`;
    case "year":
      return `${period.year} full year`;
  }
}

export function allocateAnnualCentsToMonths(
  annualCents: number,
): readonly number[] {
  assertCents(annualCents);
  const annual = BigInt(annualCents);
  const quotient = annual / 12n;
  const remainder = annual % 12n;
  const direction = remainder < 0n ? -1 : 1;
  const remainderCount = Number(remainder < 0n ? -remainder : remainder);
  return Array.from({ length: 12 }, (_, index) =>
    Number(quotient + (index < remainderCount ? BigInt(direction) : 0n)),
  );
}

export function categoryMonthlyAllocations(
  category: ExpenseEntry,
): readonly number[] {
  if (category.archived) return Array.from({ length: 12 }, () => 0);
  if (category.cadence === "monthly") {
    assertCents(category.amountCents);
    return Array.from({ length: 12 }, () => category.amountCents);
  }
  return allocateAnnualCentsToMonths(category.amountCents);
}

export function categoryRollupIsVisible({
  category,
  actualCents,
}: Pick<CategoryRollup, "category" | "actualCents">): boolean {
  return !category.archived || actualCents !== 0;
}

function includedMonthCount(period: SelectedPeriod): number {
  switch (period.kind) {
    case "month":
      assertMonth(period.month);
      return 1;
    case "ytd": {
      const through = parseLocalCalendarDate(period.throughDate);
      if (through.year !== period.year)
        throw new RangeError("YTD through date must be inside its year");
      return through.month;
    }
    case "year":
      return 12;
  }
}

export function allocatedForPeriod(
  category: ExpenseEntry,
  period: SelectedPeriod,
): number {
  const months = categoryMonthlyAllocations(category);
  if (period.kind === "month") return months[period.month - 1];
  return sumCents(months.slice(0, includedMonthCount(period)));
}

export function transactionIsInPeriod(
  transaction: Pick<TransactionEntry, "date">,
  period: SelectedPeriod,
): boolean {
  const transactionDate = parseLocalCalendarDate(transaction.date);
  if (transactionDate.year !== period.year) return false;
  switch (period.kind) {
    case "month":
      return transactionDate.month === period.month;
    case "ytd":
      parseLocalCalendarDate(period.throughDate);
      return transaction.date <= period.throughDate;
    case "year":
      return true;
  }
}

export function rollupBudget(
  categories: readonly ExpenseEntry[],
  transactions: readonly TransactionEntry[],
  period: SelectedPeriod,
): BudgetRollup {
  const transactionTotals = new Map<string, number>();
  for (const transaction of transactions) {
    if (!transactionIsInPeriod(transaction, period)) continue;
    transactionTotals.set(
      transaction.categoryId,
      sumCents([
        transactionTotals.get(transaction.categoryId) ?? 0,
        transaction.amountCents,
      ]),
    );
  }
  const categoryIds = new Set(categories.map(({ id }) => id));
  const orphan = transactions.find(
    (transaction) =>
      transactionIsInPeriod(transaction, period) &&
      !categoryIds.has(transaction.categoryId),
  );
  if (orphan)
    throw new RangeError("Transaction references an unknown category");

  const rollups = categories
    .map((category, index) => canonicalBudgetCategory(category, index))
    .map((category): CategoryRollup => {
      const allocatedCents = allocatedForPeriod(category, period);
      const actualCents = transactionTotals.get(category.id) ?? 0;
      const saving = guidanceBucket(category) === "saving";
      return {
        category,
        allocatedCents,
        actualCents,
        remainingCents: assertCents(allocatedCents - actualCents),
        actualLabel: saving ? "funded" : "spent",
        remainingLabel: saving ? "left to fund" : "remaining",
      };
    })
    .toSorted(
      (left, right) =>
        left.category.sortOrder - right.category.sortOrder ||
        left.category.id.localeCompare(right.category.id),
    );
  const spending = rollups.filter(
    ({ category }) => guidanceBucket(category) !== "saving",
  );
  const saving = rollups.filter(
    ({ category }) => guidanceBucket(category) === "saving",
  );
  const total = (
    items: readonly CategoryRollup[],
    key: "allocatedCents" | "actualCents",
  ) => sumCents(items.map((item) => item[key]));
  const spendingAllocatedCents = total(spending, "allocatedCents");
  const spendingActualCents = total(spending, "actualCents");
  const savingAllocatedCents = total(saving, "allocatedCents");
  const savingActualCents = total(saving, "actualCents");
  const allocatedCents = sumCents([
    spendingAllocatedCents,
    savingAllocatedCents,
  ]);
  const actualCents = sumCents([spendingActualCents, savingActualCents]);
  return {
    period,
    categories: rollups,
    allocatedCents,
    actualCents,
    remainingCents: assertCents(allocatedCents - actualCents),
    spendingAllocatedCents,
    spendingActualCents,
    spendingRemainingCents: assertCents(
      spendingAllocatedCents - spendingActualCents,
    ),
    savingAllocatedCents,
    savingActualCents,
    savingRemainingCents: assertCents(savingAllocatedCents - savingActualCents),
    safeToSpendCents: assertCents(spendingAllocatedCents - spendingActualCents),
  };
}

function annualValueForPeriod(
  annualCents: number,
  period: SelectedPeriod,
): number {
  const months = allocateAnnualCentsToMonths(annualCents);
  if (period.kind === "month") return months[period.month - 1];
  return sumCents(months.slice(0, includedMonthCount(period)));
}

export function calculateSavingsImpact(
  budget: BudgetRollup,
  sources: AnnualSavingsSources,
  startingSavingsCents?: number,
): SavingsImpact {
  if (startingSavingsCents !== undefined) {
    assertCents(startingSavingsCents, "starting savings");
    if (startingSavingsCents < 0)
      throw new RangeError("Starting savings cannot be negative");
  }
  const plannedCashSavingsCents = annualValueForPeriod(
    sources.cashSavingsAnnualCents,
    budget.period,
  );
  const payrollSavingsCents = annualValueForPeriod(
    sources.payrollSavingsAnnualCents,
    budget.period,
  );
  const employerSavingsCents = annualValueForPeriod(
    sources.employerSavingsAnnualCents,
    budget.period,
  );
  const plannedSavingAllocationCents = budget.savingAllocatedCents;
  const actualSavingFundingCents = budget.savingActualCents;
  const spendingVarianceCents = assertCents(
    budget.spendingAllocatedCents - budget.spendingActualCents,
  );
  const savingFundingVarianceCents = assertCents(
    actualSavingFundingCents - plannedSavingAllocationCents,
  );
  const plannedSavingsChangeCents = sumCents([
    plannedCashSavingsCents,
    payrollSavingsCents,
    employerSavingsCents,
    plannedSavingAllocationCents,
  ]);
  const projectedSavingsChangeCents = sumCents([
    plannedSavingsChangeCents,
    spendingVarianceCents,
    savingFundingVarianceCents,
  ]);
  return {
    plannedCashSavingsCents,
    payrollSavingsCents,
    employerSavingsCents,
    plannedSavingAllocationCents,
    actualSavingFundingCents,
    spendingVarianceCents,
    savingFundingVarianceCents,
    plannedSavingsChangeCents,
    projectedSavingsChangeCents,
    ...(startingSavingsCents === undefined
      ? {}
      : {
          startingSavingsCents,
          projectedEndingSavingsCents: sumCents([
            startingSavingsCents,
            projectedSavingsChangeCents,
          ]),
        }),
  };
}

export function calculateAnnualSavingsProjection(
  annualBudget: BudgetRollup,
  observedBudget: BudgetRollup | undefined,
  sources: AnnualSavingsSources,
  startingSavingsCents?: number,
): AnnualSavingsProjection {
  if (annualBudget.period.kind !== "year")
    throw new RangeError("Annual projection requires a full-year plan");
  if (observedBudget && observedBudget.period.year !== annualBudget.period.year)
    throw new RangeError("Observed budget must use the projected plan year");
  const planned = calculateSavingsImpact(annualBudget, sources);
  const observed = observedBudget
    ? calculateSavingsImpact(observedBudget, sources)
    : undefined;
  const observedSpendingVarianceCents = observed?.spendingVarianceCents ?? 0;
  const observedSavingFundingVarianceCents =
    observed?.savingFundingVarianceCents ?? 0;
  const projectedSavingsChangeCents = sumCents([
    planned.plannedSavingsChangeCents,
    observedSpendingVarianceCents,
    observedSavingFundingVarianceCents,
  ]);
  if (startingSavingsCents !== undefined) {
    assertCents(startingSavingsCents, "starting savings");
    if (startingSavingsCents < 0)
      throw new RangeError("Starting savings cannot be negative");
  }
  return {
    plannedSavingsChangeCents: planned.plannedSavingsChangeCents,
    observedSpendingVarianceCents,
    observedSavingFundingVarianceCents,
    projectedSavingsChangeCents,
    ...(startingSavingsCents === undefined
      ? {}
      : {
          startingSavingsCents,
          projectedEndingSavingsCents: sumCents([
            startingSavingsCents,
            projectedSavingsChangeCents,
          ]),
        }),
  };
}

export function buildMonthlyWrap(
  categories: readonly ExpenseEntry[],
  transactions: readonly TransactionEntry[],
  period: Extract<SelectedPeriod, { kind: "month" }>,
  sources: AnnualSavingsSources,
  startingSavingsCents?: number,
): MonthlyWrap {
  const budget = rollupBudget(categories, transactions, period);
  const spending = budget.categories.filter(
    ({ category }) => guidanceBucket(category) !== "saving",
  );
  return {
    period,
    budget,
    underBudget: spending.filter(({ remainingCents }) => remainingCents > 0),
    overBudget: spending.filter(({ remainingCents }) => remainingCents < 0),
    onBudget: spending.filter(({ remainingCents }) => remainingCents === 0),
    savings: calculateSavingsImpact(budget, sources, startingSavingsCents),
  };
}

export function allocatePiePercentages(
  values: readonly { id: string; valueCents: number }[],
): PieAllocation[] {
  for (const value of values) {
    assertCents(value.valueCents);
    if (value.valueCents < 0)
      throw new RangeError("Pie values cannot be negative");
  }
  const total = values.reduce(
    (sum, { valueCents }) => sum + BigInt(valueCents),
    0n,
  );
  if (total === 0n)
    return values.map((value) => ({ ...value, percentagePpm: 0 }));
  const shares = values.map((value, index) => {
    const scaled = BigInt(value.valueCents) * 1_000_000n;
    return {
      ...value,
      index,
      percentagePpm: Number(scaled / total),
      remainder: scaled % total,
    };
  });
  let remainder =
    1_000_000 - shares.reduce((sum, share) => sum + share.percentagePpm, 0);
  for (const share of shares.toSorted((left, right) =>
    left.remainder === right.remainder
      ? left.index - right.index
      : left.remainder > right.remainder
        ? -1
        : 1,
  )) {
    if (remainder === 0) break;
    share.percentagePpm += 1;
    remainder -= 1;
  }
  return shares
    .toSorted((left, right) => left.index - right.index)
    .map(({ id, valueCents, percentagePpm }) => ({
      id,
      valueCents,
      percentagePpm,
    }));
}

export function allocateDisplayedPercentageTenths(
  allocations: readonly PieAllocation[],
): Map<string, number> {
  if (allocations.every(({ percentagePpm }) => percentagePpm === 0))
    return new Map(allocations.map(({ id }) => [id, 0]));
  const shares = allocations.map(({ id, percentagePpm }, index) => ({
    id,
    index,
    tenths: Math.floor(percentagePpm / 1_000),
    remainder: percentagePpm % 1_000,
  }));
  let remainder = 1_000 - shares.reduce((sum, share) => sum + share.tenths, 0);
  for (const share of shares.toSorted(
    (left, right) =>
      right.remainder - left.remainder || left.index - right.index,
  )) {
    if (remainder === 0) break;
    share.tenths += 1;
    remainder -= 1;
  }
  return new Map(shares.map(({ id, tenths }) => [id, tenths]));
}

export function annualCategoryTotal(
  categories: readonly ExpenseEntry[],
): number {
  return sumCents(categories.map(annualExpenseAmount));
}

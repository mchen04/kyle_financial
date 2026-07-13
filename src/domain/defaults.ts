import type { BenefitEntry } from "./benefits";
import type { ExpenseEntry } from "./budget";

export const DEFAULT_BENEFITS: Omit<BenefitEntry, "id">[] = [
  {
    type: "traditional401k",
    label: "Traditional 401(k)",
    amount: { kind: "percent", ratePpm: 0 },
  },
  {
    type: "roth401k",
    label: "Roth 401(k)",
    amount: { kind: "percent", ratePpm: 0 },
  },
  {
    type: "employer401kMatch",
    label: "Employer 401(k) match",
    amount: { kind: "percent", ratePpm: 0 },
  },
  {
    type: "espp",
    label: "Employee stock purchase plan",
    amount: { kind: "percent", ratePpm: 0 },
    discountRatePpm: 150_000,
  },
  {
    type: "hsa",
    label: "Health savings account",
    amount: { kind: "fixedAnnual", cents: 0 },
  },
  {
    type: "employerHsa",
    label: "Employer HSA contribution",
    amount: { kind: "fixedAnnual", cents: 0 },
  },
  {
    type: "section125Premium",
    label: "Health, dental, and vision premiums",
    amount: { kind: "fixedMonthly", cents: 0 },
  },
];

const expenseDefaults: Array<
  [name: string, group: string, cadence?: "monthly" | "yearly"]
> = [
  ["Car payment", "Transportation"],
  ["Car insurance", "Transportation"],
  ["Car registration", "Transportation", "yearly"],
  ["Estimated car maintenance", "Transportation", "yearly"],
  ["Rent", "Home"],
  ["Groceries", "Everyday"],
  ["Water", "Utilities"],
  ["Electric", "Utilities"],
  ["Gas", "Utilities"],
  ["Internet", "Utilities"],
  ["Brokerage investing", "Investing"],
  ["IRA / Roth IRA", "Investing", "yearly"],
  ["Other transportation", "Transportation"],
  ["Cleaning supplies", "Home"],
  ["Household replacements", "Home"],
  ["Gifts", "Personal", "yearly"],
  ["Clothes", "Personal"],
  ["Skincare", "Personal"],
  ["TV subscriptions", "Subscriptions"],
  ["Spotify", "Subscriptions"],
  ["Cell phone", "Subscriptions"],
  ["Fun money", "Lifestyle"],
  ["Vacation", "Lifestyle", "yearly"],
];

export const DEFAULT_EXPENSES: Omit<ExpenseEntry, "id">[] = expenseDefaults.map(
  ([name, group, cadence = "monthly"], sortOrder) => ({
    name,
    group,
    cadence,
    amountCents: 0,
    sortOrder,
  }),
);

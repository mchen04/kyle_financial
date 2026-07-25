// Deterministic local-development fixture for the mobile-density measurement
// harness (`scripts/measure-density.mjs`). Every surface the harness visits has
// to be populated, so this script owns one account and rebuilds it exactly.
//
// It is idempotent by construction: the fixture user is deleted (cascading to
// its plans, categories, transactions, and benefits) and rewritten from a
// deterministic description, so re-running never duplicates data and always
// produces byte-identical rows apart from `created_at`.
import { createHash } from "node:crypto";
import postgres from "postgres";
import { hashPassword } from "../src/server/auth/crypto";

// Local-development only. These credentials exist so an automated harness can
// sign in; they are never used outside a localhost database (see assertLocal).
export const FIXTURE_EMAIL = "density-fixture@localhost.test";
export const FIXTURE_PASSWORD = "density-fixture-4Kx9-local-only";
// A second account with no plan at all. Onboarding is only reachable for a
// signed-in user without a draft, so it cannot be measured on the populated
// account.
export const ONBOARDING_EMAIL = "density-onboarding@localhost.test";
export const ONBOARDING_PASSWORD = "density-onboarding-4Kx9-local-only";

const PRIMARY_YEAR = 2026;
const COMPARISON_YEAR = 2025;
// The harness measures the default selected period, which is the current month
// of the primary plan year. Transactions must land on or before this day or
// `observedTransactionsThrough` filters them out of Home, Budget, and Wrap.
const PRIMARY_MONTH = 7;
const LAST_OBSERVED_DAY = 24;

type GuidanceBucket = "needs" | "wants" | "saving";
type Cadence = "monthly" | "yearly";

interface CategorySeed {
  key: string;
  name: string;
  group: string;
  cadence: Cadence;
  amountCents: number;
  guidanceBucket: GuidanceBucket;
  colorToken: string;
}

interface BenefitSeed {
  key: string;
  type: string;
  label: string;
  amountKind: "percent" | "fixedAnnual" | "fixedMonthly";
  amountValue: number;
  discountRatePpm: number | null;
  customTaxTreatment: Record<string, boolean> | null;
}

interface TransactionSeed {
  categoryKey: string;
  title: string;
  amountCents: number;
  date: string;
  note: string | null;
}

// A stable RFC-4122 v5-shaped identifier so re-seeding reuses the same primary
// keys. Deterministic ids keep harness selectors and JSON diffs stable.
function stableUuid(key: string): string {
  const digest = createHash("sha1").update(`kf-density/${key}`).digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function day(year: number, month: number, dayOfMonth: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
}

const PRIMARY_CATEGORIES: CategorySeed[] = [
  {
    key: "rent",
    name: "Rent",
    group: "Home",
    cadence: "monthly",
    amountCents: 210_000,
    guidanceBucket: "needs",
    colorToken: "blue",
  },
  {
    key: "groceries",
    name: "Groceries",
    group: "Everyday",
    cadence: "monthly",
    amountCents: 65_000,
    guidanceBucket: "needs",
    colorToken: "teal",
  },
  {
    key: "utilities",
    name: "Utilities",
    group: "Utilities",
    cadence: "monthly",
    amountCents: 18_500,
    guidanceBucket: "needs",
    colorToken: "violet",
  },
  {
    key: "car",
    name: "Car payment",
    group: "Transportation",
    cadence: "monthly",
    amountCents: 41_000,
    guidanceBucket: "needs",
    colorToken: "amber",
  },
  {
    key: "fuel",
    name: "Fuel and transit",
    group: "Transportation",
    cadence: "monthly",
    amountCents: 16_000,
    guidanceBucket: "needs",
    colorToken: "rose",
  },
  {
    key: "dining",
    name: "Dining out",
    group: "Wants",
    cadence: "monthly",
    amountCents: 24_000,
    guidanceBucket: "wants",
    colorToken: "cyan",
  },
  {
    key: "coffee",
    name: "Coffee",
    group: "Wants",
    cadence: "monthly",
    amountCents: 6_000,
    guidanceBucket: "wants",
    colorToken: "green",
  },
  {
    key: "streaming",
    name: "Streaming",
    group: "Wants",
    cadence: "monthly",
    amountCents: 4_800,
    guidanceBucket: "wants",
    colorToken: "orange",
  },
  {
    key: "health",
    name: "Health and pharmacy",
    group: "Everyday",
    cadence: "monthly",
    amountCents: 12_500,
    guidanceBucket: "needs",
    colorToken: "indigo",
  },
  {
    key: "phone",
    name: "Phone and internet",
    group: "Utilities",
    cadence: "monthly",
    amountCents: 13_500,
    guidanceBucket: "needs",
    colorToken: "pink",
  },
  {
    key: "pets",
    name: "Pet care",
    group: "Wants",
    cadence: "monthly",
    amountCents: 9_000,
    guidanceBucket: "wants",
    colorToken: "lime",
  },
  {
    key: "supplies",
    name: "Home supplies",
    group: "Home",
    cadence: "monthly",
    amountCents: 7_500,
    guidanceBucket: "needs",
    colorToken: "slate",
  },
  {
    key: "travel",
    name: "Travel fund",
    group: "Wants",
    cadence: "yearly",
    amountCents: 240_000,
    guidanceBucket: "wants",
    colorToken: "blue",
  },
  {
    key: "emergency",
    name: "Emergency fund",
    group: "Investing",
    cadence: "monthly",
    amountCents: 50_000,
    guidanceBucket: "saving",
    colorToken: "teal",
  },
  {
    key: "brokerage",
    name: "Brokerage transfer",
    group: "Investing",
    cadence: "monthly",
    amountCents: 40_000,
    guidanceBucket: "saving",
    colorToken: "violet",
  },
];

const PRIMARY_BENEFITS: BenefitSeed[] = [
  {
    key: "t401k",
    type: "traditional401k",
    label: "Traditional 401(k)",
    amountKind: "percent",
    amountValue: 100_000,
    discountRatePpm: null,
    customTaxTreatment: null,
  },
  {
    key: "match",
    type: "employer401kMatch",
    label: "Employer 401(k) match",
    amountKind: "percent",
    amountValue: 40_000,
    discountRatePpm: null,
    customTaxTreatment: null,
  },
  {
    key: "roth",
    type: "roth401k",
    label: "Roth 401(k)",
    amountKind: "percent",
    amountValue: 20_000,
    discountRatePpm: null,
    customTaxTreatment: null,
  },
  {
    key: "hsa",
    type: "hsa",
    label: "HSA contribution",
    amountKind: "fixedAnnual",
    amountValue: 300_000,
    discountRatePpm: null,
    customTaxTreatment: null,
  },
  {
    key: "employer-hsa",
    type: "employerHsa",
    label: "Employer HSA seed",
    amountKind: "fixedAnnual",
    amountValue: 100_000,
    discountRatePpm: null,
    customTaxTreatment: null,
  },
  {
    key: "espp",
    type: "espp",
    label: "Employee stock purchase",
    amountKind: "percent",
    amountValue: 50_000,
    discountRatePpm: 150_000,
    customTaxTreatment: null,
  },
  {
    key: "fsa",
    type: "healthFsa",
    label: "Health FSA",
    amountKind: "fixedAnnual",
    amountValue: 90_000,
    discountRatePpm: null,
    customTaxTreatment: null,
  },
  {
    key: "premium",
    type: "section125Premium",
    label: "Medical premium",
    amountKind: "fixedMonthly",
    amountValue: 22_000,
    discountRatePpm: null,
    customTaxTreatment: null,
  },
  {
    key: "commuter",
    type: "commuter",
    label: "Commuter transit",
    amountKind: "fixedMonthly",
    amountValue: 12_000,
    discountRatePpm: null,
    customTaxTreatment: null,
  },
  {
    key: "life",
    type: "lifeDisabilityInsurance",
    label: "Life and disability",
    amountKind: "fixedMonthly",
    amountValue: 3_500,
    discountRatePpm: null,
    customTaxTreatment: null,
  },
  {
    key: "stipend",
    type: "custom",
    label: "Wellness stipend",
    amountKind: "fixedMonthly",
    amountValue: 5_000,
    discountRatePpm: null,
    customTaxTreatment: {
      reducesFederalTaxable: false,
      reducesFicaTaxable: false,
      reducesStateTaxable: false,
      reducesTakeHome: false,
      countsAsSavings: false,
      employerSide: true,
    },
  },
];

// Titles are cycled deterministically so every run produces identical rows.
const TITLES: Record<string, string[]> = {
  rent: ["Monthly rent"],
  groceries: [
    "Corner market",
    "Weekly grocery run",
    "Produce stand",
    "Bulk pantry order",
  ],
  utilities: ["Electricity", "Water and refuse"],
  car: ["Auto loan payment"],
  fuel: ["Fuel fill-up", "Transit pass top-up"],
  dining: ["Lunch out", "Dinner with friends", "Takeout", "Brunch"],
  coffee: ["Morning coffee", "Espresso stop", "Beans for home"],
  streaming: ["Streaming video", "Music subscription", "Cloud storage"],
  health: ["Pharmacy refill", "Clinic copay", "Vitamins"],
  phone: ["Mobile plan", "Home internet"],
  pets: ["Pet food", "Vet visit", "Grooming"],
  supplies: ["Cleaning supplies", "Light bulbs", "Kitchen basics", "Hardware"],
  travel: ["Flight deposit"],
  emergency: ["Emergency fund transfer"],
  brokerage: ["Brokerage transfer"],
};

// Amounts are chosen so `Dining out` finishes the month over its allocation
// (the attention state Home and Budget render) and `Coffee` finishes inside the
// 10% near-limit band that the Budget attention panel also surfaces.
const JULY_PLAN: { categoryKey: string; days: number[]; amounts: number[] }[] =
  [
    { categoryKey: "rent", days: [1], amounts: [210_000] },
    {
      categoryKey: "groceries",
      days: [2, 4, 7, 9, 12, 15, 18, 21, 23, 24],
      amounts: [
        7_240, 5_180, 6_930, 4_410, 8_120, 5_760, 6_340, 7_010, 4_880, 5_530,
      ],
    },
    { categoryKey: "utilities", days: [3, 19], amounts: [9_240, 8_610] },
    { categoryKey: "car", days: [5], amounts: [41_000] },
    {
      categoryKey: "fuel",
      days: [2, 8, 13, 17, 22],
      amounts: [3_150, 3_620, 2_980, 3_410, 3_240],
    },
    {
      categoryKey: "dining",
      days: [1, 3, 5, 6, 9, 11, 14, 16, 18, 20, 22, 24],
      amounts: [
        2_480, 3_120, 1_950, 4_260, 2_310, 3_540, 1_880, 2_760, 3_090, 2_140,
        1_720, 2_850,
      ],
    },
    {
      categoryKey: "coffee",
      days: [1, 2, 3, 6, 7, 8, 10, 13, 14, 16, 20, 23],
      amounts: [485, 520, 460, 575, 495, 510, 440, 530, 475, 505, 465, 490],
    },
    {
      categoryKey: "streaming",
      days: [4, 11, 19],
      amounts: [1_599, 1_499, 1_099],
    },
    {
      categoryKey: "health",
      days: [6, 15, 21],
      amounts: [4_250, 3_500, 2_180],
    },
    { categoryKey: "phone", days: [8, 12], amounts: [6_500, 7_000] },
    { categoryKey: "pets", days: [7, 16, 22], amounts: [3_400, 4_150, 1_950] },
    {
      categoryKey: "supplies",
      days: [3, 10, 17, 23],
      amounts: [1_820, 2_340, 1_460, 2_010],
    },
    { categoryKey: "travel", days: [9], amounts: [6_000] },
    { categoryKey: "emergency", days: [1], amounts: [50_000] },
    { categoryKey: "brokerage", days: [2], amounts: [40_000] },
  ];

// Earlier months keep the year-to-date and full-year periods, the Plan hub
// projection, and Compare populated rather than showing a single-month spike.
const EARLIER_MONTH_PLAN: { categoryKey: string; amounts: number[] }[] = [
  { categoryKey: "rent", amounts: [210_000] },
  { categoryKey: "groceries", amounts: [16_400, 15_900, 14_800, 15_200] },
  { categoryKey: "utilities", amounts: [9_100, 8_900] },
  { categoryKey: "car", amounts: [41_000] },
  { categoryKey: "fuel", amounts: [7_800, 7_400] },
  { categoryKey: "dining", amounts: [8_600, 7_900, 6_400] },
  { categoryKey: "coffee", amounts: [2_600, 2_400] },
  { categoryKey: "phone", amounts: [13_500] },
  { categoryKey: "emergency", amounts: [50_000] },
  { categoryKey: "brokerage", amounts: [40_000] },
];

function buildPrimaryTransactions(): TransactionSeed[] {
  const rows: TransactionSeed[] = [];
  const titleFor = (categoryKey: string, index: number): string => {
    const options = TITLES[categoryKey] ?? ["Expense"];
    return options[index % options.length];
  };

  for (const entry of JULY_PLAN) {
    entry.days.forEach((dayOfMonth, index) => {
      rows.push({
        categoryKey: entry.categoryKey,
        title: titleFor(entry.categoryKey, index),
        amountCents: entry.amounts[index],
        date: day(PRIMARY_YEAR, PRIMARY_MONTH, dayOfMonth),
        note: index === 0 ? "Seeded density fixture" : null,
      });
    });
  }

  for (let month = 1; month < PRIMARY_MONTH; month += 1) {
    for (const entry of EARLIER_MONTH_PLAN) {
      entry.amounts.forEach((amountCents, index) => {
        rows.push({
          categoryKey: entry.categoryKey,
          title: titleFor(entry.categoryKey, index),
          amountCents,
          date: day(PRIMARY_YEAR, month, 2 + index * 5),
          note: null,
        });
      });
    }
  }
  return rows;
}

function buildComparisonTransactions(): TransactionSeed[] {
  const rows: TransactionSeed[] = [];
  for (let month = 1; month <= 12; month += 1) {
    for (const entry of EARLIER_MONTH_PLAN) {
      entry.amounts.forEach((amountCents, index) => {
        rows.push({
          categoryKey: entry.categoryKey,
          title:
            TITLES[entry.categoryKey][index % TITLES[entry.categoryKey].length],
          amountCents: Math.round(amountCents * 0.94),
          date: day(COMPARISON_YEAR, month, 3 + index * 5),
          note: null,
        });
      });
    }
  }
  return rows;
}

function assertLocalDatabase(databaseUrl: string): void {
  let host: string;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  const local = ["localhost", "127.0.0.1", "::1", "[::1]", ""];
  if (!local.includes(host)) {
    throw new Error(
      `Refusing to seed the density fixture against host "${host}". This script only runs against a localhost database.`,
    );
  }
}

interface PlanSeed {
  year: number;
  grossSalaryCents: number;
  startingSavingsCents: number;
  categories: CategorySeed[];
  benefits: BenefitSeed[];
  transactions: TransactionSeed[];
}

async function writePlan(
  sql: postgres.Sql,
  userId: string,
  plan: PlanSeed,
): Promise<number> {
  const planId = stableUuid(`plan/${plan.year}`);
  await sql`
    INSERT INTO plans (
      id, user_id, year, state_code, filing_status,
      gross_salary_cents, additional_income_cents,
      spouse_wage_income_cents, other_ordinary_income_cents,
      hsa_coverage, primary_hsa_eligible, spouse_hsa_eligible,
      primary_hsa_catch_up_eligible, spouse_hsa_catch_up_eligible,
      primary_hsa_family_allocation_ppm, spouse_hsa_family_allocation_ppm,
      starting_savings_cents
    ) VALUES (
      ${planId}, ${userId}, ${plan.year}, 'CA', 'single',
      ${plan.grossSalaryCents}, 0, 0, 0,
      'self', true, false, false, false, 1000000, 0,
      ${plan.startingSavingsCents}
    )
  `;

  const categoryIds = new Map<string, string>();
  const categoryRows = plan.categories.map((category, index) => {
    const id = stableUuid(`category/${plan.year}/${category.key}`);
    categoryIds.set(category.key, id);
    return {
      id,
      plan_id: planId,
      name: category.name,
      category_group: category.group,
      cadence: category.cadence,
      amount_cents: category.amountCents,
      sort_order: index,
      guidance_bucket: category.guidanceBucket,
      color_token: category.colorToken,
      archived: false,
    };
  });
  await sql`INSERT INTO expenses ${sql(
    categoryRows,
    "id",
    "plan_id",
    "name",
    "category_group",
    "cadence",
    "amount_cents",
    "sort_order",
    "guidance_bucket",
    "color_token",
    "archived",
  )}`;

  const benefitRows = plan.benefits.map((benefit, index) => ({
    id: stableUuid(`benefit/${plan.year}/${benefit.key}`),
    plan_id: planId,
    type: benefit.type,
    label: benefit.label,
    amount_kind: benefit.amountKind,
    amount_value: benefit.amountValue,
    discount_rate_ppm: benefit.discountRatePpm,
    custom_tax_treatment: benefit.customTaxTreatment
      ? JSON.stringify(benefit.customTaxTreatment)
      : null,
    sort_order: index,
    owner: "primary",
  }));
  await sql`INSERT INTO benefits ${sql(
    benefitRows,
    "id",
    "plan_id",
    "type",
    "label",
    "amount_kind",
    "amount_value",
    "discount_rate_ppm",
    "custom_tax_treatment",
    "sort_order",
    "owner",
  )}`;

  const transactionRows = plan.transactions.map((transaction, index) => {
    const categoryId = categoryIds.get(transaction.categoryKey);
    if (!categoryId) {
      throw new Error(
        `Transaction references unseeded category "${transaction.categoryKey}"`,
      );
    }
    return {
      id: stableUuid(`transaction/${plan.year}/${index}`),
      plan_id: planId,
      category_id: categoryId,
      amount_cents: transaction.amountCents,
      title: transaction.title,
      note: transaction.note,
      transaction_date: transaction.date,
    };
  });
  for (let offset = 0; offset < transactionRows.length; offset += 200) {
    const chunk = transactionRows.slice(offset, offset + 200);
    await sql`INSERT INTO transactions ${sql(
      chunk,
      "id",
      "plan_id",
      "category_id",
      "amount_cents",
      "title",
      "note",
      "transaction_date",
    )}`;
  }
  return transactionRows.length;
}

export async function seedDensityFixture(databaseUrl: string): Promise<{
  email: string;
  password: string;
  categories: number;
  periodTransactions: number;
  totalTransactions: number;
}> {
  assertLocalDatabase(databaseUrl);
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
  try {
    const primaryTransactions = buildPrimaryTransactions();
    const periodTransactions = primaryTransactions.filter((transaction) =>
      transaction.date.startsWith(
        `${PRIMARY_YEAR}-${String(PRIMARY_MONTH).padStart(2, "0")}`,
      ),
    ).length;
    if (PRIMARY_CATEGORIES.length < 12) {
      throw new Error("Fixture must define at least 12 budget categories");
    }
    if (periodTransactions < 60) {
      throw new Error(
        `Fixture must place at least 60 transactions in the selected period; built ${periodTransactions}`,
      );
    }

    const userId = stableUuid("user");
    const passwordHash = await hashPassword(FIXTURE_PASSWORD);
    const onboardingHash = await hashPassword(ONBOARDING_PASSWORD);
    await sql.begin(async (transaction) => {
      // Deleting the fixture users cascades to their plans, categories,
      // transactions, and benefits, which is what makes re-seeding idempotent.
      await transaction`
        DELETE FROM users WHERE email IN (${FIXTURE_EMAIL}, ${ONBOARDING_EMAIL})
      `;
      await transaction`
        INSERT INTO users (id, email, password_hash)
        VALUES (${userId}, ${FIXTURE_EMAIL}, ${passwordHash})
      `;
      await transaction`
        INSERT INTO users (id, email, password_hash)
        VALUES (${stableUuid("onboarding-user")}, ${ONBOARDING_EMAIL}, ${onboardingHash})
      `;
    });
    // The harness signs in twice per viewport, so consecutive runs would
    // otherwise trip the per-identity (10) and per-address (30) login limits
    // and fail for a reason that has nothing to do with density. Clearing the
    // login buckets is safe here only because assertLocalDatabase has already
    // proven this is a localhost development database; the limiter itself is
    // untouched and still enforces exactly as before.
    await sql`
      DELETE FROM auth_rate_limits WHERE scope IN ('login:ip', 'login:identity')
    `;

    const total =
      (await writePlan(sql, userId, {
        year: PRIMARY_YEAR,
        grossSalaryCents: 14_500_000,
        startingSavingsCents: 2_850_000,
        categories: PRIMARY_CATEGORIES,
        benefits: PRIMARY_BENEFITS,
        transactions: primaryTransactions,
      })) +
      (await writePlan(sql, userId, {
        year: COMPARISON_YEAR,
        grossSalaryCents: 13_200_000,
        startingSavingsCents: 1_600_000,
        categories: PRIMARY_CATEGORIES.map((category) => ({
          ...category,
          amountCents: Math.round(category.amountCents * 0.92),
        })),
        benefits: PRIMARY_BENEFITS,
        transactions: buildComparisonTransactions(),
      }));

    return {
      email: FIXTURE_EMAIL,
      password: FIXTURE_PASSWORD,
      categories: PRIMARY_CATEGORIES.length,
      periodTransactions,
      totalTransactions: total,
    };
  } finally {
    await sql.end();
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const result = await seedDensityFixture(databaseUrl);
  console.log(
    [
      "Density fixture seeded (idempotent).",
      `  email:                ${result.email}`,
      `  password:             ${result.password}`,
      `  budget categories:    ${result.categories}`,
      `  period transactions:  ${result.periodTransactions} (${PRIMARY_YEAR}-${String(PRIMARY_MONTH).padStart(2, "0")}-01..${LAST_OBSERVED_DAY})`,
      `  total transactions:   ${result.totalTransactions}`,
      `  plan years:           ${COMPARISON_YEAR}, ${PRIMARY_YEAR}`,
    ].join("\n"),
  );
}

if (
  process.argv[1] &&
  /scripts[/\\]seed-density-fixture\.ts$/.test(process.argv[1])
) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Seeding failed");
    process.exitCode = 1;
  });
}

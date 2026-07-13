import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { STATE_CODE_BY_NAME } from "../src/domain/tax/jurisdictions.ts";

const SOURCE_URL =
  "https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/";
const OUTPUT = resolve("src/domain/tax/tables/2026.states.json");

function decode(value) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#8211;|&ndash;/g, "-")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMoney(value) {
  const match = value.match(/\$([\d,]+)/);
  return match ? Number(match[1].replaceAll(",", "")) * 100 : 0;
}

function parseDeduction(value) {
  if (/credit|n\.a\.|none/i.test(value)) return 0;
  return parseMoney(value);
}

function parseRate(value) {
  const match = value.match(/([\d.]+)%/);
  return match ? Math.round(Number(match[1]) * 10_000) : 0;
}

function cells(row) {
  return [...row.matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/g)].map(
    (match) => decode(match[1]),
  );
}

async function loadHtml() {
  const local = process.argv[2];
  if (local) return readFile(local, "utf8");
  const response = await fetch(SOURCE_URL);
  if (!response.ok)
    throw new Error(`Tax Foundation returned ${response.status}`);
  return response.text();
}

const html = await loadHtml();
const table = html.match(
  /<table[^>]+id="tablepress-1276"[^>]*>([\s\S]*?)<\/table>/,
);
if (!table) throw new Error("Could not find the 2026 state rate table");

const entries = {};
let current;
for (const match of table[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
  const values = cells(match[1]);
  if (values.length < 12 || values[0] === "State") continue;

  const isContinuation = values[0].startsWith("-");
  if (!isContinuation) {
    const name = values[0].replace(/\s+\([^)]*\)$/, "");
    const code = STATE_CODE_BY_NAME[name];
    if (!code) throw new Error(`Unknown state name: ${name}`);
    current = {
      code,
      name,
      approximation:
        "Planning estimate using published brackets, standard deduction, and dollar personal exemption only; credits, recapture, phase-outs, local tax, and special deductions are excluded.",
      citations: ["TF_STATE_2026"],
      filingStatuses: {
        single: {
          standardDeductionCents: parseDeduction(values[7]),
          personalExemptionCents: parseDeduction(values[9]),
          citations: ["TF_STATE_2026"],
          brackets: [],
        },
        mfj: {
          standardDeductionCents: parseDeduction(values[8]),
          personalExemptionCents: parseDeduction(values[10]),
          citations: ["TF_STATE_2026"],
          brackets: [],
        },
      },
    };
    entries[code] = current;
  }

  if (!current) throw new Error("Continuation row appeared before a state");
  const singleRate = parseRate(values[1]);
  const jointRate = parseRate(values[4]);
  if (values[1].includes("%")) {
    current.filingStatuses.single.brackets.push({
      thresholdCents: parseMoney(values[3]),
      ratePpm: singleRate,
      citations: ["TF_STATE_2026"],
    });
  }
  if (values[4].includes("%")) {
    current.filingStatuses.mfj.brackets.push({
      thresholdCents: parseMoney(values[6]),
      ratePpm: jointRate,
      citations: ["TF_STATE_2026"],
    });
  }
}

for (const entry of Object.values(entries)) {
  entry.filingStatuses.hoh = structuredClone(entry.filingStatuses.single);
}

const benefitOverrides = {
  CA: {
    values: { hsa: false, employerHsa: false },
    citations: ["CA_FTB_HSA_2025"],
  },
  NJ: {
    values: { hsa: false, employerHsa: false },
    citations: ["NJ_1040_2025"],
  },
  PA: {
    values: {
      traditional401k: false,
      dependentCareFsa: false,
      commuter: false,
      commuterParking: false,
    },
    citations: [
      "PA_GROSS_COMP_2026",
      "PA_HSA_DEDUCTIONS_2026",
      "PA_HSA_RULING_2006",
    ],
  },
};
for (const [code, override] of Object.entries(benefitOverrides)) {
  entries[code].benefitStateTaxOverrides = override.values;
  entries[code].citations.push(...override.citations);
}

// Washington's published rows are capital-gains-only. This application models
// wage and ordinary income, so its wage-income schedule is intentionally empty.
for (const status of ["single", "mfj", "hoh"]) {
  entries.WA.filingStatuses[status].brackets = [];
}

if (Object.keys(entries).length !== 51) {
  throw new Error(
    `Expected 51 state entries, found ${Object.keys(entries).length}`,
  );
}

const output = {
  year: 2026,
  states: Object.fromEntries(Object.entries(entries).sort()),
};

await mkdir(resolve("src/domain/tax/tables"), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${Object.keys(entries).length} entries to ${OUTPUT}`);

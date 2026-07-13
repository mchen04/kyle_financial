import { GENERATED_TAX_TABLES } from "./table-registry.generated";
import type { TaxTable, TaxTableSelection } from "./types";

const TABLES: Record<number, TaxTable> = GENERATED_TAX_TABLES;

export function selectTaxTable(year: number): TaxTableSelection {
  const exact = TABLES[year];
  if (exact) {
    return {
      table: exact,
      requestedYear: year,
      appliedYear: year,
      isFallback: false,
      usesFutureTable: false,
    };
  }

  const years = Object.keys(TABLES)
    .map(Number)
    .sort((a, b) => a - b);
  const prior = years.filter((candidate) => candidate <= year).at(-1);
  const appliedYear = prior ?? years.at(-1);
  if (appliedYear === undefined)
    throw new Error("No tax tables are registered");
  return {
    table: TABLES[appliedYear],
    requestedYear: year,
    appliedYear,
    isFallback: true,
    usesFutureTable: appliedYear > year,
  };
}

export function availableTaxYears(): number[] {
  return Object.keys(TABLES).map(Number).sort();
}

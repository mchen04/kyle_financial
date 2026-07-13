import { multiplyByRate, sumCents } from "../money";
import type { TaxBracket } from "./types";

export interface BracketTax {
  thresholdCents: number;
  taxableSliceCents: number;
  ratePpm: number;
  taxCents: number;
}

export function calculateProgressiveTax(
  taxableIncomeCents: number,
  brackets: readonly TaxBracket[],
): { totalTaxCents: number; brackets: BracketTax[] } {
  if (taxableIncomeCents <= 0 || brackets.length === 0) {
    return { totalTaxCents: 0, brackets: [] };
  }

  const taxes = brackets.map((bracket, index) => {
    const nextThreshold =
      brackets[index + 1]?.thresholdCents ?? taxableIncomeCents;
    const upper = Math.min(taxableIncomeCents, nextThreshold);
    const taxableSliceCents = Math.max(0, upper - bracket.thresholdCents);
    return {
      thresholdCents: bracket.thresholdCents,
      taxableSliceCents,
      ratePpm: bracket.ratePpm,
      taxCents: multiplyByRate(taxableSliceCents, bracket.ratePpm),
    };
  });

  return {
    totalTaxCents: sumCents(taxes.map((bracket) => bracket.taxCents)),
    brackets: taxes,
  };
}

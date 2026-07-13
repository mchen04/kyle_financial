export const RATE_SCALE = 1_000_000;

export function assertCents(value: number, label = "money"): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer number of cents`);
  }
  return value;
}

export function multiplyByRate(cents: number, ratePpm: number): number {
  assertCents(cents);
  if (!Number.isSafeInteger(ratePpm)) {
    throw new RangeError("rate must be an integer number of millionths");
  }
  const product = BigInt(cents) * BigInt(ratePpm);
  const scale = BigInt(RATE_SCALE);
  const adjustment = product >= 0n ? scale / 2n : -(scale / 2n);
  return Number((product + adjustment) / scale);
}

export function divideAnnualForMonthly(cents: number): number {
  assertCents(cents);
  const value = BigInt(cents);
  const adjustment = value >= 0n ? 6n : -6n;
  return Number((value + adjustment) / 12n);
}

export function sumCents(values: readonly number[]): number {
  return assertCents(
    values.reduce((total, value) => total + assertCents(value), 0),
  );
}

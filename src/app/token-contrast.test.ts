import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WCAG 2.1 contrast, computed from the token registry itself.
 *
 * The category-detail overage rendered `--status-warning-text` (a light-surface
 * amber) on `--surface-inverse` (navy) and measured 1.92:1 against a 3.0:1
 * requirement for 24px/700 text — the most important number on that screen and
 * the least readable thing on it. A browser sweep found it, but a browser sweep
 * is not part of `pnpm verify`, so the pairing is pinned here instead: these are
 * literal token values, so the check fails the moment a role is re-pointed at a
 * colour that cannot be read where the role is used.
 */
const registry = readFileSync(
  resolve(import.meta.dirname, "globals.css"),
  "utf8",
);

function tokenValue(name: string): string {
  const seen = new Set<string>();
  let current = name;
  for (;;) {
    if (seen.has(current))
      throw new Error(`token cycle while resolving ${name} at ${current}`);
    seen.add(current);
    const declaration = new RegExp(
      `^\\s*${current.replace(/[-]/g, "\\-")}\\s*:\\s*([^;]+);`,
      "m",
    ).exec(registry);
    if (!declaration) throw new Error(`no such token: ${current}`);
    const value = declaration[1].trim();
    const reference = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value);
    if (!reference) return value;
    current = reference[1];
  }
}

function channels(hex: string): [number, number, number] {
  const digits = hex.replace("#", "");
  expect(digits, `${hex} is not a 6-digit hex literal`).toMatch(
    /^[0-9a-fA-F]{6}$/,
  );
  return [0, 2, 4].map((index) =>
    Number.parseInt(digits.slice(index, index + 2), 16),
  ) as [number, number, number];
}

function relativeLuminance(hex: string): number {
  const [red, green, blue] = channels(hex).map((channel) => {
    const ratio = channel / 255;
    return ratio <= 0.03928
      ? ratio / 12.92
      : Math.pow((ratio + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("token contrast", () => {
  it("scores known pairs the way WCAG does", () => {
    // Reference values computed independently from the WCAG 2.1 relative
    // luminance definition. No colour is written here: the registry is the only
    // place a colour literal may live, so these read from it (rule 4).
    const white = tokenValue("--color-white");
    const navy = tokenValue("--color-navy-950");
    expect(contrastRatio(white, white)).toBeCloseTo(1, 6);
    expect(contrastRatio(white, navy)).toBeCloseTo(15.696139, 5);
    // Symmetric in its arguments, as the definition is.
    expect(contrastRatio(navy, white)).toBeCloseTo(
      contrastRatio(white, navy),
      6,
    );
  });

  // Every pairing an inverse (navy) surface actually paints. The overage on
  // Category detail is 24px/700 — WCAG "large text", 3.0:1 — and the rest are
  // body-sized, so they are held to 4.5:1.
  const inverseSurface = "--text-primary";
  const pairings: ReadonlyArray<[string, string, number]> = [
    ["--status-warning-text-inverse", inverseSurface, 3],
    ["--text-inverse", inverseSurface, 4.5],
    ["--text-inverse-soft", inverseSurface, 4.5],
    ["--text-inverse-muted", inverseSurface, 4.5],
  ];

  for (const [role, surface, required] of pairings) {
    it(`${role} clears ${required}:1 on ${surface}`, () => {
      const measured = contrastRatio(tokenValue(role), tokenValue(surface));
      expect(
        measured,
        `${role} (${tokenValue(role)}) on ${surface} (${tokenValue(surface)}) measured ${measured.toFixed(3)}:1`,
      ).toBeGreaterThanOrEqual(required);
    });
  }

  it("holds the light-surface warning role to light surfaces", () => {
    // The exact substitution that produced the defect. If someone ever points
    // the inverse role back at this one, the assertion above goes red; this
    // records why, with the number.
    const measured = contrastRatio(
      tokenValue("--status-warning-text"),
      tokenValue(inverseSurface),
    );
    expect(measured).toBeLessThan(3);
    expect(
      contrastRatio(tokenValue("--status-warning-text"), tokenValue("--paper")),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

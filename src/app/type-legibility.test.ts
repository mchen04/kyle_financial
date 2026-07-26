import { readdirSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * HIG-T3: 11pt is the smallest size iOS treats as legible, and the mission
 * forbids buying density below it.
 *
 * Two 9.17px and 10.83px runs shipped anyway — the Plan-details "monthly
 * estimate" qualifier and Fast Log's "Optional" — and neither appears anywhere
 * in the source as a number, which is exactly why a grep never found them. Both
 * were the user agent's relative `smaller` keyword on `<small>` *compounding*
 * inside a block that was already at `--text-sm` (13px) or `--text-xs` (11px):
 * 13 x 0.8333 = 10.83, 11 x 0.8333 = 9.17. A stylesheet author reading either
 * rule sees only "small", and the size that comes out depends on where the
 * element happens to be mounted.
 *
 * The browser harness measures the rendered result of this
 * (`pnpm ui:density:measure` fails any surface with a computed font-size under
 * 11px, and `--fail-demo tiny` proves that gate goes red). That harness is not
 * part of `pnpm verify`, so the two things which make the rendered result true
 * are pinned here: the floor rule itself, and the absence of any stylesheet
 * declaration that sets type below the floor directly.
 */
const stylesheetRoot = resolve(import.meta.dirname, "..");
const globals = readFileSync(
  resolve(import.meta.dirname, "globals.css"),
  "utf8",
);

function stylesheets(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...stylesheets(path));
    else if (extname(entry.name) === ".css") found.push(path);
  }
  return found.sort();
}

/** Resolve a `--text-*` token to px, following one level of `var()` aliasing. */
function tokenPx(name: string): number {
  const declaration = new RegExp(`^\\s*${name}\\s*:\\s*([^;]+);`, "m").exec(
    globals,
  );
  if (!declaration) throw new Error(`no such token: ${name}`);
  const value = declaration[1].trim();
  const rem = /^([\d.]+)rem$/.exec(value);
  if (rem) return Number(rem[1]) * 16;
  const px = /^([\d.]+)px$/.exec(value);
  if (px) return Number(px[1]);
  throw new Error(`token ${name} is not an absolute length: ${value}`);
}

const FLOOR_PX = 11;

describe("type legibility floor", () => {
  it("puts the smallest size token exactly at the 11px floor", () => {
    // Everything below depends on --text-xs being the floor; if it is ever
    // lowered, the floor moves with it silently, so it is asserted directly.
    expect(tokenPx("--text-xs")).toBe(FLOOR_PX);
    expect(tokenPx("--text-sm")).toBeGreaterThan(FLOOR_PX);
  });

  it("floors every user-agent relative type scale at --text-xs", () => {
    // `small`, `sub` and `sup` are the three elements the UA sizes with the
    // relative `smaller` keyword. Each must be re-declared against the floor,
    // or nesting silently reintroduces the defect.
    for (const selector of ["small", "sub,\nsup"]) {
      const rule = new RegExp(
        `^${selector} \\{\\n  font-size: max\\(\\s*var\\(--text-scale-smaller\\),\\s*var\\(--text-xs\\)\\s*\\);\\n\\}`,
        "m",
      );
      expect(
        rule.test(globals),
        `${selector.replace(/\n/g, " ")} must floor its relative scale at var(--text-xs)`,
      ).toBe(true);
    }
  });

  it("never sets type below the floor in any stylesheet", () => {
    const offenders: string[] = [];
    for (const file of stylesheets(stylesheetRoot)) {
      const source = readFileSync(file, "utf8");
      for (const [, property, value] of source.matchAll(
        /(font-size|font)\s*:\s*([^;{}]+);/g,
      )) {
        // Token references: resolve each and compare against the floor.
        for (const [, token] of value.matchAll(/var\((--text-[\w-]+)\)/g)) {
          if (token === "--text-scale-smaller") continue; // relative, floored above
          if (tokenPx(token) < FLOOR_PX) {
            offenders.push(`${file}: ${property}: ${value.trim()} (${token})`);
          }
        }
        // Absolute literals: the token audit already bans these outright, so
        // this catches a raw size only if that audit is ever loosened.
        for (const [, literal, unit] of value.matchAll(
          /(?<![\w-])([\d.]+)(px|rem)(?![\w-])/g,
        )) {
          const px = unit === "rem" ? Number(literal) * 16 : Number(literal);
          if (px < FLOOR_PX) {
            offenders.push(`${file}: ${property}: ${value.trim()}`);
          }
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

/**
 * DF1. A text input has no wrapping to fall back on: when its value is wider
 * than its content box the browser clips, and the default `text-overflow: clip`
 * cuts through whatever glyph it lands on. "Health and pharmacy" rendered
 * "Health and pharma" on the Plan-details ledger with nothing saying it had been
 * cut, and the same defect class had already been fixed once on Benefits and
 * missed here — which is what makes a per-field fix the wrong shape.
 *
 * Sizing a field to its content is still the real fix wherever it is possible.
 * This pins the floor underneath every field, so the next input nobody thought
 * to check cannot reintroduce it.
 */
describe("text input truncation floor", () => {
  it("gives every text input an ellipsis rather than a cut glyph", () => {
    const rule =
      /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="range"\]\),\nselect \{\n  text-overflow: ellipsis;\n\}/;
    expect(
      rule.test(globals),
      "globals.css must set text-overflow: ellipsis on every non-toggle input",
    ).toBe(true);
  });
});

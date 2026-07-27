#!/usr/bin/env node
// Row alignment harness — "is the chevron on the same line as its label?"
//
// A reader reported: "for all screens make sure text and like arrows like `>`
// text are centered at same area or make it same height or smth". That is a
// geometric claim, and this file turns it into a number so it can be graded
// instead of eyeballed.
//
// ---------------------------------------------------------------------------
// WHAT IS MEASURED
// ---------------------------------------------------------------------------
// Every recurring "label + chevron affordance" row in the product is located by
// its CSS-module class, and for each instance the harness reads, out of a live
// laid-out page:
//
//   centerDeltaPx    |icon vertical centre - text vertical centre|. PRIMARY.
//   rowHeightPx      the row's own border box height
//   iconBoxPx        the rendered width x height of the <svg>
//   textBoxPx        the union of the row's text rects, from Range geometry
//                    (font ascent/descent), not from the containing block
//   baselineDeltaPx  iconBottom - the first text line's alphabetic baseline.
//                    ~0 means the glyph is sitting ON the baseline, which is
//                    the signature of inline flow with no flex/grid at all.
//   mechanism        which of the three vertical-alignment mechanisms this
//                    codebase actually uses is in force here, read out of
//                    computed style: grid + align-items, (inline-)flex +
//                    align-items, or inline-flow baseline alignment.
//   sampleCount      how many instances were found. MANDATORY, see below.
//
// This harness does not fix anything and must never be made to. Its whole value
// is that its output is an independent statement about the product.
//
// ---------------------------------------------------------------------------
// LIVENESS: "nothing measured" IS NOT "nothing wrong"
// ---------------------------------------------------------------------------
// A previous harness on this repo reported a clean sweep while its selector
// matched no elements at all. So every cell in the output carries the number of
// instances it was computed from, and:
//
//   * a pattern that rendered ZERO instances on a surface that declares it is a
//     FAIL, not a pass;
//   * a pattern that is never MEASURED anywhere in the whole run - every
//     instance hidden, on every engine, at every viewport - is a FAIL, because
//     a check that never executed cannot be evidence;
//   * a pattern whose chevron is legitimately `display: none` at this width is
//     `N/A-HIDDEN`. It is counted separately and inflates neither the pass rate
//     nor the fail rate. A hidden chevron is not a misalignment.
//
// ---------------------------------------------------------------------------
// TWO ENGINES, AND WHY
// ---------------------------------------------------------------------------
// The product ships as an iPhone-Safari PWA. A prior mission on this repo
// measured nine waves of touch-target sizes in headless Chromium, scored "0
// targets under 44px", and shipped 26 selects that WebKit rendered at 21-23px:
// Chromium honoured the author's `min-height`, WebKit's styled-menulist path
// did not. Chromium's numbers about this product are not evidence about this
// product. So both engines run the same catalogue, every row carries `engine`,
// and a Chromium pass can never stand in for a WebKit one - the gate is over
// the union of rows, so a WebKit failure fails the run whatever Chromium said.
//
// `--mode capture` records without gating; `--mode gate` (default) exits
// non-zero when the frozen bar is violated.
import { execFile, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// The density harness's page probe already records in-flight fetches, which is
// what `settle` waits on. Reused rather than duplicated.
const probeScript = resolve(repositoryRoot, "scripts/density-probe.js");

/**
 * Load `.env.local` into `process.env` so the harness runs in a clean shell.
 * Variables already present in the environment win, so an explicit
 * `DATABASE_URL=… pnpm ui:alignment:measure` is not silently overridden.
 */
function loadLocalEnvironment() {
  let contents;
  try {
    contents = readFileSync(resolve(repositoryRoot, ".env.local"), "utf8");
  } catch {
    return;
  }
  for (const line of contents.split("\n")) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(
      line,
    );
    if (!match) continue;
    const [, name, rawValue] = match;
    if (name in process.env) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    process.env[name] = value;
  }
}

loadLocalEnvironment();

// ---------------------------------------------------------------------------
// The frozen bar: 0.5 CSS px.
//
// Not a round number picked in advance — it is read off the measured
// distribution, which turned out to be sharply bimodal with nothing at all in
// between:
//
//   every row that centres its glyph with grid/flex + align-items:center
//     chromium  0.00px, worst 0.25px    (n = 192 graded instances)
//     webkit    0.00px, worst 0.38px    (n = 192 graded instances)
//   every row that leaves its glyph in inline flow on the text baseline
//     chromium  1.50px (.monthStepper) and 4.00px (.backHeader > button)
//     webkit    1.98px (.monthStepper) and 3.95px (.backHeader > button)
//
// So the bar has to sit somewhere in (0.38, 1.50), and 0.5 is where the physics
// puts it: 0.5 CSS px is one whole device pixel at the deviceScaleFactor 2 this
// harness uses for the desktop viewport, and one and a half at the factor 3 it
// uses for the phones. An offset below that cannot be painted differently from
// zero, so calling it a misalignment would be claiming something no reader can
// see. The measured sub-pixel residue on a correct row (0.25 / 0.38px, from
// rounding an odd-height text block inside an even-height row) falls under it,
// and the smallest genuine defect in the product is 3x above it. Nothing
// observed lies between, so the bar is not sitting in a data-dense region and
// will not flip on noise.
//
// It is deliberately not settable from the command line. A gate you can widen
// from its own invocation is not a gate.
// ---------------------------------------------------------------------------
const BAR_CENTER_DELTA_PX = 0.5;

const DEFAULT_VIEWPORTS = [
  // Phone, the shipping form factor. Below every one of the app's max-width
  // breakpoints (1000/900/720/600/380/360/350).
  { width: 390, height: 844, scale: 3, primary: true },
  // Below --viewport-narrow (360px), where the compact row layouts apply.
  { width: 360, height: 740, scale: 3, primary: false },
  // Above every max-width breakpoint: the only widths at which the row
  // chevrons the compact stylesheets hide are actually rendered, so this is the
  // only place several of these patterns can be measured at all.
  { width: 1280, height: 900, scale: 2, primary: false },
];

const FIXTURE_EMAIL = "density-fixture@localhost.test";
const FIXTURE_PASSWORD = "density-fixture-4Kx9-local-only";
const ONBOARDING_EMAIL = "density-onboarding@localhost.test";
const ONBOARDING_PASSWORD = "density-onboarding-4Kx9-local-only";

const js = (value) => JSON.stringify(value);

/** Sentinel navigation step: reload the document instead of clicking. */
const RELOAD_STEP = "@reload";

/** Click the single visible, enabled button whose trimmed text equals `label`. */
function clickExact(label) {
  return `(() => {
    const wanted = ${js(label)};
    const matches = [...document.querySelectorAll('button')].filter((node) =>
      node.textContent.replace(/\\s+/g, ' ').trim() === wanted &&
      node.getBoundingClientRect().width > 0 && !node.disabled);
    if (matches.length === 0) throw new Error('no visible enabled button with text: ' + wanted);
    matches[0].click();
    return matches.length;
  })()`;
}

/** Click the first visible, enabled button whose text contains `fragment`. */
function clickContains(fragment) {
  return `(() => {
    const wanted = ${js(fragment)};
    const matches = [...document.querySelectorAll('button')].filter((node) =>
      node.textContent.replace(/\\s+/g, ' ').trim().includes(wanted) &&
      node.getBoundingClientRect().width > 0 && !node.disabled);
    if (matches.length === 0) throw new Error('no visible enabled button containing: ' + wanted);
    matches[0].click();
    return matches.length;
  })()`;
}

// ---------------------------------------------------------------------------
// Pattern catalogue.
//
// A pattern is named by its CSS-module LOCAL name (`navRow`), never by a
// hardcoded built class name, because the two bundlers this project can be
// built with hash it differently and in opposite orders:
//
//   Turbopack (Next 16 default)  cockpit-shared-module__aCgKia__navRow
//   webpack (getCssModuleLocalIdent)  daily-cockpit_navRow__aB3cD
//
// So the page-side matcher looks for the local name as a whole word inside a
// class token, delimited by anything that is not a letter or digit. That is
// what stops `categoryRow` from also matching the `categoryRows` container —
// the `s` is alphanumeric, so the boundary fails — and it holds under either
// naming scheme without a product edit. Verifying no product edit is needed is
// the point: a harness that requires a `data-` hook in the component is
// measuring a page that only exists because it is being measured.
//
// `descend` selects the real row inside the matched element, for the two
// patterns whose class sits on a container.
//
// `textless: true` marks a control that carries no label at all — an icon-only
// tap target. There is no text to be level with, so `centerDeltaPx` is null by
// construction and what is graded instead is whether the glyph is centred in
// its own box (`iconRowCenterDeltaPx`). Grading those two quantities against
// one bar is deliberate: they are the same quantity in the same units, and
// dropping the icon-only controls from the gate would leave a hole exactly
// where a lazy harness would want one.
// ---------------------------------------------------------------------------
const PATTERNS = [
  {
    id: "navRow",
    label: ".navRow",
    locals: ["navRow"],
    // The row may carry a leading category/calendar glyph as well; the measured
    // affordance is the trailing chevron.
    iconSelector: ":scope > svg:last-child",
    source:
      "src/components/cockpit-rows.tsx:23-42, src/components/cockpit-plan-surfaces.tsx:428-436",
    note: "grid + align-items:center, chevron in a fixed --icon-sm track",
  },
  {
    id: "categoryRow",
    label: ".categoryRow",
    locals: ["categoryRow"],
    iconSelector: ":scope > svg",
    source: "src/components/cockpit-rows.tsx:79-106 (chevron :97)",
    note: "chevron is display:none at <=720px (daily-cockpit-responsive.module.css:234-237)",
  },
  {
    id: "transactionRow",
    label: ".transactionRow",
    locals: ["transactionRow"],
    iconSelector: ":scope > svg",
    source: "src/components/cockpit-rows.tsx:142-177 (chevron :175)",
    note: "chevron is display:none at <=720px (daily-cockpit-responsive.module.css:234-237)",
  },
  {
    id: "manageRow",
    label: ".manageRow",
    locals: ["manageRow"],
    // The disclosure glyph is wrapped in a presentational <span> so the bucket
    // chip and the chevron read as two separate boxes. Both shapes are named
    // explicitly rather than using a bare ":scope svg": a descendant selector
    // would silently adopt any future nested glyph, and a selector loosened
    // until it matches something has stopped grading.
    iconSelector: ":scope > svg, :scope > span > svg",
    source:
      "src/components/cockpit-category-settings.tsx:132-152 (ChevronDown in a <span> wrapper)",
    note: "grid + align-items:center; chevron nested one level in a decorative span",
  },
  {
    id: "backHeaderButton",
    label: ".backHeader > button",
    locals: ["backHeader"],
    descend: ":scope > button",
    iconSelector: ":scope > svg",
    source: "src/components/cockpit-back-page.tsx:33-38",
    note: "daily-cockpit.module.css:70-78 and :714-721 declare no display and no align-items",
  },
  {
    id: "monthStepper",
    label: ".monthStepper button",
    locals: ["monthStepper"],
    descend: ":scope > button",
    iconSelector: ":scope > svg",
    textless: true,
    source: "src/components/cockpit-period-control.tsx:142-148, 174-180",
    note: "icon-only stepper arrows; graded on glyph-in-box centring",
  },
  {
    id: "actionButton",
    label: ".primaryButton / .secondaryButton + chevron",
    locals: ["primaryButton", "secondaryButton"],
    iconSelector: ":scope > svg",
    source:
      "src/components/session-screens.tsx:136,295, src/components/plan-workspace.tsx:450",
    note: "inline-flex + align-items:center; .topBar .secondaryButton svg is display:none <=600px",
  },
  {
    id: "detailsToggle",
    label: ".detailsToggle",
    locals: ["detailsToggle"],
    iconSelector: ":scope > svg",
    textless: true,
    source: "src/components/expense-ledger.tsx:127-136",
    note: "icon-only disclosure; grid + place-items:center",
  },
];

const PATTERN_IDS = new Set(PATTERNS.map((pattern) => pattern.id));

/**
 * A plain CSS selector for one pattern, for the fail-demo stylesheets only.
 *
 * Deliberately looser than the page-side matcher: `[class*="categoryRow"]` also
 * catches the `categoryRows` container, which is harmless in an injection whose
 * only job is to break something, and keeps the demo CSS readable.
 */
function cssSelectorsFor(pattern) {
  const tail = pattern.descend
    ? ` > ${pattern.descend.replace(":scope > ", "")}`
    : "";
  return pattern.locals.map((local) => `[class*="${local}"]${tail}`);
}

// ---------------------------------------------------------------------------
// Surface catalogue.
//
// `expects` is the liveness contract, and it is the reason this harness cannot
// quietly measure nothing: naming a pattern here asserts the surface renders at
// least one instance of it. If it renders none, that cell FAILS. `prefix`
// navigates somewhere else first so the measured step is always a real
// transition.
//
// Nothing here is scanned inside `main` only: the Plan top bar lives outside
// it and carries one of the measured patterns.
// ---------------------------------------------------------------------------
const SURFACES = [
  {
    id: "signed-out-sign-in",
    label: "Signed out · sign in",
    account: "none",
    prefix: [],
    nav: [clickExact("Already have an account? Sign in")],
    expect: `document.querySelector('main h2')?.textContent === "Sign in"`,
    expects: ["actionButton"],
  },
  {
    id: "onboarding",
    label: "Onboarding",
    account: "onboarding",
    prefix: [],
    nav: [RELOAD_STEP],
    expect: `document.querySelector('main h1')?.textContent === "Create your plan"`,
    expects: ["actionButton"],
  },
  {
    id: "home",
    label: "Home",
    account: "fixture",
    prefix: [clickExact("Plan")],
    nav: [clickExact("Home")],
    expect: `document.querySelector('main h1')?.textContent === "Home"`,
    expects: ["navRow"],
  },
  {
    id: "budget",
    label: "Budget",
    account: "fixture",
    prefix: [clickExact("Home")],
    nav: [clickExact("Budget")],
    expect: `document.querySelector('main header p')?.textContent === "Budget"`,
    expects: ["categoryRow", "monthStepper"],
  },
  {
    id: "activity",
    label: "Activity",
    account: "fixture",
    prefix: [clickExact("Home")],
    nav: [clickExact("Activity")],
    expect: `document.querySelector('main header p')?.textContent === "Activity"`,
    expects: ["transactionRow", "monthStepper", "navRow"],
  },
  {
    id: "category-detail",
    label: "Category detail · Dining out",
    account: "fixture",
    prefix: [clickExact("Home"), clickExact("Budget")],
    nav: [clickContains("Dining out")],
    expect: `document.querySelector('main h1')?.textContent === "Dining out" && document.querySelector('main header button[aria-label="Back to Budget"]') !== null`,
    expects: ["backHeaderButton", "transactionRow"],
  },
  {
    id: "manage-categories",
    label: "Manage categories",
    account: "fixture",
    prefix: [clickExact("Home"), clickExact("Budget")],
    nav: [clickExact("Manage categories")],
    expect: `document.querySelector('main h1')?.textContent === "Manage categories"`,
    expects: ["backHeaderButton", "manageRow"],
  },
  {
    id: "monthly-wrap",
    label: "Monthly wrap",
    account: "fixture",
    prefix: [clickExact("Plan"), clickExact("Home")],
    nav: [clickContains("Monthly wrap")],
    expect: `/\\swrap$/.test(document.querySelector('main h1')?.textContent ?? "") && document.querySelector('main header button[aria-label="Back to Home"]') !== null`,
    expects: ["backHeaderButton"],
  },
  {
    id: "plan",
    label: "Plan",
    account: "fixture",
    prefix: [clickExact("Home")],
    nav: [clickExact("Plan")],
    expect: `/ annual plan$/.test(document.querySelector('main header p')?.textContent ?? "")`,
    expects: ["navRow", "actionButton"],
  },
  {
    id: "plan-details",
    label: "Plan details",
    account: "fixture",
    prefix: [clickExact("Home"), clickExact("Plan")],
    nav: [clickContains("Plan details")],
    expect: `document.querySelectorAll('main h1')[0]?.textContent === "Plan details"`,
    expects: ["backHeaderButton", "detailsToggle", "actionButton"],
  },
];

// ---------------------------------------------------------------------------
// FAIL-DEMO injections. Each mutates the live page from the browser only — no
// product component and no product stylesheet is touched — so a check that has
// never gone red can be proven, on demand, to be capable of going red.
// ---------------------------------------------------------------------------
const ROW_SELECTOR_LIST = PATTERNS.filter((pattern) => !pattern.textless)
  .flatMap(cssSelectorsFor)
  .join(", ");
const ALL_SELECTOR_LIST = PATTERNS.flatMap(cssSelectorsFor).join(", ");
const ALL_ICON_SELECTOR_LIST = PATTERNS.flatMap(cssSelectorsFor)
  .map((selector) => `${selector} svg`)
  .join(", ");

const FAIL_DEMOS = {
  // The metric itself. Forcing every grid/flex row to top-align drags the
  // chevron to the top of the row while the text block stays where it is, which
  // is precisely the shape `centerDeltaPx` exists to see.
  flexstart: `(() => {
    const style = document.createElement('style');
    style.id = 'alignment-fail-demo';
    style.textContent = ${js(`${ROW_SELECTOR_LIST} { align-items: flex-start !important; }`)};
    document.head.append(style);
    return 'flexstart: align-items:flex-start forced on every text-bearing row pattern';
  })()`,
  // The suspected defect class, reproduced on patterns known to be good.
  // Dropping grid/flex leaves the glyph and the label in inline flow, sharing a
  // baseline, which is exactly what `.backHeader > button` does natively.
  "inline-flow": `(() => {
    const style = document.createElement('style');
    style.id = 'alignment-fail-demo';
    style.textContent = ${js(`${ROW_SELECTOR_LIST} { display: block !important; }`)};
    document.head.append(style);
    return 'inline-flow: display:block forced on every text-bearing row pattern (no flex, no grid)';
  })()`,
  // Liveness. Every row of every measured pattern is removed from the document.
  // A harness that reports a clean sweep here is measuring nothing and saying
  // nothing, which is the exact failure this file was written after.
  vanish: `(() => {
    const rows = [...document.querySelectorAll(${js(ALL_SELECTOR_LIST)})];
    for (const row of rows) row.remove();
    return 'vanish: ' + rows.length + ' measured row(s) removed from the document';
  })()`,
  // The other liveness hole: rows still present, chevrons all hidden. This must
  // read N/A-HIDDEN everywhere and must NOT read as a pass, because nothing was
  // graded — and, because no pattern is then measured anywhere in the run, the
  // run-level liveness rule has to turn that into a failure.
  hide: `(() => {
    const style = document.createElement('style');
    style.id = 'alignment-fail-demo';
    style.textContent = ${js(`${ALL_ICON_SELECTOR_LIST} { display: none !important; }`)};
    document.head.append(style);
    return 'hide: every measured chevron forced to display:none';
  })()`,
};

// ---------------------------------------------------------------------------
// Page-side measurement.
//
// Runs once per surface/engine/viewport, after settle, and reads geometry only:
// it adds no node to the document and changes no style, so the numbers describe
// the frame the reader would have seen.
// ---------------------------------------------------------------------------
const measureExpression = (patterns) => `(() => {
  const patterns = ${js(patterns)};
  const round = (value) => Math.round(value * 1000) / 1000;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  const rendered = (node) => {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  /**
   * Does this element carry the CSS-module local name \`local\`?
   *
   * The bundler decides where in the class token the local name lands and what
   * it is glued to, so the test is a whole-word one: the name must be bounded
   * on both sides by something that is not a letter or a digit (or by the ends
   * of the token). That is what keeps \`categoryRow\` off \`categoryRows\`.
   */
  const carries = (node, locals) =>
    [...node.classList].some((token) =>
      locals.some((local) =>
        new RegExp('(^|[^A-Za-z0-9])' + local + '([^A-Za-z0-9]|$)').test(token)));

  const rowsFor = (pattern) => {
    const hosts = [...document.querySelectorAll(
      pattern.locals.map((local) => '[class*="' + local + '"]').join(', '),
    )].filter((node) => carries(node, pattern.locals));
    if (!pattern.descend) return hosts;
    return hosts.flatMap((host) => [...host.querySelectorAll(pattern.descend)]);
  };

  /**
   * Where the row's words actually are.
   *
   * A Range over a text node reports the inline text box — the font's own
   * ascent/descent extent — rather than the height of whatever block happens to
   * contain it, so a label inside a stretched grid item is not reported as
   * being as tall as the cell. That distinction is the whole measurement.
   */
  const textEntries = (row, icon) => {
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    const entries = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.nodeValue || !node.nodeValue.trim()) continue;
      if (icon && icon.contains(node)) continue;
      const parent = node.parentElement;
      if (!parent) continue;
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      entries.push({ rect, parent, text: node.nodeValue.trim() });
    }
    return entries;
  };

  /**
   * The alphabetic baseline of one text run, from the font's own metrics.
   *
   * No probe node is inserted: inserting one to find a baseline would change
   * the line box being measured. Canvas font metrics give the ascent for the
   * same font the element resolved, and the Range rect gives where that font's
   * box starts, so baseline = rectTop + fontBoundingBoxAscent.
   */
  const baselineOf = (entry) => {
    const style = getComputedStyle(entry.parent);
    const sentinel = '10px monospace';
    context.font = sentinel;
    const wanted = [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].join(' ');
    context.font = wanted;
    if (context.font === sentinel && wanted !== sentinel) return null;
    const metrics = context.measureText(entry.text);
    if (typeof metrics.fontBoundingBoxAscent !== 'number') return null;
    return entry.rect.top + metrics.fontBoundingBoxAscent;
  };

  /**
   * Which of the three vertical-alignment mechanisms this codebase uses is in
   * force for this glyph, read out of computed style rather than assumed from
   * the source. \`inline-flow-baseline\` is the one with no flex and no grid
   * anywhere — the suspected defect class.
   */
  const mechanismOf = (icon) => {
    const parent = icon.parentElement;
    const parentStyle = getComputedStyle(parent);
    const iconStyle = getComputedStyle(icon);
    const display = parentStyle.display;
    const alignItems = parentStyle.alignItems;
    const alignSelf = iconStyle.alignSelf;
    const effective = alignSelf && alignSelf !== 'auto' ? alignSelf : alignItems;
    let mechanism;
    if (display.includes('grid')) {
      mechanism = effective === 'center' ? 'grid-center' : 'grid-' + effective;
    } else if (display.includes('flex')) {
      mechanism = effective === 'center' ? 'flex-center' : 'flex-' + effective;
    } else {
      mechanism = 'inline-flow-baseline';
    }
    return {
      mechanism,
      parentDisplay: display,
      alignItems,
      alignSelf,
      verticalAlign: iconStyle.verticalAlign,
    };
  };

  const results = [];
  for (const pattern of patterns) {
    const rows = rowsFor(pattern);
    const instances = [];
    let rowsFound = 0;
    let rowsHidden = 0;
    let rowsWithoutIcon = 0;
    let iconsHidden = 0;

    for (const row of rows) {
      rowsFound += 1;
      if (!rendered(row)) {
        rowsHidden += 1;
        continue;
      }
      const icon = row.querySelector(pattern.iconSelector);
      if (!icon) {
        rowsWithoutIcon += 1;
        continue;
      }
      const rowRect = row.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      const iconVisible = rendered(icon);
      const entries = textEntries(row, icon);
      const label = entries.length > 0 ? entries[0].text.slice(0, 40) : null;

      if (!iconVisible) {
        iconsHidden += 1;
        instances.push({
          pattern: pattern.id,
          label,
          status: 'N/A-HIDDEN',
          reason: getComputedStyle(icon).display === 'none'
            ? 'chevron is display:none at this width'
            : 'chevron renders at zero size at this width',
          rowHeightPx: round(rowRect.height),
          rowWidthPx: round(rowRect.width),
          iconBoxPx: null,
          textBoxPx: entries.length > 0 ? round(union(entries).height) : null,
          textNodeCount: entries.length,
          centerDeltaPx: null,
          centerDeltaSignedPx: null,
          firstLineCenterDeltaPx: null,
          iconRowCenterDeltaPx: null,
          baselineDeltaPx: null,
          ...mechanismOf(icon),
        });
        continue;
      }

      const iconCenter = iconRect.top + iconRect.height / 2;
      const rowCenter = rowRect.top + rowRect.height / 2;

      if (entries.length === 0) {
        // Icon-only control. There is no text to be level with, so the graded
        // quantity is whether the glyph is centred in its own tap target.
        instances.push({
          pattern: pattern.id,
          label: null,
          status: 'ICON-ONLY',
          reason: 'control carries no text; graded on glyph-in-box centring',
          rowHeightPx: round(rowRect.height),
          rowWidthPx: round(rowRect.width),
          iconBoxPx: round(iconRect.width) + 'x' + round(iconRect.height),
          textBoxPx: null,
          textNodeCount: 0,
          centerDeltaPx: null,
          centerDeltaSignedPx: null,
          firstLineCenterDeltaPx: null,
          iconRowCenterDeltaPx: round(Math.abs(iconCenter - rowCenter)),
          baselineDeltaPx: null,
          ...mechanismOf(icon),
        });
        continue;
      }

      const textBox = union(entries);
      const textCenter = textBox.top + textBox.height / 2;
      const firstLine = entries.reduce((best, entry) =>
        entry.rect.top < best.rect.top ? entry : best, entries[0]);
      const firstCenter = firstLine.rect.top + firstLine.rect.height / 2;
      const baseline = baselineOf(firstLine);

      instances.push({
        pattern: pattern.id,
        label,
        status: 'MEASURED',
        reason: null,
        rowHeightPx: round(rowRect.height),
        rowWidthPx: round(rowRect.width),
        iconBoxPx: round(iconRect.width) + 'x' + round(iconRect.height),
        textBoxPx: round(textBox.width) + 'x' + round(textBox.height),
        textNodeCount: entries.length,
        centerDeltaPx: round(Math.abs(iconCenter - textCenter)),
        centerDeltaSignedPx: round(iconCenter - textCenter),
        firstLineCenterDeltaPx: round(Math.abs(iconCenter - firstCenter)),
        iconRowCenterDeltaPx: round(Math.abs(iconCenter - rowCenter)),
        baselineDeltaPx: baseline === null ? null : round(iconRect.bottom - baseline),
        ...mechanismOf(icon),
      });
    }

    results.push({
      pattern: pattern.id,
      rowsFound,
      rowsHidden,
      rowsWithoutIcon,
      iconsHidden,
      instances,
    });
  }

  function union(entries) {
    let top = Infinity;
    let bottom = -Infinity;
    let left = Infinity;
    let right = -Infinity;
    for (const entry of entries) {
      top = Math.min(top, entry.rect.top);
      bottom = Math.max(bottom, entry.rect.bottom);
      left = Math.min(left, entry.rect.left);
      right = Math.max(right, entry.rect.right);
    }
    return { top, bottom, left, right, height: bottom - top, width: right - left };
  }

  return JSON.stringify({ patterns: results });
})()`;

const BROWSER_LAUNCH_ARGS = ["--disable-frame-rate-limit"];

// Both engines gate every measurement in this harness. Unlike the density
// harness there is no Chromium-only instrument here — this is pure layout
// geometry, which is exactly the thing the two engines disagree about — so
// there is no engine whose rows are informational.
const ENGINES = {
  chromium: { gates: "all" },
  webkit: { gates: "all" },
};
const DEFAULT_ENGINES = ["chromium", "webkit"];

class Browser {
  static engine = "chromium";

  constructor(session) {
    this.session = session;
  }

  async call(args) {
    const { stdout } = await run(
      "agent-browser",
      ["--session", this.session, ...args],
      { maxBuffer: 32 * 1024 * 1024 },
    );
    return stdout;
  }

  async open(url) {
    await this.call([
      "open",
      "--init-script",
      probeScript,
      "--args",
      BROWSER_LAUNCH_ARGS.join(","),
      url,
    ]);
  }

  async reload() {
    await this.call(["reload"]);
  }

  async viewport(width, height, scale) {
    await this.call([
      "set",
      "viewport",
      String(width),
      String(height),
      String(scale),
    ]);
  }

  async device(name) {
    await this.call(["set", "device", name]);
  }

  async evaluate(expression) {
    const stdout = await this.call(["eval", "--json", expression]);
    const parsed = JSON.parse(stdout);
    if (!parsed.success) {
      throw new Error(`eval failed: ${JSON.stringify(parsed.error)}`);
    }
    return parsed.data.result;
  }

  async evaluateJson(expression) {
    return JSON.parse(await this.evaluate(expression));
  }

  async close() {
    await this.call(["close"]).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// WebKit driver. Same surface as `Browser`, so every navigation step, wait,
// settle and measurement in this file runs unchanged on both engines. Only the
// two calls the flows actually make through `call` are implemented; anything
// else throws rather than passing silently.
// ---------------------------------------------------------------------------
class WebkitBrowser {
  static engine = "webkit";

  constructor(session) {
    this.session = session;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.scale = 3;
    this.width = 390;
  }

  async #context(width, height) {
    if (this.context) await this.context.close();
    const { webkit } = await import("playwright-core");
    if (!this.browser) this.browser = await webkit.launch();
    this.context = await this.browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: this.scale,
      // Touch emulation belongs to the phone widths. Claiming a 1280px-wide
      // touch phone would be emulating a device nobody holds, and the desktop
      // rows exist precisely to measure the non-phone layout.
      hasTouch: width <= 700,
      isMobile: width <= 700,
    });
    await this.context.addInitScript({ path: probeScript });
    this.page = await this.context.newPage();
  }

  async open(url) {
    if (!this.page) await this.#context(this.width, 844);
    await this.page.goto(url, { waitUntil: "load" });
  }

  async reload() {
    await this.page.reload({ waitUntil: "load" });
  }

  // A WebKit context's device scale factor is fixed at creation, so a viewport
  // change rebuilds the context. The page is then re-opened by the caller's own
  // sign-in flow, exactly as the Chromium path is.
  async viewport(width, height, scale) {
    this.scale = scale;
    this.width = width;
    const url = this.page ? this.page.url() : null;
    await this.#context(width, height);
    if (url && url !== "about:blank")
      await this.page.goto(url, { waitUntil: "load" });
  }

  async device() {
    // Emulation is set on the context above; there is no separate device step.
  }

  async evaluate(expression) {
    return this.page.evaluate(expression);
  }

  async evaluateJson(expression) {
    return JSON.parse(await this.evaluate(expression));
  }

  async call(args) {
    if (args[0] === "cookies" && args[1] === "clear") {
      await this.context.clearCookies();
      return "";
    }
    if (args[0] === "navigate") {
      await this.page.goto(args[1], { waitUntil: "load" });
      return "";
    }
    throw new Error(`WebkitBrowser cannot run: ${args.join(" ")}`);
  }

  async close() {
    if (this.browser) await this.browser.close().catch(() => undefined);
    this.browser = null;
    this.context = null;
    this.page = null;
  }
}

async function waitFor(
  browser,
  expression,
  { timeout = 20000, interval = 120 } = {},
) {
  const deadline = Date.now() + timeout;
  let last = null;
  for (;;) {
    try {
      if (await browser.evaluate(`Boolean(${expression})`)) return;
      last = null;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    if (Date.now() > deadline) {
      throw new Error(
        `timed out waiting for: ${expression}${last ? ` (last error: ${last})` : ""}`,
      );
    }
    await delay(interval);
  }
}

/** Network-idle plus a beat, so geometry is read from a settled frame. */
async function settle(browser) {
  const deadline = Date.now() + 20000;
  let quiet = 0;
  while (quiet < 3) {
    const state = await browser.evaluateJson(
      `JSON.stringify({ ready: document.readyState, inflight: window.__density.inflight })`,
    );
    quiet = state.ready === "complete" && state.inflight === 0 ? quiet + 1 : 0;
    if (Date.now() > deadline) break;
    await delay(150);
  }
  await delay(700);
}

// ---------------------------------------------------------------------------
// Session flows
// ---------------------------------------------------------------------------
async function resetToSignedOut(browser, baseUrl) {
  await browser.call(["cookies", "clear"]).catch(() => undefined);
  await browser.call(["navigate", baseUrl]);
  await waitFor(
    browser,
    `document.querySelector('main h2')?.textContent === "Create account"`,
    { timeout: 30000 },
  );
  await settle(browser);
}

async function signIn(browser, email, password) {
  await browser.evaluate(clickExact("Already have an account? Sign in"));
  await waitFor(
    browser,
    `document.querySelector('main h2')?.textContent === "Sign in"`,
  );
  await browser.evaluate(`(() => {
    const setValue = (node, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(node, value);
      node.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setValue(document.querySelector('main input[name="email"]'), ${js(email)});
    setValue(document.querySelector('main input[name="password"]'), ${js(password)});
    return true;
  })()`);
  await browser.evaluate(clickExact("Sign in"));
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------
async function measureSurface(browser, surface, viewport, failDemo) {
  for (const step of surface.prefix) {
    await browser.evaluate(step);
    await delay(180);
  }
  if (surface.prefix.length > 0) await settle(browser);

  for (const step of surface.nav) {
    if (step === RELOAD_STEP) await browser.reload();
    else await browser.evaluate(step);
    await delay(60);
  }

  let arrivalError = null;
  try {
    await waitFor(browser, surface.expect);
  } catch (error) {
    arrivalError = error instanceof Error ? error.message : String(error);
  }
  await settle(browser);

  // Injected after arrival so the demo perturbs the measured frame and nothing
  // about navigation. Removed again below, so one run can carry a demo without
  // poisoning the surfaces that follow it.
  let injection = null;
  if (failDemo) injection = await browser.evaluate(FAIL_DEMOS[failDemo]);

  const measurement = await browser.evaluateJson(
    measureExpression(
      PATTERNS.map((pattern) => ({
        id: pattern.id,
        locals: pattern.locals,
        descend: pattern.descend ?? null,
        iconSelector: pattern.iconSelector,
      })),
    ),
  );

  if (failDemo) {
    await browser.evaluate(
      `(() => {
        const style = document.getElementById('alignment-fail-demo');
        if (style) style.remove();
        return true;
      })()`,
    );
  }

  for (const step of surface.after ?? []) {
    await browser.evaluate(step).catch(() => undefined);
  }
  await delay(150);

  return {
    surface: surface.id,
    surfaceLabel: surface.label,
    engine: browser.constructor.engine,
    viewport: `${viewport.width}x${viewport.height}`,
    primaryViewport: viewport.primary === true,
    arrivalError,
    injection,
    patterns: measurement.patterns,
  };
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------
const percentile = (values, fraction) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round(fraction * (sorted.length - 1))),
  );
  return sorted[index];
};

/**
 * Fold every instance of one pattern, on one engine at one viewport, across
 * every surface that rendered it, into one graded cell.
 *
 * The three non-PASS outcomes are kept distinct on purpose. `NOT-FOUND` means
 * the selector matched nothing where a surface promised instances — that is a
 * failure of the instrument or of the product, and either way it is not a pass.
 * `N/A-HIDDEN` means the chevron is legitimately not painted at this width; it
 * is neither a pass nor a fail and is excluded from both rates. Only `MEASURED`
 * instances can produce a `PASS`.
 */
function gradeCell(pattern, engine, viewport, surfaceRows) {
  const relevant = surfaceRows.filter(
    (row) => row.engine === engine && row.viewport === viewport,
  );
  const instances = [];
  const surfacesExpecting = [];
  const surfacesEmpty = [];
  let rowsFound = 0;
  let rowsWithoutIcon = 0;

  for (const row of relevant) {
    const surface = SURFACES.find((entry) => entry.id === row.surface);
    const found = row.patterns.find((entry) => entry.pattern === pattern.id);
    if (!found) continue;
    rowsFound += found.rowsFound;
    rowsWithoutIcon += found.rowsWithoutIcon;
    for (const instance of found.instances) {
      instances.push({ ...instance, surface: row.surface });
    }
    if (surface?.expects?.includes(pattern.id)) {
      surfacesExpecting.push(row.surface);
      if (found.instances.length === 0) surfacesEmpty.push(row.surface);
    }
  }

  const measured = instances.filter(
    (instance) => instance.status === "MEASURED",
  );
  const iconOnly = instances.filter(
    (instance) => instance.status === "ICON-ONLY",
  );
  const hidden = instances.filter(
    (instance) => instance.status === "N/A-HIDDEN",
  );
  const graded = pattern.textless ? iconOnly : measured;
  const metric = pattern.textless ? "iconRowCenterDeltaPx" : "centerDeltaPx";
  const values = graded.map((instance) => instance[metric]);

  const failures = [];
  let status;
  if (surfacesEmpty.length > 0) {
    status = "NOT-FOUND";
    failures.push(
      `[${engine} ${viewport}] ${pattern.label} rendered ZERO instances on surface(s) that declare it: ` +
        `${surfacesEmpty.join(", ")}. Nothing was measured, so nothing passed.`,
    );
  } else if (surfacesExpecting.length === 0 && instances.length === 0) {
    status = "NOT-FOUND";
    failures.push(
      `[${engine} ${viewport}] ${pattern.label} was not found on any surface in the catalogue.`,
    );
  } else if (graded.length === 0) {
    status = hidden.length > 0 ? "N/A-HIDDEN" : "NOT-FOUND";
    if (status === "NOT-FOUND") {
      failures.push(
        `[${engine} ${viewport}] ${pattern.label} produced no gradeable instance and no hidden one either.`,
      );
    }
  } else {
    const worst = Math.max(...values);
    status = worst > BAR_CENTER_DELTA_PX ? "FAIL" : "PASS";
    if (status === "FAIL") {
      const offenders = graded
        .filter((instance) => instance[metric] > BAR_CENTER_DELTA_PX)
        .slice(0, 4)
        .map(
          (instance) =>
            `${instance.surface}:"${instance.label ?? "(icon only)"}" ${metric}=${instance[metric]}px ` +
            `baselineΔ=${instance.baselineDeltaPx ?? "n/a"} mech=${instance.mechanism}`,
        );
      failures.push(
        `[${engine} ${viewport}] ${pattern.label}: ${
          graded.filter((instance) => instance[metric] > BAR_CENTER_DELTA_PX)
            .length
        }/${graded.length} instance(s) over the ${BAR_CENTER_DELTA_PX}px bar, worst ${worst}px — ` +
          offenders.join(" | "),
      );
    }
  }

  const mechanisms = [
    ...new Set(instances.map((instance) => instance.mechanism)),
  ];
  return {
    pattern: pattern.id,
    patternLabel: pattern.label,
    engine,
    viewport,
    status,
    metric,
    sampleCount: instances.length,
    rowsFound,
    rowsWithoutIcon,
    measuredCount: graded.length,
    hiddenCount: hidden.length,
    surfacesExpecting,
    surfacesEmpty,
    maxDeltaPx: values.length > 0 ? Math.max(...values) : null,
    p50DeltaPx: percentile(values, 0.5),
    p95DeltaPx: percentile(values, 0.95),
    maxBaselineDeltaPx:
      measured.length > 0
        ? Math.max(
            ...measured.map((instance) =>
              instance.baselineDeltaPx === null
                ? 0
                : Math.abs(instance.baselineDeltaPx),
            ),
          )
        : null,
    minAbsBaselineDeltaPx:
      measured.length > 0
        ? Math.min(
            ...measured.map((instance) =>
              instance.baselineDeltaPx === null
                ? Infinity
                : Math.abs(instance.baselineDeltaPx),
            ),
          )
        : null,
    mechanisms,
    iconBoxes: [
      ...new Set(
        instances
          .map((instance) => instance.iconBoxPx)
          .filter((value) => value !== null),
      ),
    ],
    rowHeights: [
      ...new Set(instances.map((instance) => instance.rowHeightPx)),
    ].sort((a, b) => a - b),
    failures,
    instances,
  };
}

function markdownTable(cells) {
  const cell = (value) => String(value).replace(/\|/g, "\\|");
  const number = (value) => (value === null ? "—" : value.toFixed(2));
  const lines = [
    "| Pattern | Engine | Viewport | Status | sampleCount | measured | N/A-HIDDEN | metric | max Δ | p50 Δ | p95 Δ | min abs baselineΔ | mechanism(s) | icon box | row heights |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | --- | --- | --- |",
  ];
  for (const entry of cells) {
    const flag =
      entry.status === "PASS"
        ? "PASS"
        : entry.status === "N/A-HIDDEN"
          ? "N/A-HIDDEN"
          : `**${entry.status}**`;
    lines.push(
      `| ${cell(entry.patternLabel)} | ${entry.engine} | ${entry.viewport} | ${flag} | ` +
        `${entry.sampleCount} | ${entry.measuredCount} | ${entry.hiddenCount} | ${entry.metric} | ` +
        `${number(entry.maxDeltaPx)} | ${number(entry.p50DeltaPx)} | ${number(entry.p95DeltaPx)} | ` +
        `${entry.minAbsBaselineDeltaPx === null || entry.minAbsBaselineDeltaPx === Infinity ? "—" : entry.minAbsBaselineDeltaPx.toFixed(2)} | ` +
        `${cell(entry.mechanisms.join(", ") || "—")} | ${cell(entry.iconBoxes.join(", ") || "—")} | ` +
        `${cell(entry.rowHeights.join(", ") || "—")} |`,
    );
  }
  return lines.join("\n");
}

function surfaceTable(cells) {
  const cell = (value) => String(value).replace(/\|/g, "\\|");
  const lines = [
    "| Pattern | Surface | Engine | Viewport | sampleCount | measured | hidden | max Δ | mechanism |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |",
  ];
  for (const entry of cells) {
    const bySurface = new Map();
    for (const instance of entry.instances) {
      const bucket = bySurface.get(instance.surface) ?? [];
      bucket.push(instance);
      bySurface.set(instance.surface, bucket);
    }
    for (const [surface, bucket] of bySurface) {
      const graded = bucket.filter((instance) =>
        entry.metric === "centerDeltaPx"
          ? instance.status === "MEASURED"
          : instance.status === "ICON-ONLY",
      );
      const hidden = bucket.filter(
        (instance) => instance.status === "N/A-HIDDEN",
      ).length;
      const worst =
        graded.length > 0
          ? Math.max(...graded.map((instance) => instance[entry.metric]))
          : null;
      lines.push(
        `| ${cell(entry.patternLabel)} | ${cell(surface)} | ${entry.engine} | ${entry.viewport} | ` +
          `${bucket.length} | ${graded.length} | ${hidden} | ${worst === null ? "—" : worst.toFixed(2)} | ` +
          `${cell([...new Set(bucket.map((instance) => instance.mechanism))].join(", "))} |`,
      );
    }
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------
async function waitForServer(url, timeout = 120000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline)
      throw new Error(`server never became ready at ${url}`);
    await delay(500);
  }
}

/**
 * Refuse to run against a server this process did not start.
 *
 * A healthy foreign server looks exactly like your own, so attaching to one
 * silently measures a build this run never compiled. `--base-url` is the
 * supported way to target something you started yourself.
 */
async function assertPortFree(port) {
  try {
    const response = await fetch(`http://localhost:${port}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(2000),
    });
    throw new Error(
      `port ${port} is already serving (HTTP ${response.status}). Another ` +
        `measurement run or dev server is using it, and this run would measure ` +
        `that build instead of the one it just compiled. Stop it, or pass ` +
        `--port with a free port, or --base-url to target it deliberately.`,
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("port "))
      throw error;
    // Nothing listening, or it did not answer in time: the port is ours.
  }
}

/**
 * A stale browser session from an abandoned run holds the previous document,
 * and `agent-browser open` would attach to it rather than start clean. Closing
 * it first is what makes two consecutive runs comparable.
 */
async function killStraySessions(session) {
  await run("agent-browser", ["--session", session, "close"]).catch(
    () => undefined,
  );
  // The close is asynchronous on the daemon's side: opening again immediately
  // after it races the socket teardown and fails with "No such file or
  // directory". Observed once in this harness's own fail-demo battery, where it
  // aborted the run before a single row was measured.
  await delay(1500);
}

/**
 * Open the base URL, retrying a socket-level failure a bounded number of times.
 *
 * Only connection setup is retried, and only because an instrument that dies on
 * a session-teardown race reports "no measurements" for a reason that has
 * nothing to do with the product. A genuine failure still stops the run: the
 * last error is rethrown.
 */
async function openWithRetry(browser, baseUrl, attempts = 3) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await browser.open(baseUrl);
      return;
    } catch (error) {
      last = error;
      console.log(
        `     open attempt ${attempt}/${attempts} failed: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
      );
      await delay(2000 * attempt);
    }
  }
  throw last;
}

// Derived from this process, so two concurrent runs cannot collide on it and
// neither can silently inherit a dev server left on a well-known port.
const DEFAULT_PORT = 3300 + (process.pid % 400);

function parseArguments(argv) {
  const options = {
    mode: "gate",
    port: DEFAULT_PORT,
    baseUrl: null,
    build: true,
    seed: true,
    json: null,
    markdown: null,
    surfaces: null,
    patterns: null,
    viewports: DEFAULT_VIEWPORTS,
    failDemo: null,
    session: "alignment-baseline",
    engines: [...DEFAULT_ENGINES],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => argv[(index += 1)];
    switch (argument) {
      case "--":
        break;
      case "--mode":
        options.mode = next();
        break;
      case "--port":
        options.port = Number(next());
        break;
      case "--base-url":
        options.baseUrl = next();
        break;
      case "--no-build":
        options.build = false;
        break;
      case "--no-seed":
        options.seed = false;
        break;
      case "--json":
        options.json = next();
        break;
      case "--markdown":
        options.markdown = next();
        break;
      case "--surfaces":
        options.surfaces = next().split(",");
        break;
      case "--patterns":
        options.patterns = next().split(",");
        break;
      case "--viewports":
        options.viewports = next()
          .split(",")
          .map((entry, order) => {
            const [width, height] = entry.split("x").map(Number);
            return {
              width,
              height,
              scale: width <= 700 ? 3 : 2,
              primary: order === 0,
            };
          });
        break;
      case "--fail-demo":
        options.failDemo = next();
        break;
      case "--session":
        options.session = next();
        break;
      // Narrows the run for investigation only. It cannot widen anything and it
      // cannot relax a bar: an engine left out simply is not measured, and the
      // default is every engine.
      case "--engines":
        options.engines = next().split(",");
        break;
      default:
        throw new Error(`unknown argument: ${argument}`);
    }
  }
  if (!["gate", "capture"].includes(options.mode)) {
    throw new Error(`--mode must be gate or capture, got ${options.mode}`);
  }
  for (const engine of options.engines) {
    if (!(engine in ENGINES)) {
      throw new Error(
        `--engines must name only ${Object.keys(ENGINES).join(", ")}, got ${engine}`,
      );
    }
  }
  if (options.engines.length === 0) throw new Error("no engines selected");
  for (const pattern of options.patterns ?? []) {
    if (!PATTERN_IDS.has(pattern)) {
      throw new Error(
        `--patterns must name only ${[...PATTERN_IDS].join(", ")}, got ${pattern}`,
      );
    }
  }
  if (options.failDemo && !(options.failDemo in FAIL_DEMOS)) {
    throw new Error(
      `--fail-demo must be one of ${Object.keys(FAIL_DEMOS).join(", ")}, got ${options.failDemo}`,
    );
  }
  if (!options.json) {
    throw new Error(
      "--json is required: this harness writes its evidence outside the repository " +
        "so a scratch file can never be picked up by the repo's own test runner.",
    );
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const selected = options.surfaces
    ? SURFACES.filter((surface) => options.surfaces.includes(surface.id))
    : SURFACES;
  if (selected.length === 0) throw new Error("no surfaces selected");
  const patterns = options.patterns
    ? PATTERNS.filter((pattern) => options.patterns.includes(pattern.id))
    : PATTERNS;

  if (options.seed) {
    console.log("Seeding density fixture…");
    const { stdout } = await run(
      "npx",
      ["tsx", "scripts/seed-density-fixture.ts"],
      {
        cwd: repositoryRoot,
        env: process.env,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    console.log(stdout.trim());
  }

  let server = null;
  let baseUrl = options.baseUrl;
  if (!baseUrl) {
    await assertPortFree(options.port);
    if (options.build) {
      console.log("Building production bundle…");
      await run("pnpm", ["build"], {
        cwd: repositoryRoot,
        maxBuffer: 64 * 1024 * 1024,
      });
    }
    baseUrl = `http://localhost:${options.port}`;
    console.log(`Starting production server on ${baseUrl}…`);
    server = spawn("npx", ["next", "start", "-p", String(options.port)], {
      cwd: repositoryRoot,
      stdio: "ignore",
      env: process.env,
    });
    await waitForServer(baseUrl);
  }

  const surfaceRows = [];
  try {
    for (const engine of options.engines) {
      console.log(`\n--- ${engine} ---`);
      await runEngine(engine, baseUrl, options, selected, surfaceRows);
    }
  } finally {
    if (server) server.kill("SIGTERM");
  }

  const cells = [];
  for (const pattern of patterns) {
    for (const engine of options.engines) {
      for (const viewport of options.viewports) {
        cells.push(
          gradeCell(
            pattern,
            engine,
            `${viewport.width}x${viewport.height}`,
            surfaceRows,
          ),
        );
      }
    }
  }

  // A pattern that is hidden on every engine at every viewport was never
  // graded anywhere, and a check that never executed is not evidence. This is
  // the run-level half of the liveness rule: the per-cell half above cannot see
  // it, because each individual N/A-HIDDEN cell is legitimately not a failure.
  const neverMeasured = patterns.filter((pattern) =>
    cells
      .filter((entry) => entry.pattern === pattern.id)
      .every((entry) => entry.measuredCount === 0),
  );
  const arrivalErrors = surfaceRows.filter((row) => row.arrivalError);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: options.mode,
    failDemo: options.failDemo,
    bar: { centerDeltaPx: BAR_CENTER_DELTA_PX },
    engines: options.engines,
    viewports: options.viewports.map(
      (viewport) => `${viewport.width}x${viewport.height}`,
    ),
    patterns: patterns.map((pattern) => ({
      id: pattern.id,
      label: pattern.label,
      locals: pattern.locals,
      descend: pattern.descend ?? null,
      iconSelector: pattern.iconSelector,
      textless: pattern.textless === true,
      source: pattern.source,
      note: pattern.note,
    })),
    neverMeasured: neverMeasured.map((pattern) => pattern.id),
    arrivalErrors: arrivalErrors.map((row) => ({
      surface: row.surface,
      engine: row.engine,
      viewport: row.viewport,
      error: row.arrivalError,
    })),
    cells,
    surfaceRows,
  };
  const jsonPath = resolve(repositoryRoot, options.json);
  await mkdir(dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

  const table = markdownTable(cells);
  console.log(`\n${table}\n`);
  console.log(surfaceTable(cells));
  if (options.markdown) {
    const markdownPath = resolve(repositoryRoot, options.markdown);
    await mkdir(dirname(markdownPath), { recursive: true });
    await writeFile(markdownPath, `${table}\n\n${surfaceTable(cells)}\n`);
  }

  const failures = cells.flatMap((entry) => entry.failures);
  for (const pattern of neverMeasured) {
    failures.push(
      `${pattern.label} was never measured on any engine at any viewport ` +
        `(every instance hidden or absent). A check that never executed is not a pass.`,
    );
  }
  for (const row of arrivalErrors) {
    failures.push(
      `[${row.engine} ${row.viewport}] never arrived on ${row.surface}: ${row.arrivalError}. ` +
        `Whatever was measured there describes some other surface.`,
    );
  }

  const hiddenCells = cells.filter((entry) => entry.status === "N/A-HIDDEN");
  const passCells = cells.filter((entry) => entry.status === "PASS");
  const failCells = cells.filter(
    (entry) => entry.status === "FAIL" || entry.status === "NOT-FOUND",
  );
  console.log(
    `\n${cells.length} graded cell(s) across ${options.engines.join(" + ")} ` +
      `x ${options.viewports.length} viewport(s): ${passCells.length} PASS, ` +
      `${failCells.length} FAIL/NOT-FOUND, ${hiddenCells.length} N/A-HIDDEN (neither).`,
  );
  console.log(
    `Instances: ${cells.reduce((total, entry) => total + entry.sampleCount, 0)} found, ` +
      `${cells.reduce((total, entry) => total + entry.measuredCount, 0)} graded, ` +
      `${cells.reduce((total, entry) => total + entry.hiddenCount, 0)} N/A-HIDDEN.`,
  );
  for (const failure of failures) console.log(`  - ${failure}`);
  console.log(
    `bar=centerDeltaPx <= ${BAR_CENTER_DELTA_PX}px; mode=${options.mode}; json=${options.json}`,
  );
  if (options.mode === "gate" && failures.length > 0) process.exitCode = 1;
}

/** One full pass of the catalogue, on one engine, across every viewport. */
async function runEngine(engine, baseUrl, options, selected, surfaceRows) {
  const session = `${options.session}-${engine}`;
  await killStraySessions(session);
  const browser =
    engine === "webkit" ? new WebkitBrowser(session) : new Browser(session);
  try {
    await openWithRetry(browser, baseUrl);
    await browser.device("iPhone 14");

    for (const viewport of options.viewports) {
      // Every viewport signs both fixture accounts in again, which across two
      // engines makes far more logins per identity than the limiter's ten. The
      // bucket is reset so a run fails for an alignment reason or not at all;
      // no limiter rule, window or count is changed anywhere.
      await run(
        "npx",
        ["tsx", "scripts/seed-density-fixture.ts", "--login-buckets-only"],
        { cwd: repositoryRoot, env: process.env },
      ).catch(() => undefined);
      await browser.viewport(viewport.width, viewport.height, viewport.scale);
      let account = null;

      for (const surface of selected) {
        if (surface.account !== account) {
          await resetToSignedOut(browser, baseUrl);
          if (surface.account === "onboarding") {
            await signIn(browser, ONBOARDING_EMAIL, ONBOARDING_PASSWORD);
            await waitFor(
              browser,
              `document.querySelector('main h1')?.textContent === "Create your plan"`,
              { timeout: 30000 },
            );
          } else if (surface.account === "fixture") {
            await signIn(browser, FIXTURE_EMAIL, FIXTURE_PASSWORD);
            await waitFor(
              browser,
              `document.querySelector('main h1')?.textContent === "Home"`,
              { timeout: 45000 },
            );
          }
          await settle(browser);
          account = surface.account;
        }

        const row = await measureSurface(
          browser,
          surface,
          viewport,
          options.failDemo,
        );
        surfaceRows.push(row);
        const found = row.patterns.reduce(
          (total, entry) => total + entry.instances.length,
          0,
        );
        console.log(
          `     ${row.engine.padEnd(8)} ${row.viewport.padEnd(9)} ${row.surfaceLabel.padEnd(30)} ` +
            `${found} instance(s)` +
            (row.arrivalError ? `  ARRIVAL ERROR: ${row.arrivalError}` : ""),
        );
      }
    }
  } finally {
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});

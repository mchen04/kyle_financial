#!/usr/bin/env node
// Mobile vertical-density harness.
//
// Drives the production build in a mobile-emulated headless Chromium, clicks
// its way to every product surface (the app is a single route; every "surface"
// is client state), and records six measured signals per surface, state, and
// viewport:
//
//   1. vertical cost in viewport heights (scrollHeight / innerHeight)
//   2. Cumulative Layout Shift, from the real Layout Instability API
//   3. the primary headline string at first paint and at settled state
//   4. count of visible interactive targets smaller than 44px
//   5. horizontal overflow (clientWidth !== scrollWidth)
//   6. count of console errors
//
// Nothing here estimates. Every number in the output was read out of a live
// page. Run `--mode capture` to record without gating, `--mode gate` (default)
// to exit non-zero when a frozen bar is violated.
import { execFile, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const probeScript = resolve(repositoryRoot, "scripts/density-probe.js");

/**
 * Load `.env.local` into `process.env` so the harness runs in a clean shell.
 * The seeder, the build, and `next start` are all spawned with `process.env`,
 * so they inherit whatever is loaded here. Variables already present in the
 * environment win: an explicit `DATABASE_URL=… pnpm ui:density:measure` must
 * not be silently overridden by the file.
 */
function loadLocalEnvironment() {
  let contents;
  try {
    contents = readFileSync(resolve(repositoryRoot, ".env.local"), "utf8");
  } catch {
    return; // No file: rely on the ambient environment.
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
// Frozen bars. These come from the mission and are deliberately not tunable
// from the command line: a gate you can widen from its own invocation is not a
// gate. Changing them requires editing this file in a reviewed commit.
// ---------------------------------------------------------------------------
const BAR_CLS = 0.02;
const MINIMUM_TARGET_PX = 44;
const VERTICAL_BARS = {
  home: 1.0,
  standard: 3.0, // Budget, Activity, Monthly Wrap, Plan, Account
  deep: 4.0, // Benefits, Compare, Plan Details, sub-pages
  entry: 1.5, // Signed-out, Onboarding
};

const DEFAULT_VIEWPORTS = [
  { width: 390, height: 844, primary: true },
  { width: 360, height: 740, primary: false },
  { width: 430, height: 932, primary: false },
];
const DEVICE_SCALE_FACTOR = 3;

const FIXTURE_EMAIL = "density-fixture@localhost.test";
const FIXTURE_PASSWORD = "density-fixture-4Kx9-local-only";
const ONBOARDING_EMAIL = "density-onboarding@localhost.test";
const ONBOARDING_PASSWORD = "density-onboarding-4Kx9-local-only";

// ---------------------------------------------------------------------------
// Page-side expression builders
// ---------------------------------------------------------------------------
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

function clickSelector(selector) {
  return `(() => {
    const matches = [...document.querySelectorAll(${js(selector)})].filter((node) =>
      node.getBoundingClientRect().width > 0 && !node.disabled);
    if (matches.length === 0) throw new Error('no visible enabled element for: ' + ${js(selector)});
    matches[0].click();
    return matches.length;
  })()`;
}

// ---------------------------------------------------------------------------
// Surface catalogue.
//
// `prefix` navigates somewhere else first so the measured step is always a real
// transition — clicking through to a surface you are already on renders nothing
// and would silently produce a zero-shift, no-headline-sample reading.
// `nav` is the measured step: the layout-shift and headline recording window
// opens immediately before it.
// ---------------------------------------------------------------------------
const SURFACES = [
  {
    id: "signed-out-create-account",
    label: "Signed out · create account (cold load)",
    account: "none",
    bar: VERTICAL_BARS.entry,
    prefix: [],
    nav: [RELOAD_STEP],
    expect: `document.querySelector('main h1#welcome-title') !== null && document.querySelector('main h2')?.textContent === "Create account"`,
  },
  {
    id: "signed-out-sign-in",
    label: "Signed out · sign in",
    account: "none",
    bar: VERTICAL_BARS.entry,
    prefix: [],
    nav: [clickExact("Already have an account? Sign in")],
    expect: `document.querySelector('main h2')?.textContent === "Sign in"`,
  },
  {
    id: "onboarding",
    label: "Onboarding · cold load",
    account: "onboarding",
    bar: VERTICAL_BARS.entry,
    prefix: [],
    nav: [RELOAD_STEP],
    expect: `document.querySelector('main h1')?.textContent === "Create your plan"`,
  },
  {
    id: "home",
    label: "Home",
    account: "fixture",
    bar: VERTICAL_BARS.home,
    prefix: [clickExact("Plan")],
    nav: [clickExact("Home")],
    expect: `document.querySelector('main h1')?.textContent === "Home"`,
  },
  {
    id: "home-cold-load",
    label: "Home · cold load",
    account: "fixture",
    bar: VERTICAL_BARS.home,
    prefix: [],
    nav: [RELOAD_STEP],
    expect: `document.querySelector('main h1')?.textContent === "Home"`,
  },
  {
    id: "budget",
    label: "Budget",
    account: "fixture",
    bar: VERTICAL_BARS.standard,
    prefix: [clickExact("Home")],
    nav: [clickExact("Budget")],
    expect: `document.querySelector('main header p')?.textContent === "Budget" && /^\\$[\\d,]+ (planned spending|over|safe to spend)$/.test(document.querySelector('main h1')?.textContent ?? "")`,
  },
  {
    id: "budget-future-month",
    label: "Budget · future month",
    account: "fixture",
    bar: VERTICAL_BARS.standard,
    prefix: [clickExact("Home"), clickExact("Budget")],
    nav: [clickSelector('button[aria-label="Next month"]')],
    expect: `document.querySelector('main h1')?.textContent?.endsWith(" planned spending") === true`,
    // The selected period is app-wide state. Leaving it in the future would
    // disable Monthly wrap and silently change every later measurement.
    after: [clickSelector('button[aria-label="Previous month"]')],
  },
  {
    id: "activity",
    label: "Activity",
    account: "fixture",
    bar: VERTICAL_BARS.standard,
    prefix: [clickExact("Home")],
    nav: [clickExact("Activity")],
    expect: `document.querySelector('main h1')?.textContent === "Activity"`,
  },
  {
    id: "activity-empty-search",
    label: "Activity · empty search",
    account: "fixture",
    bar: VERTICAL_BARS.standard,
    prefix: [clickExact("Home"), clickExact("Activity")],
    nav: [
      `(() => {
        const field = document.querySelector('main input[type="search"]');
        if (!field) throw new Error('no activity search field');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(field, 'density-no-such-expense');
        field.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`,
    ],
    expect: `document.querySelector('main h2')?.textContent === "No matching expenses"`,
    after: [
      `(() => {
        const field = document.querySelector('main input[type="search"]');
        if (!field) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(field, '');
        field.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`,
    ],
  },
  {
    id: "category-detail",
    label: "Category detail · Dining out",
    account: "fixture",
    bar: VERTICAL_BARS.deep,
    prefix: [clickExact("Home"), clickExact("Budget")],
    nav: [clickContains("Dining out")],
    expect: `document.querySelector('main h1')?.textContent === "Dining out" && document.querySelector('main header button[aria-label="Back to Budget"]') !== null`,
  },
  {
    id: "edit-budget",
    label: "Edit budget",
    account: "fixture",
    bar: VERTICAL_BARS.deep,
    prefix: [clickExact("Home"), clickExact("Budget")],
    nav: [clickExact("Edit budget")],
    expect: `document.querySelector('main h1')?.textContent === "Edit monthly budget"`,
  },
  {
    id: "manage-categories",
    label: "Manage categories",
    account: "fixture",
    bar: VERTICAL_BARS.deep,
    prefix: [clickExact("Home"), clickExact("Budget")],
    nav: [clickExact("Manage categories")],
    expect: `document.querySelector('main h1')?.textContent === "Manage categories"`,
  },
  {
    id: "monthly-wrap",
    label: "Monthly wrap",
    account: "fixture",
    bar: VERTICAL_BARS.standard,
    prefix: [clickExact("Plan"), clickExact("Home")],
    nav: [clickContains("Monthly wrap")],
    expect: `/\\swrap$/.test(document.querySelector('main h1')?.textContent ?? "") && document.querySelector('main header p')?.textContent === "Budget"`,
  },
  {
    id: "plan",
    label: "Plan",
    account: "fixture",
    bar: VERTICAL_BARS.standard,
    prefix: [clickExact("Home")],
    nav: [clickExact("Plan")],
    expect: `/ annual plan$/.test(document.querySelector('main header p')?.textContent ?? "") && /cash savings planned\\.$/.test(document.querySelector('main h1')?.textContent ?? "")`,
  },
  {
    id: "plan-details",
    label: "Plan details",
    account: "fixture",
    bar: VERTICAL_BARS.deep,
    prefix: [clickExact("Home"), clickExact("Plan")],
    nav: [clickContains("Plan details")],
    expect: `document.querySelectorAll('main h1')[0]?.textContent === "Plan details"`,
  },
  {
    id: "benefits",
    label: "Benefits",
    account: "fixture",
    bar: VERTICAL_BARS.deep,
    prefix: [clickExact("Home"), clickExact("Plan")],
    nav: [clickContains("Benefits")],
    expect: `document.querySelectorAll('main h1')[0]?.textContent === "Benefits" && document.querySelector('main select[aria-label="Add benefit"]') !== null`,
  },
  {
    id: "compare",
    label: "Compare years",
    account: "fixture",
    bar: VERTICAL_BARS.deep,
    prefix: [clickExact("Home"), clickExact("Plan")],
    nav: [clickContains("Compare years")],
    expect: `document.querySelectorAll('main h1')[0]?.textContent === "Compare years"`,
  },
  {
    id: "account",
    label: "Account",
    account: "fixture",
    bar: VERTICAL_BARS.standard,
    prefix: [clickExact("Home")],
    nav: [clickSelector('button[aria-label="Open account"]')],
    expect: `document.querySelector('main h1')?.textContent === "Account and data"`,
  },
  {
    id: "fast-log-new",
    label: "Fast Log · new expense",
    account: "fixture",
    bar: VERTICAL_BARS.deep,
    prefix: [clickExact("Home")],
    nav: [clickSelector('button[aria-label="Fast Log expense"]')],
    expect: `document.querySelector('[role="dialog"][aria-modal="true"] h2#fast-log-title')?.textContent === "Fast Log"`,
    after: [clickSelector('button[aria-label="Close Fast Log"]')],
  },
  {
    id: "fast-log-edit",
    label: "Fast Log · edit expense",
    account: "fixture",
    bar: VERTICAL_BARS.deep,
    prefix: [clickExact("Home"), clickExact("Activity")],
    nav: [clickContains("Lunch out")],
    expect: `document.querySelector('[role="dialog"][aria-modal="true"] h2#fast-log-title')?.textContent === "Edit expense"`,
    after: [clickSelector('button[aria-label="Close Fast Log"]')],
  },
];

// ---------------------------------------------------------------------------
// FAIL-DEMO injections. Each mutates the live page through the browser only —
// no application source is touched — so a check that has never gone red can be
// proven to go red on demand.
// ---------------------------------------------------------------------------
const FAIL_DEMOS = {
  vh: `(() => {
    const host = document.querySelector('main') ?? document.body;
    host.style.paddingBottom = '4000px';
    return 'vh: 4000px of padding added to the scrolling content region';
  })()`,
  // Delayed past the 500ms hadRecentInput exclusion window so the shift counts.
  cls: `setTimeout(() => {
    const host = document.querySelector('main');
    const block = document.createElement('div');
    block.style.height = '220px';
    host.prepend(block);
  }, 900); 'cls: 220px block prepended to main at +900ms'`,
  headline: `setTimeout(() => {
    const heading = document.querySelector('main h1');
    if (heading) heading.textContent = '$0 planned spending';
  }, 900); 'headline: main h1 rewritten at +900ms'`,
  touch: `(() => {
    const button = document.createElement('button');
    button.textContent = 'x';
    button.style.cssText = 'width:20px;height:20px;min-width:0;min-height:0;padding:0';
    document.querySelector('main').prepend(button);
    return 'touch: 20x20 button prepended to main';
  })()`,
  overflow: `(() => {
    document.body.style.width = '3000px';
    return 'overflow: document body widened to 3000px';
  })()`,
  console: `console.error('density fail-demo: injected console error'); 'console: one console.error emitted'`,
};

// ---------------------------------------------------------------------------
// Metric readout. Runs once per surface/state/viewport, after settle.
// ---------------------------------------------------------------------------
const MEASURE = `(() => {
  const probe = window.__density;
  if (!probe) throw new Error('density probe was not installed');
  const since = probe.markTime;
  const shifts = probe.shifts.filter((entry) => entry.startTime >= since);

  // Session-window CLS, per web.dev: group shifts into windows that end after
  // 5s of window duration or a 1s gap, and report the largest window's sum.
  let maximum = 0;
  let current = 0;
  let windowStart = 0;
  let previous = 0;
  for (const shift of shifts) {
    if (current > 0 && (shift.startTime - windowStart > 5000 || shift.startTime - previous > 1000)) {
      current = 0;
    }
    if (current === 0) windowStart = shift.startTime;
    current += shift.value;
    previous = shift.startTime;
    if (current > maximum) maximum = current;
  }

  const style = (node) => getComputedStyle(node);
  const isVisible = (node) => {
    const rect = node.getBoundingClientRect();
    const computed = style(node);
    return rect.width > 0 && rect.height > 0 &&
      computed.visibility !== 'hidden' && computed.display !== 'none';
  };
  const targetRect = (node) =>
    ['checkbox', 'radio'].includes(node.getAttribute('type')) && node.closest('label')
      ? node.closest('label').getBoundingClientRect()
      : node.getBoundingClientRect();
  const controls = [...document.querySelectorAll('button,input,select,textarea,a')];
  const small = controls.filter(
    (node) => isVisible(node) && (targetRect(node).width < 43.5 || targetRect(node).height < 43.5),
  );

  const root = document.documentElement;

  // This app is a fixed-viewport shell: <html> is pinned to 100dvh and the
  // product content scrolls inside <main>. So documentElement.scrollHeight is
  // identically window.innerHeight on every surface and cannot express
  // density. Both numbers are reported: documentScrollCost is the literal
  // document metric, verticalCost is the real content cost that gates.
  //
  // verticalCost takes the tallest scrollable region that occupies a
  // substantial share of the viewport, so a surface cannot hide height by
  // moving it into a nested scroller, while small inline scroll boxes (a
  // clipped heading, a chart legend) are ignored.
  //
  // When a modal sheet is open the sheet is the surface under measurement, so
  // it is scoped to instead of the page behind it — which has its own row.
  const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
  const scope = dialog ?? root;
  const candidates = [scope, ...scope.querySelectorAll('*')].filter((node) => {
    if (node === scope) return true;
    const overflowY = style(node).overflowY;
    if (overflowY !== 'auto' && overflowY !== 'scroll') return false;
    return node.clientHeight >= window.innerHeight * 0.4;
  });
  const measured = candidates.reduce(
    (tallest, node) => (node.scrollHeight > tallest.scrollHeight ? node : tallest),
    scope,
  );
  const contentHeight = dialog
    ? measured.scrollHeight
    : Math.max(root.scrollHeight, measured.scrollHeight);

  const errors = probe.consoleErrors.filter((entry) => entry.at >= since);
  const headlines = probe.headlines.filter((entry) => entry.at >= since);
  return JSON.stringify({
    scrollHeight: contentHeight,
    documentScrollHeight: root.scrollHeight,
    measuredRegion: measured === root
      ? 'documentElement'
      : (dialog ? 'dialog:' : '') +
        measured.tagName.toLowerCase() +
        (measured.id ? '#' + measured.id : ''),
    innerHeight: window.innerHeight,
    documentScrollCost: root.scrollHeight / window.innerHeight,
    verticalCost: contentHeight / window.innerHeight,
    cls: maximum,
    shiftCount: shifts.length,
    // The first headline the surface itself painted. Samples taken while the
    // branded loading placeholder was mounted are not this surface's headline,
    // so they are excluded — otherwise every cold load reads as a swap and the
    // real defect class (a settled headline mutating) would be lost in noise.
    // No qualifying sample means the headline never changed during the window,
    // so first paint is by definition the settled value.
    headlineFirstPaint:
      (headlines.find((entry) => !entry.busy) ?? { text: probe.headline() }).text,
    headlineSettled: probe.headline(),
    headlineSamples: headlines.map((entry) => ({ text: entry.text, busy: entry.busy })),
    smallTargets: small.length,
    smallTargetDetail: small.slice(0, 10).map((node) => ({
      label: (node.getAttribute('aria-label') || node.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 48),
      width: Math.round(targetRect(node).width * 10) / 10,
      height: Math.round(targetRect(node).height * 10) / 10,
    })),
    horizontalOverflow: root.clientWidth !== root.scrollWidth,
    clientWidth: root.clientWidth,
    scrollWidth: root.scrollWidth,
    consoleErrors: errors.length,
    consoleErrorDetail: errors.slice(0, 5).map((entry) => entry.message),
    observerError: probe.observerError,
    devicePixelRatio: window.devicePixelRatio,
    // Recorded as evidence of what the emulation actually delivered. The UA and
    // device scale are real; maxTouchPoints reads 0, so this harness does not
    // prove anything about real touch input (see the residuals in the report).
    maxTouchPoints: navigator.maxTouchPoints,
    userAgent: navigator.userAgent,
  });
})()`;

// ---------------------------------------------------------------------------
// agent-browser driver
// ---------------------------------------------------------------------------
class Browser {
  constructor(session) {
    this.session = session;
  }

  async call(args) {
    const { stdout } = await run(
      "agent-browser",
      ["--session", this.session, ...args],
      {
        maxBuffer: 32 * 1024 * 1024,
      },
    );
    return stdout;
  }

  async open(url) {
    await this.call(["open", "--init-script", probeScript, url]);
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

async function waitFor(
  browser,
  expression,
  { timeout = 15000, interval = 120 } = {},
) {
  const deadline = Date.now() + timeout;
  let last = null;
  for (;;) {
    try {
      const value = await browser.evaluate(`Boolean(${expression})`);
      if (value === true || value === "true") return;
      last = value;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    if (Date.now() > deadline) {
      throw new Error(
        `timed out waiting for: ${expression} (last: ${JSON.stringify(last)})`,
      );
    }
    await delay(interval);
  }
}

/**
 * Network idle, then one further second, matching the measurement window the
 * mission defines. `inflight` is maintained by the probe's fetch wrapper, so
 * this tracks the SPA's own API calls rather than only document load.
 */
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
  await delay(1000);
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
  await browser.evaluate(`window.__density.reset()`);
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

  // A full reload restarts the probe in a fresh document whose mark is 0, so a
  // cold-load surface is measured from the very first layout shift and the very
  // first headline paint — exactly what a late-settling headline swap needs.
  const coldLoad = surface.nav.includes(RELOAD_STEP);
  let markTime = 0;
  if (!coldLoad) markTime = await browser.evaluate(`window.__density.reset()`);
  for (const step of surface.nav) {
    if (step === RELOAD_STEP) {
      await browser.reload();
    } else {
      await browser.evaluate(step);
    }
    await delay(60);
  }

  let injection = null;
  if (failDemo) {
    injection = await browser.evaluate(FAIL_DEMOS[failDemo]);
  }

  let arrivalError = null;
  try {
    await waitFor(browser, surface.expect);
  } catch (error) {
    arrivalError = error instanceof Error ? error.message : String(error);
  }
  await settle(browser);

  const metrics = await browser.evaluateJson(MEASURE);
  for (const step of surface.after ?? []) {
    await browser.evaluate(step).catch(() => undefined);
  }
  await delay(150);

  return {
    surface: surface.id,
    label: surface.label,
    viewport: `${viewport.width}x${viewport.height}`,
    primaryViewport: viewport.primary,
    bar: surface.bar,
    markTime,
    arrivalError,
    injection,
    ...metrics,
  };
}

function violations(row, mode) {
  if (mode === "capture") return [];
  const failures = [];
  if (row.arrivalError)
    failures.push(`did not reach surface: ${row.arrivalError}`);
  if (row.verticalCost > row.bar) {
    failures.push(
      `vertical cost ${row.verticalCost.toFixed(3)} VH exceeds ${row.bar.toFixed(1)} VH`,
    );
  }
  if (row.cls > BAR_CLS)
    failures.push(`CLS ${row.cls.toFixed(4)} exceeds ${BAR_CLS}`);
  if (row.headlineFirstPaint !== row.headlineSettled) {
    failures.push(
      `headline changed between first paint and settled: ${JSON.stringify(row.headlineFirstPaint)} -> ${JSON.stringify(row.headlineSettled)}`,
    );
  }
  if (row.smallTargets > 0) {
    failures.push(
      `${row.smallTargets} interactive target(s) under ${MINIMUM_TARGET_PX}px: ${JSON.stringify(row.smallTargetDetail)}`,
    );
  }
  if (row.horizontalOverflow) {
    failures.push(
      `horizontal overflow: clientWidth ${row.clientWidth} !== scrollWidth ${row.scrollWidth}`,
    );
  }
  if (row.consoleErrors > 0) {
    failures.push(
      `${row.consoleErrors} console error(s): ${JSON.stringify(row.consoleErrorDetail)}`,
    );
  }
  return failures;
}

function markdownTable(rows) {
  const cell = (value) => String(value).replace(/\|/g, "\\|");
  const lines = [
    "| Surface | State | Viewport | VH | CLS | Headline first paint | Headline settled | Swap | <44px | Overflow | Console errors | Bar | Over bar by |",
    "| --- | --- | --- | ---: | ---: | --- | --- | --- | ---: | --- | ---: | ---: | ---: |",
  ];
  for (const row of rows) {
    const [surface, ...rest] = row.label.split(" · ");
    const state = rest.join(" · ") || "default";
    const swap =
      row.headlineFirstPaint !== row.headlineSettled ? "**YES**" : "no";
    const over = row.verticalCost - row.bar;
    lines.push(
      `| ${cell(surface)} | ${cell(state)} | ${row.viewport} | ${row.verticalCost.toFixed(3)} | ${row.cls.toFixed(4)} | ${cell(row.headlineFirstPaint ?? "—")} | ${cell(row.headlineSettled ?? "—")} | ${swap} | ${row.smallTargets} | ${row.horizontalOverflow ? "**yes**" : "no"} | ${row.consoleErrors} | ${row.bar.toFixed(1)} | ${over > 0 ? `**+${over.toFixed(3)}**` : "—"} |`,
    );
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

function parseArguments(argv) {
  const options = {
    mode: "gate",
    port: 3211,
    baseUrl: null,
    build: true,
    seed: true,
    // Never default to the frozen BEFORE evidence. That file is the baseline
    // the whole mission is measured against, and a bare `pnpm ui:density:measure`
    // used to silently overwrite it with whatever subset of surfaces was being
    // spot-checked. Writing the baseline is now an explicit `--json` opt-in.
    json: "docs/evidence/mobile-density-latest.json",
    markdown: null,
    surfaces: null,
    viewports: DEFAULT_VIEWPORTS,
    failDemo: null,
    session: "density-baseline",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => argv[(index += 1)];
    switch (argument) {
      // `pnpm ui:density:measure -- --mode capture` forwards the separator.
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
      case "--viewports":
        options.viewports = next()
          .split(",")
          .map((entry, order) => {
            const [width, height] = entry.split("x").map(Number);
            return { width, height, primary: order === 0 };
          });
        break;
      case "--fail-demo":
        options.failDemo = next();
        break;
      case "--session":
        options.session = next();
        break;
      default:
        throw new Error(`unknown argument: ${argument}`);
    }
  }
  if (!["gate", "capture"].includes(options.mode)) {
    throw new Error(`--mode must be gate or capture, got ${options.mode}`);
  }
  if (options.failDemo && !(options.failDemo in FAIL_DEMOS)) {
    throw new Error(
      `--fail-demo must be one of ${Object.keys(FAIL_DEMOS).join(", ")}, got ${options.failDemo}`,
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

  const browser = new Browser(options.session);
  const rows = [];
  try {
    await browser.open(baseUrl);
    await browser.device("iPhone 14");

    for (const viewport of options.viewports) {
      await browser.viewport(
        viewport.width,
        viewport.height,
        DEVICE_SCALE_FACTOR,
      );
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
        row.failures = violations(row, options.mode);
        rows.push(row);
        const status = row.failures.length === 0 ? "ok" : "FAIL";
        console.log(
          `${status.padEnd(4)} ${row.viewport.padEnd(8)} ${row.label.padEnd(32)} ` +
            `${row.verticalCost.toFixed(3)} VH  CLS ${row.cls.toFixed(4)}  ` +
            `<44px ${row.smallTargets}  overflow ${row.horizontalOverflow}  errors ${row.consoleErrors}`,
        );
        for (const failure of row.failures) console.log(`       - ${failure}`);
      }
    }
  } finally {
    await browser.close();
    if (server) server.kill("SIGTERM");
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: options.mode,
    failDemo: options.failDemo,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    bars: {
      vertical: VERTICAL_BARS,
      cls: BAR_CLS,
      minimumTargetPx: MINIMUM_TARGET_PX,
    },
    rows,
  };
  const jsonPath = resolve(repositoryRoot, options.json);
  await mkdir(dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

  const table = markdownTable(rows);
  console.log(`\n${table}\n`);
  if (options.markdown) {
    const markdownPath = resolve(repositoryRoot, options.markdown);
    await mkdir(dirname(markdownPath), { recursive: true });
    await writeFile(markdownPath, `${table}\n`);
  }

  const failing = rows.filter((row) => row.failures.length > 0);
  console.log(
    `${rows.length} measurement(s); ${failing.length} violating row(s); mode=${options.mode}; json=${options.json}`,
  );
  if (options.mode === "gate" && failing.length > 0) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});

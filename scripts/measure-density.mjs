#!/usr/bin/env node
// Mobile vertical-density harness.
//
// Drives the production build in a mobile-emulated headless browser, clicks its
// way to every product surface (the app is a single route; every "surface" is
// client state), and records six measured signals per surface, state, and
// viewport:
//
//   1. vertical cost in viewport heights (scrollHeight / innerHeight)
//   2. Cumulative Layout Shift, from the real Layout Instability API
//   3. the primary headline string at first paint and at settled state
//   4. count of visible interactive targets smaller than 44px
//   5. horizontal overflow (clientWidth !== scrollWidth)
//   6. count of console errors
//
// and, on a surface that declares the mission's long-list exemption, two more:
//
//   7. chrome above the first list row, in viewport heights (this gates)
//   8. the height of every list row, tallied (this is reported for review)
//
// Nothing here estimates. Every number in the output was read out of a live
// page. Run `--mode capture` to record without gating, `--mode gate` (default)
// to exit non-zero when a frozen bar is violated.
//
// ---------------------------------------------------------------------------
// TWO ENGINES, AND WHY (L9)
// ---------------------------------------------------------------------------
// This harness used to run Chromium only, and reported `smallTargets: 0` on all
// 63 rows while the product shipped 49 sub-44px control instances, across 19 of
// its 21 surface states, to iPhone Safari. The cause was measured, not guessed,
// and it is a real engine divergence in the one place rule 4 lives — native
// form controls:
//
//   <select style="min-height:44px">                chromium 75x44   webkit 75x44
//   <select style="min-height:44px; padding:0 32px 0 8px">
//                                                   chromium 115x44  webkit 115x44
//   <select style="min-height:44px; border:1px solid">
//                                                   chromium 104x44  webkit  73x23
//   <select style="min-height:44px; border-radius:6px">
//                                                   chromium 104x44  webkit  73x23
//   <select style="min-height:44px; background:#fff">
//                                                   chromium 104x44  webkit  73x23
//   <select style="min-height:44px; appearance:none">
//                                                   chromium  41x44  webkit  41x44
//
// The moment an author paints a `<select>` — any border, any border-radius, any
// background — WebKit leaves the native menulist theme for its "styled
// menulist" path, and that path's user-agent rules override the author's own:
// `getComputedStyle(select).minHeight` reads **18px** on a control the
// stylesheet set to 44px, and author padding computes to 0. Chromium honours
// the author value in every case. So the app's real `select[aria-label="Plan
// year"]` measures **104x44 in Chromium and 76x23 in WebKit** — the same DOM,
// the same CSS, the same viewport. The Chromium 0 was true about Chromium and
// false about the product.
//
// The harness's own target-size filter was never wrong; it was pointed at the
// wrong engine. So this is additive:
//
//   * Chromium keeps every measurement it had. The Layout Instability API is
//     Chromium-only (WebKit does not implement `layout-shift`), so CLS, frame
//     liveness, headline swaps and the vertical bars stay where they were.
//   * WebKit runs the same catalogue and gates the geometry that diverges:
//     target size, computed font size, text fit and horizontal overflow.
//
// Every row carries `engine`, and the markdown table prints it, so no number in
// the output is ambiguous about where it came from. `appearance: none` is the
// one setting both engines agree on, which is why the product now uses it for
// every select rather than 26 individual patches.
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
// HIG-T3. 11pt is the smallest size iOS treats as legible; the mission forbids
// reducing type below it to buy density.
const MINIMUM_FONT_SIZE_PX = 11;
// D4. Dead band a single-screen surface is allowed to leave unused. A compact
// two-line transaction row is 48px and its group gap is 16px, so anything at or
// above 64px is room a real row would have fitted in; 64px is therefore the
// largest band that cannot be blamed on content that could have filled it.
const BAR_SINGLE_SCREEN_SLACK_PX = 64;
// The mission's long-list exemption: "Lists that are legitimately long
// (transaction history, all-category rows) are exempt from the absolute cap for
// their row region only — but the chrome above the first row must cost <= 0.6 VH,
// and the per-row height must be justified against the research file."
//
// This is a NARROWER gate, not a looser one. A surface may only claim it by
// naming, in the frozen catalogue below, the selector of its own first list row
// (`listExemption`). The absolute VH bar is then reported but does not gate;
// what gates instead is the measured distance from the scroll region's content
// top to the top of that first row, plus the requirement that the rows actually
// exist. Per-row heights are measured and reported so the "justified against the
// research file" clause is checkable by a reader rather than asserted by an
// author. There is no command-line switch for any of this, and no surface
// without an explicit `listExemption` entry is affected in any way.
const BAR_CHROME_ABOVE_LIST = 0.6;
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
    // D4: Home is the one surface the mission requires to be a single screen at
    // every viewport, so it declares it and is gated on it.
    fitsWithoutScrolling: true,
    prefix: [clickExact("Plan")],
    nav: [clickExact("Home")],
    expect: `document.querySelector('main h1')?.textContent === "Home"`,
  },
  {
    id: "home-cold-load",
    label: "Home · cold load",
    account: "fixture",
    bar: VERTICAL_BARS.home,
    fitsWithoutScrolling: true,
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
    expect: `document.querySelector('main header p')?.textContent === "Budget" && /^\\$[\\d,]+ (planned spending|over|left to spend)$/.test(document.querySelector('main h1')?.textContent ?? "")`,
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
    // The heading used to be the literal string "Activity", which asserted only
    // that a label existed. It now carries the period total, so arrival asserts
    // the shape of the figure the surface exists to report — strictly more than
    // the old clause, and it fails if the answer ever stops being painted.
    expect: `/^\\$[\\d,]+ logged$/.test(document.querySelector('main h1')?.textContent ?? "")
      && document.querySelector('main header p')?.textContent === "Activity"`,
    // Transaction history — named verbatim by the mission as a legitimately
    // long list. 61 in-period rows at the 44px touch floor is already 3.180 VH
    // at 390x844 with zero chrome, so the 3.0 absolute cap is arithmetically
    // unreachable without breaking rule 4. The exemption applies to the row
    // region only; the chrome above the first row is gated at 0.6 VH instead.
    listExemption: {
      reason: "transaction history (named by the mission)",
      rowSelector: 'main [data-density-row="transaction"]',
    },
  },
  {
    id: "activity-empty-search",
    // The query is deliberately short. Its job is to match nothing, and a long
    // one only made the search field overflow itself — the harness measuring a
    // string the harness had just typed. Nothing about the state it produces
    // changes.
    label: "Activity · empty search",
    account: "fixture",
    bar: VERTICAL_BARS.standard,
    prefix: [clickExact("Home"), clickExact("Activity")],
    nav: [
      `(() => {
        const field = document.querySelector('main input[type="search"]');
        if (!field) throw new Error('no activity search field');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(field, 'zzq-no-match');
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
    // The second clause used to be `main header p === "Budget"`, which pinned a
    // defect rather than a behaviour: the detail header hardcoded the eyebrow
    // "Budget" while its back control was already dynamic, so this same surface
    // reached from Activity showed "Activity" beside "Budget". The eyebrow is
    // gone and the back control is now the only thing naming a destination, so
    // arrival asserts that it names the one this row actually came from —
    // strictly more than the old clause checked, and it fails if the header
    // ever goes back to answering "where am I?" twice.
    expect: `/\\swrap$/.test(document.querySelector('main h1')?.textContent ?? "") && document.querySelector('main header button[aria-label="Back to Home"]') !== null`,
  },
  {
    id: "plan",
    label: "Plan",
    account: "fixture",
    bar: VERTICAL_BARS.standard,
    prefix: [clickExact("Home")],
    nav: [clickExact("Plan")],
    // The 46.8px sentence is gone; the headline is now the monthly outcome, in
    // the same eyebrow + figure shape Budget uses. Both clauses still gate, and
    // the second one now pins a *number* rather than a trailing full stop.
    expect: `/ annual plan$/.test(document.querySelector('main header p')?.textContent ?? "") && /^\\$[\\d,]+ (saved|short) each month$/.test(document.querySelector('main h1')?.textContent ?? "")`,
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
  // D2, made into a gated row.
  //
  // The defect needs two things a happy-path fixture never supplies at once: a
  // device cache holding a plan year other than the one the server will answer
  // with, and a startup session request that fails for a reason other than 401.
  // Both are staged from the browser only — one IndexedDB row is deleted and
  // one URL is made to reject — so no application source, no sync decision, no
  // outbox entry and no service worker is involved, and nothing about what the
  // device stores changes: the authoritative refresh re-caches the year on the
  // way back. It is deterministic because the density fixture always seeds two
  // plan years and always caches both.
  //
  // Last in the catalogue on purpose: it leaves the app in a restored session,
  // and the viewport loop signs in again before the next pass.
  {
    id: "home-provisional-restore",
    label: "Home · cache restore awaiting the server",
    account: "fixture",
    bar: VERTICAL_BARS.home,
    singleAnswerPaint: true,
    fitsWithoutScrolling: true,
    prefix: [
      clickExact("Home"),
      `(() => {
        sessionStorage.setItem('__density_block', '/api/bootstrap');
        const open = (name) => new Promise((resolve, reject) => {
          const request = indexedDB.open(name);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const cachedYears = (db) => new Promise((resolve, reject) => {
          const request = db.transaction('plans', 'readonly').objectStore('plans').getAllKeys();
          request.onsuccess = () => resolve(request.result.map(Number));
          request.onerror = () => reject(request.error);
        });
        // The browser profile is shared across every surface in the run, so the
        // onboarding account has left its own (single-year, in fact empty)
        // database behind. Pick the multi-year one by inspection rather than by
        // enumeration order, which is not specified.
        const openFixtureDatabase = async () => {
          const databases = await indexedDB.databases();
          const names = databases
            .map((entry) => entry.name)
            .filter((entry) => entry && entry.startsWith('kyle-financial-account-'));
          if (names.length === 0) throw new Error('no account database on this device');
          for (const name of names) {
            const db = await open(name);
            if ((await cachedYears(db)).length >= 2) return db;
            db.close();
          }
          throw new Error('no cached account holds two plan years: ' + names.join(', '));
        };
        const removeNewestCachedYear = async () => {
          const db = await openFixtureDatabase();
          try {
            const years = await cachedYears(db);
            const newest = Math.max(...years);
            await new Promise((resolve, reject) => {
              const transaction = db.transaction('plans', 'readwrite');
              transaction.objectStore('plans').delete(newest);
              transaction.oncomplete = () => resolve();
              transaction.onerror = () => reject(transaction.error);
              transaction.onabort = () => reject(transaction.error);
            });
            // sessionStorage, not a window global: the measured step is a
            // reload, and the evidence that the cache really was made
            // multi-year-stale has to survive into the new document.
            sessionStorage.setItem('__densityD2', JSON.stringify({
              removedYear: newest,
              remainingYears: years.length - 1,
            }));
          } finally {
            db.close();
          }
        };
        sessionStorage.removeItem('__densityD2');
        removeNewestCachedYear().catch((error) => {
          sessionStorage.setItem('__densityD2', JSON.stringify({ error: String(error) }));
        });
        return 'd2: /api/bootstrap set to reject; newest cached plan year being removed';
      })()`,
    ],
    nav: [RELOAD_STEP],
    // Arrival requires all four: the surface is Home, the sabotage actually
    // fired, the cache really did lose a year (so the stale draft was a
    // different year from the server's), and nothing is left reserved.
    expect: `document.querySelector('main h1')?.textContent === "Home"
      && window.__density.blockedRequests > 0
      && JSON.parse(sessionStorage.getItem('__densityD2') ?? '{}').remainingYears >= 1
      && document.querySelector('main [data-reserved]') === null
      && /^\\$[\\d,]+$/.test(
        document.querySelector('main [role="meter"][aria-label="Spending budget used"]')
          ?.closest('section')?.querySelector('div > strong')?.textContent ?? '')`,
    after: [
      `sessionStorage.removeItem('__density_block');
       sessionStorage.removeItem('__densityD2');
       'd2: unblocked'`,
    ],
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
  // Repaints the primary answer with a second, different value under the same
  // label. It is the only injection that trips the single-answer-paint check,
  // and it deliberately puts the value back so that first paint still equals
  // settled — which is exactly the shape the generic headline check cannot see
  // and D2 had.
  answer: `setTimeout(() => {
    const meter = document.querySelector('main [role="meter"][aria-label="Spending budget used"]');
    const amount = meter && meter.closest('section').querySelector('div > strong');
    if (!amount) return;
    const settled = amount.textContent;
    amount.textContent = '$1';
    setTimeout(() => { amount.textContent = settled; }, 200);
  }, 900); 'answer: the primary answer repainted with a second value at +900ms'`,
  touch: `(() => {
    const button = document.createElement('button');
    button.textContent = 'x';
    button.style.cssText = 'width:20px;height:20px;min-width:0;min-height:0;padding:0';
    document.querySelector('main').prepend(button);
    return 'touch: 20x20 button prepended to main';
  })()`,
  // Drives the chrome above the first list row past 0.6 VH without touching the
  // rows themselves — the exact thing the long-list exemption still gates.
  chrome: `(() => {
    const host = document.querySelector('main');
    const block = document.createElement('div');
    block.style.height = '400px';
    host.prepend(block);
    return 'chrome: 400px block prepended above the list on the scrolling region';
  })()`,
  // Proves the exemption cannot go quietly vacuous: if the declared row
  // selector ever stops matching, the surface loses its only binding gate, so
  // that state has to fail rather than pass.
  listrows: `(() => {
    const rows = [...document.querySelectorAll('[data-density-row]')];
    for (const row of rows) row.removeAttribute('data-density-row');
    return 'listrows: data-density-row stripped from ' + rows.length + ' row(s)';
  })()`,
  // Puts one 9px string on the surface. Proves the legibility floor is a live
  // gate and not a column that happens to read zero.
  tiny: `(() => {
    const node = document.createElement('p');
    node.textContent = 'density fail-demo: nine pixel type';
    node.style.cssText = 'font-size:9px;margin:0';
    document.querySelector('main').prepend(node);
    return 'tiny: one 9px paragraph prepended to main';
  })()`,
  // Puts one nowrap box on the surface that is narrower than its own text and
  // clips it without an ellipsis — the DF1 shape exactly.
  clip: `(() => {
    const node = document.createElement('div');
    node.textContent = 'Health and pharmacy';
    node.style.cssText =
      'width:40px;white-space:nowrap;overflow:hidden;text-overflow:clip;font-size:16px';
    document.querySelector('main').prepend(node);
    return 'clip: one 40px nowrap box holding a 160px string, no ellipsis';
  })()`,
  // The hole the previous wave fell into, as a demo: the same too-narrow box,
  // this time ellipsising. Under the old gate this passed — the box "said it
  // was truncating" — while the reader still could not read the value. It must
  // now go red exactly like `clip` does, and it is the only demo that can tell
  // "the gate requires a fit" from "the gate requires an ellipsis".
  fit: `(() => {
    const node = document.createElement('div');
    node.textContent = 'Health and pharmacy';
    node.style.cssText =
      'width:40px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:16px';
    document.querySelector('main').prepend(node);
    return 'fit: one 40px nowrap box holding a 160px string, ellipsised';
  })()`,
  // Rule 4 against the engine the product ships on. A <select> the stylesheet
  // sizes to 44px, painted the way every select in this app is painted: in
  // Chromium it measures 44px and passes, in WebKit the styled-menulist path
  // overrides min-height to 18px and it measures ~23px. One injection, two
  // different answers — which is the whole reason there are two engines here.
  menulist: `(() => {
    const node = document.createElement('select');
    node.setAttribute('aria-label', 'density fail-demo menulist');
    node.innerHTML = '<option>2026</option>';
    node.style.cssText =
      'appearance:auto;min-height:44px;border:1px solid;border-radius:6px;font-size:16px';
    document.querySelector('main').prepend(node);
    return 'menulist: one author-painted 44px <select> prepended to main';
  })()`,
  // The same defect against the real controls instead of a synthetic one: undo
  // the single `appearance: none` the fix rests on and every <select> the
  // surface actually ships falls back to WebKit's styled-menulist path. This is
  // the demo that says how big the hole was, because it counts product
  // controls, not one injected node. On Chromium it changes nothing, which is
  // the point — the same injection is green on one engine and red on the other.
  "menulist-real": `(() => {
    const style = document.createElement('style');
    style.textContent = 'select { appearance: auto !important; }';
    document.head.append(style);
    return 'menulist-real: appearance:none removed from every <select> in the document';
  })()`,
  // The other half of the single-screen gate. Removing a real group leaves the
  // region holding less than it has room for, which is the 430x932 shape of D4
  // and reads identically to "fits" in every metric except slackPx.
  deadband: `(() => {
    const groups = [...document.querySelectorAll('main [data-home-group]')];
    for (const group of groups) group.style.display = 'none';
    return 'deadband: ' + groups.length + ' home group(s) hidden, leaving their height unused';
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
const measureExpression = (rowSelector) => `(() => {
  const rowSelector = ${js(rowSelector ?? null)};
  const probe = window.__density;
  if (!probe) throw new Error('density probe was not installed');
  const since = probe.markTime;
  const shifts = probe.shifts.filter((entry) => entry.startTime >= since);
  const geometricShifts = probe.geometricShifts.filter((entry) => entry.startTime >= since);

  // Session-window CLS, per web.dev: group shifts into windows that end after
  // 5s of window duration or a 1s gap, and report the largest window's sum.
  const sessionWindow = (entries) => {
    let maximum = 0;
    let current = 0;
    let windowStart = 0;
    let previous = 0;
    for (const shift of entries) {
      if (current > 0 && (shift.startTime - windowStart > 5000 || shift.startTime - previous > 1000)) {
        current = 0;
      }
      if (current === 0) windowStart = shift.startTime;
      current += shift.value;
      previous = shift.startTime;
      if (current > maximum) maximum = current;
    }
    return maximum;
  };
  const nativeCls = sessionWindow(shifts);
  const geometricCls = sessionWindow(geometricShifts);
  // The reported figure is the worse of the two. A browser that produces no
  // frames silently reports 0 from the native API; a browser that does produce
  // them reports both, and neither can hide a shift the other saw.
  const maximum = Math.max(nativeCls, geometricCls);

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
  // <summary> is the disclosure control of a <details>: it is tapped, it is
  // focusable, and it is the only way to reach what the <details> holds, so
  // rule 4 applies to it exactly as it does to a button. It was missing from
  // this list, which is why two 32px "Modeling notes" controls read as zero.
  const controls = [...document.querySelectorAll('button,input,select,textarea,a,summary')];
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

  // ---- long-list exemption measurement -------------------------------------
  // Only runs when the surface declared a row selector. "Chrome above the first
  // row" is the distance, in the scroll region's own content coordinates, from
  // the top of its content box to the top of the first list row: everything the
  // surface spends before the list begins. Row heights come straight from
  // getBoundingClientRect so a row that wraps on a narrow viewport is visible in
  // the output rather than averaged away.
  let listRegion = null;
  if (rowSelector) {
    const listRows = [...document.querySelectorAll(rowSelector)].filter(isVisible);
    if (listRows.length === 0) {
      listRegion = { rowSelector, rowCount: 0, error: 'no visible rows matched the declared selector' };
    } else {
      const regionRect = measured.getBoundingClientRect();
      const contentTop = regionRect.top + measured.clientTop - measured.scrollTop;
      const chrome = listRows[0].getBoundingClientRect().top - contentTop;
      const heights = listRows.map((node) =>
        Math.round(node.getBoundingClientRect().height * 100) / 100,
      );
      const tally = new Map();
      for (const height of heights) tally.set(height, (tally.get(height) ?? 0) + 1);
      listRegion = {
        rowSelector,
        rowCount: listRows.length,
        chromeAboveFirstRowPx: Math.round(chrome * 100) / 100,
        chromeAboveFirstRowCost: chrome / window.innerHeight,
        rowHeights: [...tally.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([height, count]) => ({ height, count })),
        rowRegionPx: Math.round(heights.reduce((sum, value) => sum + value, 0) * 100) / 100,
        error: null,
      };
    }
  }

  // ---- fit of the inner scroll region --------------------------------------
  // The app shell pins <html> to 100dvh and scrolls the product content inside
  // <main>, so documentElement.scrollHeight is identically window.innerHeight
  // and verticalCost reads exactly 1.000 on any single-screen surface — whether
  // that surface fits, overflows by 86px, or leaves 97px of dead band. That is
  // the whole of D4 and the VH bar is structurally blind to it. These two
  // numbers are the ones that can see it, measured on the region that actually
  // scrolls: overflow is content the reader must scroll to reach, slack is
  // reserved height nothing is using.
  const innerRegion = measured === root ? scope.querySelector('main') : measured;
  //
  // slackPx cannot come from scrollHeight: scrollHeight is floored at
  // clientHeight, so a region holding 626px of content in 723px of space
  // reports 723 and looks exactly like one that fits perfectly. The real
  // content extent is the bottom of the last laid-out child plus the region's
  // own bottom padding, which is the only figure that can tell "fits" from
  // "fits with 97px to spare".
  const innerScroll = !innerRegion
    ? null
    : (() => {
        const regionRect = innerRegion.getBoundingClientRect();
        const contentTop =
          regionRect.top + innerRegion.clientTop - innerRegion.scrollTop;
        const paddingBottom =
          Number.parseFloat(style(innerRegion).paddingBottom) || 0;
        let contentBottom = contentTop;
        for (const child of innerRegion.children) {
          const rect = child.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          if (style(child).position === 'fixed') continue;
          contentBottom = Math.max(contentBottom, rect.bottom + innerRegion.scrollTop);
        }
        const contentHeight =
          Math.round((contentBottom - contentTop + paddingBottom) * 10) / 10;
        return {
          clientHeight: innerRegion.clientHeight,
          scrollHeight: innerRegion.scrollHeight,
          contentHeight,
          overflowPx: Math.max(0, Math.round((contentHeight - innerRegion.clientHeight) * 10) / 10),
          slackPx: Math.max(0, Math.round((innerRegion.clientHeight - contentHeight) * 10) / 10),
        };
      })();

  // ---- legibility sweep (HIG-T3 / 11pt floor) ------------------------------
  // Every visible element that directly carries non-whitespace text, plus every
  // form control that shows a value, measured at its own computed font-size.
  // A relative unit compounding inside a nested scale (a UA-relative <small>
  // inside a 13px block, for instance) is invisible in source and only appears
  // here, which is the whole reason this is measured rather than grepped.
  const textCarriers = [...scope.querySelectorAll('*')].filter((node) => {
    if (!isVisible(node)) return false;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(node.tagName)) return false;
    const carriesOwnText = [...node.childNodes].some(
      (child) => child.nodeType === 3 && child.textContent.trim() !== '',
    );
    const carriesValue =
      (node.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'hidden'].includes(node.type)) ||
      node.tagName === 'SELECT' ||
      node.tagName === 'TEXTAREA';
    return carriesOwnText || carriesValue;
  });
  const tiny = textCarriers
    .map((node) => ({ node, size: Number.parseFloat(style(node).fontSize) }))
    .filter((entry) => entry.size < 10.995);
  const tinyType = {
    count: tiny.length,
    minFontSizePx:
      textCarriers.length === 0
        ? null
        : Math.round(
            Math.min(
              ...textCarriers.map((node) => Number.parseFloat(style(node).fontSize)),
            ) * 100,
          ) / 100,
    detail: tiny.slice(0, 8).map(({ node, size }) => ({
      size: Math.round(size * 100) / 100,
      tag: node.tagName.toLowerCase(),
      className: typeof node.className === 'string' ? node.className.slice(0, 60) : '',
      text: (node.textContent || node.value || '').replace(/\\s+/g, ' ').trim().slice(0, 48),
    })),
  };

  // ---- text-fit sweep (DF1 / D3 class) -------------------------------------
  // Any single-line box whose own content is wider than the box it is painted
  // in. An <input> reports this through scrollWidth directly; a nowrap element
  // that clips reports it the same way. What is measured is whether the text
  // FITS. The text-overflow value is recorded beside each entry as evidence of
  // how the overflow is being presented, but it is not an exemption: an
  // ellipsised box is still a box the reader cannot read the value out of.
  const clipCandidates = [...scope.querySelectorAll('input,textarea,select,[data-density-clip]')]
    .concat(
      [...scope.querySelectorAll('*')].filter((node) => {
        const computed = style(node);
        return (
          computed.whiteSpace === 'nowrap' &&
          ['hidden', 'clip'].includes(computed.overflowX) &&
          node.children.length === 0
        );
      }),
    )
    // A visually-hidden label is a 1x1 clipped box by construction and always
    // "overflows"; it is not a box a reader can be shown a cut word in.
    .filter(
      (node) =>
        isVisible(node) &&
        node.tagName !== 'SELECT' &&
        node.clientWidth >= 8 &&
        node.clientHeight >= 8,
    );
  const clipped = [...new Set(clipCandidates)]
    .map((node) => ({
      node,
      overflowPx: Math.round((node.scrollWidth - node.clientWidth) * 10) / 10,
      ellipsis: style(node).textOverflow === 'ellipsis',
    }))
    .filter((entry) => entry.overflowPx > 1);
  const clippedText = {
    count: clipped.length,
    detail: clipped.slice(0, 8).map(({ node, overflowPx, ellipsis }) => ({
      overflowPx,
      ellipsis,
      tag: node.tagName.toLowerCase(),
      label: (node.getAttribute('aria-label') || node.getAttribute('name') || '').slice(0, 40),
      text: (node.value ?? node.textContent ?? '').replace(/\\s+/g, ' ').trim().slice(0, 48),
      clientWidth: Math.round(node.clientWidth * 10) / 10,
      scrollWidth: Math.round(node.scrollWidth * 10) / 10,
    })),
  };

  // ---- datum density (the judge's method, reported not gated) --------------
  // Leaf text nodes lying fully inside the first viewport, per 100px of the
  // scroll region's own visible height, with the region at scrollTop 0. Form
  // controls that show a value are counted separately, because a category name
  // living in an <input> is a datum a reader reads but not a text node.
  const densityRegion = (() => {
    const priorScroll = measured === root ? window.scrollY : measured.scrollTop;
    if (measured === root) window.scrollTo(0, 0); else measured.scrollTop = 0;
    const regionRect = measured === root
      ? { top: 0, height: window.innerHeight }
      : measured.getBoundingClientRect();
    const top = Math.max(0, regionRect.top);
    const bottom = Math.min(window.innerHeight, regionRect.top + regionRect.height);
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let textNodes = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.textContent.trim() === '') continue;
      const parent = node.parentElement;
      if (!parent || !isVisible(parent)) continue;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) continue;
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      if (rect.height === 0 && rect.width === 0) continue;
      if (rect.top >= top - 0.5 && rect.bottom <= bottom + 0.5) textNodes += 1;
    }
    const valueControls = [...scope.querySelectorAll('input,select,textarea')].filter((node) => {
      if (!isVisible(node)) return false;
      if (['checkbox', 'radio', 'hidden'].includes(node.type)) return false;
      if (!(node.value ?? '').toString().trim()) return false;
      const rect = node.getBoundingClientRect();
      return rect.top >= top - 0.5 && rect.bottom <= bottom + 0.5;
    }).length;
    const per100 = Math.max(1, bottom - top) / 100;
    if (measured === root) window.scrollTo(0, priorScroll); else measured.scrollTop = priorScroll;
    return {
      regionHeightPx: Math.round((bottom - top) * 10) / 10,
      textNodes,
      valueControls,
      datumPer100px: Math.round((textNodes / per100) * 100) / 100,
      datumWithControlsPer100px:
        Math.round(((textNodes + valueControls) / per100) * 100) / 100,
    };
  })();

  const errors = probe.consoleErrors.filter((entry) => entry.at >= since);
  const headlines = probe.headlines.filter((entry) => entry.at >= since);
  return JSON.stringify({
    listRegion,
    innerScroll,
    tinyType,
    clippedText,
    densityRegion,
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
    clsNative: nativeCls,
    clsGeometric: geometricCls,
    clsSource: geometricCls > nativeCls ? 'geometric' : (nativeCls > 0 ? 'layout-shift API' : 'both zero'),
    shiftCount: shifts.length,
    // The largest few shifts with the elements the browser says moved, so a red
    // CLS row names its own cause instead of sending a reader guessing.
    shiftDetail: [...shifts]
      .sort((left, right) => right.value - left.value)
      .slice(0, 4)
      .map((entry) => ({
        value: Math.round(entry.value * 1e6) / 1e6,
        startTime: Math.round(entry.startTime),
        sources: entry.sources ?? [],
      })),
    geometricShiftCount: geometricShifts.length,
    geometricScrollSkips: probe.geometricScrollSkips,
    geometricSamples: probe.geometricSamples,
    // Frames produced since the document loaded. Zero means the native
    // Layout Instability API emitted nothing because it could not, so its 0.0000
    // is an absence of measurement rather than an absence of movement, and the
    // geometric figure beside it is the only real reading.
    frameTicks: probe.frameTicks,
    // A settle window is over a second long, so a compositor that is actually
    // running produces dozens of frames. One or two (the frame the document
    // load forces) is not liveness, so the threshold is deliberately above it.
    nativeLayoutShiftLive: probe.frameTicks > 5,
    // The first headline the surface itself painted. Samples taken while the
    // branded loading placeholder was mounted are not this surface's headline,
    // so they are excluded — otherwise every cold load reads as a swap and the
    // real defect class (a settled headline mutating) would be lost in noise.
    // No qualifying sample means the headline never changed during the window,
    // so first paint is by definition the settled value.
    headlineFirstPaint:
      (headlines.find((entry) => !entry.busy) ?? { text: probe.headline() }).text,
    headlineSettled: probe.headline(),
    headlineSamples: headlines.map((entry) => ({ text: entry.text, hero: entry.hero, busy: entry.busy })),
    // Every distinct non-empty primary answer painted during the window. Rule 3
    // is about a *number* changing meaning, and a headline that goes from "no
    // answer yet" to "the answer" is not that. Two different answers is.
    heroPaints: [...new Set(headlines.map((entry) => entry.hero).filter(Boolean))],
    blockedRequests: probe.blockedRequests,
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

// Headless Chrome has no display sink, so its frame-rate limiter never
// schedules a BeginFrame and the compositor presents nothing. The Layout
// Instability API only emits when frames are presented, so `layout-shift` goes
// permanently silent and CLS reads 0.0000 on a page that is jumping — the dead
// instrument the previous wave found and could only detect, not cure. Measured
// directly on this machine: a requestAnimationFrame loop ticks **1** time in two
// seconds by default and **115** times with the flag below, and the three
// throttling flags that look like plausible culprits
// (--disable-backgrounding-occluded-windows, --disable-renderer-backgrounding,
// --disable-background-timer-throttling) each leave it at 1. This flag is the
// instrument's power switch. It changes nothing about layout or the scores the
// API reports; it only makes the API able to report. `frameTicks` on every row
// stays, because a flag that stops working must still be visible.
const BROWSER_LAUNCH_ARGS = ["--disable-frame-rate-limit"];

// The engines this harness can drive, and what each one is allowed to gate.
// `geometry` engines are measured for size/legibility/fit only: they have no
// Layout Instability API, so their CLS column is the geometric fallback and
// gating a timing bar on them would be gating an instrument that is not there.
const ENGINES = {
  chromium: { gates: "all" },
  webkit: { gates: "geometry" },
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
      {
        maxBuffer: 32 * 1024 * 1024,
      },
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

  async screenshot(path, { full = false } = {}) {
    await this.call(
      full ? ["screenshot", "--full", path] : ["screenshot", path],
    );
  }

  async close() {
    await this.call(["close"]).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// WebKit driver
//
// Same surface as `Browser` above, so every navigation step, wait, settle and
// measurement expression in this file runs unchanged on both engines. Only the
// two calls the flows actually make through `call` are implemented (`cookies
// clear`, `navigate`); anything else throws rather than passing silently, so a
// future step that assumes agent-browser semantics fails loudly here.
//
// `--disable-frame-rate-limit` has no WebKit equivalent and needs none: WebKit
// does not implement the Layout Instability API at all, so CLS on these rows is
// the harness's own geometric figure and `nativeLayoutShiftLive` reads false by
// construction. That is why WebKit rows gate geometry only.
// ---------------------------------------------------------------------------
class WebkitBrowser {
  static engine = "webkit";

  constructor(session) {
    this.session = session;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.scale = DEVICE_SCALE_FACTOR;
  }

  async #context(width, height) {
    if (this.context) await this.context.close();
    const { webkit } = await import("playwright-core");
    if (!this.browser) this.browser = await webkit.launch();
    this.context = await this.browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: this.scale,
      hasTouch: true,
      isMobile: true,
    });
    await this.context.addInitScript({ path: probeScript });
    this.page = await this.context.newPage();
  }

  async open(url) {
    if (!this.page) await this.#context(390, 844);
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

  async screenshot(path, { full = false } = {}) {
    await this.page.screenshot({ path, fullPage: full });
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
async function measureSurface(
  browser,
  surface,
  viewport,
  failDemo,
  screenshotDir = null,
) {
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

  const metrics = await browser.evaluateJson(
    measureExpression(surface.listExemption?.rowSelector ?? null),
  );
  // The judge panel scores what a reader sees, and the reader sees one screen:
  // the shell pins <html> to 100dvh and scrolls inside <main>, so a full-page
  // capture is byte-identical to the viewport one. Captured after the metrics
  // so the image and the numbers describe the same settled frame.
  let screenshot = null;
  if (screenshotDir) {
    screenshot = resolve(
      repositoryRoot,
      screenshotDir,
      `${surface.id}--${browser.constructor.engine}--${viewport.width}x${viewport.height}.png`,
    );
    await mkdir(dirname(screenshot), { recursive: true });
    await browser.screenshot(screenshot);
  }
  for (const step of surface.after ?? []) {
    await browser.evaluate(step).catch(() => undefined);
  }
  await delay(150);

  return {
    surface: surface.id,
    label: surface.label,
    engine: browser.constructor.engine,
    viewport: `${viewport.width}x${viewport.height}`,
    primaryViewport: viewport.primary,
    bar: surface.bar,
    listExemption: surface.listExemption ?? null,
    singleAnswerPaint: surface.singleAnswerPaint === true,
    fitsWithoutScrolling: surface.fitsWithoutScrolling === true,
    markTime,
    arrivalError,
    injection,
    screenshot,
    ...metrics,
  };
}

/**
 * The four checks whose answer depends on which engine laid the page out:
 * target size, the legibility floor, whether a single-line box's text fits, and
 * horizontal overflow. Every engine in the run gates all four; the engine each
 * failure came from is on the row.
 */
function pushGeometryFailures(row, failures) {
  if (row.smallTargets > 0) {
    failures.push(
      `[${row.engine}] ${row.smallTargets} interactive target(s) under ${MINIMUM_TARGET_PX}px: ` +
        `${JSON.stringify(row.smallTargetDetail)}`,
    );
  }
  if (row.horizontalOverflow) {
    failures.push(
      `[${row.engine}] horizontal overflow: clientWidth ${row.clientWidth} !== scrollWidth ${row.scrollWidth}`,
    );
  }
  // HIG-T3: 11pt is the iOS minimum legible size, and the mission forbids
  // buying pixels by going under it. Measured, not grepped, because the two
  // instances this gate was written for were a UA-relative scale compounding
  // inside an already-reduced block and appear nowhere in the source as a
  // number.
  if ((row.tinyType?.count ?? 0) > 0) {
    failures.push(
      `[${row.engine}] ${row.tinyType.count} element(s) below the ${MINIMUM_FONT_SIZE_PX}px legibility floor ` +
        `(smallest ${row.tinyType.minFontSizePx}px): ${JSON.stringify(row.tinyType.detail)}`,
    );
  }
  // The text has to FIT. This gate used to accept `text-overflow: ellipsis` as
  // a pass, which turned out to be a hole big enough to drive the whole defect
  // through: adding one declaration moved six ledger fields from `clip` to
  // `ellipsis` and the column went green without a single box getting wider,
  // while 42% of "Health and pharmacy" stayed unreadable behind a "…". An
  // ellipsis tells the reader something was cut; it does not tell them what.
  // Ellipsis is still the floor underneath every field (globals.css) so a box
  // that does overflow says so instead of slicing a glyph — but the floor is
  // not the bar, and only fitting passes.
  if ((row.clippedText?.count ?? 0) > 0) {
    failures.push(
      `[${row.engine}] ${row.clippedText.count} box(es) are narrower than their own text ` +
        `(an ellipsis is not a fit): ${JSON.stringify(row.clippedText.detail)}`,
    );
  }
}

function violations(row, mode) {
  if (mode === "capture") return [];
  const failures = [];
  if (row.arrivalError)
    failures.push(`did not reach surface: ${row.arrivalError}`);
  // Geometry-only engines contribute the four checks that diverge between
  // engines and nothing else. Every one of them is a gate the Chromium pass
  // also runs, so this adds coverage and removes none: a control that is 44px
  // in Chromium and 23px in WebKit now fails, and one that is small in Chromium
  // still fails there.
  if (ENGINES[row.engine]?.gates === "geometry") {
    pushGeometryFailures(row, failures);
    return failures;
  }
  if (row.listExemption) {
    // The row region is exempt from the absolute cap; the chrome above it is
    // not, and neither is the requirement that the exemption be earned. A
    // selector that matches nothing would silently turn the surface's only
    // binding gate off, so it fails loudly instead.
    const region = row.listRegion;
    if (!region || region.rowCount === 0) {
      failures.push(
        `long-list exemption claimed but not earned: ${region?.error ?? "no list region measured"} (${row.listExemption.rowSelector})`,
      );
    } else if (region.chromeAboveFirstRowCost > BAR_CHROME_ABOVE_LIST) {
      failures.push(
        `chrome above the first list row ${region.chromeAboveFirstRowPx}px = ` +
          `${region.chromeAboveFirstRowCost.toFixed(3)} VH exceeds ${BAR_CHROME_ABOVE_LIST.toFixed(2)} VH ` +
          `(row region ${region.rowRegionPx}px over ${region.rowCount} rows is exempt: ${row.listExemption.reason})`,
      );
    }
  } else if (row.verticalCost > row.bar) {
    failures.push(
      `vertical cost ${row.verticalCost.toFixed(3)} VH exceeds ${row.bar.toFixed(1)} VH`,
    );
  }
  if (row.cls > BAR_CLS)
    failures.push(
      `CLS ${row.cls.toFixed(4)} exceeds ${BAR_CLS}: ${JSON.stringify(row.shiftDetail)}`,
    );
  if (row.headlineFirstPaint !== row.headlineSettled) {
    failures.push(
      `headline changed between first paint and settled: ${JSON.stringify(row.headlineFirstPaint)} -> ${JSON.stringify(row.headlineSettled)}`,
    );
  }
  // A narrower gate than the one above, and it is added, never substituted: on
  // a surface that declares it, the primary answer may be painted exactly once.
  // The generic check compares first paint with settled and so cannot see a
  // figure that appears and is replaced while the region is still marked busy;
  // this one sees every sample, busy or not. It is what holds D2 shut.
  if (row.singleAnswerPaint && (row.heroPaints?.length ?? 0) > 1) {
    failures.push(
      `the primary answer was painted ${row.heroPaints.length} times with different values, ` +
        `so a number rendered provisionally and changed meaning: ${JSON.stringify(row.heroPaints)}`,
    );
  }
  // D4. A surface that declares itself a single screen has to actually be one
  // on every viewport: nothing below the fold, and no dead band large enough to
  // have held real content. The VH bar cannot express either (see innerScroll),
  // so this is the gate that holds Home adaptive rather than tuned to 390x844.
  if (row.fitsWithoutScrolling && row.innerScroll) {
    if (row.innerScroll.overflowPx > 0.5) {
      failures.push(
        `single-screen surface overflows its scroll region by ${row.innerScroll.overflowPx}px ` +
          `(content ${row.innerScroll.contentHeight}px in ${row.innerScroll.clientHeight}px), ` +
          `so a row is cut off below the fold`,
      );
    }
    if (row.innerScroll.slackPx > BAR_SINGLE_SCREEN_SLACK_PX) {
      failures.push(
        `single-screen surface leaves ${row.innerScroll.slackPx}px of dead band ` +
          `(content ${row.innerScroll.contentHeight}px in ${row.innerScroll.clientHeight}px), ` +
          `over the ${BAR_SINGLE_SCREEN_SLACK_PX}px that would have held another row`,
      );
    }
  }
  pushGeometryFailures(row, failures);
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
    "| Surface | State | Engine | Viewport | VH | Fit | CLS | CLS native | CLS geometric | Frames | Headline first paint | Headline settled | Swap | <44px | <11px | Overflowing text | Datum/100px | Overflow | Console errors | Bar | Over bar by | Chrome above list | Row heights |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | --- |",
  ];
  for (const row of rows) {
    const [surface, ...rest] = row.label.split(" · ");
    const state = rest.join(" · ") || "default";
    const swap =
      row.headlineFirstPaint !== row.headlineSettled ? "**YES**" : "no";
    const region = row.listExemption ? row.listRegion : null;
    const fitCell = !row.innerScroll
      ? "—"
      : row.innerScroll.overflowPx > 0.5
        ? `${row.fitsWithoutScrolling ? "**" : ""}+${row.innerScroll.overflowPx} over${row.fitsWithoutScrolling ? "**" : ""}`
        : row.innerScroll.slackPx > BAR_SINGLE_SCREEN_SLACK_PX &&
            row.fitsWithoutScrolling
          ? `**${row.innerScroll.slackPx} dead**`
          : `${row.innerScroll.slackPx} slack`;
    // An exempt surface reports its absolute VH for information only; what
    // gates it is the chrome column beside it.
    const bar = row.listExemption
      ? `${row.bar.toFixed(1)} info`
      : row.bar.toFixed(1);
    const over = row.verticalCost - row.bar;
    const overCell = row.listExemption
      ? "exempt (rows)"
      : over > 0
        ? `**+${over.toFixed(3)}**`
        : "—";
    const chromeCell = !region
      ? "—"
      : region.rowCount === 0
        ? "**no rows**"
        : `${region.chromeAboveFirstRowPx}px = ${region.chromeAboveFirstRowCost > BAR_CHROME_ABOVE_LIST ? `**${region.chromeAboveFirstRowCost.toFixed(3)}**` : region.chromeAboveFirstRowCost.toFixed(3)} / ${BAR_CHROME_ABOVE_LIST.toFixed(2)}`;
    const rowsCell =
      region && region.rowCount > 0
        ? region.rowHeights
            .map((entry) => `${entry.count}x${entry.height}px`)
            .join(", ")
        : "—";
    lines.push(
      `| ${cell(surface)} | ${cell(state)} | ${cell(row.engine)} | ${row.viewport} | ${row.verticalCost.toFixed(3)} | ${fitCell} | ${row.cls.toFixed(4)} | ${row.clsNative.toFixed(4)}${row.nativeLayoutShiftLive ? "" : " dead"} | ${row.clsGeometric.toFixed(4)} | ${row.frameTicks} | ${cell(row.headlineFirstPaint ?? "—")} | ${cell(row.headlineSettled ?? "—")} | ${swap} | ${row.smallTargets} | ${row.tinyType?.count ? `**${row.tinyType.count}** (${row.tinyType.minFontSizePx}px)` : "0"} | ${row.clippedText?.count ? `**${row.clippedText.count}**` : "0"} | ${row.densityRegion ? row.densityRegion.datumPer100px.toFixed(2) : "—"} | ${row.horizontalOverflow ? "**yes**" : "no"} | ${row.consoleErrors} | ${bar} | ${overCell} | ${cell(chromeCell)} | ${cell(rowsCell)} |`,
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

/**
 * Refuse to run against a server this process did not start.
 *
 * Two overlapping runs on the default port cost a whole measurement round: the
 * second `next start` lost the bind, the first run's server answered instead,
 * and the second run measured a build it had not built — silently, because a
 * healthy foreign server looks exactly like your own. A harness that can be
 * pointed at the wrong build without saying so is not a verifier. `--base-url`
 * is the supported way to measure something you started yourself, and it skips
 * this check by construction.
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
    engines: [...DEFAULT_ENGINES],
    // Off unless asked for: a gate run writes numbers, and 126 PNGs per run is
    // evidence for a judge, not for a gate.
    screenshots: null,
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
      case "--screenshots":
        options.screenshots = next();
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

  const rows = [];
  try {
    for (const engine of options.engines) {
      console.log(`\n--- ${engine} ---`);
      // Each pass signs both fixture accounts in twice per viewport, which is
      // twelve logins per identity across a two-engine run against a limiter
      // that allows ten. The bucket is reset here so a run fails for a density
      // reason or not at all; the limiter itself is untouched.
      await runEngine(engine, baseUrl, options, selected, rows);
    }
  } finally {
    if (server) server.kill("SIGTERM");
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: options.mode,
    failDemo: options.failDemo,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    engines: options.engines.map((engine) => ({
      engine,
      gates: ENGINES[engine].gates,
    })),
    bars: {
      vertical: VERTICAL_BARS,
      cls: BAR_CLS,
      minimumTargetPx: MINIMUM_TARGET_PX,
      minimumFontSizePx: MINIMUM_FONT_SIZE_PX,
      chromeAboveExemptList: BAR_CHROME_ABOVE_LIST,
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

  // State the instrument's condition next to its output. A Chromium row where
  // the browser produced no frames still measures CLS — from geometry — but the
  // native Layout Instability API contributed nothing to it, and a reader who
  // is not told that would read 60 zeroes as 60 passes. WebKit rows are not
  // this: WebKit does not implement the API at all, which is stated rather than
  // reported as a fault.
  const dead = rows.filter(
    (row) =>
      row.nativeLayoutShiftLive === false &&
      ENGINES[row.engine].gates === "all",
  ).length;
  if (dead > 0) {
    console.log(
      `\nNOTE: the browser produced zero animation frames on ${dead}/${rows.length} row(s), ` +
        `so the native layout-shift API emitted nothing there. CLS on those rows is the ` +
        `geometry-derived figure (sampled rects, CLS scoring formula), not the browser's own.`,
    );
  }
  const geometryRows = rows.filter(
    (row) => ENGINES[row.engine].gates === "geometry",
  ).length;
  if (geometryRows > 0) {
    console.log(
      `NOTE: ${geometryRows} row(s) came from an engine with no Layout Instability API. ` +
        `Those rows gate target size, the legibility floor, text fit and horizontal overflow; ` +
        `their CLS column is the geometry-derived figure and does not gate.`,
    );
  }

  const failing = rows.filter((row) => row.failures.length > 0);
  console.log(
    `${rows.length} measurement(s) across ${options.engines.join(" + ")}; ` +
      `${failing.length} violating row(s); mode=${options.mode}; json=${options.json}`,
  );
  if (options.mode === "gate" && failing.length > 0) process.exitCode = 1;
}

/** One full pass of the catalogue, on one engine, across every viewport. */
async function runEngine(engine, baseUrl, options, selected, rows) {
  const browser =
    engine === "webkit"
      ? new WebkitBrowser(options.session)
      : new Browser(options.session);
  try {
    await browser.open(baseUrl);
    await browser.device("iPhone 14");

    for (const viewport of options.viewports) {
      // Each viewport signs both fixture accounts in again, and the run now
      // does that once per engine, so a three-viewport two-engine run makes far
      // more logins per identity than the limiter's ten. The bucket is reset
      // here so a run fails for a density reason or not at all; no limiter
      // rule, window or count is changed anywhere, and the reset is gated by
      // the seeder's own localhost-database assertion.
      await run(
        "npx",
        ["tsx", "scripts/seed-density-fixture.ts", "--login-buckets-only"],
        { cwd: repositoryRoot, env: process.env },
      ).catch(() => undefined);
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
          options.screenshots,
        );
        row.failures = violations(row, options.mode);
        rows.push(row);
        const status = row.failures.length === 0 ? "ok" : "FAIL";
        console.log(
          `${status.padEnd(4)} ${row.engine.padEnd(8)} ${row.viewport.padEnd(8)} ${row.label.padEnd(32)} ` +
            `${row.verticalCost.toFixed(3)} VH  CLS ${row.cls.toFixed(4)} (${row.clsSource})  ` +
            `<44px ${row.smallTargets}  overflow ${row.horizontalOverflow}  errors ${row.consoleErrors}` +
            (row.listRegion && row.listRegion.rowCount > 0
              ? `\n       list exemption: chrome ${row.listRegion.chromeAboveFirstRowPx}px = ` +
                `${row.listRegion.chromeAboveFirstRowCost.toFixed(3)} VH (bar ${BAR_CHROME_ABOVE_LIST}); ` +
                `${row.listRegion.rowCount} rows ${row.listRegion.rowHeights.map((entry) => `${entry.count}x${entry.height}px`).join(", ")}`
              : ""),
        );
        for (const failure of row.failures) console.log(`       - ${failure}`);
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

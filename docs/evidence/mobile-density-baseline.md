# Mobile density baseline (BEFORE)

Status: curated historical pre-change baseline

Repository-reference audit: 2026-07-28

Every number in this document was measured by `pnpm ui:density:measure` against
the production build. The original raw capture was disposable run output and is
not tracked; rerun the executable gate for current machine-readable results.

## How it was measured

```
pnpm ui:density:measure -- --mode capture
```

That command seeds the fixture, runs `pnpm build`, starts `next start`, and
drives the production server in headless Chromium under iPhone emulation
(`Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) … Mobile/15E148
Safari/604.1`) at `devicePixelRatio` 3. The app is a single route: every surface
below is client state reached by clicking, and each row asserted a
surface-specific DOM condition before any metric was read.

- Primary viewport **390x844**; boundary checks at **360x740** and **430x932**.
- Fixture: `pnpm db:seed:density` — 15 budget categories, 61 transactions inside
  the selected period (July 2026), 385 transactions total, two plan years, one
  over-budget category (`Dining out`) and one near-limit category (`Coffee`)
  driving the attention states.
- 60 measurements: 20 surface states × 3 viewports. 0 surfaces were unreachable.

### What "VH" means here, precisely

House by 30 is a fixed-viewport shell. `<html>` is pinned to the viewport height
and the product content scrolls inside `<main>`, so the metric named in the
brief — `document.documentElement.scrollHeight / window.innerHeight` — is
**identically 1.000 on all 60 measurements** and cannot express density. Both
numbers are recorded per row in the JSON:

- `documentScrollCost` — the literal document metric. 1.000 everywhere.
- `verticalCost` — the **VH column below, and the number that gates**. It is the
  tallest scrollable region of the surface divided by `window.innerHeight`.
  Region selection is recorded per row in `measuredRegion`: `documentElement`
  for signed-out and onboarding (nothing scrolls), `main` for every signed-in
  surface, and the sheet's own scroll region (`dialog:section`) when a modal is
  open, since the sheet is the surface under measurement and the page behind it
  has its own row.

Only scrollable regions at least 40% of the viewport tall are eligible, so
height cannot be hidden by moving it into a nested scroller, and small inline
scroll boxes (a clipped heading, a chart legend) are ignored.

### CLS

Measured with a real `PerformanceObserver({ type: "layout-shift", buffered: true })`
installed by `scripts/density-probe.js` as an `--init-script`, i.e. before any
application JavaScript runs. Entries with `hadRecentInput` are excluded. The
reported figure is the session-window maximum as web.dev defines CLS: shifts are
grouped into windows that close after 5s of duration or a 1s gap, and the
largest window's sum is reported. For cold-load rows the window is the whole
document lifetime; for click-navigated rows it opens immediately before the
navigating click and closes at network-idle + 1s.

### Headline first paint vs settled

A `MutationObserver` runs from document start and records the headline every
time it changes. The recorded signature is the surface heading plus, where the
surface has one, its hero label and value — e.g.
`Your money, right now. | Left to spend $123`. Samples taken while the branded
loading placeholder (`main[aria-busy="true"]`) was mounted are excluded: the
placeholder is not the surface's headline, and counting it would flag every cold
load as a swap and bury the real defect class.

## Baseline table

| Surface           | State                      | Viewport |    VH |    CLS | Headline first paint                                    | Headline settled                                        | Swap | <44px | Overflow | Console errors | Bar | Over bar by |
| ----------------- | -------------------------- | -------- | ----: | -----: | ------------------------------------------------------- | ------------------------------------------------------- | ---- | ----: | -------- | -------------: | --: | ----------: |
| Signed out        | create account (cold load) | 390x844  | 1.000 | 0.0000 | One honest plan for every day money moves.              | One honest plan for every day money moves.              | no   |     0 | no       |              0 | 1.5 |           — |
| Signed out        | sign in                    | 390x844  | 1.000 | 0.0083 | One honest plan for every day money moves.              | One honest plan for every day money moves.              | no   |     0 | no       |              0 | 1.5 |           — |
| Onboarding        | cold load                  | 390x844  | 1.000 | 0.0000 | Build the plan behind your daily budget                 | Build the plan behind your daily budget                 | no   |     0 | no       |              0 | 1.5 |           — |
| Home              | default                    | 390x844  | 2.187 | 0.0005 | Your money, right now. \| Left to spend $123            | Your money, right now. \| Left to spend $123            | no   |     0 | no       |              0 | 1.0 |  **+1.187** |
| Home              | cold load                  | 390x844  | 2.187 | 0.0000 | Your money, right now. \| Left to spend $123            | Your money, right now. \| Left to spend $123            | no   |     0 | no       |              0 | 1.0 |  **+1.187** |
| Budget            | default                    | 390x844  | 3.030 | 0.0075 | $123 safe to spend                                      | $123 safe to spend                                      | no   |     0 | no       |              0 | 3.0 |  **+0.030** |
| Budget            | future month               | 390x844  | 2.223 | 0.4113 | $4,478 planned spending                                 | $4,478 planned spending                                 | no   |     0 | no       |              0 | 3.0 |           — |
| Activity          | default                    | 390x844  | 7.873 | 0.0075 | Find and fix expenses. \| July 2026 total $5,255        | Find and fix expenses. \| July 2026 total $5,255        | no   |     0 | no       |              0 | 3.0 |  **+4.873** |
| Activity          | empty search               | 390x844  | 1.191 | 0.0000 | Find and fix expenses. \| July 2026 total $5,255        | Find and fix expenses. \| July 2026 total $5,255        | no   |     0 | no       |              0 | 3.0 |           — |
| Category detail   | Dining out                 | 390x844  | 1.607 | 0.0000 | Dining out                                              | Dining out                                              | no   |     0 | no       |              0 | 4.0 |           — |
| Edit budget       | default                    | 390x844  | 1.712 | 0.0000 | Edit monthly budget                                     | Edit monthly budget                                     | no   |     0 | no       |              0 | 4.0 |           — |
| Manage categories | default                    | 390x844  | 4.319 | 0.0000 | Manage categories                                       | Manage categories                                       | no   |     0 | no       |              0 | 4.0 |  **+0.319** |
| Monthly wrap      | default                    | 390x844  | 2.469 | 0.0000 | July 2026 wrap \| Live preview · currently unspent $123 | July 2026 wrap \| Live preview · currently unspent $123 | no   |     0 | no       |              0 | 3.0 |           — |
| Plan              | default                    | 390x844  | 2.444 | 0.0005 | $9,837 cash savings planned.                            | $9,837 cash savings planned.                            | no   |     0 | no       |              0 | 3.0 |           — |
| Plan details      | default                    | 390x844  | 2.955 | 0.0000 | Plan details \| Savings / month $819.78                 | Plan details \| Savings / month $819.78                 | no   |     0 | no       |              0 | 4.0 |           — |
| Benefits          | default                    | 390x844  | 4.289 | 0.0000 | Benefits                                                | Benefits                                                | no   |     0 | no       |              0 | 4.0 |  **+0.289** |
| Compare years     | default                    | 390x844  | 1.833 | 0.0000 | Compare years                                           | Compare years                                           | no   |     0 | no       |              0 | 4.0 |           — |
| Account           | default                    | 390x844  | 1.223 | 0.0000 | Account and data                                        | Account and data                                        | no   |     0 | no       |              0 | 3.0 |           — |
| Fast Log          | new expense                | 390x844  | 0.848 | 0.0000 | Your money, right now. \| Left to spend $123            | Your money, right now. \| Left to spend $123            | no   |     0 | no       |              0 | 4.0 |           — |
| Fast Log          | edit expense               | 390x844  | 0.782 | 0.0000 | Find and fix expenses. \| July 2026 total $5,255        | Find and fix expenses. \| July 2026 total $5,255        | no   |     0 | no       |              0 | 4.0 |           — |
| Signed out        | create account (cold load) | 360x740  | 1.158 | 0.0000 | One honest plan for every day money moves.              | One honest plan for every day money moves.              | no   |     0 | no       |              0 | 1.5 |           — |
| Signed out        | sign in                    | 360x740  | 1.131 | 0.0071 | One honest plan for every day money moves.              | One honest plan for every day money moves.              | no   |     0 | no       |              0 | 1.5 |           — |
| Onboarding        | cold load                  | 360x740  | 1.101 | 0.0000 | Build the plan behind your daily budget                 | Build the plan behind your daily budget                 | no   |     0 | no       |              0 | 1.5 |           — |
| Home              | default                    | 360x740  | 2.219 | 0.0007 | Your money, right now. \| Left to spend $123            | Your money, right now. \| Left to spend $123            | no   |     0 | no       |              0 | 1.0 |  **+1.219** |
| Home              | cold load                  | 360x740  | 2.219 | 0.0000 | Your money, right now. \| Left to spend $123            | Your money, right now. \| Left to spend $123            | no   |     0 | no       |              0 | 1.0 |  **+1.219** |
| Budget            | default                    | 360x740  | 3.511 | 0.0106 | $123 safe to spend                                      | $123 safe to spend                                      | no   |     0 | no       |              0 | 3.0 |  **+0.511** |
| Budget            | future month               | 360x740  | 2.508 | 0.6632 | $4,478 planned spending                                 | $4,478 planned spending                                 | no   |     0 | no       |              0 | 3.0 |           — |
| Activity          | default                    | 360x740  | 8.782 | 0.0106 | Find and fix expenses. \| July 2026 total $5,255        | Find and fix expenses. \| July 2026 total $5,255        | no   |     0 | no       |              0 | 3.0 |  **+5.782** |
| Activity          | empty search               | 360x740  | 1.000 | 0.1093 | Find and fix expenses. \| July 2026 total $5,255        | Find and fix expenses. \| July 2026 total $5,255        | no   |     0 | no       |              0 | 3.0 |           — |
| Category detail   | Dining out                 | 360x740  | 1.822 | 0.0000 | Dining out                                              | Dining out                                              | no   |     0 | no       |              0 | 4.0 |           — |
| Edit budget       | default                    | 360x740  | 1.966 | 0.0000 | Edit monthly budget                                     | Edit monthly budget                                     | no   |     0 | no       |              0 | 4.0 |           — |
| Manage categories | default                    | 360x740  | 3.796 | 0.0000 | Manage categories                                       | Manage categories                                       | no   |     0 | no       |              0 | 4.0 |           — |
| Monthly wrap      | default                    | 360x740  | 3.230 | 0.0000 | July 2026 wrap \| Live preview · currently unspent $123 | July 2026 wrap \| Live preview · currently unspent $123 | no   |     0 | no       |              0 | 3.0 |  **+0.230** |
| Plan              | default                    | 360x740  | 2.496 | 0.0007 | $9,837 cash savings planned.                            | $9,837 cash savings planned.                            | no   |     0 | no       |              0 | 3.0 |           — |
| Plan details      | default                    | 360x740  | 3.392 | 0.0000 | Plan details \| Savings / month $819.78                 | Plan details \| Savings / month $819.78                 | no   |     0 | no       |              0 | 4.0 |           — |
| Benefits          | default                    | 360x740  | 5.746 | 0.0000 | Benefits                                                | Benefits                                                | no   |     0 | no       |              0 | 4.0 |  **+1.746** |
| Compare years     | default                    | 360x740  | 2.115 | 0.0000 | Compare years                                           | Compare years                                           | no   |     0 | no       |              0 | 4.0 |           — |
| Account           | default                    | 360x740  | 1.497 | 0.0000 | Account and data                                        | Account and data                                        | no   |     0 | no       |              0 | 3.0 |           — |
| Fast Log          | new expense                | 360x740  | 0.968 | 0.0000 | Your money, right now. \| Left to spend $123            | Your money, right now. \| Left to spend $123            | no   |     0 | no       |              0 | 4.0 |           — |
| Fast Log          | edit expense               | 360x740  | 0.892 | 0.0000 | Find and fix expenses. \| July 2026 total $5,255        | Find and fix expenses. \| July 2026 total $5,255        | no   |     0 | no       |              0 | 4.0 |           — |
| Signed out        | create account (cold load) | 430x932  | 1.000 | 0.0000 | One honest plan for every day money moves.              | One honest plan for every day money moves.              | no   |     0 | no       |              0 | 1.5 |           — |
| Signed out        | sign in                    | 430x932  | 1.000 | 0.0068 | One honest plan for every day money moves.              | One honest plan for every day money moves.              | no   |     0 | no       |              0 | 1.5 |           — |
| Onboarding        | cold load                  | 430x932  | 1.000 | 0.0000 | Build the plan behind your daily budget                 | Build the plan behind your daily budget                 | no   |     0 | no       |              0 | 1.5 |           — |
| Home              | default                    | 430x932  | 1.982 | 0.0005 | Your money, right now. \| Left to spend $123            | Your money, right now. \| Left to spend $123            | no   |     0 | no       |              0 | 1.0 |  **+0.982** |
| Home              | cold load                  | 430x932  | 1.982 | 0.0000 | Your money, right now. \| Left to spend $123            | Your money, right now. \| Left to spend $123            | no   |     0 | no       |              0 | 1.0 |  **+0.982** |
| Budget            | default                    | 430x932  | 2.702 | 0.0056 | $123 safe to spend                                      | $123 safe to spend                                      | no   |     0 | no       |              0 | 3.0 |           — |
| Budget            | future month               | 430x932  | 1.908 | 0.3793 | $4,478 planned spending                                 | $4,478 planned spending                                 | no   |     0 | no       |              0 | 3.0 |           — |
| Activity          | default                    | 430x932  | 7.050 | 0.0056 | Find and fix expenses. \| July 2026 total $5,255        | Find and fix expenses. \| July 2026 total $5,255        | no   |     0 | no       |              0 | 3.0 |  **+4.050** |
| Activity          | empty search               | 430x932  | 1.089 | 0.0000 | Find and fix expenses. \| July 2026 total $5,255        | Find and fix expenses. \| July 2026 total $5,255        | no   |     0 | no       |              0 | 3.0 |           — |
| Category detail   | Dining out                 | 430x932  | 1.455 | 0.0000 | Dining out                                              | Dining out                                              | no   |     0 | no       |              0 | 4.0 |           — |
| Edit budget       | default                    | 430x932  | 1.505 | 0.0000 | Edit monthly budget                                     | Edit monthly budget                                     | no   |     0 | no       |              0 | 4.0 |           — |
| Manage categories | default                    | 430x932  | 3.876 | 0.0000 | Manage categories                                       | Manage categories                                       | no   |     0 | no       |              0 | 4.0 |           — |
| Monthly wrap      | default                    | 430x932  | 2.185 | 0.0000 | July 2026 wrap \| Live preview · currently unspent $123 | July 2026 wrap \| Live preview · currently unspent $123 | no   |     0 | no       |              0 | 3.0 |           — |
| Plan              | default                    | 430x932  | 2.177 | 0.0005 | $9,837 cash savings planned.                            | $9,837 cash savings planned.                            | no   |     0 | no       |              0 | 3.0 |           — |
| Plan details      | default                    | 430x932  | 2.588 | 0.0000 | Plan details \| Savings / month $819.78                 | Plan details \| Savings / month $819.78                 | no   |     0 | no       |              0 | 4.0 |           — |
| Benefits          | default                    | 430x932  | 3.866 | 0.0000 | Benefits                                                | Benefits                                                | no   |     0 | no       |              0 | 4.0 |           — |
| Compare years     | default                    | 430x932  | 1.660 | 0.0000 | Compare years                                           | Compare years                                           | no   |     0 | no       |              0 | 4.0 |           — |
| Account           | default                    | 430x932  | 1.090 | 0.0000 | Account and data                                        | Account and data                                        | no   |     0 | no       |              0 | 3.0 |           — |
| Fast Log          | new expense                | 430x932  | 0.708 | 0.0000 | Your money, right now. \| Left to spend $123            | Your money, right now. \| Left to spend $123            | no   |     0 | no       |              0 | 4.0 |           — |
| Fast Log          | edit expense               | 430x932  | 0.708 | 0.0000 | Find and fix expenses. \| July 2026 total $5,255        | Find and fix expenses. \| July 2026 total $5,255        | no   |     0 | no       |              0 | 4.0 |           — |

## Surfaces already over their bar

Frozen bars: Home ≤ 1.0 VH; Budget / Activity / Monthly Wrap / Plan / Account ≤
3.0 VH; Benefits / Compare / Plan Details / sub-pages ≤ 4.0 VH; Signed-out /
Onboarding ≤ 1.5 VH. CLS ≤ 0.02 everywhere. Zero headline swaps, zero targets
under 44px, zero horizontal overflow, zero console errors.

### Vertical cost busts (15 of 60 rows)

| Surface           | Viewport | Measured | Bar | Over by |
| ----------------- | -------- | -------: | --: | ------: |
| Home              | 390x844  |    2.187 | 1.0 |  +1.187 |
| Home · cold load  | 390x844  |    2.187 | 1.0 |  +1.187 |
| Budget            | 390x844  |    3.030 | 3.0 |  +0.030 |
| Activity          | 390x844  |    7.873 | 3.0 |  +4.873 |
| Manage categories | 390x844  |    4.319 | 4.0 |  +0.319 |
| Benefits          | 390x844  |    4.289 | 4.0 |  +0.289 |
| Home              | 360x740  |    2.219 | 1.0 |  +1.219 |
| Home · cold load  | 360x740  |    2.219 | 1.0 |  +1.219 |
| Budget            | 360x740  |    3.511 | 3.0 |  +0.511 |
| Activity          | 360x740  |    8.782 | 3.0 |  +5.782 |
| Monthly wrap      | 360x740  |    3.230 | 3.0 |  +0.230 |
| Benefits          | 360x740  |    5.746 | 4.0 |  +1.746 |
| Home              | 430x932  |    1.982 | 1.0 |  +0.982 |
| Home · cold load  | 430x932  |    1.982 | 1.0 |  +0.982 |
| Activity          | 430x932  |    7.050 | 3.0 |  +4.050 |

The two structural findings: **Home costs roughly two full screens at every
viewport** against a one-screen bar, and **Activity costs seven to nine
screens** because it renders every in-period transaction as a full row with no
density ceiling. Benefits and Manage categories bust only at the narrower
viewports, where labels wrap and each row grows a line.

### CLS busts (4 of 60 rows)

| Surface                 | Viewport | Measured |  Bar |
| ----------------------- | -------- | -------: | ---: |
| Budget · future month   | 360x740  |   0.6632 | 0.02 |
| Budget · future month   | 390x844  |   0.4113 | 0.02 |
| Budget · future month   | 430x932  |   0.3793 | 0.02 |
| Activity · empty search | 360x740  |   0.1093 | 0.02 |

Stepping the Budget period forward one month shifts a third to two thirds of the
viewport **after** the 500ms `hadRecentInput` exclusion window, so this is late
content settling rather than the user's own tap moving the page. Typing a
non-matching Activity search collapses 61 rows to an empty state and shifts
0.1093 at 360x740.

### Checks with zero baseline violations

Headline swap (0/60), targets under 44px (0/60), horizontal overflow (0/60), and
console errors (0/60) are clean across the whole matrix. Because a check that
has never failed is not a verifier, each of them is proven to go red below.

## Defect D2: not reproduced as a first-paint/settled swap

The brief expected the Budget headline `$0 safe to spend` to mutate into
`$0 planned spending`. **It did not reproduce on any of the 60 measurements.**
The Budget headline was identical at first paint and at settled state on every
run.

Both strings are real and both were measured, but they belong to two different
states rather than to one state mutating:

- `$123 safe to spend` — Budget with the default selected period (July 2026,
  the current month).
- `$4,478 planned spending` — Budget after clicking `Next month`, captured as
  the separate `Budget · future month` row.

`src/components/daily-cockpit.tsx` selects between them on
`selectedPeriodPhase(period, today) === "future"`. With the seeded fixture the
default period is the current month, so the branch is stable from the first
paint onward and there is nothing to swap. What that transition _does_ cost is
the CLS bust above: 0.4113 at 390x844.

The swap check remains armed for later loops and is proven to fire (below).

## FAIL-DEMO

Each check was run once against a deliberately-bad page and shown going red. All
six injections are driven through the browser at runtime by
`--fail-demo <check>`; **no application source is modified**, so there is nothing
to revert. Each was run against the Account surface at 390x844, whose clean
control run passes every check.

Reproduce any row with:

```
pnpm ui:density:measure -- --mode gate --base-url http://localhost:3211 \
  --viewports 390x844 --surfaces account --fail-demo <vh|cls|headline|touch|overflow|console>
```

### Control — no injection, exit 0

```
ok   390x844  Account                          1.223 VH  CLS 0.0000  <44px 0  overflow false  errors 0

1 measurement(s); 0 violating row(s); mode=gate
EXIT=0
```

### (a) Vertical cost bar — exit 1

```
FAIL 390x844  Account                          5.801 VH  CLS 0.0960  <44px 0  overflow false  errors 0
       - vertical cost 5.801 VH exceeds 3.0 VH
       - CLS 0.0960 exceeds 0.02

1 measurement(s); 1 violating row(s); mode=gate
EXIT=1
```

### (b) CLS bar — exit 1

```
FAIL 390x844  Account                          1.483 VH  CLS 0.2134  <44px 0  overflow false  errors 0
       - CLS 0.2134 exceeds 0.02

1 measurement(s); 1 violating row(s); mode=gate
EXIT=1
```

### (c) Headline swap — exit 1

```
FAIL 390x844  Account                          1.223 VH  CLS 0.0000  <44px 0  overflow false  errors 0
       - headline changed between first paint and settled: "Account and data" -> "$0 planned spending"

1 measurement(s); 1 violating row(s); mode=gate
EXIT=1
```

### (d) 44px touch target — exit 1

```
FAIL 390x844  Account                          1.246 VH  CLS 0.0194  <44px 1  overflow false  errors 0
       - 1 interactive target(s) under 44px: [{"label":"x","width":20,"height":20}]

1 measurement(s); 1 violating row(s); mode=gate
EXIT=1
```

### (e) Horizontal overflow — exit 1

```
FAIL 390x844  Account                          1.041 VH  CLS 0.0019  <44px 0  overflow true  errors 0
       - horizontal overflow: clientWidth 390 !== scrollWidth 3000

1 measurement(s); 1 violating row(s); mode=gate
EXIT=1
```

### (f) Console errors — exit 1

```
FAIL 390x844  Account                          1.223 VH  CLS 0.0000  <44px 0  overflow false  errors 1
       - 1 console error(s): ["density fail-demo: injected console error"]

1 measurement(s); 1 violating row(s); mode=gate
EXIT=1
```

## What this harness cannot see

Stated so later loops do not over-claim from a green run:

- **Real iOS Safari.** This is headless Chromium with an iPhone user agent. Safari's
  own viewport units, dynamic toolbar behaviour, safe-area handling, scroll
  physics, and rubber-banding are not exercised.
- **Real touch.** `navigator.maxTouchPoints` reads 0 in this emulation and is
  recorded in every row. The 44px check measures rendered geometry, not whether a
  finger can hit the target.
- **Font rendering.** Chromium on macOS rasterises differently from iOS. Line-box
  heights, and therefore VH, can differ by a few percent on device.
- **Perceived density.** The harness measures how tall a surface is, not whether
  it is legible, well-ordered, or pleasant. Nothing here replaces a judge.
- **Dark mode, landscape, reduced motion, offline, and sync-error states.** Not in
  this matrix.
- **Only what the fixture produces.** Surfaces render the seeded account; volumes
  far outside it (0 transactions, 10,000 transactions) are not covered.

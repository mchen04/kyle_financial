# Daily money cockpit baseline

Status: historical pre-change baseline

Repository-reference audit: 2026-07-28

Recorded 2026-07-23 against `3eca2c9` on `main`, before KF01–KF15
implementation.

## Regression floor

- `pnpm verify`: passed.
- Vitest: 45 files, 340 tests passed.
- Next.js 16.2.10 production build: passed; 16 routes generated.
- Production server startup: 70 ms.
- Authenticated production navigation resource: 78.8 ms total, 26 ms
  `DOMContentLoaded`, 15.1 ms response end, measured from Chromium's Navigation
  Timing entry on localhost.
- No uncaught browser errors, console errors, or body-level horizontal overflow
  at 390×844 or 1440×900.

## Product and surface baseline

| Area                       | Baseline evidence                                                                                                                                   | Gap                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Positioning                | Public eyebrow says “A yearly plan, not another transaction feed”; hero says “Know what's left before the year begins.”                             | KF01 requires daily-plus-annual positioning.                                                |
| First authenticated screen | Leads with “Unallocated / month” and a yearly income-flow rail.                                                                                     | It is a plan remainder, not selected-period safe-to-spend based on actual transactions.     |
| Navigation                 | Mobile and desktop order: Plan, Benefits, Compare, Account.                                                                                         | KF11 requires Home, Budget, Activity, Plan; profile top-right; Benefits/Compare under Plan. |
| “Add expense”              | Creates or edits a planned allocation row in the monthly expense ledger.                                                                            | KF03/KF04 require a structured, dated Fast Log transaction that never mutates allocation.   |
| Data                       | Plans own benefits and planned expense rows; no transaction entity, selected period, starting balance, category color/archive state, or wrap model. | KF04–KF10 are absent.                                                                       |
| Offline                    | Account-scoped IndexedDB stores complete plans and an outbox; service worker excludes `/api/**`.                                                    | Strong base, but categories and transactions are not represented.                           |
| PWA                        | Standalone manifest, icons, deployment-versioned service worker, `viewport-fit: cover`.                                                             | Copy is yearly-only and daily surfaces/sheets have no safe-area or keyboard evidence.       |
| Design system              | Existing navy/paper/blue/teal identity and continuous money-flow rail are deliberate and responsive.                                                | Tokens are spread across CSS modules and there is no deterministic token audit.             |

The current presentation also reproduces the mixed-unit problem: the main card
leads with `$8,659.80` “Unallocated / month” while its rail labels estimated tax
and unallocated cash “/ year.” Each value is individually labeled, but the
at-a-glance composition asks the user to compare different periods and does not
offer month, YTD, or full-year selection.

## Baseline screenshots

Screenshots intentionally live outside the repository:

- `/tmp/kf-daily-baseline-20260723/auth-390x844.png`
- `/tmp/kf-daily-baseline-20260723/plan-390x844.png`
- `/tmp/kf-daily-baseline-20260723/plan-1440x900.png`

At 390×844, the primary plan answer is visible with zero activations, but there
is no daily answer or transaction action. The full page screenshot is 1,582 px
tall; the user must pass the allocation editor before reaching income/tax
assumptions. At 1440×900 the yearly plan hierarchy is clear, but the sidebar
spends all four top-level destinations on planning and administration.

## KF acceptance ledger before implementation

| Item | Bucket           | Binary acceptance criterion                                                     | Baseline |
| ---- | ---------------- | ------------------------------------------------------------------------------- | -------- |
| KF01 | Product/UI       | Daily-plus-annual copy and daily-first hierarchy are rendered.                  | Fails    |
| KF02 | UI/behavior      | Authenticated default shows selected-month remaining/over before configuration. | Fails    |
| KF03 | UI/behavior      | One activation opens structured amount/category/title/note/date Fast Log.       | Fails    |
| KF04 | Data/behavior    | Dated actual transaction CRUD exists separately from allocation.                | Fails    |
| KF05 | Data/UI          | Stable, colored, ordered, archive-safe category CRUD exists.                    | Fails    |
| KF06 | Math/UI          | Period total and per-category allocated/actual/remaining reconcile.             | Fails    |
| KF07 | Math/UI          | Completed-month wrap and current preview explain exact savings impact.          | Fails    |
| KF08 | Math/UI          | Ending balance appears only with configured starting balance.                   | Fails    |
| KF09 | Math/UI          | Accessible allocation pie and legend reconcile exactly.                         | Fails    |
| KF10 | Math/UI          | Specific month, YTD, and full-year use one explicit period model.               | Fails    |
| KF11 | UI/IA            | Exact four-tab daily navigation and contextual Quick Log render.                | Fails    |
| KF12 | Offline          | Every daily/planning flow survives blocked network and cold relaunch.           | Fails    |
| KF13 | Performance      | Cached common interactions meet frozen p95 budgets.                             | Unproven |
| KF14 | UI/architecture  | One token authority and zero-exception audit cover authored UI.                 | Fails    |
| KF15 | Integration/docs | Existing planner remains correct and all docs/export/PWA reflect new entities.  | Fails    |

## Domain decisions locked before UI

1. Categories are plan-year-owned. This is the smallest extension of the
   current model: the existing planned allocation row becomes the canonical
   category for that year, and copy-forward creates a new year's category
   identities while preserving name, role, color, order, cadence, and amount.
   Transactions belong to the same plan year and reference that category.
2. Renaming or archiving a category never deletes it. Historical transactions
   retain a valid foreign key and display the current category metadata;
   archived categories remain available in history and correction flows.
3. Transactions are separate canonical rows with stable UUID, category UUID,
   positive integer cents, required title, optional note, local `YYYY-MM-DD`,
   created/updated timestamps, and per-field sync versions.
4. The selected period is exactly one of `{month: YYYY-MM}`, `{ytd: year +
through local date}`, or `{year: year}`. A local calendar date is never
   parsed through UTC for bucketing.
5. Spending-category remaining is allocation minus included transaction
   actuals. Saving-category arithmetic is identical, but the words are
   “funded” and “left to fund.”
6. Safe to spend includes only Needs and Wants allocation minus their included
   transactions. Saving/investing allocations are not spendable.
7. Savings impact is one pure result with named components: planned cash
   savings, payroll/employer saving, planned saving allocations, actual funded
   saving allocations, and spending variance. Spending variance and funding
   enter once each.
8. Starting savings is optional. Without it the UI reports contribution/change;
   with it, projected ending balance is starting balance plus the same computed
   change.

## Surface hierarchy rationale

- **Home:** period and safe-to-spend first (most urgent/frequent), Fast Log
  second (frequent action), exceptions third (consequence), then supporting
  totals, recent activity, and wrap.
- **Budget:** total remaining first, attention categories next, all categories
  in stable order after that; structural editing moves to explicit modes.
- **Activity:** period/filter context first, dated corrections next, empty state
  invites Fast Log; the screen exists to find and correct reality.
- **Plan:** annual outcome first, allocation visualization and money-flow
  explanation next, then the deeper assumptions that produce it.
- **Account:** sync/privacy/export/install/logout/deletion remain reachable from
  the profile control, but their low frequency keeps them out of top-level
  navigation.

## Design direction

The existing “living ledger” identity remains: ink, paper, sky, action blue,
surplus teal, and gap amber. The one deliberate visual risk is to evolve the
continuous annual money-flow rail into a **budget runway**: the same exact
geometry connects planned allocation, actual progress, and remaining runway
across Home, Budget, Plan, and Wrap. It encodes the product's unique
annual-to-daily relationship rather than decorating a generic dashboard.
Everything around it stays quiet, flat, and data-legible.

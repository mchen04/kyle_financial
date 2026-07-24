# Goal ledger

## Wave 0 — inspect and baseline

Date: 2026-07-12

- Repository began on `main` with no commits. Remote `origin` points to the private GitHub repository; no push is authorized.
- Local runtime: Node 20.19.4, pnpm 9.6.0, PostgreSQL client/server 14.21, Docker CLI 29.4.0 with daemon stopped.
- Production database was inspected inside `BEGIN READ ONLY`: Neon PostgreSQL 18.4, database/user `neondb`/`neondb_owner`, only system schemas plus empty `public`, extension `plpgsql`, `public` owned by `pg_database_owner`. No existing application tables or data were found.
- Local PostgreSQL 14 accepts connections on `/tmp:5432` and is the mandatory isolated automated-test target. Neon is never used by tests.
- Current Next.js installation guidance was checked on 2026-07-12; Node 20.9+ and Safari 16.4+ are supported. Scaffold resolved Next.js 16.2.10 and React 19.2.4.
- Architecture, surface map, and test strategy are recorded in adjacent docs. Ideation was skipped because the owner goal is a frozen product spec.
- Design direction: living annual ledger, exact money-flow rail, quiet ink/sky palette, tabular monetary typography. A generic gradient-stat-card concept was rejected.

Commands/evidence:

```text
git status --short --branch
node --version; pnpm --version; docker --version; psql --version
read-only psql metadata transaction
pg_isready; brew services list
pnpm create next-app@latest . --ts --eslint --app --src-dir --no-tailwind
```

Wave 0 result: PASS. Separate production and test database paths are available; the production schema is safe to migrate after local migration verification.

## Wave 1 — research and computation engine

- Verified 2026 federal brackets/deductions, Social Security wage base, Medicare rates/thresholds, and required benefit limits against current IRS/SSA sources. Traceability is in `docs/research/sources.md` and source IDs live beside each numeric table value.
- The Tax Foundation 2026 HTML table imports deterministically to 51 state/DC records. Tests caught and fixed blank continuation rows and Washington capital-gains rows being misread as wage-tax brackets.
- Pure TypeScript engine uses integer cents, integer millionth rates, and `BigInt` intermediates. It reports every federal bracket slice, FICA component, state estimate, take-home, negative-capable cash savings, payroll/employer savings, and exact accounting difference.
- Golden/boundary/fallback/warning tests and two 1,000-run fast-check properties pass. The five scenario outputs are recorded in `docs/research/tax-validation.md`.
- Current competitor docs reconfirmed the adopted targets/cadence, Sankey, leftover headline, manual planning, and iOS glanceability patterns.
- Live `agent-browser` session `wave1-external` captured SmartAsset's annual 2025 income-tax result table for all five fixed scenarios with the standard deduction, zero credits/dependents/pre-tax deductions, and non-local-tax locations. Exact federal, FICA, state, local, total-tax, and take-home outputs are recorded in `docs/research/tax-validation.md`. Every external net is within 0.35% of Kyle's 2026 result, closing the required ±2% external calculator gate; the residuals reconcile to the published result year, 2025 Social Security wage cap, and state-table/rounding differences.

## Wave 2 — accounts and persistence (foundation)

- Ordered migration `001_initial.sql` passed from an empty local PostgreSQL database and idempotently on rerun. It defines users, sessions, unique account/year plans, benefits, expenses, mutation receipts, checks, foreign keys, and access-path indexes.
- Neon application was still empty before migration. The verified migration applied once; read-only post-check showed the seven expected tables, one migration ledger entry, and zero production users/plans.
- PBKDF2-SHA-256 password hashing, opaque token digests, expiry, revocation, normalized email, account-scoped DAL, default plan seed, deep copy-forward, and multi-year export are integration-tested.
- Cross-account tests attempt plan reads, plan updates, and expense writes with another account and receive no data/no mutation.
- HTTP smoke against local PostgreSQL: signup 201, seeded plan 201 (23 expenses/7 benefits), export 200 with complete plan, logout 200, subsequent session 401. An unrelated IPv6 localhost service was detected; evidence used the verified Next target on `127.0.0.1:3000`.

## Wave 3 — plan product surface (implementation pass)

- Built account entry/onboarding, primary plan answer, instant client computation, income/state/filing editor, expense rename/reorder/add/delete/cadence, benefits editor with all required types and custom tax flags, limit warnings, flow rail, 50/30/20 lens, copy-forward, comparison, export, and install guidance.
- Atomic whole-plan PUT validates the complete browser draft before replacing owned child rows. Another account cannot address the plan through the account-scoped year lookup.
- Initial agent-browser smoke and defect/fix evidence is in `docs/evidence/browser-ux.md`. This is explicitly not the final Wave 6 production gate.

## Wave 4 — PWA and offline

- Added standalone manifest, generated full-bleed app icons (180/192/512/1024), apple-touch metadata, safe-area/dvh layout, versioned service worker, static-resource warmup, and explicit update/reload control.
- Added account-scoped IndexedDB plans/outbox, storage persistence request, network-failure cache fallback, field mutation diffing, deterministic server reconciliation, account-lifetime duplicate receipts, and logout deletion.
- Automated offline/sync/account-isolation tests and production browser evidence are recorded in `docs/offline-and-sync.md` and `docs/evidence/browser-ux.md`.

## Wave 5 — logic hardening

- Completed two consecutive clean logic-hardening passes after fixing every engine and reconciliation finding. The final suite covers golden scenarios, boundary and rounding behavior, fast-check properties, mutation ordering/idempotency, stale/future clocks, account lifecycle fencing, and queue-first startup.
- Final Wave 5 verification: 21 test files and 217 tests passed with lint, TypeScript, and production build green.

## Wave 6 — production browser UX

- Two scoped final sessions (`kyle-wave6-final-a`, `kyle-wave6-final-b`) passed the activation budgets and required viewport matrix against the production build. Returning plan: 0 extra activations; existing expense edit: 0; add expense: 1; state/filing edit: 2; start next year: 1.
- Exact viewports 390x844, 430x932, 320x568, 844x390, 768x1024, and 1440x900 had no document overflow; a 720x450 CSS viewport exercised the 1440px layout at 200% browser-zoom equivalence. Visible inputs remained 16px and mobile/coarse actions remained at least 44px.
- At 390x844, the answer, take-home, expense-ledger heading, and first expense row begin within the initial fold (`firstExpenseTop=787`, viewport 844). Keyboard order begins with the skip link and proceeds through year, next-year action, navigation, disclosures, Add expense, unused-category control, and row actions with visible outlines.

## Wave 7 — judged UI quality

- The final post-browser-fix streak used 120 real screenshots per round: 15 states across 360x740, 390x844, 844x390, 768x1024, 1024x768, 1024x700, 1440x900, and 1728x1117.
- Cycle 14: responsive 9.6, visual 9.4, trust 9.4. Cycle 15 unchanged rejudge: visual 9.6, trust 9.4, responsive 9.5. Both rounds had zero below-bar findings, zero blockers, zero page errors, no overflow, and no visible sub-44px actions.
- Account deletion and all-years export were also exercised end to end. A disposable account deletion returned to authentication with permanent-deletion confirmation; export produced a parsed JSON file containing the account email and both plan years; forced export failure preserved plans and exposed the retry action.

## Wave 8 — structural quality convergence

- Fresh-context reviews drove the application away from monoliths and duplicate contracts. The plan UI is now split by lifecycle and surface; tax computation is composed from typed stages; sync inputs are decoded once at durable/network boundaries; and persistence conversion has one canonical implementation.
- The service worker is authored as a typed module and emitted as a generated runtime asset. Its cache writes are awaited, registration is module-based, and production verification builds the generated asset before lint, tests, and Next.js compilation.
- Tax-year maintenance is data-driven: the registry discovers paired yearly federal/state files, validates every discovered table with the canonical schema, and fails on incomplete years, malformed values, unknown jurisdictions, or unresolved citations. The longevity drill injects a temporary next-year pair, runs the full tax suite, proves exact selection and visible later-year fallback, then restores the repository.
- State jurisdictions, names, benefit types, source metadata, and benefit-policy citations each have one canonical owner. Policy citations travel with the selected tax year, while state options and repository types use the exhaustive 50-state-plus-DC vocabulary.
- Application styles are colocated by surface with common primitives factored once. Browser checks after the split passed at 390x844, 844x390, and 1440x900 with no horizontal overflow or visual regressions.
- The final remediation verification before approval rounds passed the longevity drill, formatting, lint, TypeScript, 30 test files / 222 tests, and the production build.

## Wave 9 — daily money cockpit and House by 30

- Rebuilt the authenticated default around one selected-period answer, Fast Log, Home, Budget, Activity, Plan, Monthly Wrap, category management, dated transaction correction, allocation visualization, and exact savings-impact math while retaining tax, benefits, comparison, export, privacy, and account controls.
- Added separate archive-safe category and dated transaction entities through PostgreSQL, API, IndexedDB, outbox, reconciliation, export, copy-forward, and account-isolation boundaries. Future actuals are excluded from reporting, rejected from new durable writes, and exposed for correction if legacy data exists.
- Home, period changes, Fast Log, Activity, category management, Budget, Wrap, Plan editing, and deterministic calculations passed blocked-network and cold-relaunch flows. Compound offline category plus transaction creation replayed exactly once after reconnect and was cleaned from the test account.
- Renamed the product to **House by 30**, centralized the product name/mark, updated export/manifest/public copy, and installed a new house-plus-growth app icon at 180, 192, 512, and 1024 pixels.
- The objective production viewport matrix covered 320×568 through 3440×1440, phone landscapes, tablets, desktops, and a 720×450 200%-zoom equivalent. Every viewport had zero horizontal overflow, visible inputs at 16px or larger, and no visible mobile/coarse action below 44px.

## Wave 10 — final hardening and convergence

- The whole-repository code loop ran 41 recorded cycles. The unchanged code candidate `46c78ef` earned two independent clean approvals in cycles 40 and 41 with C0/I0/M0.
- Late hardening repaired future-actual quarantine, current-year startup/rollover, local-day refresh, rejected offline transaction recovery, Fast Log focus trapping/restoration, modal-local repeated-save announcements, account-generation/owner-signal fencing for copy-forward, and account-lifetime sync-receipt idempotency.
- The cold-offline integration oracle now mounts the real plan workspace and sync hook over real IndexedDB. It records an inline-created category plus Fast Log transaction, cold-restores both with networking unavailable, then proves one unique HTTP delivery, an empty outbox, and the saved server state.
- The CSS gate now parses declaration values and at-rules, decodes escapes, removes comments without corrupting quoted strings, rejects raw colors and every CSS length unit, validates `var()` grammar and custom-property authority, and distinguishes invalid unary signs from valid binary `calc()` arithmetic.
- Final `pnpm verify` passed formatting, the 214-token zero-exception UI audit, lint, TypeScript, 61 test files / 476 tests, generated assets, and the Next.js 16.2.11 production build. `pnpm audit --prod` reported no known vulnerabilities and `pnpm dedupe --check` passed.
- Production root and API responses carry clickjacking, MIME-sniffing, referrer, and device-permission protections without the framework disclosure header.
- Two final production performance passes stayed below every frozen budget. Separate 10,000-transaction PostgreSQL passes retained the intended indexes, sub-millisecond filtered queries, and roughly 32–35ms hydration/bootstrap/export paths.
- Monthly Wrap now visibly compares canonical total budget, spent/funded actuals, and signed remaining before its category and savings-impact explanations.
- Final production browser evidence is stored outside the repository at `/Users/michaelchen/.cache/agent-loops/kyle_financial/main/final-46c78ef/`.
- At the owner's explicit request, the remaining opinion-based daily-cockpit UI judging rounds were skipped. Objective browser regression, accessibility interaction, viewport, offline, reconnect, performance, token, and build gates were not skipped; no two-pass final daily-cockpit UI-loop convergence is claimed.
- Automated real Safari verification remains externally blocked. `safaridriver` returned: `Could not create a session: You must enable 'Allow remote automation' in the Developer section of Safari Settings to control Safari via WebDriver.` Installed-iPhone Safari remains an owner-device check.

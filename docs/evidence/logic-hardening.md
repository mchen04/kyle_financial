# Logic hardening evidence

Run date: 2026-07-12  
Deterministic seed: `20260712`  
Convergence target: 2 consecutive clean cycles

## Surface and invariant map

| Surface                         | Input dimensions                                                                                        | Required invariants                                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gross-to-net engine             | year, 51 jurisdictions, 3 filing statuses, income, benefit kind/amount/treatment, expense cadence/count | integer cents only; progressive slices do not overlap; taxes are finite and nonnegative; exact gross accounting; negative savings remains visible; table fallback is explicit                   |
| Benefit and expense aggregation | 12 benefit types, custom flags, percent/annual/monthly amounts, monthly/yearly expenses                 | equivalent representations agree; ordering does not change totals; payroll/employer/cash savings remain distinct; planning-limit warnings never alter entered amounts                           |
| Offline diff and reconciliation | 7 fields, timestamps, mutation IDs, plan year, account, duplicate delivery, batch order                 | changed fields emitted exactly once; inputs are immutable; replay is idempotent; account isolation; per-field last-write-wins by instant then mutation ID; acknowledged mutations are removable |

Text-oriented cases such as emoji, HTML, URLs, and whitespace are inapplicable to the typed numeric engine. Labels are persisted/displayed data rather than an input to any calculation or conflict decision; their length and trimming boundaries are covered by request schemas.

## Cycle 1 findings and fixes

1. Conflict versions were compared as ISO strings. A timestamp with fractional seconds such as `01:00:00.100Z` sorted before the earlier `01:00:00Z`. The comparison now uses epoch milliseconds, with mutation ID only as a true-instant tie-breaker.
2. The baseline lacked an implementation-independent fixture oracle and explicit matrix, metamorphic, mutation, and no-model guards. The added battery covers five full gross-to-net scenarios, 1,836 state/status/benefit combinations, boundary batch sizes, order/equivalence transformations, 3,000 rich randomized plans, 5,000 randomized conflict pairs, and the deterministic hot-path dependency guard.

## Mutation proof

Two temporary mutations were applied and reverted before the clean verification:

- Reversing the timestamp comparison made 3 reconciliation tests fail immediately. Fast-check recorded seed `20260712`, shrunk counterexample `[0, 1]`.
- Replacing the progressive-bracket upper bound `min` with `max` made all 5 independent oracle scenarios and 3 existing golden tests fail.

The restored implementation passes `pnpm verify`: 9 test files, 49 tests, lint, typecheck, and production build.

## Cycle 2 findings

- Exact paycheck deductions participated in the accounting identity but were not exposed in `PlanResult`. The income-flow rail therefore used payroll savings as a proxy and could omit insurance premiums, FSA, commuter, or other non-savings deductions while claiming every dollar had a destination. The engine now exposes the exact deduction total and the rail uses that source of truth.
- Plan and sync validation accepted any two uppercase letters as a state. An offline `ZZ` mutation could reach PostgreSQL and make the next calculation throw. All write paths now share a tax-table-backed state validator; an integration regression proves the invalid mutation rolls back both the plan edit and receipt.
- The first blind output panel failed: financial intelligibility 4.5, trust 4.0, and edge predictability 6.0 (average 4.83, minimum 4.0, two blockers). It found per-entry rather than aggregate ESPP limit checks; no feasibility explanation for deductions above available pay; a misleading positive net-savings rate when take-home was negative; globally uniform state benefit treatment; object-key order creating false sync mutations; and future-table fallback copy phrased as though a past year had not been published yet.
- The fixes aggregate ESPP grant value; add a non-clamping paycheck-feasibility warning and cause-specific gap copy; report net savings rate as 0 when net pay is nonpositive; model cited CA/NJ HSA and PA 401(k) state exceptions in versioned data; compare sync objects canonically while preserving array order; and use direction-neutral fallback copy.

One panel assertion was refuted by primary evidence: New Jersey excludes employee 401(k) contributions from state wages. The official NJ wage guide supports retaining that treatment. The same review correctly exposed NJ HSA nonconformity, which is now modeled. Invalid stored timestamps were also not reproducible through an application path: both incoming mutations and persisted field versions are parsed as ISO datetimes before comparison.

## Cycle 3 findings

The rotated panel again failed (tax credibility 4.0, sync predictability 4.0, planner clarity 6.0; average 4.67, minimum 4.0, blockers present). Its distinct findings were fixed as one model-level wave:

- Income now separates primary salary/bonus wages, spouse wages, and non-wage taxable income. Benefits percentage against the primary payroll base, non-wage income avoids FICA, and MFJ Social Security caps independently per spouse.
- CA/NJ employer HSA add-backs, the $72,000 combined defined-contribution limit, catch-up-qualified base-limit copy, state approximation/citation result metadata, ESPP illustration notices/value, and reimbursement-account double-count guidance are explicit and tested.
- Infeasible payroll remains mathematically unclamped as required, but positive “total saved” celebration and net-rate output are suppressed in the UI; warnings show the entered amount, HSA coverage is editable, shortfall copy identifies the cause, and the gross-flow rail always allocates exactly gross while reporting the unfunded gap separately.
- Sync now diffs benefits and expenses per UUID, advances versions on ordinary online saves, retains removal tombstones, clamps future clocks, rejects mutation-ID content reuse, and atomically commits the IndexedDB plan cache with its outbox. Regression tests interleave online/offline saves, merge disjoint expenses, attack clock skew/ID reuse, and prove browser-storage rollback.

The tax reviewer’s claim that all entered additional income was intended as non-wage was resolved by adding explicit wage and non-wage inputs rather than choosing either assumption silently. The explicit goal requirement that over-limit entries continue through the what-if math was retained; feasibility state and presentation now prevent that hypothetical from masquerading as an achievable plan.

## Cycle 4 findings

The next rotated panel also failed (tax credibility 4.0, sync predictability 3.5, planner clarity 5.8; average 4.43, minimum 3.5, blockers present). Its findings drove another no-defer wave:

- All browser edits now enter the durable outbox first, regardless of `navigator.onLine`. Reconciliation drains chronological 500-mutation batches, de-duplicates concurrent runs, ignores a response when a newer local revision appeared in flight, and retries requested work after the active run. Property-level item mutations preserve compatible edits; ordered future-clock clamping preserves same-batch intent; advisory locks make simultaneous duplicate delivery idempotent; and benefit edits retain order.
- Benefits now have a primary/spouse payroll owner. Percentage amounts and FICA reductions use that owner’s wages, and feasibility checks each payroll against its own wage source instead of allowing spouse income to mask an impossible election.
- Investing-group ledger rows are added back to the honest total-saved figure. The 50/30/20 reference now classifies needs, wants, and saving/investing against one disclosed resource denominator. Negative-domain inputs throw, the flow distinguishes configured payroll from fundable capacity, tax components are visible, and gap guidance identifies the largest driver.
- The visible federal scope now distinguishes ordinary non-wage income from self-employment and capital-gain treatment. Dependent-care earned-income assumptions warn, ESPP input is bounded to the modeled 15% Section 423 discount, generic state conformity assumptions are explicit, and catch-up wording appears only on limits where it can apply.

Regression coverage now includes 501-item batching, per-property diffs, disjoint same-item server merges, future-skew ordering, spouse-owned benefits, masked payroll infeasibility, investment-savings invariance, dependent-care eligibility, invalid ESPP discounts, and corrupted negative inputs.

## Cycle 5 findings

The rotated panel failed again (tax credibility 5.0, sync predictability 3.0, planner clarity 4.5; average 4.17, minimum 3.0, blockers present). The repair wave addressed the panel’s concrete counterexamples:

- Employee 401(k), defined-contribution, health FSA, commuter, self-only HSA, and ESPP limits are checked per payroll participant; family HSA and dependent-care limits remain household-level. Dependent care now uses the lower wage earner. Combined payroll deductions also produce a feasibility warning when neither owner alone reveals the household after-tax gap.
- An infeasible payroll setup now replaces the positive plan headline with “Needs adjustment,” styles the answer as a problem, repeats actionable warnings on the Plan surface, and labels non-wage-inclusive output as after-tax household income. Benefit percentages name the selected owner wage base and show the computed annual dollars.
- Filing-status changes reassign hidden spouse-owned benefits to primary. Guidance consistently says “plan resources,” state approximation/citation IDs are visible, and common free-form saving/needs synonyms no longer silently fall into wants.
- The outbox compacts superseded same-field keystrokes before delivery and refuses to send an unresolved blank label. Per-year captured baselines prevent delayed writes from diffing against another year. Logout waits for local writes and reconciliation, refuses to destroy pending edits, and fences account state before cache deletion.
- Acknowledgement removal, empty-outbox detection, and server-plan cache replacement now share one IndexedDB transaction. Whole-item and property mutations share an entity version; stale properties cannot overwrite replacements and updates to deleted rows are acknowledged as not applied. Client clocks more than five minutes from server time are normalized while recent edit order is preserved.

Regression coverage now includes participant-scoped limits, lower-earner dependent care, transient invalid-label compaction, atomic acknowledgement/cache replacement, bounded clock skew, and reversed whole-item/property conflicts. The deterministic suite contains 73 passing tests after this wave.

## Cycle 6 findings

Cycle 6 failed (tax 5.8, sync 3.8, planner 7.4; average 5.67, minimum 3.8, blockers present) and exposed assumptions that required model changes rather than narrower guards:

- Sync mutations now carry the server field/entity version they were based on. A matching base applies even from a slow client clock; a day-old offline edit with a stale base cannot be promoted to “now” and overwrite a newer server save. Recent concurrent conflicts still use timestamp and mutation ID.
- Reconciliation removes acknowledgements, fetches a fresh server snapshot, and caches it only if the outbox remains empty and the snapshot is not older than the cached server revision. All year baselines update together. Baselines advance only after IndexedDB persistence succeeds, so a failed write remains in the next diff.
- Web Locks serialize account writes and logout across tabs. Logout checks the outbox, revokes the session, writes a cross-tab logout tombstone, deletes account storage, and clears remembered identity under one lock. A waiting tab cannot recreate private cache data after logout.
- Invalid labels are skipped rather than blocking valid batches; an unresolved invalid row remains pending/error until corrected. A 500-valid-plus-one-invalid regression proves independent work drains. Multi-tab stale-response and logout-marker regressions cover the former cache/data-loss races.
- Payroll feasibility reserves each owner’s Social Security and Medicare before employee deductions. The result identifies the offending owner; Plan guidance uses that owner’s largest choice, and Compare reports “Needs adjustment” instead of a green surplus.
- Transit and qualified parking are distinct benefit types with separate $340 monthly limits. HOH visibly names its state Single-schedule proxy, state source IDs link to publishers, dependent-care copy names lower-earner wages, and reimbursement notices appear beside the expense ledger.
- Every expense row now exposes its inferred Need / Want / Saving bucket as an editable control. Common free-form labels are also recognized, preventing silent authoritative-looking 50/30/20 misclassification.

The expanded deterministic suite contains 80 passing tests, including base-version clock/stale-edit cases, per-owner FICA capacity, separate transit/parking limits, explicit HOH proxy metadata, stale cross-tab responses, safe logout tombstones, and invalid work beyond the batch boundary.

## Cycle 7 findings

Cycle 7 failed just below the planner bar (tax 7.6, sync 6.3, planner 8.2; average 7.37, blockers present). The final repair wave removed the remaining coupled state and partial-failure assumptions:

- Expense guidance bucket is now an independent persisted field, backed by migration 004. Editing a label such as “Medical copays” cannot silently change Need/Want/Saving, and changing the bucket no longer destroys the custom group label.
- Per-owner payroll capacity now includes mandatory 0.9% Additional Medicare withholding above each employee’s $200,000 employer threshold. Single/HOH plans reject spouse wages or spouse-owned deductions. Monthly benefit and expense schemas cap amounts before annualization can exceed safe integer cents. Transit/parking copy discloses that monthly limits are annualized because month-level elections are not inputs.
- Federal, FICA, and benefit source IDs now render as publisher links. Compare retains the quantitative cash result for infeasible years, and feasibility warnings label their threshold as modeled capacity after mandatory payroll withholding.
- Startup session restoration no longer clears a logout tombstone; only an explicit login may do that. Logout broadcasts across tabs to evict rendered private plans. The IndexedDB lease fallback preserves serialization when Web Locks are unavailable, and offline startup refuses remembered data carrying a logout marker.
- Cache freshness merges per plan year. Local cache writes apply field mutations to the existing cached plan rather than replacing full stale snapshots. Server batches prevalidate every supported mutation payload, quarantine malformed items, and continue applying valid peers. Rejected edits remain visibly failed rather than becoming “Saved.”
- Authenticated server use now survives IndexedDB denial/failure. Volatile persistence failure remains an error until a later successful durable write. Logout marks the account before revocation, rolls the marker back if revocation fails, then broadcasts and best-effort clears cache/identity; the marker protects privacy even if deletion is blocked.

The battery now contains 88 tests across 10 files, including per-year cache merges, stale-startup logout markers, cross-tab field-cache merges, malformed/valid mixed server batches, Additional Medicare owner capacity, independent expense buckets, and safe annualization boundaries.

## Cycle 8 findings

Cycle 8 still failed overall despite the planner passing (tax 7.8, sync 7.2, planner 8.6; average 7.87, blockers present). Its final blocker set produced another boundary-focused repair:

- Whole-plan schemas now enforce spouse/MFJ consistency and a conservative aggregate safe-integer ceiling across incomes, annualized benefits, and annualized expenses. Sync simulates each plan-year batch against the current plan and rejects a final cross-field-invalid result before persistence. Property mutation validation reuses the bounded configured-amount schema and conservatively caps expense amounts for safe monthly annualization.
- Additional Medicare’s per-employee $200,000 withholding threshold moved into the versioned/cited FICA table. Targeted schema, engine, and sync tests cover aggregate overflow, spouse consistency, final-plan rejection, and malformed envelope isolation.
- The fallback IndexedDB lease now lasts five minutes and renews every 30 seconds while work is active. Shared cache application compares incoming mutations with all queued entity/property versions, so a late older same-field mutation cannot regress offline-visible state.
- Sync parses mutation envelopes independently as well as payloads; a bad UUID/date/year/field is quarantined while valid peers continue. Explicit-login IndexedDB failure falls back to server plans and remains visibly failed. Logout cleanup reports a visible account-entry notice if physical cache deletion could not finish, while the tombstone continues protecting access.
- Mobile keeps the payroll legend label visible, infeasible Compare rows retain their quantitative cash result, and federal/state citation links use descriptive publisher text. The production README now makes migrations-before-start explicit.

The battery contains 93 tests across 10 files after this wave, including aggregate schema bounds, mixed malformed envelopes, final sync plan invariants, and delayed same-field cache ordering.

## Cycle 9 findings

Cycle 9 failed (tax 6.2, sync 5.5, planner 8.3; average 6.67, blockers present). The repair wave closed the reviewers' remaining persistence-boundary and quantitative-clarity counterexamples:

- Final-plan validation now occurs after reconciliation has selected the actual winning mutations and while the plan row remains locked in the same SQL transaction. A stale no-op cannot poison a valid peer, and a concurrently introduced invalid state cannot slip between preflight and commit. Invalid years roll back independently with rejected acknowledgements.
- Scalar create/PATCH validation rejects a combined income total beyond safe integer cents. Full-plan validation includes ESPP gross-up in its aggregate, and cadence-aware final validation permits safe annual expenses without weakening the monthly bound.
- Leaving MFJ transactionally reassigns persisted spouse benefits to primary and advances the matching owner versions, so a direct API edit cannot strand a hidden invalid owner.
- Offline queued-version comparisons are scoped by `(plan year, field)`. The unfenced IndexedDB lease fallback was removed: browsers without Web Locks receive a visible local-persistence failure rather than a false serialization guarantee.
- Infeasible payroll flow now reports the actual fundable deduction capacity, not the entered deduction total. Compare uses explicit table header/cell roles, zero-dollar benefit notices and sources stay hidden, and participant-limit copy discloses the model's per-owner scope because employer/plan identifiers are not inputs.
- A null sync JSON body now receives a validated client error instead of producing a route exception.

The deterministic battery contains 98 passing tests across 10 files, including committed-winner validation, combined-income and ESPP aggregate overflow, MFJ transition persistence, year-scoped queued versions, and fundable payroll capacity.

The optimized production server also passed authenticated boundary smoke checks: login, session restoration, and plan loading returned 200, while a null sync envelope returned the intended 400 response. A new visual browser pass could not run because the in-app browser surface was unavailable; no visual claim was inferred from the HTTP checks.

## Cycle 10 findings

Cycle 10 failed (tax 6.8, sync 5.2, planner 6.5; average 6.17, blockers in every lane). Nineteen findings drove a cross-layer repair wave:

- Every private request now carries the account expected by the rendered client. The server rejects a shared-cookie account change before any read or write, authentication broadcasts evict stale tabs, and account-bound exports use the same fence. Global shell locking and conditional remembered-user clearing prevent one account's logout from erasing another account's offline identity.
- Rejected and volatile writes persist as unresolved state across later empty reconciliation. `Saved` requires no queued, rejected, or volatile work, and logout refuses any displayed draft that differs from its durable snapshot.
- Mobile expense reordering remains available; coarse-pointer controls meet 44px and mobile form text remains at least 16px. The next-year action keeps visible text instead of collapsing to an unexplained icon.
- Plan shows signed monthly savings plus gross and take-home savings rates. The annual flow distinguishes payroll saving, other payroll deductions, each expense group, and cash savings with visible cadence. Compare adds annual group columns, so equal aggregate spending cannot hide a category shift.
- Onboarding explicitly labels primary-earner wages. Client currency, benefit, percentage, and ESPP parsing clamp unsafe values before render. Exact-cent tax components reconcile with the displayed total.
- Executable benefit-treatment metadata now carries active source IDs. Tests cover every federal bracket edge, exact Social Security and Additional Medicare boundaries, and a full benefit/expense MFJ pipeline golden.

The combined battery contains 111 passing tests across 13 files, followed by lint, typecheck, optimized build, diff, and secret-scan gates. Exact SmartAsset/ADP calculator outputs remain a separate research acceptance item: public text pages exposed formulas but not filled interactive results, and the unavailable in-app browser prevented a truthful new capture.

An optimized-server smoke then proved the account fence end to end: the expected account loaded plans with 200, while both a missing and mismatched account binding returned 409 before access; a bound null sync envelope returned 400.

## Cycle 11 findings

Cycle 11 failed (tax 7.6, sync 6.7, planner 8.3; average 7.53, blockers present). Eleven findings produced another root-cause wave:

- Test runs now create isolated random PostgreSQL schemas, including failure cleanup. Two concurrent full test processes both passed and left zero test schemas.
- Migration 005 adds `commuterParking` to the live benefit constraint; empty, repeat, upgrade, and real sync-persistence paths are covered. It was applied successfully to Neon.
- Draft comparison now runs inside the serialized durable-write chain, so rapid edit then revert persists the final intent. Logout revokes the presented session without returning a stale cookie deletion that could erase a newer cross-tab login.
- New plans seed neutral benefit amounts rather than silently assuming a 401(k) election or employer match. The logic battery adds zero income, randomized percent/fixed equivalence, wage and deduction monotonicity, and exact display reconciliation.
- Monthly headline, take-home, expenses, savings, and Compare values use exact cents. Mobile Compare uses bounded cards with every group while desktop retains its semantic table. Nested benefit controls meet the 44px target, save failures distinguish device/server/connection recovery, and tax mechanics start collapsed.

The combined gate passed 120 tests across 15 files, formatting, lint, typecheck, optimized build, diff, and secret scan. Browser checks at 390px and 1440px confirmed bounded responsive Compare, exact visible arithmetic, required target sizes, collapsed disclosure, and a clean console.

## Cycle 12 findings

Cycle 12 failed overall (tax 8.8 pass, sync 7.8, planner 6.8; average 7.8, blockers present). Seven findings drove the repair:

- Complete candidate drafts are validated before calculation; an unsafe aggregate edit keeps the last calculable draft, is not persisted, and reports why.
- A synchronous in-memory intent ledger makes year navigation select the newest edit even while IndexedDB is delayed, preventing a stale selection from manufacturing a revert.
- The service worker is generated from the deployment/git SHA. Every release changes its bytes and cache identity; activation prunes prior shell caches while preserving unrelated caches.
- Zero-minimum grid tracks and wrapping eliminate Plan clipping at 390x844, 430x932, and 844x390. A first-tab skip link reaches primary mobile navigation, citation targets are 44px on coarse pointers, and expected network failure restores the truthful Offline state.

The combined gate passed 124 tests across 16 files, formatting, lint, typecheck, build, diff, and secret scan. Browser measurements showed document width exactly equal to each required viewport, all controls in bounds, first-tab navigation bypass, exact 44px mobile source links, and offline edit restoration followed by successful reconnect.

## Cycle 13 findings

Cycle 13 failed overall (tax 8.8 pass, sync 6.4, planner 8.4; average 7.87, blockers present). Seven findings were fixed:

- Offline restoration rechecks the logout tombstone under the account lock and logout broadcasts cancel an in-flight restore before private state can enter React.
- Copy-forward waits for local persistence and reconciliation, refuses rejected or unsynced sources, and merges the created year with pending local intent so it stays visible.
- Reconciliation distinguishes network Offline, HTTP Sync failed, and IndexedDB Device save failed states while preserving the volatile-write fence.
- Client and server share one aggregate-admissibility predicate. Unsafe income, benefit, or expense aggregates never forward to persistence, and calculation alerts clear on year change.
- Expense money inputs now measure an effective 44px at every required viewport.

The combined gate passed 134 tests, formatting, lint, typecheck, optimized build, and diff checks. Browser measurements across all six required viewports found 22/22 expense inputs at least 44px, no horizontal overflow, and no visible undersized targets.

## Cycle 14 findings

Cycle 14 failed overall (tax 9.2 pass, sync 7.8, planner 8.2; average 8.4, blockers present). Four findings were fixed:

- Copy-forward holds a shared per-account intent lock from readiness through the request, sends reconciled source-version preconditions, and rejects any intervening intent.
- PostgreSQL locks the source plan before checking those preconditions and copies scalars, benefits, and expenses from one consistent transaction snapshot.
- Empty, malformed, or non-object HTTP responses become protocol `HttpError`s rather than false device-persistence failures; a successful durable reconciliation clears a stale volatile fence.
- Every annual Plan flow and desktop/mobile Compare value displays exact cents, including groups, totals, gross, tax, and infeasible disclosures.

The combined gate passed 142 tests, formatting, zero-warning lint, typecheck, optimized build, and diff checks. Browser validation reproduced exact `$14,814.72` and `$12,000.12` annual values and their reconciling monthly results.

## Cycle 15 findings

Cycle 15 failed as a strict gate (tax 9.2 pass, sync 8.2 with blocker, planner quality 8.8 but mandatory evidence incomplete). Four findings/evidence gaps remained:

- Reconciliation no longer clears a volatile local-write failure after a mere successful session check. Only successful persistence of current intent clears it; an empty online reconciliation remains `Device save failed` rather than falsely becoming `Saved`.
- Fresh planner checks reconfirmed exact annual/monthly cadence, synchronous state recomputation, actionable negative savings, six-viewpoint geometry, 44px targets, and 16px mobile inputs.
- Copy-forward confirmation, cold offline reload/reconnect, and 200% text zoom were not all completed in that fresh browser run, so the cycle received no clean-pass credit despite no reproduced planner defect.

The repair gate passed 143 tests, formatting, lint, typecheck, optimized build, and diff checks.

## Cycle 16 findings

Cycle 16 failed overall (tax 8.1 with blocker, sync 9.1 pass, planner 9.33 pass). Five findings were fixed despite two sync items being non-blocking:

- HSA tax exclusions now depend on a visible qualified-HDHP/no-disqualifying-coverage assumption. A general Health FSA plus employee or employer HSA preserves entered what-if amounts but conservatively grants no HSA federal, FICA, or state exclusion and warns on Plan and Benefits.
- Pennsylvania executable overrides now include dependent-care FSA, transit, and parking salary reductions, backed by fixed-value tests independent of the production mapping.
- IndexedDB assigns monotonic local intent sequences, so device-clock rollback cannot cause cache/compaction to discard the later edit; server timestamp/base-version semantics remain unchanged.
- Retry device save now reruns failed startup identity/cache persistence even when the draft equals its baseline and clears the fence only after durable success.

The combined gate passed 150 tests, formatting, lint, typecheck, optimized build, browser HSA conflict checks, and diff checks. Planner evidence completed copy confirmation/prior-year integrity, cold offline reload/edit/reconnect, all six viewports, 200% reflow, 44px targets, 16px inputs, exact Plan/Compare values, and a clean console.

## Cycle 17 findings

Cycle 17 failed overall (tax 9.0 pass, sync 5.9 with blockers, planner 9.2 pass). Five actionable findings were fixed:

- Outbox records retain original edit timestamps but add persistent monotonic delivery timestamps, preserving whole-entity/property admission order through device-clock rollback.
- Startup persistence retry merges pending cached intent back into `plans`, `draft`, refs, and durable snapshots instead of merely reading it.
- Persistence retries carry an account ID, replace rather than chain across accounts, and are canceled on login, logout, account change, broadcast/409 eviction, preventing a stale retry from clearing another account's tombstone.
- Pennsylvania HSA traceability now separates compensation guidance, the HSA deduction guide, and payroll Letter Ruling PIT-06-005. The headline now says “Spendable after taxes and payroll deductions.”

The combined gate passed 153 tests, formatting, lint, typecheck, optimized build, and diff checks.

## Cycle 18 findings

Cycle 18 failed overall (tax 9.3 pass, sync 7.9 with blocker, planner 9.2 pass). Five findings, including low-severity polish, were closed:

- Persistence retries now use account ID plus lifecycle generation; stale admissions, completions, and failures cannot replace or mutate the active account's retry or status.
- Ordered delivery carries `intentUpdatedAt`: monotonic delivery time preserves hierarchical application order, while original intent semantics keep duplicate fingerprints stable across upgrades. The server accepts both semantic and legacy delivery-form receipts during transition.
- Fixed Pennsylvania employee-payroll and employer-HSA taxable-income regressions now lock those outcomes independently, and conflict copy says “Tax-excluded HSA amount $0.”
- The keyboard skip link now has an explicit 44px minimum focus target.

The combined gate passed 157 tests, formatting, lint, typecheck, optimized build, and diff checks.

## Cycle 19 findings

Cycle 19 failed overall (tax 8.2 due the external-validation blocker, sync 7.9 with blocker, planner 9.3 pass). Both findings were closed:

- Server future-clock normalization now stays strictly newer than the relevant persisted entity/field version across request boundaries. A 1,001-mutation `500/500/1` regression proves a later property survives cross-batch skew.
- Live SmartAsset annual calculator captures now cover TX, IL, CA, NY, and FL with exact components and assumptions. Every Kyle net result is within 0.35% of SmartAsset, closing the separate Wave 1 ±2% gate.

The combined gate passed 158 tests, formatting, lint, typecheck, optimized build, calculator component/delta recalculation, and diff checks.

## Cycle 20 findings

Cycle 20 failed overall (tax 8.1 with blocker, sync 7.8 with blocker, planner 8.8 pass). Four substantive findings were closed:

- Benefit tax exclusions now stop at modeled 401(k), combined defined-contribution, HSA, Health FSA, dependent-care, transit, and parking limits while full entered paycheck amounts remain visible. Excess is post-tax; excess employer HSA is added back to applicable income bases.
- Eligible allocation across entries/owners is deterministic and order-independent. Warnings disclose unmodeled catch-ups, corrections, plan remedies, and excise taxes.
- Future-skew flooring now requires explicit `deliveryAfterMutationId` predecessor evidence. A live PostgreSQL inverse-lock regression proves an older request cannot overwrite a newer committed intent, while the 1,001-mutation cross-batch case still preserves hierarchy.
- Raw SmartAsset DOM values and input provenance are stored in `docs/research/evidence/smartasset-2025-live.json`, with component and delta validation.

The combined gate passed 165 tests, formatting, lint, typecheck, optimized build, live browser evidence validation, and diff checks.

## Cycle 21 clean pass

The fresh panel passed every lane: tax 9.2, sync 9.2, planner 8.6; average 9.0, minimum 8.6, no blockers. Focused tax and sync batteries, the full 165-test gate, exact capped-excess behavior, durable calculator evidence, ordering, account isolation, and responsive/accessibility source and browser checks all held. This is convergence streak 1 of 2.

## Cycle 22 findings

Cycle 22 failed overall (tax 8.8 pass, sync 7.8 with blocker, planner 9.2 pass), resetting the clean streak. Four actionable findings were closed:

- Entity-aware compaction makes a later whole delete/replacement remove every older property mutation, including invalid blank labels/names; later properties remain ordered after the retained whole mutation and predecessor hints never reference discarded work.
- Exact full-path engine regressions now cover all five SmartAsset scenarios, and the validation wording matches that coverage.
- A strict Zod-backed test validates the durable SmartAsset artifact's schema, uniqueness, capture date, component sums, gross reconciliation, cent/percent deltas, and ±2% gate.
- Visible and research copy disclose deterministic employee-before-employer HSA cap allocation and employer excess add-back.

The combined gate passed 178 tests, formatting, lint, typecheck, optimized build, and diff checks.

## Cycle 23 findings

Cycle 23 failed overall (tax 7.8 with blocker, sync 9.4 pass, planner 8.1). Six findings were closed:

- The SmartAsset validator locks exact scenario IDs/order, locations, incomes, filing statuses, and zero adjustments, imports `calculatePlan`, and derives every Kyle component/net from evidence inputs rather than trusting recorded results.
- The provenance manifest honestly records unavailable original raw paths plus replay instructions; the 2025-vs-2026 comparison remains labeled a sanity gate, not a same-year oracle.
- MFJ family HSA defaults to equal spouse shares per IRS guidance, with deterministic employee-before-employer allocation within each spouse and wage-base-sensitive tests.
- Fresh plans show six common zero rows; untouched defaults remain behind an accessible unused-category disclosure, while every nonzero/renamed/custom row stays visible and persisted. Warning stacks retain overflow in native details.
- DOM, accessibility, keyboard, and visual order now agree: answer, Income and taxes, ledger. Named grid areas preserve phone, landscape, tablet, and desktop layouts.

The combined gate passed 184 tests, formatting, lint, typecheck, optimized build, browser keyboard/accessibility checks, and six overflow-free viewports.

## Cycle 24 findings

Cycle 24 failed overall (tax 8.0 with blocker, sync 7.8 with blocker, planner 8.17). Six findings were closed:

- Plans now persist explicit primary/spouse HSA eligibility and complementary family allocation. Both eligible defaults to 50/50, a sole eligible spouse receives 100%, and users may set a 0–100 agreement; employee/employer contributions consume each owner's share.
- Migration 006, repository create/update/replace/copy/export, validation, scalar sync versions, offline legacy normalization, non-MFJ normalization, conditional UI, and asymmetric wage-base tests cover the new model end to end.
- Invariant-aware bounded batching keeps coupled filing status, spouse wages, HSA scalars, and benefit-owner changes together while deferring independent work and staying at 500. Rejected groups remain queued and reconciliation stops rather than deleting intent.
- HSA messages span the answer card, stack at phone widths, avoid redundant zero-allocation warnings for ineligible owners, and use 44px eligibility targets.

The combined gate passed 197 tests, formatting, lint, typecheck, optimized build, browser MFJ/family persistence and responsive warning checks, and diff checks.

## Cycle 25 findings

Cycle 25 failed overall (tax 8.2 with blocker, sync 7.6 with blocker, planner 7.0). Seven substantive findings were closed:

- MFJ self-only plans expose spouse HSA eligibility directly; family allocation remains family-only, coverage transitions preserve visible eligibility, and negotiated allocations survive reversible UI toggles while persisted state stays canonical.
- Sync rejects and rolls back noncanonical HSA groups instead of silently rewriting unversioned scalars. Explicit coupled winners version every changed field; stale cross-device transitions preserve allocation values, metadata, and copy preconditions.
- Per-owner age-55 HSA catch-up eligibility is versioned, persisted, synced, and modeled with the cited 2026 $1,000 limit; employee-first ordering and employer excess add-backs remain exact across self/family/asymmetric owners.
- The mobile answer card is single-column with bounded typography, ineligible warnings use exact tax-exclusion wording, and eligibility/allocation warnings no longer duplicate or overlap.

The combined gate passed 212 tests, formatting, lint, typecheck, optimized build, browser persistence and five-viewport overlap checks, disposable migration coverage, and diff checks.

## Cycle 26 findings

Cycle 26 failed overall (tax 8.8 pass, sync 8.2 with blocker, planner 9.0 pass). Three findings were closed:

- Public plan reads now hydrate scalar/version rows and child collections inside read-only repeatable-read transactions. Sync final validation reuses its existing transaction. A live barrier regression proves concurrent writes cannot produce hybrid snapshots.
- HSA warning copy now describes catch-up-inclusive limits accurately, while retirement warnings retain pre-catch-up wording.
- Research copy distinguishes modeled per-owner HSA catch-ups from unmodeled retirement catch-ups and partial-year HSA eligibility.

The combined gate passed 214 tests, formatting, lint, typecheck, optimized build, live snapshot-concurrency coverage, five-viewport browser checks, and diff checks.

## Cycle 27 clean pass

The fresh panel passed every lane: tax 9.3, sync 9.2, planner 8.8; average 9.1, minimum 8.8, no blockers. The full 214-test gate, spouse/self/family/catch-up tax paths, repeatable-read hydration, canonical sync and bounded batching, mobile HSA workflow, responsive targets, and status semantics all held. This is convergence streak 1 of 2.

## Cycle 28 clean pass

The independent confirmation panel passed every lane: tax 9.2, sync 9.5, planner 9.1; average 9.27, minimum 9.1, no blockers. Calculation limits and catch-ups, canonical/versioned sync, repeatable hydration, copy/logout/offline isolation, mobile information order, HSA controls, exact warnings, save semantics, responsive layouts, and touch targets all held against the unchanged product commit. This completes the required 2-of-2 clean convergence streak.

# Daily cockpit performance evidence

Status: curated historical result; rerun the executable gates for current data

Repository-reference audit: 2026-07-28

Measured 2026-07-24 against the final production code candidate at `46c78ef`,
on the local Mac/PostgreSQL environment. These are executable local budgets,
not perceptual claims. The final check passed twice consecutively without a
performance fix between checks.

## Cached browser interactions

The harness used a persistent production Chrome profile at 390×844. It signed
in and cached the shell online, exercised common surfaces, blocked all browser
networking, created 12 distinct transactions per cycle, waited for each exact
title to appear in the account-scoped IndexedDB plan record, reloaded cold
while still offline, then reconnected and waited for the outbox to drain. Each
interaction waited through two animation frames after the expected state
rendered. The disposable transactions were deleted after each cycle.

| Operation                                 | Samples/cycle | Cycle 1 p95 | Cycle 2 p95 | Frozen gate |
| ----------------------------------------- | ------------: | ----------: | ----------: | ----------: |
| Cached primary-tab switch                 |            40 |      66.8ms |      66.8ms |     < 100ms |
| Selected-period switch                    |            30 |      66.7ms |      66.7ms |     < 100ms |
| Activity local filter                     |            20 |      33.5ms |      33.5ms |     < 100ms |
| Monthly Wrap local calculation/navigation |            10 |      66.7ms |      66.7ms |     < 200ms |
| Offline Fast Log visible + durable commit |            12 |      43.1ms |      30.9ms |     < 200ms |

The offline cold reload returned useful Home with navigation load timing of
**53.3ms** and **39.1ms**, well below the one-second installed-shell target.
Each cycle produced 12 pending transaction mutations. Reconnect drained the
outbox in **55.9ms** and **35.7ms**; the server then contained exactly 12
distinct matching titles in each cycle, proving no duplicate replay.

The same production profile was checked at 320×568, 390×844, 667×375, and
1440×900 while this harness was built. The formal final viewport matrix is
recorded separately after UI convergence.

## PostgreSQL scale

`src/server/plans/repository-performance.test.ts` creates an isolated user and
plan, inserts **10,000** dated transactions distributed across the real seeded
categories, analyzes the table, and runs real repository/export/copy paths.
The test requires both transaction indexes and asserts the period/category
query plans use their intended index with execution below 50ms. Hydration,
bootstrap, export, and copy each have a 500ms hard test ceiling.

Recorded local values:

| Operation                                      | Cycle 1 | Cycle 2 | Hard gate |
| ---------------------------------------------- | ------: | ------: | --------: |
| Selected-month transaction query               | 0.299ms | 0.284ms |    < 50ms |
| Selected-month + category transaction query    | 0.015ms | 0.016ms |    < 50ms |
| Complete plan hydration, 10,000 transactions   | 32.94ms | 31.55ms |   < 500ms |
| Account bootstrap/list, 10,000 transactions    | 35.29ms | 34.18ms |   < 500ms |
| Complete account export, 10,000 transactions   | 32.71ms | 31.87ms |   < 500ms |
| Copy-forward structure without transaction log |  2.44ms |  2.40ms |   < 500ms |

The repository hydrates all plan collections in three batched collection
queries, not one query per plan/category/transaction. Copy-forward duplicates
category structure and allocations but returns zero transaction history.

## Build, request, migration, and regression floor

The final candidate ran `pnpm verify`: format, the 214-token zero-exception UI
audit, lint, TypeScript, all 61 test files / 476 tests, generated
service-worker/tax assets, and the Next.js 16.2.11 production build passed.
`pnpm audit --prod` reported no known vulnerabilities and
`pnpm dedupe --check` passed. The two browser cycles repeated cached use,
offline durability, cold launch, reconnect, exact-once replay, and cleanup
checks against the production build.

The production artifact contains 15 JavaScript chunks totaling 1,209,401 bytes
uncompressed on disk; the largest is 397,371 bytes. Common-path request
inspection showed one bootstrap request on reload and no navigation request
waterfall; additional sync/export requests corresponded only to harness
mutations and server verification.

The database test runs `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` and requires
`transactions_plan_date_idx` and
`transactions_plan_category_date_idx` in the selected period/category plans.
The migration suite proves an empty schema, idempotent rerun, and upgrade of an
existing yearly plan without inventing transactions.

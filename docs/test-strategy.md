# Verification strategy

## Automated layers

- Domain unit/golden tests assert tax intermediates, explicit zero and threshold boundaries, exact-cent accounting, and display reconciliation.
- Fast-check properties cover wage/take-home and deduction/take-home monotonicity where mathematically valid, percent/fixed equivalence, sum invariants, and randomized plans.
- Schema tests prove 50 states plus DC, ordered brackets, valid rates, and citations.
- DAL integration tests apply migrations to a dedicated local PostgreSQL database, test atomic per-IP/per-identity authentication throttling, concurrent bucket reactivation versus bounded expiry cleanup, universal signup invitations, opaque signup and uniform login password verification, auth/session expiry, account isolation, CRUD, unique plan years, deep copy, and export.
- Offline tests use a fake IndexedDB environment to prove caching, idempotent replay, conflict ordering, and logout deletion.
- Component tests cover instant recomputation and accessible controls where browser E2E is not the stronger proof.
- `pnpm verify` runs format check, lint, typecheck, all tests, and production build.

Tests never use the Neon connection. The test command requires a local URL whose database name ends in `_test`; the harness refuses any other database, creates a unique per-run schema, scopes every connection and migration to that schema, and removes it after the suite. Concurrent test processes therefore cannot reset or mutate one another's schema.

## Browser gate

Production browser passes cover 390x844, 430x932, 320x568, 844x390, 768x1024, and 1440x900, plus 200% text zoom. Required flows, activation budgets, keyboard order, accessibility scans, console/network checks, installability, offline cold relaunch, reconnect, and cache clearing run twice clean. Evidence lives in `docs/evidence/browser-ux.md`.

## Performance and visual gates

Lighthouse runs against a production build with a realistic plan. Thresholds are Performance 90, Accessibility 95, Best Practices 95, LCP 2.5 seconds, and CLS 0.10. The UI quality loop judges captured surfaces at phone, small phone, and desktop until average 8.5+, every dimension 8+, and no blockers. Structural quality then converges for two independent clean passes.

# House by 30

Offline-first daily money cockpit backed by an annual plan. House by 30 turns yearly income, estimated taxes, payroll benefits, and category allocations into a selected-period safe-to-spend answer; dated transactions update Home, Budget, Activity, Monthly Wrap, and projected savings immediately. Plans are private per account, persist in PostgreSQL, and remain editable offline through an account-scoped IndexedDB outbox.

## Local setup

Requirements: Node 20+, pnpm, and PostgreSQL.

```bash
pnpm install
export DATABASE_URL='postgresql://...'
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000` and create an account with an email and a password
of at least 10 characters. Public registration is limited to five attempts per
IP and three attempts per normalized email each hour. Migrations must run
before the application starts; apply every ordered SQL file in
[`migrations/`](migrations/) through `pnpm db:migrate`. Never point automated
tests at production: `TEST_DATABASE_URL` defaults to the isolated local
`kyle_financial_test` database.

## Verification

```bash
pnpm verify
```

The gate runs formatting, token-authority checks, lint, TypeScript, deterministic unit/property/integration tests, and a production Next.js build. PostgreSQL tests create an isolated local test database and apply every migration from empty.

## Yearly tax-table update

1. Copy the prior year's `src/domain/tax/tables/<year>.federal.json` and `<year>.states.json` to the new year and replace every value, citation ID, and `sources` label/URL from the current IRS, SSA, and Tax Foundation sources.
2. Keep each JSON file's top-level `year` equal to its filename. No TypeScript registry edit is needed: `pnpm verify` discovers complete filename pairs, validates all 50 states plus DC and every citation destination, and regenerates the compiler-checked registry.
3. Update `docs/research/sources.md` and `docs/research/tax-validation.md`, including the five external gross-to-net comparisons.
4. Run `pnpm tax:longevity-drill` and `pnpm verify`, review the diff, commit the two data files plus evidence, and redeploy.

If a requested year is absent, the app selects the latest prior table and visibly labels the applied tax year. The drill creates a temporary next-year pair, proves exact selection plus later-year fallback, and removes it again.

## Account recovery and deletion

There is intentionally no email reset service. For a manual password reset, work from a trusted shell with a database backup: generate a replacement using `hashPassword` in `src/server/auth/crypto.ts`, update only the matching normalized `users.email` row's `password_hash`, and delete that user's `sessions` rows so every device must sign in again. Run both statements in one transaction and verify exactly one user row matched before commit. Never paste the password or database URL into shell history, logs, or source.

Users can permanently delete themselves from Account. The app first makes local edits durable, then deletes the user row and all owned sessions/plans through foreign-key cascades, clears IndexedDB, and broadcasts logout. For emergency operator deletion, export first if possible, then delete the single confirmed `users` row inside a transaction; do not truncate or reset the schema.

## Install on iPhone

Open the deployed HTTPS URL in Safari, tap Share, choose **Add to Home Screen**, and open House by 30 from the new icon. Safari has no install prompt, so the Account screen repeats these steps. Complete one online sign-in and sync before testing an offline launch; afterward the cached Home, Fast Log, Activity, Budget, Wrap, and Plan flows work without a network connection.

## Production and Vercel runbook

Provide the server-only `DATABASE_URL`, then run migrations before starting the new build:

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm build
pnpm start
```

For Vercel, create or link the project, add `DATABASE_URL` as an encrypted
Production environment variable, and run `pnpm db:migrate` once from a trusted
local shell against the production database before deploying. Then deploy with
`vercel deploy --prod`, exercise public signup, plan creation, export, and
deletion on the live URL with disposable data, run the production Lighthouse
gate, and perform the iPhone install check. Migrations are ordered and
idempotent; never reset the production schema during deployment. Roll back
application code by redeploying the prior known-good commit—do not roll back or
delete data migrations.

The service worker caches only the public app shell and build assets; `/api/**` and private plan JSON are never stored in Cache Storage. See [architecture](docs/architecture.md), [offline and sync behavior](docs/offline-and-sync.md), and [research sources](docs/research/sources.md).

Signed-in users can export every plan year, category, and transaction as one server-backed JSON file from Account. A second account-scoped device export remains available offline for the data currently cached on that device. Ordinary logout revokes the session and clears the local private cache without deleting server plans.

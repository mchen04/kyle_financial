# Kyle Financial

Plan-based budgeting PWA that turns yearly income, estimated taxes, payroll benefits, and planned expenses into an honest monthly remainder. Plans are private per account, persist in PostgreSQL, and remain editable offline through an account-scoped IndexedDB outbox.

## Local setup

Requirements: Node 20+, pnpm, and PostgreSQL.

```bash
pnpm install
export DATABASE_URL='postgresql://...'
export REGISTRATION_SECRET="$(openssl rand -base64 48)"
pnpm db:migrate
pnpm auth:invite
pnpm dev
```

Open `http://localhost:3000` and paste the generated universal invitation when creating an account. `REGISTRATION_SECRET` is server-only and must contain at least 32 random bytes; keep it stable so the trusted-shell command produces the same invitation. Rotate the secret to invalidate the old invitation and mint a new one. Migrations must run before the application starts; apply every ordered SQL file in [`migrations/`](migrations/) through `pnpm db:migrate`. Never point automated tests at production: `TEST_DATABASE_URL` defaults to the isolated local `kyle_financial_test` database.

## Verification

```bash
pnpm verify
```

The gate runs formatting, lint, TypeScript, deterministic unit/property/integration tests, and a production Next.js build. PostgreSQL tests create an isolated local test database and apply every migration from empty.

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

Open the deployed HTTPS URL in Safari, tap Share, choose **Add to Home Screen**, and open Kyle Financial from the new icon. Safari has no install prompt, so the Account screen repeats these steps. Complete one online sync before testing an offline launch.

## Production and Vercel runbook

Provide the server-only `DATABASE_URL` and `REGISTRATION_SECRET`, then run migrations before starting the new build:

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm build
pnpm start
```

For Vercel, create or link the project, add `DATABASE_URL` and a random 32+ byte `REGISTRATION_SECRET` as encrypted Production environment variables, and run `pnpm db:migrate` once from a trusted local shell against the production database before deploying. Use that same secret locally with `pnpm auth:invite` to print the universal invitation. Then deploy with `vercel deploy --prod`, exercise invited signup/plan/export/delete on the live URL with disposable data, run the production Lighthouse gate, and perform the iPhone install check. Migrations are ordered and idempotent; never reset the production schema during deployment. Roll back application code by redeploying the prior known-good commit—do not roll back or delete data migrations.

The service worker caches only the public app shell and build assets; `/api/**` and private plan JSON are never stored in Cache Storage. See [architecture](docs/architecture.md), [offline and sync behavior](docs/offline-and-sync.md), and [research sources](docs/research/sources.md).

Signed-in users can export every plan year as one JSON file from Account. Ordinary logout revokes the session and clears the local private cache without deleting server plans.

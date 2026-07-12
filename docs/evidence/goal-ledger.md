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


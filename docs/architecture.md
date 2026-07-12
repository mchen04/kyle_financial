# Architecture decision

Last reviewed: 2026-07-12

## Decision

Kyle Financial is one Next.js 16 App Router application on Node.js 20 with React 19 and TypeScript. Route handlers provide the JSON boundary, PostgreSQL is the server source of truth, and a small IndexedDB adapter provides the account-scoped offline cache and mutation outbox. The same dependency-free computation module runs in the browser and in Vitest.

The architecture follows the current Next.js guidance for a server-only data access layer: only `src/server/**` may import the database client or read secrets; every DAL operation accepts the authenticated account ID and includes it in its query. Route handlers validate input and output with Zod. Session cookies carry opaque random tokens; only a SHA-256 token digest is stored. Passwords use Node Web Crypto PBKDF2-SHA-256 with a per-user salt and a documented work factor, avoiding a native deployment dependency.

Money is integer cents. Rates are integer millionths (1% = 10,000). Multiplication uses `BigInt`, with half-away-from-zero rounding once at the boundary where a percentage becomes money. Annual amounts are authoritative; monthly displays allocate annual cents deterministically so displayed totals reconcile.

## Why this stack

- Next.js keeps server-rendered account entry, private route handlers, shared types, and the installable client in one deployable.
- PostgreSQL is durable, supports ordered SQL migrations, and matches the supplied Neon target and local test server.
- Custom SQL, service worker, and IndexedDB modules keep schema ownership, authorization predicates, update behavior, and conflict rules visible.
- Vitest and fast-check cover deterministic math without coupling it to the UI.

Rejected alternatives:

- A client-only SPA would need a second authentication/data service and weakens offline/server-source-of-truth integration.
- A separate API server doubles deployment and maintenance for a one-person product.
- Prisma adds a generated client and migration abstraction that is not needed for this small, explicit schema.
- A PWA framework plugin obscures cache-version transitions; the required offline model is small enough to implement and test directly.
- `localStorage` is synchronous, too limited for an outbox, and does not meet the iOS durability requirement.

## Boundaries

```text
Browser UI ── plan draft ──> pure engine <── versioned JSON tax table
    │                              │
    ├── IndexedDB account cache    └── complete computed breakdown
    └── authenticated /api ──> server DAL ──> PostgreSQL
                 session cookie ──┘
```

- `src/domain/**`: pure values, tax tables, calculation, warnings; no React, I/O, clock, or environment access.
- `src/offline/**`: IndexedDB cache/outbox and deterministic last-write-wins reconciliation.
- `src/server/**`: server-only environment, database, authentication, and account-scoped DAL.
- `src/app/api/**`: HTTP parsing, Zod validation, status codes, and safe DTOs.
- `src/app/**` and `src/components/**`: product surfaces and instant local recomputation.
- `migrations/**`: ordered, idempotent-forward SQL. Tests apply from empty against local PostgreSQL only.

## Data and conflict model

One plan exists per `(user_id, year)`. Benefits and expenses are owned through a plan foreign key. Mutable fields carry `updated_at` plus a client mutation ID. On replay, the server ignores a previously applied mutation ID. Otherwise each field is accepted only when its incoming timestamp is newer than the stored field timestamp; equal timestamps break ties by lexicographically larger mutation ID. The server response is the reconciled record. This makes duplicate replay idempotent and two-device results deterministic.

The browser database name includes the authenticated user ID. Logout deletes that database and unregisters in-memory state before the session is destroyed.

## Tax table lifecycle

Tax tables are JSON data keyed by year. Federal filing-status schedules and all state entries include source IDs and approximation notes. A missing requested year selects the greatest available year not newer than the request, or the latest available table if all tables are newer, and returns `isFallback: true`. Adding a tax year changes data and the table registry only; the engine is unchanged.

## Deployment shape

The production target is a Node-capable Next.js host with `DATABASE_URL` and `SESSION_SECRET` server-only environment variables. Neon is the production database. Static public assets and the service worker are served by the same origin. No background worker, email service, bank integration, or paid dependency is required.


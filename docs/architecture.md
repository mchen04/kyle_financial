# Architecture decision

Last reviewed: 2026-07-13

## Decision

Kyle Financial is one Next.js 16 App Router application on Node.js 20 with React 19 and TypeScript. Route handlers provide the JSON boundary, PostgreSQL is the server source of truth, and a small IndexedDB adapter provides the account-scoped offline cache and mutation outbox. The same dependency-free computation module runs in the browser and in Vitest.

The architecture follows the current Next.js guidance for a server-only data access layer: only `src/server/**` may import the database client or read secrets; every DAL operation accepts the authenticated account ID and includes it in its query. Route handlers validate input and output with Zod. Session cookies carry opaque random tokens; only a SHA-256 token digest is stored. Passwords use Node `crypto.pbkdf2` with SHA-256, a per-user salt, and a documented work factor, avoiding a native deployment dependency. Login and signup first consume an atomic PostgreSQL fixed-window counter for the Vercel-provided client IP before JSON parsing, then a normalized-email counter after schema validation and before PBKDF2. Counter keys are hashed at rest, concurrent function instances share the same limits, signup volume is bounded per IP, exhausted buckets return `429` with `Retry-After`, and a limiter failure fails closed. Buckets become cleanup-eligible five minutes beyond the longest live policy window, and opportunistic expiry locks and removes at most 100 rows per request while skipping a bucket that another request is reactivating.

Signup always returns the same accepted response. It inserts a new normalized identity only when the request carries an HMAC invitation minted by the trusted operator for that exact email address; invalid invitations and existing identities remain indistinguishable at the boundary. The browser then signs in through the ordinary login boundary, which runs the same 600,000-iteration PBKDF2 verification path for missing and present identities before returning its generic credential error. This provides an out-of-band address-authorization step without introducing an email service: `REGISTRATION_SECRET` stays server-only, and the trusted-shell invite command is the only minting surface.

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

One plan exists per `(user_id, year)`. Benefits and expenses are owned through a plan foreign key. Expenses persist free-form category labels separately from an explicit Need/Want/Saving guidance bucket. Scalar plan fields plus individual benefit/expense properties carry an update timestamp and mutation ID in plan version metadata. Each mutation also carries its server base version, distinguishing a fresh edit on a slow clock from a stale offline edit. Browser edits use the same durable outbox whether nominally online or offline. Future client clocks are clamped to ordered receipt instants; equal instants break ties by mutation ID. Duplicate IDs must carry identical canonical content, with a transaction advisory lock making concurrent delivery idempotent. Bounded batches, per-year freshness, and revision checks prevent oversized, cross-tab, or in-flight responses from discarding newer local work.

The browser database name includes the authenticated user ID. Every private request binds the screen's expected account ID to the cookie-authenticated account; a mismatch returns 409 before access and broadcasts cross-tab eviction. Logout and deletion additionally bind the rendered server session UUID, so a stale close cannot consume a newer same-account cookie even if Web Lock grant beats BroadcastChannel delivery. Web Locks are required to serialize private browser writes and account closure across tabs, while a global shell lock protects remembered identity; an unsupported browser gets an explicit persistence failure rather than an unfenced IndexedDB lease. Logout and deletion refuse any undurable displayed draft, then write a mode-aware indeterminate closure marker before calling the server. A confirmed response makes the marker terminal. If the request may have committed but its response is lost, timed out, or aborted, the indeterminate marker remains and the browser conservatively broadcasts eviction and clears or locks its private local data. Startup and offline fallback honor either marker state; only explicit authentication clears it. On the server, each plan-year sync group validates the actual winning post-reconciliation state inside the same SQL transaction that holds the plan lock.

Account deletion calls the authenticated `DELETE /api/account` boundary after that durability and marker gate. The repository deletes the owned user row; foreign keys cascade through sessions, plans, benefits, expenses, and mutation receipts inside one database transaction. A definitive 409 account-mismatch rejection may roll back a newly created marker because the server proves that it did not act. Indeterminate outcomes instead return to authentication with an explicit verification/retry notice; signing in proves that the account still exists, clears the marker, and permits another deletion attempt. Closure modes are not interchangeable: a confirmed deletion also satisfies logout, but a logout marker can never claim that deletion succeeded.

## Tax table lifecycle

Tax tables are JSON data keyed by year. Federal filing-status schedules and all state entries include source IDs and approximation notes; the federal file also owns each ID's display label and URL, so citations render without a component registry. One jurisdiction tuple defines the exhaustive 50-state-plus-DC keys used by domain types, Zod boundaries, plan validation, and the state importer. A missing requested year selects the greatest available year not newer than the request, or the latest available table if all tables are newer, and returns `isFallback: true`. The generated TypeScript registry discovers complete `<year>.federal.json` / `<year>.states.json` pairs before development, tests, verification, and production builds. Adding a tax year therefore changes data and evidence only; neither the registry nor the engine is hand-edited.

## Deployment shape

The production target is a Node-capable Next.js host with a server-only `DATABASE_URL`. Neon is the production database. Static public assets and the service worker are served by the same origin. No background worker, email service, bank integration, or paid dependency is required.

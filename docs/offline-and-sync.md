# Offline cache and reconciliation

The PostgreSQL server is the source of truth. IndexedDB is an account-scoped working cache so the installed PWA can open and edit without a network.

## Storage layout

- `kyle-financial-shell` stores only the last authenticated user ID/email and non-secret server session UUID needed to find an offline account cache and fence destructive close requests. Legacy records without a session UUID remain readable; their remote close outcome is treated conservatively as indeterminate. Logout removes this record.
- `kyle-financial-account-<user UUID>` stores complete plan DTOs keyed by year and an outbox keyed by mutation UUID. Another account uses a different database name. Logout deletes the current account database before another account can use the app.
- The service-worker cache contains the public app shell, manifest, icons, and current build’s same-origin static resources. It never caches `/api/**` responses or private plan JSON.

The app requests persistent browser storage when supported. Installed iOS home-screen storage remains platform-controlled, so server persistence and JSON export are still the durability guarantees.

## Offline lifecycle

1. A successful session fetch remembers the account and replaces its plan cache with the server result.
2. If the session request fails at the network layer, the shell loads that remembered account’s cached plans. A real HTTP 401 never falls back to cached private data.
3. Every edit immediately recomputes in memory and atomically commits the cached plan plus its outbox mutations in one IndexedDB transaction, even when the browser reports online. Network delivery is a separate debounced step, so a failed request cannot strand the edit in React memory. Scalars diff independently; existing benefits and expenses diff by property under a stable item UUID.
4. On reconnect, superseded same-field edits are compacted and the outbox drains valid work in chronological batches of at most 500. An unresolved blank label remains pending as an explicit error but cannot block unrelated valid mutations. After acknowledgement, the client fetches a fresh server snapshot and caches it only when the outbox is still empty and the snapshot is not older than the cached server revision.
5. Duplicate posts are safe: `(user_id, mutation_id)` is the receipt key. Receipts older than 90 days are pruned during sync.

## Conflict rule

Last-write-wins is applied independently to:

- state;
- filing status;
- gross salary;
- bonus/RSU wages;
- spouse wages;
- other non-wage taxable income;
- HSA coverage;
- each benefit UUID and its editable properties;
- each expense UUID and its editable properties.

Each plan exposes the server `{updatedAt, mutationId}` version for every scalar/item. Every local mutation records the version it was based on. A matching base applies even when the client clock is slow; when the base is stale, timestamp then mutation UUID resolves the true conflict, with future clocks clamped to receipt time. Whole-item and property mutations consult the same entity version, including tombstones, so an older property cannot corrupt a newer replacement and an update to a deleted row is reported as not applied. Disjoint item edits merge; edits to the same item resolve deterministically.

Queued writes capture their plan-year baseline before asynchronous IndexedDB work begins and advance it only after persistence succeeds. Cache writes apply field mutations to the existing per-year record, so a stale tab cannot erase a disjoint cached edit with a full snapshot. Reconciliation refreshes every year’s baseline together and merges server freshness per year.

The in-memory plan list is also an intent ledger: every draft change updates it synchronously before IndexedDB work begins, and year navigation reads from that ledger. Completing an older device write never overwrites newer in-memory intent. This prevents a quick edit → switch year → switch back sequence from selecting an old server snapshot and manufacturing a revert, while an actual user revert remains a distinct serialized intent.

Account identity fences state changes. Every private browser request names the account the current screen expects; the server compares it with the authenticated cookie account and returns 409 before any read or write if another tab changed the shared session. Destructive close requests also name the server session UUID captured by the rendered tab. This second fence rejects a stale same-account close even when it acquires its Web Lock after another tab installs a newer cookie but before that tab's authentication broadcast is delivered. Authentication by a different account evicts stale rendered data; authentication by the same account updates the rendered session identity and cancels a queued or already-granted close before remote dispatch without discarding that account's pending edit chain. Browsers must support Web Locks to serialize private IndexedDB writes and account closure across tabs; a global shell lock also protects the shared remembered-user record. If Web Locks are absent, local persistence reports an explicit failure instead of pretending an unfenced lease is safe.

Logout and deletion refuse pending, rejected, volatile, or otherwise undurable displayed work. Under the account lock, the browser writes a mode-aware `indeterminate` closure marker before the remote request; a confirmed response advances it to `terminal`. A lost, timed-out, or aborted response cannot prove whether the server committed, so the browser keeps the protective marker, broadcasts eviction, clears or locks the private cache and remembered identity, and shows a verification/retry notice. A definitive 409 may remove only a newly created marker because it proves that the expected account was not changed. Explicit authentication clears either marker state and is the recovery path for an indeterminate deletion. A deletion marker may satisfy a later logout, but a logout marker never satisfies deletion. The revoked opaque cookie is left inert until expiry or the next login replaces it, because a delayed logout response must never clear a newer login cookie from another tab. Startup restoration and offline fallback honor every closure marker.

Every mutation envelope and supported payload is prevalidated independently at the server. Malformed entries are acknowledged as rejected and removed from delivery without rolling back valid peers in the same batch. Each plan-year group then runs in its own SQL transaction: the server locks the plan, applies only the mutations that win reconciliation, hydrates that actual prospective result through the same repository, and validates every aggregate and cross-field invariant before commit. An invalid year rolls back as a unit while valid years remain independent. The client keeps rejection or local IndexedDB failure visibly in `Save failed`; an empty outbox alone cannot turn a volatile failed edit into `Saved`.

Duplicate mutation IDs are accepted only when their canonical payload is identical; reusing an ID with different content rejects the transaction. This is deliberately not a collaborative document editor, but it does preserve independent category and benefit edits without whole-list data loss.

## Service-worker updates

`/sw.js` is generated with Next’s current deployment ID in both its script bytes and cache name. The deployment ID comes from the hosting/git SHA, so each released revision installs beside the active worker and shows an `Update ready · reload` control. Only that user action sends `SKIP_WAITING`; `controllerchange` reloads once. Activation removes every older `kyle-shell-*` cache while leaving unrelated origin caches alone, preventing mixed build versions and unbounded hashed-asset growth. The worker response is explicitly `no-store` and retains the same API/private-data exclusion rules.

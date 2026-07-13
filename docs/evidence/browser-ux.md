# Browser UX evidence

## Wave 3 implementation smoke — not the final Wave 6 gate

Date: 2026-07-12  
Session: `kyle-wave3-smoke` (scoped agent-browser session)  
Target: Next.js development server with local PostgreSQL, `http://127.0.0.1:3100`

Flows exercised:

- 390x844 signup → three-field onboarding → seeded 2026 Texas plan.
- Savings/take-home/expense start are above the fold; measured answer `y=81..309`, ledger begins `y=321`, document width equals viewport width (390px).
- Inline $10,000 monthly rent edit recomputed the headline immediately from `$5,948`to a distinct`-$4,052` “Monthly plan gap,” then persisted (`PUT 200`, status Saved).
- CA state selection recomputed take-home immediately from `$5,948` to `$5,591` before persistence.
- Benefits surface exposed all required addable types plus custom tax-treatment flags. A 30% 401(k) produced the $24,500 warning without blocking math.
- Mobile overflow defect on Benefits (`scrollWidth=481` at 390px) was reproduced and fixed; recheck `scrollWidth=clientWidth=390`.
- Copy-forward created 2027, including custom benefits. A discovered JSONB string-deserialization defect caused an honest Save failed state/PUT 400; repository parsing was fixed and regression-tested. Subsequent PUT returned 200.
- Editing 2027 401(k) to 20% left 2026 intact; comparison showed 2026 `-$5,563/month` and 2027 `-$4,982/month`.
- 320x568 and 1440x900 screenshots were visually inspected. Both measured `scrollWidth=clientWidth`; negative treatment, controls, and desktop two-column composition were intact.
- Console contained only Next development/HMR messages; uncaught page errors were empty.

This pass establishes the first working product flow. It does not count toward the required production-build, all-viewport, two-consecutive-pass Wave 6 acceptance streak.

## Wave 4 production offline proof

Date: 2026-07-12

Sessions: `kyle-wave4-offline2`, `kyle-wave4-offline-proof`

Target: production `next start`, local PostgreSQL, 390x844

- Manifest returned standalone display, 192/512 icons, and a 512 maskable purpose entry. The registered worker controlled the page; IndexedDB listed only the shell database plus the authenticated account database.
- Offline rent edit changed the computed gap `-$4,982` → `-$2,982` with status Offline and no network round trip.
- Cold reload with API traffic aborted rendered the cached plan and the same `-$2,982` result. A status defect (`Save failed`, then an unproven `Saved` on a zero outbox) was fixed so network failure remains honestly Offline.
- Final cold-shell retest used session `kyle-wave4-cold-shell`: after one authenticated load the worker controlled the page and `kyle-shell-v1` contained 15 shell/build responses. Aborting **all** network traffic and reloading still rendered the complete cached plan at `-$2,982` with status Offline.
- Reconnect issued `/api/sync`; two near-simultaneous online events replayed the same mutation safely, server receipts made the duplicate idempotent, the outbox returned to zero, and online reload retained `-$2,982`.
- Logout returned the account-entry surface, `/api/auth/session` returned 401, the account-named IndexedDB was absent, and only the empty shell database remained.
- Production HTTP initially failed to retain a cookie marked Secure. Cookie security now follows the actual request protocol, preserving Secure on HTTPS deployment while enabling a faithful plain-HTTP local production proof.

## Wave 5 queue-first reconciliation regression

Date: 2026-07-12

Session: `kyle-wave5-sync` (scoped agent-browser session)

Target: production `next start`, local PostgreSQL, 390x844

- With `navigator.onLine === true`, `/api/sync` was aborted and 2027 rent changed from $7,000 to $6,000. The UI immediately recomputed and reported Offline; no successful network write occurred.
- Reload while sync remained aborted restored $6,000 from the account cache, not the older server plan. This reproduced and then verified the startup fix that prefers cached plans whenever an outbox exists.
- Unblocking sync and dispatching `online` drained the outbox, changed status to Saved, and a subsequent reload retained $6,000 from PostgreSQL.
- Switching to MFJ exposed a spouse-wage input and a payroll-owner selector on every benefit. The production bundle rendered the new tax-source controls without console or page errors.

## Cycle 5 hardening browser proof

Date: 2026-07-12

Session: `kyle-cycle5` (scoped agent-browser session)

Target: production `next start`, Neon PostgreSQL

- Created a new MFJ $200,000 Texas plan. The normal Plan surface said “After-tax household income,” the guidance result said “100% of plan resources,” and state approximation scope plus citation IDs were visible.
- Benefit rows named “% of owner wages,” exposed the primary/spouse payroll owner, and displayed their computed annual dollar amount.
- Setting the primary 401(k) to 100% changed the Plan headline to “Payroll setup is not feasible / Needs adjustment” and showed participant 401(k), defined-contribution, and payroll-capacity warnings beside the answer.
- With `/api/sync` aborted, Rent was cleared and immediately entered as `Housing rent`. The UI honestly reported `Save failed`; after reconnect it reached `Saved`, and a full reload retained `Housing rent`. The transient invalid edit did not poison the corrected mutation.
- With sync aborted again, a rent edit made logout remain on the authenticated Account screen with “Unsynced edits are still on this device” instead of deleting the outbox. After reconnect reached `Saved`, logout succeeded and returned to authentication.

## Cycle 6 causal-sync and planner proof

Date: 2026-07-12

Session: `kyle-cycle6-fix` (scoped agent-browser session)

Target: production `next start`, Neon PostgreSQL

- Existing production plan DTOs loaded with the newly exposed server field-version map; no migration or deserialization error appeared.
- Every expense row rendered an explicit Need / Want / Saving & investing selector beside its free-form group and cadence. `Housing rent` correctly displayed Need.
- Changed monthly housing rent from $1,234 to $1,200. Reconciliation completed through the new acknowledge → fresh-read → guarded-cache flow, reached `Saved`, and a full reload retained $1,200.
- Selected Head of household. The option itself said “state uses Single proxy”; the state estimate repeated the full proxy limitation and rendered `TF_STATE_2026` as an inspectable source link.

## Cycle 7 independent-bucket and cross-tab logout proof

Date: 2026-07-12

Session: `kyle-cycle7-fix` (scoped agent-browser session, two tabs)

Target: production `next start`, Neon PostgreSQL after migration 004

- Changed the Housing rent group from `Home` to the previously unrecognized `Medical copays`. Its independently persisted guidance selector remained `Need`; after reconciliation reached `Saved`, a full reload retained both the custom label and Need bucket.
- Federal and benefit source IDs rendered as inspectable links alongside the visible federal approximation.
- Opened the authenticated plan in a second tab, then logged out there. The first tab immediately replaced its private plan workspace with the account-entry screen via the logout broadcast; no interaction or reload was required.
- Neon’s migration ledger listed 001–004 and `expenses.guidance_bucket` existed exactly once before the browser pass.

## Wave 6 final production browser streak

Date: 2026-07-12

Sessions: `kyle-wave6-final-a`, `kyle-wave6-final-b` (scoped and closed)

Target: production `next start`, Neon PostgreSQL

- Both sessions independently loaded the current signed-in plan with zero additional activations. Existing expense editing required zero navigation activations, Add expense one, state/filing status two, and Start next year one.
- Required viewports 390x844, 430x932, 320x568, 844x390, 768x1024, and 1440x900 all had `clientWidth === scrollWidth`. The 1440px layout at 200% zoom was exercised with an equivalent 720x450 CSS viewport. Mobile/coarse actions were at least 44px and all visible inputs/selects computed to 16px.
- At 390x844 the Savings/month answer, take-home summary, Monthly expense ledger heading, and first expense row are all in the initial viewport; the first expense starts at y=787.
- Accessibility snapshots contained the labeled plan navigation, year selector, answer and ledger regions, every editable expense field, and expanded state. A 12-step keyboard pass followed skip link → year → next year → four navigation actions → disclosures → Add expense → unused categories → row actions, with a visible solid outline and no trap.
- Both sessions had zero uncaught page errors. The full Cycle 14/15 visual matrices cover offline, sync failure, invalid auth, loading, warning, export failure, negative-plan, and responsive states; scores are in `docs/evidence/ui-quality.md`.

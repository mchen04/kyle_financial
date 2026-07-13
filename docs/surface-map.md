# Product surface map

The single job is to answer “what is left each month?” while making every contributing assumption easy to change.

## Design direction

The product is a living annual ledger rather than a generic analytics dashboard.

- Ink `#12233F`, paper `#F7FAFC`, sky `#DCEBFA`, action blue `#1769AA`, surplus teal `#087E73`, and gap amber `#A65318`.
- Display: a restrained humanist face for plan headings; body: a highly legible system sans; data: tabular numerals and a compact utility style.
- Signature: a continuous money-flow rail, aligned to exact totals, that visually carries gross pay through taxes, payroll savings, expenses, and cash savings.
- Motion is limited to number interpolation and the flow rail responding to edits; reduced-motion removes both.

The initial idea used a prominent gradient savings card. It was removed during self-critique because it was generic and made negative results feel alarmist. The ledger hierarchy and flow rail are more specific to plan-based money allocation.

## Surfaces and states

1. Public entry: product explanation, sign in, create account, install guidance.
2. Authentication: sign up, sign in, validation failure, expired session.
3. First plan: year, gross income, state, filing status, seeded categories, computed preview.
4. Current plan: savings/month answer, take-home/tax summary, flow rail, start of expense ledger above fold.
5. Income editor: salary, additional ordinary income, state, filing status, estimate/table-fallback notice.
6. Benefits editor: every required seeded type, percent/fixed cadence, tax treatment, employer-side values, limit warnings.
7. Expense ledger: grouped rows, monthly/yearly cadence, add, inline edit, rename, reorder, delete.
8. Guidance: 50/30/20 comparison, informational language, category-group totals.
9. Year controls: plan picker, copy next year confirmation, prior-year integrity, year comparison.
10. Data/account: sync status, all-years JSON export with explicit failure recovery, logout, permanent account/data deletion, iOS installation instructions.
11. Operational states: branded loading, no plan, invalid credentials, export error, offline cached, offline pending edits, sync failure with retry, synced, update available.
12. Edge states: negative savings, zero income, deductions above income, tax-limit warnings, unavailable tax year fallback.

## Responsive composition

```text
Phone                                Desktop
┌ year · sync · account ┐            ┌ navigation ┬ annual plan controls ┐
│ WHAT'S LEFT / MONTH   │            │            │ answer + flow rail   │
│ take-home · est. tax  │            │ year list  ├──────────────────────│
│ money-flow rail       │            │            │ ledger │ assumptions │
├ expense ledger begins ┤            └────────────┴──────────────────────┘
│ grouped editable rows │
└ bottom action dock ───┘
```

The 320px layout collapses labels before values, never the values themselves. Landscape uses a two-column answer/ledger split. Tablet and desktop expose assumptions beside the ledger rather than stretching a phone column.

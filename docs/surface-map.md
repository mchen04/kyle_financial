# Product surface map

House by 30’s job is to **plan the year, then make today’s spending
consequence obvious**. The annual plan supplies income, tax, benefit, saving,
and category allocations; the daily cockpit compares dated actuals with that
plan without implying access to a bank balance.

## Design direction

The product is a living ledger rather than a generic analytics dashboard.

- The one token authority in `src/app/globals.css` owns the ink, paper, sky,
  action blue, surplus teal, gap amber, data palette, 4px base grid, 8px
  ordinary rhythm, type/control scales, elevation, motion, and layer order.
- The **budget runway** is the signature connection between long-range
  allocation and present actuals. Home gives it the strongest hierarchy; Plan
  retains the exact annual money-flow rail.
- Category colors are stable data tokens shared by Budget, Activity, Wrap, and
  the accessible allocation chart. Names and values always accompany color.
- Motion is restrained and reduced-motion removes nonessential transitions.

`pnpm ui:tokens:check` audits 214 canonical tokens and rejects component token
authorities, raw component colors or CSS lengths, duplicate or unknown tokens,
noncanonical media queries, malformed dimensions or `var()` calls, and drift
from the 4px/8px/44px/48px contract. The parser normalizes CSS escapes and
comments, including declaration properties and at-rule parameters, while
preserving quoted content and valid binary `calc()` arithmetic.

## Surfaces and hierarchy

1. **Public/Auth:** daily-plus-annual product promise, public account creation,
   sign-in, validation, and honest online-first bootstrap.
2. **Onboarding:** year, rough wage income, state, and filing status; the copy
   explains that the annual plan becomes the daily budget.
3. **Home:** selected period, Left to spend/Over budget, Fast Log, budgeted,
   spent, remaining, savings impact, attention, recent correction, Wrap, Plan.
4. **Fast Log sheet:** focused amount, category, title, optional note, date,
   inline category creation, Save, Save and add another; the same sheet edits
   and explicitly deletes transactions.
5. **Budget:** selected-period total, attention/near-limit categories, all
   allocated/actual/remaining rows, then dedicated Category Detail, Edit
   Budget, and Manage Categories pages.
6. **Activity:** selected period, search/category filters, local-date groups,
   and the correction path.
7. **Monthly Wrap:** total budget versus actual, wins, overruns, projected
   savings change or configured ending balance, and a component-by-component
   explanation that prevents double counting.
8. **Plan:** annual and explicit monthly outcomes, optional starting savings,
   projected change/ending result, accessible allocation chart, annual
   money-flow rail, and links to Plan Details, Benefits, Compare, and budget
   editing.
9. **Plan Details/Benefits/Compare:** deeper annual inputs and explanations,
   kept as Plan sub-surfaces rather than daily navigation.
10. **Account:** privacy/sync context, online all-years export, offline
    account-scoped device export, install instructions, safe logout, and
    permanent deletion.
11. **Operational states:** branded loading, empty plan, invalid/expired
    session, offline cached, pending edits, sync rejection/failure with retry,
    update ready, and export/deletion errors.
12. **Edge states:** over-budget, zero allocations/activity, saving categories,
    infeasible payroll, tax-limit warnings, and tax-table fallback.

## Navigation and responsive composition

Mobile bottom tabs are exactly `Home → Budget → Activity → Plan`. Fast Log is a
floating action above the safe area—labeled on Home, compact on Budget and
Activity, absent elsewhere. Account is the top-right profile control.
Desktop uses the same order in a persistent sidebar.

```text
Phone                                  Desktop
┌ year · sync · profile ┐              ┌ Home     ┬ year · sync · profile ┐
│ period                │              │ Budget   │ period + primary answer│
│ LEFT TO SPEND         │              │ Activity │ budget runway          │
│ runway + exact totals │              │ Plan     ├────────────────────────│
│ attention · activity  │              │          │ attention │ activity   │
│             Fast Log  │              │          │ deeper detail          │
├ Home Budget Activity Plan ┤          └──────────┴────────────────────────┘
```

Safe-area insets protect top chrome, Fast Log, sheets, and bottom navigation.
`100dvh` keeps sheets keyboard-aware. At narrow widths labels yield before
values; desktop content stops at a finite maximum rather than stretching a
phone layout. Landscape moves mobile navigation to a side rail when vertical
space is scarce.

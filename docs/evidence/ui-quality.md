# UI quality convergence evidence

Date: 2026-07-12

Target: production `next start` against Neon PostgreSQL

Scratch captures: `/tmp/kyle-financial-ui-quality/` (not committed)

## Matrix

Each final round captured 15 product states at eight viewports (120 PNGs): signed out, invalid credentials, authenticated loading, onboarding, positive plan, expanded assumptions, expanded unused expenses, populated benefits, year comparison, account/export, export failure, negative plan, HSA conflict, offline queue, and sync failure.

Viewports: 360x740, 390x844, 844x390, 768x1024, 1024x768, 1024x700, 1440x900, and 1728x1117. Every PNG was non-empty. Browser measurements reported document `clientWidth === scrollWidth`, zero visible actions under 44px, and zero page errors at every viewport.

## Convergence

Early rounds found and fixed misleading zero-expense savings language, dense warning stacks, tablet benefit collisions, landscape navigation overlap, Compare clipping, account privacy/deletion gaps, unhandled export failure, and a false loading capture. Later strict rounds fixed mobile comparison scan order, account email collision, branded loading, compact sync recovery, landscape export recovery, onboarding caveat placement, HSA correction navigation, and wide comparison wrapping.

The functional browser gate then found that the first expense row had drifted below the primary iPhone fold. The final revision orders compact Plan content as answer → ledger → assumptions, keeps the full money-flow rail with a concise mobile legend, and places used expense rows before totals/unused controls on phones. At 390x844 the first expense begins at y=787.

Final two-round streak:

| Round    | Visual | Responsive / PWA | Trust / clarity | Findings | Blockers |
| -------- | -----: | ---------------: | --------------: | -------: | -------: |
| Cycle 14 |    9.4 |              9.6 |             9.4 |        0 |        0 |
| Cycle 15 |    9.6 |              9.5 |             9.4 |        0 |        0 |

All three judges inspected all 120 source PNGs in each round. Pixel audits confirmed that black rectangles shown by the image viewer were redaction artifacts rather than rendered application pixels. The unchanged Cycle 15 set sustained the bar with no regression.

## Representative evidence

- Primary fold: `/tmp/kyle-financial-ui-quality/cycle-15/kyle__plan__positive__390x844__light.png`
- Negative plan: `/tmp/kyle-financial-ui-quality/cycle-15/kyle__plan__negative__390x844__light.png`
- Mobile comparison: `/tmp/kyle-financial-ui-quality/cycle-15/kyle__compare__populated__390x844__light.png`
- Landscape export recovery: `/tmp/kyle-financial-ui-quality/cycle-15/kyle__account__export-error__844x390__light.png`
- Offline/sync recovery: `/tmp/kyle-financial-ui-quality/cycle-15/kyle__benefits__sync-error-banner__360x740__light.png`
- Wide comparison: `/tmp/kyle-financial-ui-quality/cycle-15/kyle__compare__populated__1728x1117__light.png`

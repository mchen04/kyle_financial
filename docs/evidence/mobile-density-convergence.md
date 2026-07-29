# Mobile density convergence

Status: curated historical QA summary

Last reviewed against the repository: 2026-07-28

This document preserves the conclusions from the July 2026 mobile-density work.
Raw browser captures, per-run JSON, generated measurement tables, and judge
transcripts are reproducible output and are intentionally not tracked. The
executable source of truth is `scripts/measure-density.mjs`; current behavior
must be established by rerunning the gate, not by treating these historical
numbers as live telemetry.

## Scope

The work covered 21 product states at 390×844, 360×740, and 430×932 in Chromium
and Playwright WebKit. It checked:

- vertical-cost budgets for entry, standard, deep, and long-list surfaces;
- native and geometric layout shift;
- headline stability during cache restoration;
- minimum touch-target and text-size floors;
- clipped text and horizontal overflow;
- console errors;
- navigation reachability and selected-tab semantics.

The gate also contains deliberate fail demonstrations. Each instrument must be
shown capable of turning red before a green run is accepted.

## Changes that carried forward

- Home and Budget were reduced by removing duplicate navigation and explanatory
  copy before changing type or control sizes.
- Activity retained its transaction list. Its gated constraint is chrome above
  the first row rather than total list height.
- Benefits, category management, Monthly Wrap, and Plan details use compact
  rows without hiding required values or reducing touch targets.
- Cache restoration reserves the answer region until authoritative state is
  known, preventing stale values and headline swaps.
- Fast Log stays labeled on every tab where it appears.
- The primary navigation remains `Home → Budget → Activity → Plan`; Monthly
  Wrap is a labeled row reached from Home or Activity, not a fifth tab.
- Chromium and WebKit are evaluated separately where browser capabilities
  differ. WebKit does not expose Chromium's Layout Instability API, so geometric
  checks cover the shared behavior.

## Final recorded automated result

Two consecutive runs on the final July candidate produced 126 measurements
across Chromium and WebKit with zero violating rows and identical reported
values to three decimals.

| Signal                                | Recorded result           |
| ------------------------------------- | ------------------------- |
| Absolute vertical-budget misses       | 0 of 63                   |
| Maximum Chromium CLS                  | 0.0039 against a 0.02 bar |
| Headline label/value swaps            | 0                         |
| Targets below 44px                    | 0                         |
| Smallest computed text                | 11px                      |
| Boxes clipping their own text         | 0                         |
| Horizontal-overflow findings          | 0                         |
| Console errors                        | 0                         |
| Chromium native-shift instrumentation | live on all 63 rows       |

These are historical results, not a release assertion for the current commit.

## Explicit misses

The work did not meet every aspirational percentage-reduction target even
though every absolute vertical budget passed:

| Surface      | Viewport | Baseline | Final | Required cut | Recorded cut |
| ------------ | -------- | -------: | ----: | -----------: | -----------: |
| Activity     | 390×844  |    7.873 | 4.682 |          60% |        40.5% |
| Activity     | 360×740  |    8.782 | 5.341 |          60% |        39.2% |
| Activity     | 430×932  |    7.050 | 4.240 |          60% |        39.9% |
| Benefits     | 360×740  |    5.746 | 3.051 |          60% |        46.9% |
| Monthly Wrap | 360×740  |    3.230 | 2.474 |          35% |        23.4% |
| Plan details | 360×740  |    3.392 | 3.186 |          35% |         6.1% |

Activity's total height is dominated by the explicitly exempt transaction
region; its chrome-above-list gate passed at every measured viewport. The other
misses were left visible because meeting the percentages would have required
collapsing useful financial detail or undoing the measured row/touch-target
floor.

The final opinion panel also remained below its aspirational bar: 7.23 average
against 8.5. That result was not relabeled as a pass.

## Residual risk

- A real installed iPhone Safari pass remains an owner-device release check.
- Headless capture cannot prove nonzero safe-area insets because its
  `env(safe-area-inset-*)` values resolve to zero.
- Historical measurements cover a seeded account and do not substitute for
  extreme-volume testing.

## Reproduce

Build and serve the production application, seed the density fixture, then run:

```sh
pnpm ui:density:measure -- --mode gate \
  --viewports 390x844,360x740,430x932
```

Keep generated output in temporary or ignored paths. Commit only a maintained
summary when a durable architectural or release conclusion changes.

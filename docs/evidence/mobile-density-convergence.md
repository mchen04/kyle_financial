# Mobile density convergence

Every number on this page was read out of a live production build by
`pnpm ui:density:measure`. Nothing is estimated. The BEFORE column is
[`mobile-density-baseline.json`](./mobile-density-baseline.json) re-measured at
the head of this loop and reproduced to three decimals; the AFTER column is
[`l3a-after.json`](./l3a-after.json) (Home and Budget, gate mode) and
[`l3a-full-after.json`](./l3a-full-after.json) (all 20 surface states, capture
mode, used only to prove no other surface regressed).

```
pnpm ui:density:measure -- --mode gate \
  --surfaces home,home-cold-load,budget,budget-future-month \
  --viewports 390x844,360x740,430x932 --session l3a
# 12 measurement(s); 0 violating row(s); mode=gate   EXIT=0
```

---

## L3a — Home and Budget

### Vertical cost (VH) and CLS

| Surface               | Viewport | Before VH |  After VH | Bar | Before CLS |  After CLS | CLS bar |
| --------------------- | -------- | --------: | --------: | --: | ---------: | ---------: | ------: |
| Home                  | 390x844  | **2.187** | **1.000** | 1.0 |     0.0005 |     0.0005 |    0.02 |
| Home · cold load      | 390x844  |     2.187 |     1.000 | 1.0 |     0.0000 |     0.0000 |    0.02 |
| Home                  | 360x740  |     2.219 |     1.000 | 1.0 |     0.0007 |     0.0007 |    0.02 |
| Home · cold load      | 360x740  |     2.219 |     1.000 | 1.0 |     0.0000 |     0.0000 |    0.02 |
| Home                  | 430x932  |     1.982 |     1.000 | 1.0 |     0.0005 |     0.0005 |    0.02 |
| Home · cold load      | 430x932  |     1.982 |     1.000 | 1.0 |     0.0000 |     0.0000 |    0.02 |
| Budget                | 390x844  | **3.030** | **1.367** | 3.0 |     0.0075 |     0.0075 |    0.02 |
| Budget · future month | 390x844  |     2.223 |     1.367 | 3.0 | **0.4113** | **0.0042** |    0.02 |
| Budget                | 360x740  |     3.511 |     1.565 | 3.0 |     0.0106 |     0.0106 |    0.02 |
| Budget · future month | 360x740  |     2.508 |     1.565 | 3.0 | **0.6632** | **0.0038** |    0.02 |
| Budget                | 430x932  |     2.702 |     1.238 | 3.0 |     0.0056 |     0.0056 |    0.02 |
| Budget · future month | 430x932  |     1.908 |     1.238 | 3.0 | **0.3793** | **0.0039** |    0.02 |

Headline first paint equals headline settled on all 12 rows. 0 interactive
targets under 44px, 0 horizontal overflow, 0 console errors on all 12 rows —
unchanged from baseline.

`1.000` is the floor of the metric, not a coincidence: `verticalCost` is
`max(documentElement.scrollHeight, tallest scrollable region) / innerHeight`,
and `<html>` is pinned to the viewport, so any surface whose content fits reads
exactly 1.000. The real content heights are below.

### Does Home actually fit the screen?

The bar's stated intent is that the primary answer, the primary action, and any
attention item are visible without scrolling. Measured directly against the
scroll region's own client height (`main.clientHeight`), with the fixture's
three over-budget categories present:

| Viewport | `main` client height | `main` scroll height | Answer card ends | Attention group ends | Recent group ends | Monthly wrap ends |
| -------- | -------------------: | -------------------: | ---------------: | -------------------: | ----------------: | ----------------: |
| 390x844  |                  691 |                  759 |          **283** |              **465** |               631 |               695 |
| 360x740  |                  587 |                  709 |          **233** |              **415** |               581 |               645 |
| 430x932  |                  779 |              **779** |              283 |                  465 |               631 |               695 |

- The answer (`Left to spend $123` plus its exact line) and **all three**
  over-budget rows are above the fold at every viewport.
- The primary action is the Fast Log floating button, measured at 125x48 and
  `position: fixed` — on screen at all times, never scrolled away.
- At 430x932 the surface does not scroll at all (779 = 779).
- At 390x844 it overshoots the fold by 68px and at 360x740 by 122px: the last
  visible thing without scrolling is the recent-activity group, and the Monthly
  wrap row needs a short scroll. That is stated, not hidden.

### No other surface regressed

Full 60-row capture after the change, compared to baseline (390x844):
Activity 7.873 → 7.245, Manage categories 4.319 → 4.233, Benefits 4.289 →
4.204, Monthly wrap 2.469 → 2.114, Plan 2.444 → 2.359, Plan details 2.955 →
2.870, Category detail 1.607 → 1.417, Edit budget 1.712 → 1.627, Compare 1.833
→ 1.748, Account 1.223 → 1.137. Signed-out, onboarding and both Fast Log states
are byte-identical to baseline. At 360x740 `Activity · empty search` CLS fell
0.1093 → 0.0804 (still over bar; that surface belongs to another loop). **No
row in the 60-row matrix moved in the wrong direction.**

---

## What was cut, and why

Ordered by the mission's order of preference for cuts.

### 1. Deleted non-information

| Cut                                                                                                                                                                                                                        | Citation                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Home eyebrow `Today's money cockpit` / `Planned money cockpit` — restates the Home tab, carries no figure                                                                                                                  | C2 (a header never carries a subtitle), rule 1                   |
| Home section eyebrows `Needs attention` + `Recent activity` **and** their `<h2>` subtitles `Tight categories` / `Budget is on track` / `Correct it while it's fresh` — two header lines where one 13px label says the same | C2 (header ≤ 32px, no subtitle)                                  |
| Home `View budget →` and `All activity →` text buttons (44px each) — Budget and Activity are permanent tab-bar destinations                                                                                                | C13 (tabs are destinations), rule 1 (redundant)                  |
| Home `Annual plan` action card — Plan is a permanent tab-bar destination                                                                                                                                                   | C13, rule 1                                                      |
| Home runway metrics `Budgeted` / `Spent` / `Remaining` — the three terms of the `exact: $4,478.00 − $4,354.44 = $123.56` line directly above them, to lower precision                                                      | rule 1 (restated values)                                         |
| Home runway qualifier's leading `July 2026 ·` — the month picker names the period 40px above                                                                                                                               | rule 1 (restated values)                                         |
| Budget's separate `Needs attention` block — every row in it was rendered a second time in `All categories` on the same screen                                                                                              | rule 1 (restated values), C2 (a group of <3 rows gets no header) |
| `spent`/`funded` inside the category ratio (`$614 spent of $650` → `$614 of $650`) — the figure beside it already reads `remaining` vs `left to fund`                                                                      | rule 1 (redundant label)                                         |
| 60px right gutter on every category and transaction row at ≤720px — it reserved a chevron that the same media query sets to `display: none`                                                                                | C4 (decorative padding), rule 1                                  |
| `136px` bottom padding on the scroll region — it reserved the tab bar, which is a flow sibling below the scroll region and reserves itself; only the 48px floating button needs clearing                                   | C4 (page bottom padding = 16px + clearance)                      |
| `64px` / `68px` bottom margin under the runway card at ≤720px                                                                                                                                                              | C4 (**32px and above is banned on mobile**)                      |
| Home empty-state second sentences (`Keep logging expenses to protect the signal.`, `Fast Log is ready when you are.`)                                                                                                      | rule 6 (factual operational copy may be shortened)               |

### 2. Cards converted to rows

| Cut                                                                                                                                                                     | Citation                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Home's two 16px-padded, bordered, shadowed `panel` cards → hairline-separated row groups with a 13px label                                                              | C5, HIG-L2                                                                            |
| Home `Monthly wrap` 80px `actionCard` → 48px `navRow` carrying its summary value (`July 2026`) instead of the descriptive line `See wins, overruns, and savings impact` | C5 (a card needs 3+ facts; this had 2), C12 (a promoted row states its summary value) |
| Budget's 3–4 line prose toolbar → a 4-cell `dl` (`Spent or funded`, `Allocated total`, `Saving reserved`, `Safe to spend`) plus one 13px note line                      | C5, C1                                                                                |
| 8px gaps between rows inside a group → 0px with a 1px hairline                                                                                                          | C4 (0px inside a group), HIG-L2                                                       |

### 3. Two-line pairs merged into one line with tabular numerals

| Cut                                                                                                                                                                                                               | Citation                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Category rows: 64px two-line → **48px**, name in the flexible column and both figures stacked in a fixed 120px right column                                                                                       | C1 (48px single-line row), C6 |
| Home runway metric: stacked `dt`/`dd` block → one baseline-aligned line                                                                                                                                           | C1, C4                        |
| Period control: the kind tabs (44px) and the month stepper (44px) stacked with an 8px gap → **one 44px row**; the month picker's options abbreviate to `Jul 2026` so all five controls fit 360px without clipping | C1, C4                        |
| `font-variant-numeric: tabular-nums` added to every headline, amount, metric, row figure, note and date figure on these surfaces (there was none anywhere before)                                                 | **C6**                        |

### 4. Type scale (last resort, applied only after the above)

| Cut                                                                                                                                                                                                                              | Citation |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Home `h1` `Your money, right now.` 46.8px → 18px. It is a label that restates the tab name, not a display figure                                                                                                                 | C2       |
| Budget `h1` 46.8px → 24px at ≤720px. Also load-bearing for CLS: at 24px both phase strings (`$123 safe to spend`, `$4,478 planned spending`) set on **one line** at 360–430px, so stepping the period cannot reflow the headline | C9       |
| Home answer figure 70px → 56px at ≤720px, and → 40px at ≤740px-tall phones only                                                                                                                                                  | order 6  |

Nothing else was type-scaled. No input font-size was touched; the 16px input
floor (C10) is untouched.

---

## The Budget future-month CLS bust: root cause and fix

Baseline: stepping Budget forward one month shifted **0.4113 / 0.6632 / 0.3793**
against a 0.02 bar — the worst defect on either surface. Three independent
causes, all fixed structurally rather than by suppression:

1. **A block that existed in one phase and not the other.** The `Needs
attention` section rendered above `All categories` in the current month and
   vanished in a future month (nothing can be over budget before the period
   starts), teleporting the whole category list upward. Removed as a restated
   value (above).
2. **Prose that changed length.** The toolbar paragraph was 3–4 lines in one
   phase and 2–3 in the other. Replaced by a `dl` with the **same four labels
   and the same four cells in both phases** (C9-3: the label never changes
   identity), plus a one-line note that differs in wording but not in height.
3. **Rows that re-wrapped on digit count.** `$321 spent of $240` and
   `$0 spent of $240` are different widths, so a category name wrapped in one
   phase and not the other and rows changed height individually. Fixed by
   moving every figure into a fixed-width, `nowrap`, `tabular-nums` column so
   the name column width — and therefore the row height — is independent of the
   data (C6, C9-4).

The category-row branch on `unstarted` is gone entirely: a future period now
reads `$0 of $2,100` / `$2,100 remaining`, which is exactly what the rollup
says. Result: Budget and Budget · future month now measure the **same** VH to
three decimals at every viewport (1.367 / 1.565 / 1.238), which is the
strongest available evidence that period phase no longer changes geometry.

---

## Tap paths walked after the change

Nothing became unreachable. Every path is ≤ 3 taps from Home, the first
authenticated screen.

| Capability                 | Before                                                   | After                                                                                                            | Taps |
| -------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---: |
| Budget surface             | Home → `View budget` text button **or** Budget tab       | Home → **Budget tab**                                                                                            |    1 |
| Activity surface           | Home → `All activity` text button **or** Activity tab    | Home → **Activity tab**                                                                                          |    1 |
| Annual plan                | Home → `Annual plan` card **or** Plan tab                | Home → **Plan tab**                                                                                              |    1 |
| Monthly wrap               | Home → `Monthly wrap` card                               | Home → **`Monthly wrap` row** (labeled, 48px, shows `July 2026`)                                                 |    1 |
| Category detail            | Home attention row / Budget attention row / Budget list  | Home `Needs attention` row **or** Budget list row                                                                |    1 |
| Edit budget                | Budget → `Edit budget`                                   | unchanged                                                                                                        |    2 |
| Manage categories          | Budget → `Manage categories`                             | unchanged                                                                                                        |    2 |
| Change reporting period    | Month / YTD / Year buttons + month stepper (two rows)    | same five controls, **one row**                                                                                  |    1 |
| Fast Log a new expense     | floating action                                          | unchanged, measured 125x48, always on screen                                                                     |    1 |
| Edit a recent expense      | Home recent row (4 shown)                                | Home recent row (2 shown) **or** Activity tab                                                                    |  1–2 |
| Every over-budget category | Home `Tight categories` (top 3) / Budget attention block | Home `Needs attention` (top 3) **and** every one of them in Budget's list, in warning colour, reading `$81 over` |    1 |

---

## What was refused

- **The exact-math line was not cut.** `exact: $4,478.00 − $4,354.44 = $123.56`
  is the only place on Home carrying cents. It is the audit trail for the
  headline and is what a returning user checks the app against. The rounded
  metric trio that duplicated it went instead.
- **The `Needs attention` group was not collapsed on Home.** A collapsed group
  with an escaping exception was permitted by the brief, but every attention row
  already fits above the fold (ends at 465px of a 691px fold at 390x844), so
  collapsing would have hidden true information for no measured gain.
- **The period control was not promoted to a sub-page.** C12 permits promoting a
  section opened less than once per session, but the month stepper drives every
  number on both surfaces and belongs on them; it was compressed to one 44px row
  instead.
- **No touch target was shrunk and no input was re-sized.** Every control in the
  new one-row period control is still ≥ 44px (`min-width: var(--control-sm)`),
  which the harness confirms: 0 targets under 44px on all 60 rows.
- **The transaction note line was not deleted.** A recent expense with a note
  renders a third line on Home. The seeded fixture has none in the top two, so
  the measured numbers do not exercise it — recorded as a residual below rather
  than solved by deleting the note.
- **No bar, threshold or measurement semantic in `scripts/measure-density.mjs`
  was touched.** The only change to that file is that it now loads `.env.local`
  itself, which it previously required the caller to export by hand.

---

## Residual risk

- **The fixture is the only data shape measured.** Category names longer than
  ~164px at 360px wide will wrap and add ~8px per row; the longest seeded name
  (`Health and pharmacy`) fits with ~8px to spare. Home's margin at 360x740 is
  31px of the 740px bar, so roughly four such rows would be needed to bust it.
- **A note on one of the two most recent expenses adds a third line to that row**
  (~20px) on Home. Two noted rows would consume the 360x740 margin.
- **Home overshoots the true fold** (`main.clientHeight`) by 68px at 390x844 and
  122px at 360x740 even though it measures 1.000 VH. The bar is a viewport-height
  ratio; the fold is smaller than the viewport because the 72px top bar and the
  tab bar are flow siblings. The answer, the action and every attention item are
  above the true fold; the Monthly wrap row is not.
- Everything the harness itself cannot see is unchanged and still listed in
  [`mobile-density-baseline.md`](./mobile-density-baseline.md#what-this-harness-cannot-see)
  — real iOS Safari, real touch, font rasterisation, dark mode, landscape.

---

## L3b — Activity and Monthly wrap

Every number below was read out of a live production build.
BEFORE is [`l3b-before.json`](./l3b-before.json), measured at the head of this
loop (i.e. on top of L3a); AFTER is [`l3b-after.json`](./l3b-after.json).
[`l3b-full-after.json`](./l3b-full-after.json) is the 20-state capture used only
to prove no other surface regressed.

```
pnpm ui:density:measure -- --mode gate \
  --surfaces activity,activity-empty-search,monthly-wrap \
  --viewports 390x844,360x740,430x932 --session l3b
# 9 measurement(s); 3 violating row(s)   EXIT=1  (Activity, see the arithmetic below)
```

### Vertical cost (VH) and CLS

| Surface                 | Viewport | Before VH |  After VH | Bar | Before CLS |  After CLS | CLS bar |
| ----------------------- | -------- | --------: | --------: | --: | ---------: | ---------: | ------: |
| Activity                | 390x844  | **7.245** | **5.103** | 3.0 |     0.0075 |     0.0075 |    0.02 |
| Activity                | 360x740  | **7.982** | **5.820** | 3.0 |     0.0106 |     0.0106 |    0.02 |
| Activity                | 430x932  | **6.572** | **4.621** | 3.0 |     0.0056 |     0.0056 |    0.02 |
| Activity · empty search | 390x844  |     1.013 |     1.000 | 3.0 |     0.0000 |     0.0000 |    0.02 |
| Activity · empty search | 360x740  |     1.000 |     1.000 | 3.0 | **0.0804** | **0.0000** |    0.02 |
| Activity · empty search | 430x932  |     1.000 |     1.000 | 3.0 |     0.0000 |     0.0000 |    0.02 |
| Monthly wrap            | 390x844  |     2.114 |     2.114 | 3.0 |     0.0000 |     0.0000 |    0.02 |
| Monthly wrap            | 360x740  |     2.768 |     2.768 | 3.0 |     0.0000 |     0.0000 |    0.02 |
| Monthly wrap            | 430x932  |     1.867 |     1.867 | 3.0 |     0.0000 |     0.0000 |    0.02 |

Headline first paint equals headline settled on all 9 rows; 0 interactive
targets under 44px, 0 horizontal overflow, 0 console errors on all 9 rows.
Monthly wrap is byte-identical before and after: it was already under bar and
nothing on it was touched.

### The long-list exemption, measured

The mission exempts a legitimately long list from the absolute cap **for its row
region only**, on two conditions. Both are measured directly, not estimated
(scroll-region content top → first transaction row top; and the live
`getBoundingClientRect().height` of all 61 rows).

| Signal                              |         Before 390x844 |           Before 360x740 |         Before 430x932 |         After (all three) |
| ----------------------------------- | ---------------------: | -----------------------: | ---------------------: | ------------------------: |
| Chrome above the first row          | 471.22px = **0.558VH** | 451.69px = **0.610VH** ✗ | 481.31px = **0.516VH** |              **188.89px** |
| …as VH                              |                  0.558 |                    0.610 |                  0.516 | **0.224 / 0.255 / 0.203** |
| Sub-bar                             |                 ≤ 0.60 |                   ≤ 0.60 |                 ≤ 0.60 |                    ≤ 0.60 |
| Section headings (`h2`) on the list |                     24 |                       24 |                     24 |                     **0** |
| Bordered `section` panels           |                     25 |                       25 |                     25 |                     **0** |

The 0.6 VH chrome sub-bar was **busted at 360x740 before this loop** (0.610) and
is now met at every viewport with a 2.4–2.9x margin.

Per-row height, identical at all three viewports (rows do not re-wrap on width):

| Row shape                                 | Count |   Height | C1 justification                                     |
| ----------------------------------------- | ----: | -------: | ---------------------------------------------------- |
| title / `category · Fri, Jul 24` / amount |    46 | **64px** | C1 two-line row = 64px                               |
| the same plus a note line                 |    15 | **74px** | a fifth fact; C1 has no three-line row, see refusals |

### Activity did not reach 3.0 VH. The honest arithmetic.

Measured decomposition of the 4307px Activity surface at every viewport:

```
  188.89 px  chrome above the first row      (4.4 %)
4054.00 px  61 transaction rows             (94.1 %)
   64.00 px  bottom clearance for the floating Fast Log button (1.5 %)
--------
 4306.89 px  = 4307 px measured scrollHeight
```

**3.0 VH is arithmetically unreachable for this fixture at any legal row
height.** The fixture holds 61 in-period transactions. Rule 4 and C1 both floor
a row at 44px:

| Row height                      | 61 rows | VH @390x844 | VH @360x740 | VH @430x932 |
| ------------------------------- | ------: | ----------: | ----------: | ----------: |
| 44px — the absolute touch floor |  2684px | **3.180** ✗ | **3.627** ✗ |       2.880 |
| 48px — C1 single-line row       |  2928px | **3.469** ✗ | **3.957** ✗ |     3.141 ✗ |
| 64px — C1 two-line row (built)  |  3904px |       4.626 |       5.276 |       4.189 |

Even with **zero chrome** and every row at the illegal-to-cross 44px floor,
Activity measures 3.180 VH at 390x844 and 3.627 VH at 360x740. The 3.0 bar
cannot be met without deleting rows, shrinking targets below 44px, or
virtualising — all three forbidden. What is irreducible is exactly the 4054px of
rows: 94.1 % of the surface. Everything else has been cut to 253px.

The mission's percentage rule (a surface above 5.0 VH at baseline must be cut by
≥ 60 %) is unreachable for the same reason: 60 % of the 7.873 VH baseline is
3.149 VH, which is below the 44px-floor arithmetic above. The achieved cut is
**7.245 → 5.103 VH at 390x844 (−29.6 %)**, **7.982 → 5.820 (−27.1 %)** and
**6.572 → 4.621 (−29.7 %)**; against the original 7.873 baseline at 390x844 that
is **−35.2 %**. This is reported as a **miss on the absolute bar with the
row-region exemption satisfied**, not as a pass.

### What was cut, and why

| Cut                                                                                                                                                                                            | Citation                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **24 date section headings inside 24 bordered panels** → one hairline-separated row group. The day moves onto every row as `Groceries · Fri, Jul 24`, keeping the weekday the heading carried. | **C2** (max 5 section headers; a group of <3 rows gets no header), **C4** (0px inside a group) |
| Panel padding, border and 8px inter-panel gap × 24 — the cost of the grouping above                                                                                                            | C4, C5 (a date is not a card)                                                                  |
| `Activity` eyebrow above the heading — restates the Activity tab in the bottom nav, carries no figure                                                                                          | C2, rule 1 (redundant)                                                                         |
| The bordered `July 2026 total / $5,255.44 / 61 expenses` summary panel → one line under the heading reading `$5,255.44 · 61 expenses`                                                          | **C5** (nobody acts on it, so it is not a card), C1                                            |
| …and its `July 2026` label — the period control names the period 40px away, same reading as L3a's Home runway qualifier                                                                        | rule 1 (restated value)                                                                        |
| Search + category filter stacked (two 48px rows + a 12px gap) → **one 48px row** at ≤720px                                                                                                     | C1, C4                                                                                         |
| Activity `h1` `Find and fix expenses.` 30px → 18px at ≤720px. It labels the tab; it carries no figure                                                                                          | C2 (same reading L3a applied to Home)                                                          |
| Raw ISO `2026-07-02` on every row → `Fri, Jul 24`                                                                                                                                              | C6 (a date figure is a figure), rule 6                                                         |

Dead CSS removed with the markup it styled: `.dateHeading`, `.activitySummary`.

### The empty-search CLS bust: root cause and fix

Baseline `Activity · empty search` shifted **0.1093** at 360x740 in the frozen
baseline and **0.0804** after L3a, against a 0.02 bar.

Root cause, found by inspection and confirmed by the fix: two rules,
`@media (--short-shell-740)` and `@media (--short-phone-740)`, said

```css
.surfaceStack:has(.emptyHero) .surfaceHeader > div:first-child {
  display: none;
}
```

so the moment a search matched nothing, the empty hero mounted, `:has()` matched,
and **the surface heading was deleted from the layout** — teleporting the search
field and everything under it ~50px upward on a 740px viewport. That is exactly
the defect **C9** names: the label changed identity between renders and the
settled box was not reserved. Both rules are deleted; the heading is now present
in both states and the measured CLS is **0.0000** at 360x740.

The companion `:has()` rules that shrink the hero itself (`> svg`, `button`)
were rewritten as plain `.emptyHero` selectors — same effect, no dependency on
an ancestor's contents.

### Tap paths walked after the change

Nothing became unreachable; every path is unchanged in length.

| Capability                           | Path                                                           | Taps |
| ------------------------------------ | -------------------------------------------------------------- | ---: |
| Activity surface                     | Activity tab                                                   |    1 |
| **Correct / edit a transaction**     | Activity tab → tap the row → Fast Log `Edit expense`           |    2 |
| Search expenses                      | Activity tab → search field (still `input[type=search]`, 16px) |    1 |
| Filter by category                   | Activity tab → category select (all 15 + archived)             |    1 |
| Change the reporting period          | Activity tab → period control (unchanged, one 44px row)        |    1 |
| Show transactions past the first 100 | Activity tab → `Load 100 more · N remaining`                   |    1 |
| Correct a future-dated expense       | Activity tab → `Needs correction` group → row                  |    2 |
| Fast Log a new expense               | floating action, `position: fixed`, on screen at all times     |    1 |
| Monthly wrap                         | Home → `Monthly wrap` row                                      |    1 |

The harness proves the edit path independently: its `fast-log-edit` state clicks
a transaction row on Activity and asserts it lands on `Edit expense` — 0.782 VH,
green, in the 20-state capture.

### What was refused

- **The note line was not folded into the meta line.** 15 of the 61 fixture rows
  carry a note and are 74px rather than 64px, costing 150px (0.18 VH). Merging
  the note into `category · date · note` would have made every row a uniform C1
  64px two-line row, but the note is already ellipsis-truncated and sharing the
  line would shrink the visible portion further. Rule 2 outranks 0.18 VH.
- **A 48px single-line row was rejected.** It would have taken Activity to
  ~3.77 VH — still over bar. A C1 48px row holds one flexible text column plus a
  fixed figure column; a transaction carries four facts (title, category, day,
  amount), and fitting them on one line at 360px forces the _title_ to ellipsise.
  Truncating the thing the user searches by, to miss the bar by less, is not a
  trade worth making.
- **The list was not virtualised or paginated smaller.** `visibleLimit` stays at 100. Rendering fewer rows would move the number without moving the density.
- **`Needs correction` (future-dated expenses) was not merged into the list.**
  Those entries are excluded from every money total; the fixture has none, so it
  costs 0px in the measured numbers and deleting the distinction would hide the
  reason a total looks wrong.
- **No bar, threshold or measurement semantic in `scripts/measure-density.mjs`
  was touched**, and no test was changed or deleted.

### Residual risk

- The 0.6 VH chrome sub-bar is met with room, but chrome is a _fixed_ cost while
  the bar is a _ratio_: on a viewport shorter than 315px the same 188.89px would
  bust it. No such phone exists.
- The fixture is one data shape. 61 rows over 24 days is a busy month; a quiet
  month reads proportionally lower, a 90-day period proportionally higher. The
  row region scales linearly at 64px/row and the chrome does not scale at all.
- A transaction title long enough to wrap would add a line to that row. No
  seeded title wraps at 360px; row heights are identical at 360, 390 and 430,
  which is the evidence for that.
- The `--fail-demo headline` injection does not fire on `Activity · empty
search` (React re-renders the heading and restores the text before the sample).
  It is proven red on `Monthly wrap`; the other five checks are proven red on
  both surfaces.

---

## L3d/e — Benefits, Manage categories, and the removal of all promotional copy

Every number below was read out of a live production build.
BEFORE is [`l3de-before.json`](./l3de-before.json), measured at the head of this
loop (i.e. on top of L3a and L3b); AFTER is
[`l3de-after.json`](./l3de-after.json).
[`l3de-full-after.json`](./l3de-full-after.json) is the 60-row capture (20
surface states × 3 viewports) used to prove no other surface regressed.

```
pnpm ui:density:measure -- --mode gate \
  --surfaces benefits,manage-categories,compare,plan,plan-details,account,onboarding,signed-out-sign-in,signed-out-create-account \
  --viewports 390x844,360x740,430x932 --session l3de
# 27 measurement(s); 0 violating row(s); mode=gate   EXIT=0
```

### Vertical cost (VH) and CLS

| Surface                    | Viewport | Before VH |  After VH | Bar | Before CLS | After CLS | CLS bar |
| -------------------------- | -------- | --------: | --------: | --: | ---------: | --------: | ------: |
| **Benefits**               | 390x844  | **4.204** | **2.757** | 4.0 |     0.0000 |    0.0000 |    0.02 |
| **Benefits**               | 360x740  | **5.649** | **3.166** | 4.0 |     0.0000 |    0.0000 |    0.02 |
| Benefits                   | 430x932  |     3.789 |     2.461 | 4.0 |     0.0000 |    0.0000 |    0.02 |
| **Manage categories**      | 390x844  | **4.233** | **2.364** | 4.0 |     0.0000 |    0.0000 |    0.02 |
| Manage categories          | 360x740  |     3.699 |     2.645 | 4.0 |     0.0000 |    0.0000 |    0.02 |
| Manage categories          | 430x932  |     3.798 |     2.105 | 4.0 |     0.0000 |    0.0000 |    0.02 |
| Compare years              | 390x844  |     1.748 |     1.634 | 4.0 |     0.0000 |    0.0000 |    0.02 |
| Compare years              | 360x740  |     2.018 |     1.888 | 4.0 |     0.0000 |    0.0000 |    0.02 |
| Compare years              | 430x932  |     1.583 |     1.480 | 4.0 |     0.0000 |    0.0000 |    0.02 |
| Plan                       | 390x844  |     2.359 |     2.359 | 3.0 |     0.0005 |    0.0005 |    0.02 |
| Plan                       | 360x740  |     2.399 |     2.399 | 3.0 |     0.0007 |    0.0007 |    0.02 |
| Plan                       | 430x932  |     2.100 |     2.100 | 3.0 |     0.0005 |    0.0005 |    0.02 |
| Plan details               | 390x844  |     2.870 |     2.845 | 4.0 |     0.0000 |    0.0000 |    0.02 |
| Plan details               | 360x740  |     3.295 |     3.265 | 4.0 |     0.0000 |    0.0000 |    0.02 |
| Plan details               | 430x932  |     2.511 |     2.488 | 4.0 |     0.0000 |    0.0000 |    0.02 |
| Account                    | 390x844  |     1.137 |     1.000 | 3.0 |     0.0000 |    0.0000 |    0.02 |
| Account                    | 360x740  |     1.400 |     1.208 | 3.0 |     0.0000 |    0.0000 |    0.02 |
| Account                    | 430x932  |     1.013 |     1.000 | 3.0 |     0.0000 |    0.0000 |    0.02 |
| Onboarding · cold load     | 390x844  |     1.000 |     1.000 | 1.5 |     0.0000 |    0.0000 |    0.02 |
| Onboarding · cold load     | 360x740  |     1.101 |     1.000 | 1.5 |     0.0000 |    0.0000 |    0.02 |
| Onboarding · cold load     | 430x932  |     1.000 |     1.000 | 1.5 |     0.0000 |    0.0000 |    0.02 |
| Signed out · create (cold) | 390x844  |     1.000 |     1.000 | 1.5 |     0.0000 |    0.0000 |    0.02 |
| Signed out · create (cold) | 360x740  |     1.158 |     1.000 | 1.5 |     0.0000 |    0.0000 |    0.02 |
| Signed out · create (cold) | 430x932  |     1.000 |     1.000 | 1.5 |     0.0000 |    0.0000 |    0.02 |
| Signed out · sign in       | 390x844  |     1.000 |     1.000 | 1.5 |     0.0083 |    0.0005 |    0.02 |
| Signed out · sign in       | 360x740  |     1.131 |     1.000 | 1.5 |     0.0071 |    0.0007 |    0.02 |
| Signed out · sign in       | 430x932  |     1.000 |     1.000 | 1.5 |     0.0068 |    0.0004 |    0.02 |

Headline first paint equals headline settled on all 27 rows. 0 interactive
targets under 44px, 0 horizontal overflow, 0 console errors on all 27 rows.

### No other surface regressed

`l3de-full-after.json` is 60 measurements. Compared row-by-row against the
frozen original baseline, **0 of 60 rows moved in the wrong direction on either
VH or CLS**, and compared against `l3b-full-after.json` (390x844) the same holds:

| Surface (390x844)       |     After L3b |   After L3d/e | Note                                                           |
| ----------------------- | ------------: | ------------: | -------------------------------------------------------------- |
| Home / Home · cold load |         1.000 |         1.000 | headline is now `Home`; geometry unchanged                     |
| Budget / future month   |         1.367 |         1.367 | untouched                                                      |
| Activity                |         5.103 |         5.103 | untouched; still the residual documented in L3b                |
| Activity · empty search |         1.000 |         1.000 | untouched                                                      |
| Category detail         |         1.417 |         1.417 | untouched                                                      |
| Edit budget             |         1.627 |     **1.608** | one sentence shortened on the page intro                       |
| Monthly wrap            |         2.114 |     **2.098** | one duplicated section eyebrow removed                         |
| Manage categories       |         4.233 |     **2.364** | this loop                                                      |
| Benefits                |         4.204 |     **2.757** | this loop                                                      |
| Plan details            |         2.870 |     **2.845** | shared `.eyebrow` untouched; the delta is the Fast Log eyebrow |
| Compare years           |         1.748 |     **1.634** | duplicated eyebrow + h1 removed                                |
| Account                 |         1.137 |     **1.000** | two positioning paragraphs removed                             |
| Plan                    |         2.359 |         2.359 | untouched                                                      |
| Fast Log new / edit     | 0.848 / 0.782 | 0.848 / 0.782 | eyebrow removal did not change the sheet's height              |

### Benefits: what was cut, and why

| Cut                                                                                                                                                                                                                                                                    | Citation                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| The **five-line benefit row** (name / kind / amount+delete / discount / result at ≤360px, and a three-line variant above it) → **two 44px lines**: name plus the computed annual figure in a fixed `nowrap` `tabular-nums` column, then amount kind, amount and delete | **C1** (48px single-line row, no row below 44px), **C6**     |
| …measured: 271px → **117px** per plain row at 360x740, 11 rows 3198px → **1544px**                                                                                                                                                                                     | C1                                                           |
| The four `benefitSummary` **cards** (12px padding, rounded, 61px each) → a hairline **row group** of 44px lines, label left, figure right                                                                                                                              | **C5** (nobody acts on these four facts as a unit), C1, C6   |
| The second `<h1>` `Benefits and payroll choices` — the sub-page already renders `<h1>Benefits</h1>` 32px above it                                                                                                                                                      | **C2** (header ≤ 32px, no subtitle), rule 1 (restated value) |
| The eyebrow `Before the paycheck lands`                                                                                                                                                                                                                                | C2, rule 6 (promotional flavour)                             |
| The per-row line `Recomputes take-home instantly`, rendered on 9 of the 11 rows                                                                                                                                                                                        | **rule 6** (a feature claim carrying no information)         |
| …the _other_ branch of that line, `Employer-side · does not reduce paycheck`, was **kept** on the two employer-side rows: it is the only place that fact is stated                                                                                                     | rule 1 (no capability or fact removed)                       |
| The intro note shortened and set at 13px                                                                                                                                                                                                                               | order 6 (type scale, last resort)                            |

### Manage categories: what was cut, and why

| Cut                                                                                                                                                                                                                                            | Citation                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| The category row's **four auto-placed 44px lines** (dot+name / type / colour / reorder / archive) → an explicit **two-line grid**: `dot name … archive` over `dot type colour reorder`. 217px → **112px** per row, 15 rows 3255px → **1680px** | **C1**, C4 (0px inside a group)                           |
| The toolbar sentence `Rename, classify, reorder, or archive. History stays attached.` → `Archiving keeps the category's history.` — the four verbs name controls that are visible on every row                                                 | rule 1 (restated), rule 6 (factual copy may be shortened) |
| `Edit budget` intro `Change planned amounts in one pass. Annual categories remain annual.` → `Annual categories remain annual.`                                                                                                                | rule 6 (shortened, not deleted)                           |

Every control kept its own ≥44px target: the harness reports **0 targets under
44px** on all 60 rows.

### Benefits and the 60 % rule: the honest arithmetic

The frozen original baseline for Benefits at 360x740 is **5.746 VH = 4252px**,
which is above 5.0, so the mission requires a cut of at least 60 % — a target of
**2.298 VH = 1701px** — _and_ the absolute 4.0 bar.

- **The absolute bar is met at every viewport**: 2.757 / 3.166 / 2.461 VH.
- **The 60 % target is not met.** Achieved 3.166 VH at 360x740 = **2343px**, a
  **−44.9 %** cut against the frozen baseline (−43.9 % against this loop's head
  of 5.649). Against the 390x844 baseline the cut is 4.289 → 2.757 (−35.7 %) and
  at 430x932 3.866 → 2.461 (−36.3 %).

Measured decomposition of the 2343px surface at 360x740:

```
   44 px  back control                                        ( 1.9 %)
   32 px  page heading "Benefits"                             ( 1.4 %)
  136 px  intro note + the "Add benefit" control              ( 5.8 %)
  176 px  four 44px summary rows                              ( 7.5 %)
  237 px  bounded warning + tax-notice region                 (10.1 %)
 1544 px  11 benefit rows                                     (65.9 %)
  174 px  card padding, group gaps, scroll-region clearance   ( 7.4 %)
--------
 2343 px  = measured scrollHeight
```

Per-row heights at 360x740, identical at 390 and 430 (rows do not re-wrap on width):

| Row shape                                         | Count |    Height | Why                                             |
| ------------------------------------------------- | ----: | --------: | ----------------------------------------------- |
| name+figure / kind+amount+delete                  |     7 | **117px** | C1 two 44px control lines, 8px gap, 8px padding |
| the same plus the employer-side note              |     2 |     149px | the note is the only statement of that fact     |
| the same plus the ESPP discount input             |     1 |     169px | a sixth control                                 |
| the same plus the custom tax-treatment checkboxes |     1 |     258px | four checkbox targets, each ≥44px               |

**The 60 % target is not arithmetically impossible here, and it would be
dishonest to claim it is.** The floor under the never-cross rules is roughly:

```
 968 px  11 rows × two 44px control lines, zero padding, zero gap
  44 px  the ESPP discount input
  88 px  two wrapped 44px rows of custom tax-treatment checkboxes
  44 px  back control
  32 px  page heading
  44 px  "Add benefit" control
 176 px  four summary lines
 237 px  warning + notice region (rule 2: attention items must stay visible)
--------
1633 px  = 2.207 VH
```

The 1701px target therefore sits **68px above that floor**, i.e. it is reachable
only by a page with zero padding, zero gaps between groups and no explanatory
note — which **C4 forbids outright** (16px between groups, 24px between major
sections). The 642px between the built page and the target is exactly the
padding, gaps, 48px money-input height, the operational intro note, and the four
row shapes above that carry a sixth or seventh control.

**One mechanism would reach it, and it was refused.** C12 licenses promoting a
section over 400px to a sub-page behind a labeled 48px row showing its summary
value. Promoting each benefit to its own editor page would leave 11 labeled 48px
rows (~540px) and project to ≈1350px = **1.82 VH at 360x740, a −68 % cut**. It
was refused because:

- Benefits exists to be _compared while tuning_: the whole point of the surface
  is seeing all eleven payroll choices and the three summary figures move
  together. Eleven sub-pages turns one screen of work into 22 taps.
- C12's own trigger is a section "opened less than once per session". The
  benefit list is not a section of this surface; it **is** this surface.
- It would satisfy the percentage by relocating the content the percentage is
  measuring — the same class of move the mission blocks for nested scrollers and
  virtualisation.

This is reported as a **pass on the absolute 4.0 bar and a miss on the 60 %
reduction**, with the arithmetic above, not as a pass.

### The signed-out CLS regression this loop introduced, and its fix

Removing the marketing panel made the auth card the only content on the page and
vertically centred it. The password hint `Use at least 10 characters.` rendered
in create-account mode only, so toggling to sign-in shortened the card and the
centring moved the whole panel: measured **0.0277 / 0.0361 / 0.0214** against a
0.02 bar, worse than the 0.0083 / 0.0071 / 0.0068 baseline.

Root cause is exactly what **C9** names: a box that exists in one state and not
the other. `minLength` is 10 in both modes, so the line is true in both modes and
it is now rendered in both. Measured after the fix: **0.0005 / 0.0007 / 0.0004** —
an order of magnitude better than the baseline it started from.

### Promotional copy removed

The app has two private users, no customers and nothing to sell. Every string
below was deleted or reduced to a factual label. Nothing in the "kept" list was
touched beyond shortening.

| Where                  | String removed                                                                                                                          | Class                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Signed out             | eyebrow `Plan the year. Know what is left today.`                                                                                       | tagline                   |
| Signed out             | `<h1>` `One honest plan for every day money moves.`                                                                                     | product promise           |
| Signed out             | `Set the long view from salary, taxes, benefits, and planned spending. Then log real expenses and see what is safe to spend now.`       | feature-selling pitch     |
| Signed out             | `previewLedger`: `Gross pay $150,000`, `Taxes · benefits · life — accounted for`, `What's safe this month $2,184`                       | **fabricated data**       |
| Signed out             | eyebrows `Start your cockpit` / `Welcome back`                                                                                          | flavour                   |
| Signed out             | `<h2>` `Create your private account` / `Open your money cockpit` → `Create account` / `Sign in`                                         | positioning               |
| Signed out             | `No bank connection or ads. Export or permanently delete every plan anytime.`                                                           | differentiation claim     |
| Signed out             | the entire dark `authStory` panel that framed the above                                                                                 | marketing chrome          |
| Onboarding             | eyebrow `Three details · sensible defaults do the rest`                                                                                 | effort-minimisation pitch |
| Onboarding             | `<h1>` `Build the plan behind your daily budget` → `Create your plan`                                                                   | positioning               |
| Onboarding             | button `Open my cockpit` / `Opening your cockpit…` → `Create plan` / `Creating plan…`                                                   | positioning               |
| Onboarding             | `placeholder="150,000"` on the wages field                                                                                              | **fabricated figure**     |
| Account                | eyebrow `Your data`; `Your plans stay private to this account. Export a complete copy whenever you want.`                               | restated / positioning    |
| Account                | `No bank connection or ads.` (leading clause of the privacy line)                                                                       | differentiation claim     |
| Account                | `<h2>` `Keep your plan one tap away.` → `Install on iPhone`                                                                             | benefit promise           |
| Benefits               | eyebrow `Before the paycheck lands`; `<h1>` `Benefits and payroll choices`                                                              | flavour / restated        |
| Benefits               | per-row `Recomputes take-home instantly` (9 rows)                                                                                       | feature claim             |
| Home                   | `<h1>` `Your money, right now.` / `Your plan, ahead.` → `Home`                                                                          | tagline                   |
| Activity               | `<h1>` `Find and fix expenses.` → `Activity`                                                                                            | pitch voice               |
| Monthly expense ledger | eyebrow `Your planned life`                                                                                                             | aspirational flavour      |
| Fast Log               | eyebrow `One clean entry`                                                                                                               | quality claim             |
| Fast Log               | `Create category without losing this expense` → `Create category`                                                                       | reassurance claim         |
| Compare years          | `<h1>` `See what changed—and what stayed yours.` / `Your {year} plan at a glance.` and its eyebrow                                      | pitch / restated          |
| Monthly wrap           | `<h2>` `Every contribution and variance, counted once` → `How the savings impact is built` (and its duplicate eyebrow)                  | correctness claim         |
| Monthly wrap           | list title `Wins` → `Under budget`                                                                                                      | celebratory framing       |
| Plan answer            | `Flexible cash saving after every planned expense.` → `Cash remaining after every planned expense.`                                     | reassurance tone          |
| Plan answer            | `…to see what is truly left.` → `…to complete it.`                                                                                      | truth/clarity promise     |
| Sidebar                | strapline `Daily decisions · annual plan`                                                                                               | tagline                   |
| Manifest               | `name: "House by 30 — Daily Money Cockpit"` → `"House by 30"`                                                                           | tagline suffix            |
| `brand.ts`             | `PRODUCT_DESCRIPTION` `Plan the year, log daily spending, and know what is safe to spend.` → `Annual money plan and daily expense log.` | pitch → descriptor        |

**Kept, as the mission requires:** every field label, every validation and error
message, the sign-in / create-account controls and their toggle, the Add-to-Home-Screen
install steps, `Installed plans will remain available offline after their first
sync.`, `Plans remain on the server until you delete this account; deletion also
clears this device's cached copy.`, the tax-estimate disclaimer, the ESPP /
HSA / limit notices, and every line that explains what a number means.

#### The `PRODUCT_DESCRIPTION` decision

**Kept, rewritten from a pitch to a descriptor.** A PWA manifest `description`
and the document `<meta name="description">` are install-time metadata: the
install sheet and the Home Screen listing render it, and dropping it degrades a
real operational surface. What is _not_ defensible is putting a pitch there.
`Plan the year, log daily spending, and know what is safe to spend.` addresses
the reader in the second person and promises an outcome ("know what is safe").
`Annual money plan and daily expense log.` states what the software is, in the
third person, with no promise, benefit claim, or address to a reader. It is
rendered nowhere inside the app — the two call sites are `src/app/manifest.ts`
and `src/app/layout.tsx`, both metadata. The manifest's `name` field lost its
`— Daily Money Cockpit` suffix outright: that was a tagline, not metadata.

### Tap paths walked after the change

Nothing became unreachable; no path grew.

| Capability                           | Path                                                         | Taps |
| ------------------------------------ | ------------------------------------------------------------ | ---: |
| Benefits surface                     | Plan tab → `Benefits`                                        |    2 |
| Edit a 401(k) / HSA / payroll amount | Plan tab → `Benefits` → the row's amount field, inline       |    2 |
| Change a benefit's amount kind       | same row, `% of wages` / `$ per year` / `$ per month` select |    2 |
| Rename a benefit                     | same row, name field                                         |    2 |
| Delete a benefit                     | same row, 44px trash control                                 |    2 |
| Add a benefit                        | Plan tab → `Benefits` → `Add benefit` select (13 types)      |    2 |
| ESPP discount rate                   | the ESPP row's `Discount %` field                            |    2 |
| Custom benefit tax treatment         | the custom row's four checkboxes                             |    2 |
| Manage categories                    | Budget tab → `Manage categories`                             |    2 |
| Create a category                    | → `Add category`                                             |    3 |
| Rename a category                    | → the row's name field                                       |    3 |
| Archive / reactivate a category      | → the row's `Archive` / `Reactivate` control                 |    3 |
| Reorder a category                   | → the row's up / down controls                               |    3 |
| Change a category's type or colour   | → the row's two selects                                      |    3 |
| Export all years / this device       | Account → the two export buttons                             |    2 |
| Add to Home Screen instructions      | Account → the three numbered steps                           |    1 |
| Log out / delete account permanently | Account → `Log out` / `Delete account`                       |    2 |
| Create an account / sign in          | signed-out panel, both modes via the toggle                  |  1–2 |

### FAIL-DEMO, re-proven on this loop's surfaces

Each check was re-proven red on **Benefits and Manage categories** after the
change, by browser-side injection only — no application source was touched.

| Check         | Injection                         | Manage categories     | Benefits               |
| ------------- | --------------------------------- | --------------------- | ---------------------- |
| vertical cost | 4000px of padding on the scroller | 7.027 VH ✗            | 7.421 VH ✗             |
| CLS           | 220px block prepended at +900ms   | 0.2097 ✗              | 0.1418 ✗               |
| headline swap | `main h1` rewritten at +900ms     | swapped ✗             | swapped ✗              |
| touch target  | 20x20 button prepended            | 1 target under 44px ✗ | 2 targets under 44px ✗ |
| overflow      | body widened to 3000px            | 390 ≠ 3000 ✗          | 390 ≠ 3000 ✗           |
| console error | one `console.error`               | 1 error ✗             | 1 error ✗              |

Evidence: `l3de-faildemo-{vh,cls,headline,touch,overflow,console}.json`, each run
exiting non-zero.

### What was refused

- **Eleven benefit sub-pages** — see the 60 % arithmetic above.
- **The bounded warning / tax-notice region (237px) was not cut.** It is 10 % of
  the Benefits surface and the largest remaining non-row block, but it carries
  the HSA/FSA conflict warning and the contribution-limit notices. Rule 2 puts
  attention items above density; it is already bounded to one visible message
  plus a labeled `Show 5 more warnings and tax notes` disclosure.
- **`Benefits going to savings` was not deleted** even though it is the sum of
  the two rows above it (the pattern L3a used to delete Home's metric trio). It
  is the only place the `Not feasible with current payroll choices` state is
  stated, and deleting it would delete an attention signal.
- **No input font-size was touched.** C10's 16px floor is intact on both
  restructured surfaces; the money field is still 48px tall with a 16px value.
- **The category colour select was not replaced by a swatch picker.** Eleven
  named tokens in a native select is one 44px target; a swatch grid would be
  eleven smaller ones.
- **No bar, threshold or measurement semantic in `scripts/measure-density.mjs`
  was touched.** The only edits to that file are the surface-arrival assertions
  for headings whose text this loop intentionally changed (`Create account`,
  `Sign in`, `Create your plan`, `Home`, `Activity`, and the Benefits assertion,
  which now asserts the sub-page heading plus the presence of the `Add benefit`
  control rather than the deleted duplicate `<h1>`).
- **No test was deleted or weakened.** All 498 tests in 61 files pass. Two
  assertions in `core-flow.integration.test.tsx` encoded copy this loop
  intentionally changed and were updated in place: `Your money, right now.` →
  an assertion that `main h1` is `Home`, and the Fast Log button label
  `Create category without losing this expense` → `Create category`.

### Residual risk

- **Benefits misses the 60 % reduction target** at 3.166 VH against a 2.298 VH
  target at 360x740. The mechanism that would close it is documented and
  refused above; a reviewer who disagrees with that judgement has the projected
  number (≈1.82 VH) to act on.
- **The fixture is one data shape.** Eleven benefits is a full payroll; the row
  region scales linearly at 117px per plain row and the chrome does not scale.
  A twelfth benefit adds 0.16 VH at 360x740, so ~16 more benefits would reach
  the 4.0 bar. Fifteen categories likewise costs 112px each on Manage
  categories; ~11 more would reach it.
- **A benefit label long enough to wrap** would add a line to that row. No
  seeded label wraps at 360px — the seven plain rows all measure 117px at 360,
  390 and 430, which is the evidence for that.
- The auth panel is now the only thing on the signed-out page. Its CLS is
  measured at 0.0005–0.0007, but any future control that renders in one mode and
  not the other will re-open the C9 defect that this loop closed.
- Everything the harness cannot see is unchanged and still listed in
  [`mobile-density-baseline.md`](./mobile-density-baseline.md#what-this-harness-cannot-see).

---

## L4 — stability, verifier fidelity, and the long-list exemption made measurable

Every number below was read out of the same live production build.
Evidence: [`l4-full-after.json`](./l4-full-after.json) (60 rows, gate mode,
exit 0) and [`l4-full-after.md`](./l4-full-after.md); the red proofs are
`l4-faildemo-{chrome,listrows,cls,vh,headline,touch,overflow,console}.json`.

```
pnpm ui:density:measure -- --mode gate --viewports 390x844,360x740,430x932
# 60 measurement(s); 0 violating row(s); mode=gate   EXIT=0
```

### 1. The long-list exemption is now a measured gate, not an author's claim

L3b's chrome-above-the-first-row figure existed only in an uncommitted ad-hoc
probe. The one bar that actually binds Activity was therefore unverifiable by
anyone but its author. That was the real defect, and it is closed:

- The Activity entry in the harness's frozen surface catalogue now carries a
  `listExemption` naming the selector of its first list row
  (`main [data-density-row="transaction"]`). No other surface has one, and there
  is no command-line flag that can grant one. The mission names transaction
  history and all-category rows; Budget's category list already passes the
  absolute 3.0 bar at 1.238-1.565 VH, so it was not given an exemption it does
  not need.
- The harness measures **chrome above the first row** itself, in the scroll
  region's own content coordinates (content-box top to first row top), and gates
  it at **<= 0.6 VH**.
- It measures and reports **every row's height**, tallied, so the "justified
  against the research file" clause is checkable by a reader.
- Activity's 3.0 VH figure is still reported, in a column marked `info`. It no
  longer gates.
- A `data-density-row="transaction"` attribute was added to the transaction row
  so the selector cannot be renamed by the CSS-module hasher. It costs 0px.

Measured, identical at every viewport because chrome is a fixed cost:

| Viewport | Chrome above the first row |     as VH | Sub-bar | Margin |
| -------- | -------------------------: | --------: | ------: | -----: |
| 390x844  |                   188.89px | **0.224** | <= 0.60 |   2.7x |
| 360x740  |                   188.89px | **0.255** | <= 0.60 |   2.4x |
| 430x932  |                   188.89px | **0.203** | <= 0.60 |   3.0x |

**Red proof** (`--fail-demo chrome`, browser-side injection only, no application
source touched): a 400px block prepended above the list drives the chrome to
588.89px = **0.698 / 0.796 / 0.632 VH**, and the run exits non-zero on all three
viewports with the row region still exempt. **Green proof**: the table above,
0 violating rows.

**Second red proof** (`--fail-demo listrows`): stripping `data-density-row` from
every row makes the harness report _long-list exemption claimed but not earned_
and exit non-zero. An exemption whose selector stops matching cannot silently
turn Activity's only binding gate off.

### 2. The 74px row: resolved by deriving the rung, option (a)

Activity rendered 46 rows at 64px (C1's two-line rung, justified) and 15 rows at
**74px** because those transactions carry a note. C1 defined no three-line rung,
so 74px was a height nobody had justified — the exemption's second condition was
unmet.

`docs/research/mobile-density-2026-07.md` now carries **C1b**, appended with its
derivation and citations. The short version: the binding constraint on a
three-line block is not Carbon's ladder (which stops at 64px and publishes no
three-line rung) but **HIG-T2** — "if you need to display three or more lines of
text, avoid tight leading even in areas where height is limited" — which **C3**
already turns into 1.5 leading. At 1.5, the three line boxes measure
24 + 19.5 + 19.5 = 63px; with the row's 8px top and bottom padding that is 79px,
which rounds to **80px** on C4's 8px rhythm. The gap goes to **0px** because a
24px line box for 16px text already carries the 8px of separation a gap would
duplicate.

The 74px the surface was shipping was `normal` leading (~1.18) on a three-line
block — tight leading at three lines, exactly what HIG-T2 forbids. Setting the
note at 11px to reach 74px legitimately was rejected: 24 + 19.5 + 16.5 + 16 =
76px lands on the same 80px rung after rounding, so it would buy less legible
text for zero pixels.

Measured after the change, identical at 390, 360 and 430 (rows do not re-wrap on
width): **46 x 64px, 15 x 80px**. Both figures are now printed by the harness on
every Activity row.

**This costs density and the cost is stated, not absorbed:** +6px per noted row,
90px over the 15 noted rows, and Activity moves **5.103 -> 5.210 VH** at 390x844
(5.820 -> 5.942 at 360x740, 4.621 -> 4.718 at 430x932). Activity's absolute VH
was already a documented miss on a bar that is arithmetically unreachable under
rule 4; the chrome sub-bar that actually gates it is unaffected, and the trade
buys compliance with HIG-T2/C3 on 15 rows. L3b's refusal to fold the note into
the meta line stands and was not revisited.

### 3. The CLS instrument was dead, and that is why it now reports its own liveness

This is the finding that matters most for verifier fidelity.

Partway through this loop the harness reported **CLS 0.0000 on all 60 rows** —
and the `cls` fail-demo, which prepends a 220px block, **also reported 0.0000 and
passed**. The check had stopped being able to fail.

Root cause, established directly rather than guessed: the browser was producing
**zero animation frames**. A `requestAnimationFrame` loop never ticked; a
control experiment that moved an element 390px down produced **zero**
`layout-shift` entries with `PerformanceObserver.supportedEntryTypes` still
listing `layout-shift` and `observerError` still null. The Layout Instability
API only emits when the compositor presents frames, so an occluded or
non-compositing window reports a perfect score for a page that is jumping. This
reproduced headless and headed, so it was not fixable from inside the repo.

Two changes, both of which stay in place now that frames are being produced
again:

1. **The probe counts frames.** Every row now reports `frameTicks` and
   `nativeLayoutShiftLive` (frames > 5 — one frame is what document load forces,
   and is not liveness). A run whose native CLS is zero because nothing was
   measured is now distinguishable from one where nothing moved, and the harness
   prints a NOTE naming the affected row count.
2. **A second, compositor-independent CLS measurement.** Layout still runs when
   frames do not, so `getBoundingClientRect()` stays truthful. The probe samples
   every rendered element on a 100ms timer (`setInterval` runs without frames)
   and applies the spec's own scoring formula — impact fraction x max distance
   fraction — to whatever moved between two samples, grouped into web.dev
   session windows, excluding shifts within 500ms of an input (CLS-4) and
   discarding sample pairs that straddle a scroll. The gate uses
   **`max(native, geometric)`**, so neither instrument can hide what the other
   saw.

Its two deliberate differences from the native metric are stated in the code and
both make it conservative or coarse, never permissive: the impact region is the
**bounding box** of the moved elements' rects, which is >= their true union, so
it over-reports rather than under-reports; and 100ms sampling scores two shifts
inside one interval as their net movement, so a jump-and-return within 100ms
scores lower than natively.

**It is cross-validated.** On the 220px `cls` injection it reads **0.2203**;
L3d/e measured **0.2097** natively for the same 220px injection on Manage
categories. On the `chrome` injection the native API — live again by then — read
0.3399-0.4038 and the run failed on both counts.

In the final 60-row run **both instruments are live** (92-3263 frames per row),
and the native figures reproduce the earlier waves' numbers to four decimals:
Budget 0.0075 / 0.0106 / 0.0056, Budget future-month 0.0042 / 0.0038 / 0.0039,
Home 0.0005 / 0.0007 / 0.0005, signed-out sign-in 0.0005 / 0.0007 / 0.0004.
That agreement is the evidence that the instrument is healthy, and it is why
this run's table can be trusted where the earlier all-zeroes run could not.

### 4. Full-matrix stability sweep — 20 surface states x 3 viewports

`CLS` is `max(native, geometric)`; both columns are shown. `Frames` is the
liveness evidence for the native column. Every row's headline is identical at
first paint and settled.

| Surface           | State                      | Viewport |    VH |      Bar | CLS native | CLS geometric | Frames | Headline swap | <44px | Overflow | Console errors | Chrome above list | Row heights      |
| ----------------- | -------------------------- | -------- | ----: | -------: | ---------: | ------------: | -----: | ------------- | ----: | -------- | -------------: | ----------------: | ---------------- |
| Signed out        | create account (cold load) | 390x844  | 1.000 |      1.5 |     0.0000 |        0.0000 |     92 | no            |     0 | no       |              0 |                 — | —                |
| Signed out        | sign in                    | 390x844  | 1.000 |      1.5 |     0.0005 |        0.0000 |    195 | no            |     0 | no       |              0 |                 — | —                |
| Onboarding        | cold load                  | 390x844  | 1.000 |      1.5 |     0.0000 |        0.0000 |     94 | no            |     0 | no       |              0 |                 — | —                |
| Home              | default                    | 390x844  | 1.000 |      1.0 |     0.0005 |        0.0000 |    383 | no            |     0 | no       |              0 |                 — | —                |
| Home              | cold load                  | 390x844  | 1.000 |      1.0 |     0.0000 |        0.0000 |     94 | no            |     0 | no       |              0 |                 — | —                |
| Budget            | default                    | 390x844  | 1.367 |      3.0 |     0.0075 |        0.0000 |    297 | no            |     0 | no       |              0 |                 — | —                |
| Budget            | future month               | 390x844  | 1.367 |      3.0 |     0.0042 |        0.0000 |    511 | no            |     0 | no       |              0 |                 — | —                |
| Activity          | default                    | 390x844  | 5.210 | 3.0 info |     0.0075 |        0.0000 |    714 | no            |     0 | no       |              0 |  188.89px = 0.224 | 46x64px, 15x80px |
| Activity          | empty search               | 390x844  | 1.000 |      3.0 |     0.0000 |        0.0000 |    928 | no            |     0 | no       |              0 |                 — | —                |
| Category detail   | Dining out                 | 390x844  | 1.424 |      4.0 |     0.0000 |        0.0000 |   1144 | no            |     0 | no       |              0 |                 — | —                |
| Edit budget       | default                    | 390x844  | 1.608 |      4.0 |     0.0000 |        0.0000 |   1359 | no            |     0 | no       |              0 |                 — | —                |
| Manage categories | default                    | 390x844  | 2.364 |      4.0 |     0.0000 |        0.0000 |   1573 | no            |     0 | no       |              0 |                 — | —                |
| Monthly wrap      | default                    | 390x844  | 2.098 |      3.0 |     0.0000 |        0.0000 |   1788 | no            |     0 | no       |              0 |                 — | —                |
| Plan              | default                    | 390x844  | 2.359 |      3.0 |     0.0005 |        0.0000 |   1991 | no            |     0 | no       |              0 |                 — | —                |
| Plan details      | default                    | 390x844  | 2.845 |      4.0 |     0.0000 |        0.0000 |   2207 | no            |     0 | no       |              0 |                 — | —                |
| Benefits          | default                    | 390x844  | 2.757 |      4.0 |     0.0000 |        0.0000 |   2421 | no            |     0 | no       |              0 |                 — | —                |
| Compare years     | default                    | 390x844  | 1.634 |      4.0 |     0.0000 |        0.0000 |   2636 | no            |     0 | no       |              0 |                 — | —                |
| Account           | default                    | 390x844  | 1.000 |      3.0 |     0.0000 |        0.0000 |   2838 | no            |     0 | no       |              0 |                 — | —                |
| Fast Log          | new expense                | 390x844  | 0.848 |      4.0 |     0.0000 |        0.0000 |   3041 | no            |     0 | no       |              0 |                 — | —                |
| Fast Log          | edit expense               | 390x844  | 0.782 |      4.0 |     0.0000 |        0.0000 |   3256 | no            |     0 | no       |              0 |                 — | —                |
| Signed out        | create account (cold load) | 360x740  | 1.000 |      1.5 |     0.0000 |        0.0000 |     94 | no            |     0 | no       |              0 |                 — | —                |
| Signed out        | sign in                    | 360x740  | 1.000 |      1.5 |     0.0007 |        0.0000 |    197 | no            |     0 | no       |              0 |                 — | —                |
| Onboarding        | cold load                  | 360x740  | 1.000 |      1.5 |     0.0000 |        0.0000 |     94 | no            |     0 | no       |              0 |                 — | —                |
| Home              | default                    | 360x740  | 1.000 |      1.0 |     0.0007 |        0.0000 |    382 | no            |     0 | no       |              0 |                 — | —                |
| Home              | cold load                  | 360x740  | 1.000 |      1.0 |     0.0000 |        0.0000 |     94 | no            |     0 | no       |              0 |                 — | —                |
| Budget            | default                    | 360x740  | 1.565 |      3.0 |     0.0106 |        0.0000 |    298 | no            |     0 | no       |              0 |                 — | —                |
| Budget            | future month               | 360x740  | 1.565 |      3.0 |     0.0038 |        0.0000 |    513 | no            |     0 | no       |              0 |                 — | —                |
| Activity          | default                    | 360x740  | 5.942 | 3.0 info |     0.0106 |        0.0000 |    717 | no            |     0 | no       |              0 |  188.89px = 0.255 | 46x64px, 15x80px |
| Activity          | empty search               | 360x740  | 1.000 |      3.0 |     0.0000 |        0.0000 |    932 | no            |     0 | no       |              0 |                 — | —                |
| Category detail   | Dining out                 | 360x740  | 1.614 |      4.0 |     0.0000 |        0.0000 |   1148 | no            |     0 | no       |              0 |                 — | —                |
| Edit budget       | default                    | 360x740  | 1.847 |      4.0 |     0.0000 |        0.0000 |   1363 | no            |     0 | no       |              0 |                 — | —                |
| Manage categories | default                    | 360x740  | 2.645 |      4.0 |     0.0000 |        0.0000 |   1578 | no            |     0 | no       |              0 |                 — | —                |
| Monthly wrap      | default                    | 360x740  | 2.750 |      3.0 |     0.0000 |        0.0000 |   1793 | no            |     0 | no       |              0 |                 — | —                |
| Plan              | default                    | 360x740  | 2.399 |      3.0 |     0.0007 |        0.0000 |   1996 | no            |     0 | no       |              0 |                 — | —                |
| Plan details      | default                    | 360x740  | 3.265 |      4.0 |     0.0000 |        0.0000 |   2212 | no            |     0 | no       |              0 |                 — | —                |
| Benefits          | default                    | 360x740  | 3.166 |      4.0 |     0.0000 |        0.0000 |   2427 | no            |     0 | no       |              0 |                 — | —                |
| Compare years     | default                    | 360x740  | 1.888 |      4.0 |     0.0000 |        0.0000 |   2642 | no            |     0 | no       |              0 |                 — | —                |
| Account           | default                    | 360x740  | 1.208 |      3.0 |     0.0000 |        0.0000 |   2845 | no            |     0 | no       |              0 |                 — | —                |
| Fast Log          | new expense                | 360x740  | 0.968 |      4.0 |     0.0000 |        0.0000 |   3048 | no            |     0 | no       |              0 |                 — | —                |
| Fast Log          | edit expense               | 360x740  | 0.892 |      4.0 |     0.0000 |        0.0000 |   3263 | no            |     0 | no       |              0 |                 — | —                |
| Signed out        | create account (cold load) | 430x932  | 1.000 |      1.5 |     0.0000 |        0.0000 |     94 | no            |     0 | no       |              0 |                 — | —                |
| Signed out        | sign in                    | 430x932  | 1.000 |      1.5 |     0.0004 |        0.0000 |    197 | no            |     0 | no       |              0 |                 — | —                |
| Onboarding        | cold load                  | 430x932  | 1.000 |      1.5 |     0.0000 |        0.0000 |     94 | no            |     0 | no       |              0 |                 — | —                |
| Home              | default                    | 430x932  | 1.000 |      1.0 |     0.0005 |        0.0000 |    383 | no            |     0 | no       |              0 |                 — | —                |
| Home              | cold load                  | 430x932  | 1.000 |      1.0 |     0.0000 |        0.0000 |     94 | no            |     0 | no       |              0 |                 — | —                |
| Budget            | default                    | 430x932  | 1.238 |      3.0 |     0.0056 |        0.0000 |    298 | no            |     0 | no       |              0 |                 — | —                |
| Budget            | future month               | 430x932  | 1.238 |      3.0 |     0.0039 |        0.0000 |    513 | no            |     0 | no       |              0 |                 — | —                |
| Activity          | default                    | 430x932  | 4.718 | 3.0 info |     0.0056 |        0.0000 |    716 | no            |     0 | no       |              0 |  188.89px = 0.203 | 46x64px, 15x80px |
| Activity          | empty search               | 430x932  | 1.000 |      3.0 |     0.0000 |        0.0000 |    930 | no            |     0 | no       |              0 |                 — | —                |
| Category detail   | Dining out                 | 430x932  | 1.290 |      4.0 |     0.0000 |        0.0000 |   1147 | no            |     0 | no       |              0 |                 — | —                |
| Edit budget       | default                    | 430x932  | 1.411 |      4.0 |     0.0000 |        0.0000 |   1362 | no            |     0 | no       |              0 |                 — | —                |
| Manage categories | default                    | 430x932  | 2.105 |      4.0 |     0.0000 |        0.0000 |   1577 | no            |     0 | no       |              0 |                 — | —                |
| Monthly wrap      | default                    | 430x932  | 1.823 |      3.0 |     0.0000 |        0.0000 |   1792 | no            |     0 | no       |              0 |                 — | —                |
| Plan              | default                    | 430x932  | 2.100 |      3.0 |     0.0005 |        0.0000 |   1995 | no            |     0 | no       |              0 |                 — | —                |
| Plan details      | default                    | 430x932  | 2.488 |      4.0 |     0.0000 |        0.0000 |   2210 | no            |     0 | no       |              0 |                 — | —                |
| Benefits          | default                    | 430x932  | 2.461 |      4.0 |     0.0000 |        0.0000 |   2424 | no            |     0 | no       |              0 |                 — | —                |
| Compare years     | default                    | 430x932  | 1.480 |      4.0 |     0.0000 |        0.0000 |   2639 | no            |     0 | no       |              0 |                 — | —                |
| Account           | default                    | 430x932  | 1.000 |      3.0 |     0.0000 |        0.0000 |   2842 | no            |     0 | no       |              0 |                 — | —                |
| Fast Log          | new expense                | 430x932  | 0.708 |      4.0 |     0.0000 |        0.0000 |   3045 | no            |     0 | no       |              0 |                 — | —                |
| Fast Log          | edit expense               | 430x932  | 0.708 |      4.0 |     0.0000 |        0.0000 |   3260 | no            |     0 | no       |              0 |                 — | —                |

**Totals across all 60 rows: max CLS 0.0106 against a 0.02 bar; 0 headline
label/value differences between first paint and settled; 0 interactive targets
under 44px; 0 horizontal overflow; 0 console errors; 0 surfaces failing to
arrive.**

The three busts earlier waves fixed are all confirmed still fixed, at every
viewport: Budget future-month **0.4113 / 0.6632 / 0.3793 -> 0.0042 / 0.0038 /
0.0039**; Activity empty-search **0.0804 -> 0.0000**; the signed-out auth panel
L3d/e introduced and closed **0.0277 / 0.0361 / 0.0214 -> 0.0005 / 0.0007 /
0.0004**. Nothing regressed: no row moved in the wrong direction on CLS, and the
only VH movement in the whole matrix is Activity's +0.107 from C1b above.

### 5. D2 — REPRODUCED, through cache state only

Earlier waves recorded D2 as not reproducible: the harness found the Budget
headline identical at first paint and settled on all 60 rows, and concluded the
two strings were two different _period_ states rather than one state mutating.
That conclusion was correct **about the seeded fixture's happy path** and wrong
as a verdict on the defect. Following the code path the supervisor identified
during recon, D2 reproduces.

**The path.** `initialPeriod` (`cockpit-period-control.tsx:36-41`) returns
month 1 when `draft.year` is not today's year and the current month when it is.
`plan-workspace.tsx:78-89` seeds `periodSelection` from `initialPeriod(draft.year,
today)`. `daily-cockpit.tsx:240` branches the Budget `<h1>` — and
`HomeSurface` its answer label — on `selectedPeriodPhase(period, today)`. So the
period, and every number derived from it, changes the moment `draft.year`
changes. `financial-app.tsx:55-58` computes `activeDraft` from `plans`, `draft`
and `today`, and `use-account-lifecycle.ts:190-216` sets `draft` from
`restorableCachedPlans` — the IndexedDB copy — whenever the session request fails
for any reason other than 401, flagging it `requireAuthoritativePlanRefresh`;
`use-plan-sync.ts:158-161` later replaces it with the server's answer.

**The reproduction.** Signed in as the density fixture at 390x844, so the
IndexedDB `plans` store held both seeded years (2025 and 2026, distinct ids).
Then, through cache state and a simulated network condition only — no
application source, sync, offline or auth behaviour was changed:

1. deleted the **2026** row from the IndexedDB `plans` store, leaving 2025;
2. aborted `**/api/auth/session*` and `**/api/bootstrap*` at the browser's
   network layer, so the session request fails the way a real flaky network
   makes it fail;
3. reloaded, sampling the DOM every 20ms.

Observed:

```
t =   8ms   (nothing painted)
t =  29ms   loading placeholder, "House by 30"
t =  50ms   Home painted.  month picker = 1   (January)      <- provisional
t =  70ms   Home re-painted. month picker = 7  (July)        <- settled
t = 730ms   offline indicator appears
```

and in the same experiment, the recorded headline samples, neither of them taken
while the loading placeholder was mounted:

```
t = 43ms   "Home | Left to spend $474"     <- January 2025, from the stale cache
t = 68ms   "Home | Left to spend $123"     <- July 2026, from the server
```

A number rendered in a provisional state and then changed meaning: **$474 is
January 2025's figure and $123 is July 2026's**, under an unchanged label, 25ms
apart. On a real network that gap is however long the failed session request and
the subsequent plan load take, not 25ms.

**The verbatim label flip follows analytically and was not observed directly.**
It needs the cached year to be a _future_ year: `initialPeriod` would seed
January of it, `selectedPeriodPhase` would return `"future"`, and the Budget
`<h1>` would read `"$X planned spending"` before the authoritative current-year
draft made it `"$X safe to spend"` — D2's reported strings exactly. An attempt to
stage that by writing a fabricated 2027 plan row into the cache and removing the
seeded years did not get there: the app fell back to the signed-out screen
instead, so the fabricated row was not restorable. This is stated as reasoning
from `selectedPeriodPhase` and `initialMonth`, **not** as something measured.

**Latent verdict: LATENT for real users.** Nothing about the reproduction is
synthetic except the timing. A user whose device cache holds a plan year other
than the current one — which the fixture's own two-year seed produces, and which
any user who rolled over a year has — and whose `/api/auth/session` call fails
for any reason other than 401 will render one plan year's figures and then have
them replaced by another's. "Could not trigger it under the seeded happy path"
and "cannot happen" are different claims, and the earlier write-up conflated
them.

**What was fixed, and what was refused.**

- **The geometry half of D2 as reported — "everything below jumps" — is already
  fixed and is now measured at every viewport.** L3a set the Budget `h1` to 24px
  at <=720px specifically so both phase strings set on one line, and replaced the
  phase-varying toolbar with a `dl` carrying the same four cells in both phases.
  The evidence is that Budget and Budget-future-month measure the **same VH to
  three decimals** at all three viewports (1.367 / 1.565 / 1.238) with CLS
  0.0042 / 0.0038 / 0.0039. Adding C9-1's 96px reservation on top of that would
  add height to a block whose geometry is already invariant across the exact
  transition D2 names, so it was not added.
- **Suppressing the provisional number was refused as out of scope.** The only
  root fix is in the offline restore path: either stop painting a draft the app
  has already flagged `requireAuthoritativePlanRefresh`, or reserve the box until
  that refresh resolves. Both change what an offline device shows and for how
  long, and **never-cross rule 5 forbids changing offline behaviour**. Rule 5 is
  not reinterpretable by this loop, and it outranks a deliverable instruction the
  same way rule 2 outranked 0.18 VH when L3b refused the note-line merge. The
  exact call sites are named above so the decision can be taken by whoever owns
  that boundary.
- **The reproduction was not added as a gated harness state.** It would be a row
  that is red by construction and that this loop is forbidden to fix, which would
  leave every future run exiting non-zero for a reason unrelated to what it is
  measuring. The recipe above is reproducible by hand in under two minutes.

### What was refused

- **No bar was widened.** Home 1.0, standard 3.0, deep 4.0, entry 1.5, CLS 0.02,
  44px, no overflow, no console errors, no headline swap are byte-identical in
  `scripts/measure-density.mjs`. The one bar that changed for one surface became
  **narrower and better measured**: Activity's absolute cap became informational
  and a 0.6 VH chrome sub-bar plus a row-height report took over, per the
  mission's own BARS section and the supervisor's adjudication.
- **No general escape hatch was added.** `listExemption` is a property of an
  entry in the frozen surface catalogue, not a flag; a surface that claims it and
  matches no rows **fails**, which is proven red.
- **No touch target, input size or token was touched.** `pnpm ui:tokens:check`
  passes with 217 canonical tokens; the 80px rung uses the existing `--space-20`
  and `--leading-body`, and no raw px literal was authored.
- **No test was deleted, weakened, or changed.** All 498 tests in 61 files pass
  unmodified.

### Residual risk

- **The geometric CLS measurement is coarser than the native one.** It reads
  0.0000 on rows where the native API reads 0.0038-0.0106, because those shifts
  are smaller than what a 100ms sampler resolves. It is a safety net for a dead
  compositor, not a replacement: when both are live the native figure is the one
  that binds, and the gate takes the larger of the two.
- **The 0.6 VH chrome sub-bar is a ratio over a fixed cost.** 188.89px busts it
  only below a 315px-tall viewport. No such phone exists.
- **C1b's 80px rung is derived, not published.** Carbon publishes no three-line
  rung; the number comes from C3's 1.5 leading applied to the row's actual type
  sizes and rounded to C4's rhythm. A reviewer who disagrees with 1.5 leading in
  a list row is disagreeing with HIG-T2, and the derivation is written out so
  that disagreement has something to attach to.
- **D2 is reproduced and unfixed**, by refusal, with its call sites named. It is
  latent for any user with a multi-year cache and a failing session request.
- Everything the harness cannot see is unchanged and still listed in
  [`mobile-density-baseline.md`](./mobile-density-baseline.md#what-this-harness-cannot-see).

---

## L5 — D2 fixed at the root, and the navigation IA

Every number below was read out of a live production build.
AFTER is [`l5-full-after.json`](./l5-full-after.json) (63 rows: 21 surface
states x 3 viewports, gate mode, exit 0) and
[`l5-full-after.md`](./l5-full-after.md). The two BEFORE artefacts are
[`l5-d2-before.json`](./l5-d2-before.json) (the defect, reproduced on a build
with the fix removed) and [`l5-d2-cls-before.json`](./l5-d2-cls-before.json)
(the residual layout shift the fix's first half left behind, with the moved
elements named). The red proofs are `l5-faildemo-{answer,cls,headline,chrome,listrows,touch}.json`.

```
pnpm ui:density:measure -- --mode gate --viewports 390x844,360x740,430x932 --session final
# 63 measurement(s); 0 violating row(s); mode=gate   EXIT=0
```

---

### 1. The instrument was still dead, and this time it was fixable from inside the repo

L4 found the Layout Instability API emitting nothing because the browser was
producing no animation frames, concluded it "reproduced headless and headed, so
it was not fixable from inside the repo", and shipped `frameTicks` so a future
run could at least _detect_ the condition. The detector fired immediately on
this loop's first full run: **zero frames on 63 of 63 rows**, which under the
mission's rule makes that run invalid. It was thrown away.

The cause is narrower than "occlusion". Headless Chrome has no display sink, so
its **frame-rate limiter** never schedules a `BeginFrame` and the compositor
presents nothing; the Layout Instability API only emits on presented frames.
Measured directly, a `requestAnimationFrame` loop over two seconds:

| Launch flag                                | Frames in 2s |
| ------------------------------------------ | -----------: |
| (none — the default)                       |        **1** |
| `--disable-backgrounding-occluded-windows` |            1 |
| `--disable-renderer-backgrounding`         |            1 |
| `--disable-background-timer-throttling`    |            1 |
| **`--disable-frame-rate-limit`**           |      **115** |

The harness now passes `--disable-frame-rate-limit` at launch. It changes
nothing about layout or about the scores the API reports; it only makes the API
able to report. `frameTicks` stays on every row, because a flag that stops
working has to remain visible: **the minimum across all 63 rows of the accepted
run is 102 and the maximum is 6171, and `nativeLayoutShiftLive` is true on
63/63**. Every native CLS figure in the L4 table reproduces exactly, which is
the cross-check that the flag did not change what is being measured.

A second instrument change, for the same reason L4 gave: a red CLS row now
prints **which elements the browser saw move**, with their before/after rects.
That is what turned this loop's residual shift from a guess into a two-minute
diagnosis, twice.

---

### 2. D2 — fixed

**The defect, reproduced on a build with the fix removed** (`l5-d2-before.json`,
gate mode, 390x844):

```
FAIL  Home · cache restore awaiting the server
  - headline changed between first paint and settled:
      "Home | Left to spend $474" -> "Home | Left to spend $123"
  - the primary answer was painted 2 times with different values:
      ["Left to spend $474", "Left to spend $123"]
```

`$474` is January 2025's figure and `$123` is July 2026's, under the identical
label `Left to spend`. It reproduces L4's hand-run numbers exactly.

#### What the fix is

One new piece of session state, `planAwaitingAuthority`, and two elements that
render a reserved box instead of a number while it is set.

- **Set** in `use-account-lifecycle.ts`, on the line after the restore already
  flags `requireAuthoritativePlanRefresh` and calls `setUser` (which is what
  starts the authoritative refresh), and **only when `navigator.onLine`**.
- **Cleared** by the reducer alone, so no sync code decides it: the next
  `plans` action clears it (the authoritative answer arrived, or the user
  edited), and any `save` action other than `"saving"` clears it (the reconciler
  resolved — including by failing, in which case the cached plan _is_ the
  settled value). It cannot strand a surface in a skeleton: every exit from the
  reconciler passes through one of those two actions, and a device that cannot
  reach the server never enters the state at all.

Nothing was suppressed, delayed, or re-ordered in the restore. The same plans
are read from the same cache at the same moment; the outbox, the service worker,
the IndexedDB schema and the auth boundary are untouched; `use-plan-sync`'s sync
logic is not edited at all. The only added statement in that file is one guarded
call to a UI state setter.

#### The reservation, and why it is zero-shift by construction

**C9-2** allows exactly two states. The reserved state is the _same elements_,
with the _same classes, fonts, leading, margins and grid gaps_, each holding a
single non-breaking space:

| Element                    |      Settled |     Reserved | Why they are equal            |
| -------------------------- | -----------: | -----------: | ----------------------------- |
| Home label `<span>`        |         18px |         18px | one line box, 16px / `normal` |
| Home amount `<strong>`     |     53.188px |     53.188px | one line box, 56px / 0.95     |
| Home qualifier `<small>`   |         16px |         16px | one line box, 13.33px         |
| 2 x grid gap (`--space-1`) |          8px |          8px | same grid                     |
| **Home headline block**    | **95.188px** | **95.188px** | 390x844 and 430x932           |
| **Home headline block**    |     **80px** |     **80px** | 360x740 (40px amount)         |
| Budget `<h1>`              |     25.188px |     25.188px | one line box, 24px            |

No height is hard-coded anywhere. C9-1 names **96px** for this block as
18 + 44 + 18 + 2x8; the block this build actually ships is 95.188px at 390 and
430 and 80px at 360x740, because L3a set the amount at 56px/40px display type
rather than 44px and the gap at 4px. C9-1's requirement is "an explicit
`min-height` **equal to the settled line box**", and a literal 96px would be
_wrong here by 0.8px at two viewports and 16px at the third_ — which is a
layout shift, not a reservation. Matching the settled line box by construction
is what the rule asks for and what a fixed number cannot guarantee across three
viewports and two type scales.

C9-3 (the label may never change identity) is satisfied by putting the label
_inside_ the reservation. Home's label is `Left to spend` / `Over budget` /
`Planned spending` depending on the very numbers that are provisional, and
Budget's `<h1>` is one string carrying both the figure and the phrase that gives
it meaning. Neither can be painted early. Budget's `Budget` eyebrow is a fixed
section name and stays.

#### The two things the reservation alone did not fix, found by the shift report

Reserving the headline left **CLS 0.0633 / 0.0700 / 0.0585** against a 0.02 bar
(`l5-d2-cls-before.json`). The shift report named the culprit in one line:
`main` moving from y=137 to y=72 while growing 626 -> 691px — a 65px block
_above_ the scroll region disappearing. Two blocks, both the same C9-1 defect
(a box that exists in one state and not the other), both driven by the
provisional draft:

1. **The offline notice.** The restore sets `saveState` to `"offline"` before
   the reconciler has said anything, so a 65px banner reading _"Showing the
   latest copy saved on this device"_ asserted the device was offline while it
   was in fact fetching, then removed itself.
2. **The fallback tax-table notice.** The cached draft was **2025**, for which
   this build has no tax table, so _"Tax data isn't available for 2025"_
   rendered and then vanished when the authoritative **2026** plan landed.

Both are now gated on `!planAwaitingAuthority`, and so is the compact-offline
Home layout, which is a different box at <=740px tall. **This is the edge of
never-cross rule 5 and it is worth being explicit about where the line was
drawn.** `planAwaitingAuthority` is only ever set when `navigator.onLine` is
true, so:

- a genuinely offline device never reaches any of these branches;
- what an offline device holds, how long it holds it, its queued edits, its
  offline notice and its `Retry sync` control are byte-for-byte what they were;
- nothing is suppressed indefinitely — each of the three renders the instant the
  plan settles, which is the first moment its statement is true.

This is asserted in tests rather than claimed: one test drives the online
restore and requires the offline notice to be **absent**, another drives the
offline restore and requires it and its `Retry sync` button to be **present**.

#### After

| Viewport | Before CLS |  After CLS | Before answer paints                       | After answer paints  | Frames |
| -------- | ---------: | ---------: | ------------------------------------------ | -------------------- | -----: |
| 390x844  | **0.0633** | **0.0000** | `Left to spend $474`, `Left to spend $123` | `Left to spend $123` |    778 |
| 360x740  | **0.0700** | **0.0001** | (same)                                     | `Left to spend $123` |    823 |
| 430x932  | **0.0585** | **0.0000** | (same)                                     | `Left to spend $123` |    812 |

(After, to full precision: 4.07e-5 / 5.73e-5 / 3.03e-5 — the sync-status chip
changing from `Saving` to `Saved`, which is 0.2% of the bar.)

The recorded samples show the two legal states and nothing between them:

```
"House by 30"                 hero ""                    busy
"Home"                        hero ""                    busy   <- the reserved box
"Home | Left to spend $123"   hero "Left to spend $123"          <- settled
```

Budget and Budget-future-month are byte-identical to L4 at every viewport
(1.367 / 1.565 / 1.238 VH, CLS 0.0075 / 0.0106 / 0.0056 and 0.0042 / 0.0038 /
0.0039), so the reservation added no height to the block whose invariance L3a
established.

#### The gated harness state — deterministic, and it is deterministic

`home-provisional-restore` is a real row in the frozen surface catalogue, gated
in every run. It stages the defect from the browser only:

1. `sessionStorage.__density_block` is set to `/api/bootstrap`; the probe's
   existing `fetch` wrapper rejects any matching request with a `TypeError`,
   which is how a flaky network fails.
2. The **newest** cached plan year is deleted from the account's IndexedDB
   `plans` store, so the restore has a year the server will disagree with.
3. The document reloads and is measured cold.

It is deterministic because the density fixture always seeds exactly two plan
years (2025 and 2026) and the app always caches both, so step 2 always leaves
one stale year behind. Arrival asserts all four of: the surface is Home, the
sabotage actually fired (`blockedRequests > 0`), the cache really did lose a
year, and nothing is left reserved — so the row cannot pass by failing to stage
itself. Its `after` step clears the flag, and the authoritative refresh
re-caches the deleted year on the way back, so the device ends the row holding
exactly what it held before.

The one thing it does not cover: **Budget's reservation is not separately
gated**, because the provisional window closes in tens of milliseconds and no
deterministic tap can reach Budget inside it. It is covered by a test that
navigates to Budget while the flag is held and asserts the `<h1>` is reserved
and carries no figure.

#### A new gate, narrower than the one it sits beside

The generic headline check compares first paint with settled, so it cannot see a
figure that appears and is replaced _before_ the settled value. On a surface
that declares `singleAnswerPaint`, the harness now also requires the **primary
answer to be painted exactly once**, across every sample, busy or not. Proven
red on demand by `--fail-demo answer`, which repaints the answer with a second
value and puts it back — and which the generic check reports as green on the
same row, which is the point.

---

### 3. Navigation IA

#### The tab set is unchanged: `Home -> Budget -> Activity -> Plan`

A blind fresh-eyes reviewer placed **9 of 10** named tasks correctly against
these four labels plus the floating `+` and the profile avatar, which clears the

> = 9/10 bar. Nothing was renamed or reordered, because doing so would have
> invalidated that placement evidence for a 1/10 gain. Against **C13**, ordered
> left to right by expected open frequency for a two-person private budget app:

| Tab          | Opened                                         | Why it sits here                                                                                                                           |
| ------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Home**     | every session, first                           | It is the one question the app exists to answer — what is safe to spend today. Nothing is opened more often than the reason for opening.   |
| **Budget**   | several times a week                           | The follow-up to Home's answer: _which_ category is tight. Second because it is where the reader goes when the first number is not enough. |
| **Activity** | a few times a week, and after every correction | The ledger. Read less often than the rollup that summarises it, but it is the only place an individual expense can be found and fixed.     |
| **Plan**     | a few times a year                             | Salary, taxes, benefits, allocations. Deliberately last: it is set up once and revisited at raises, open enrolment, and the year rollover. |

C13's other clauses hold and were measured, not asserted. Walked across
**13 screens** at 390x844 — Home, Budget, Category detail, Edit budget, Manage
categories, Activity, Wrap from Activity, Wrap from Home, Plan, Plan details,
Benefits, Compare years, Account — the bar is byte-identical on every one of
them: the same four labels in the same order, **72px each**, none disabled,
none hidden, none badged, labels always visible, and **exactly one**
`aria-current="page"` at a time. Account is the sole screen with no highlighted
tab, which is correct: it is a toolbar control, not a destination. **Tabs are
destinations, never actions**: Fast Log stays a `position: fixed` floating
button (125x48, on screen at all times) and Account stays the top-right profile
control, because neither is a place.

#### The one miss, and what was added

The miss was _"See what you overspent on last month."_ — the reviewer tapped
**Activity**, and Monthly Wrap was reachable only from Home. A retrospective
question reads as a history question. **Monthly Wrap is now reachable from
Activity as well, and is still reachable from Home.** No path was removed, so
never-cross rule 1 is untouched; one was added.

Per **C12**, it is a **labeled 48px row carrying its own summary value** —
`Monthly wrap` with `July 2026` on the right — never a bare chevron. Measured
live at 390x844: **48.00px**, enabled, identical to Home's row.

Its cost, measured against the gate that actually binds Activity:

| Viewport | Chrome above the first row |     as VH | This row's share | Sub-bar | Margin |
| -------- | -------------------------: | --------: | ---------------: | ------: | -----: |
| 390x844  |     188.89 -> **252.89px** | **0.300** |   +64px = +0.076 | <= 0.60 |   2.0x |
| 360x740  |     188.89 -> **252.89px** | **0.342** |   +64px = +0.086 | <= 0.60 |   1.8x |
| 430x932  |     188.89 -> **252.89px** | **0.271** |   +64px = +0.069 | <= 0.60 |   2.2x |

64px is the 48px row plus one 16px group gap. Against the mission's <= 0.6 VH
allowance for this addition the actual spend is **0.076 VH**, and Activity's
total chrome remains under the 0.6 VH gate with a 1.8x margin at its tightest
viewport. Activity's informational absolute figure moves 5.210 -> 5.286,
5.942 -> 6.028 and 4.718 -> 4.786 VH. **It is the only row in the 63-row matrix
that moved at all**; the other 60 are identical to L4 on both VH and CLS.

Two smaller things came with it, both walked in a live browser:

- The wrap route now carries its origin, so its single back control **names the
  surface it returns to**. It previously read `Back to Budget` and navigated to
  **Home** — a control that lied about its own destination. It now reads
  `Back to Home` from Home and `Back to Activity` from Activity, and goes there.
  The page's `Budget` eyebrow is unchanged: that is the wrap's section identity,
  not its return path.
- The tab highlight follows the origin, so opening the wrap from Activity does
  not move the bar to a tab the reader did not tap. From Home it still
  highlights Budget, exactly as before.

Walked live at 390x844:

```
Home      -> tab Home      | Monthly wrap row, 48px, "July 2026"
Activity  -> tab Activity  | Monthly wrap row, 48px, "July 2026"
  tap it  -> "July 2026 wrap", eyebrow Budget, back "Back to Activity", tab Activity
  back    -> Activity
Home
  tap it  -> "July 2026 wrap", eyebrow Budget, back "Back to Home",     tab Budget
  back    -> Home
```

The reviewer's other two comments are recorded and **not** acted on, with
reasons: _"Plan told me the least"_ — Plan is the annual-inputs destination and
its own hub names Plan Details, Benefits and Compare on arrival; renaming it
would cost the placement evidence. _"Activity was ambiguous between history and
notifications"_ — the app has no notifications surface at all, so the ambiguity
resolves on first arrival and never recurs.

#### Every capability in `docs/surface-map.md`, in taps from Home

Home is the first authenticated screen and is tap 0. Every path below was walked,
not assumed; the ones marked (H) are held by the harness, which asserts arrival
on that surface in every run.

|   # | Capability (`surface-map.md`)                      | Path from Home                                                          | Taps |
| --: | -------------------------------------------------- | ----------------------------------------------------------------------- | ---: |
|   1 | Create an account                                  | signed out; `Create account` is the default panel                       |    1 |
|   1 | Sign in                                            | signed out; `Already have an account? Sign in` -> `Sign in`             |    2 |
|   1 | Validation / bootstrap states                      | rendered in place on the same panel                                     |    0 |
|   2 | Onboarding: year, wages, state, filing status      | shown automatically when the account has no plan                        |    0 |
|   3 | Selected period (Month / YTD / Year + stepper)     | Home header, one 44px row, five controls                                |    1 |
|   3 | Left to spend / Over budget (the answer)           | Home, above the fold                                                    |    0 |
|   3 | Budgeted, spent, remaining (to the cent)           | Home, the `exact:` line under the answer                                |    0 |
|   3 | Savings impact                                     | Home, the runway metric row                                             |    0 |
|   3 | Attention (over-budget categories)                 | Home, `Needs attention`, top 3 above the fold                           |    0 |
|   3 | Recent correction                                  | Home, `Recent activity`, 2 rows                                         |    0 |
|   3 | Monthly Wrap                                       | Home -> `Monthly wrap` row **or** Activity -> `Monthly wrap` row        |  1–2 |
|   3 | Plan                                               | `Plan` tab                                                              |    1 |
|   4 | Fast Log a new expense                             | floating `+`, `position: fixed`, on screen at all times                 |    1 |
|   4 | Amount, category, title, note, date                | inside that sheet                                                       |    1 |
|   4 | Inline category creation                           | Fast Log -> `Create category`                                           |    2 |
|   4 | Save / Save and add another                        | inside that sheet                                                       |    1 |
|   4 | Edit an existing expense                           | Home recent row **or** `Activity` -> the row                            |  1–2 |
|   4 | Delete an expense                                  | that same sheet -> `Delete`                                             |  2–3 |
|   5 | Selected-period total                              | `Budget`                                                                |    1 |
|   5 | Attention / near-limit categories                  | `Budget`; over-budget rows escape in warning colour reading `$81 over`  |    1 |
|   5 | All allocated / actual / remaining rows            | `Budget`                                                                |    1 |
|   5 | Category Detail                                    | `Budget` -> the row (**or** Home `Needs attention` row, 1 tap)          |  1–2 |
|   5 | Edit Budget                                        | `Budget` -> `Edit budget`                                               |    2 |
|   5 | Manage Categories                                  | `Budget` -> `Manage categories`                                         |    2 |
|   5 | Create / rename / archive / reorder / recolour     | `Budget` -> `Manage categories` -> the control                          |    3 |
|   6 | Activity list                                      | `Activity`                                                              |    1 |
|   6 | Search expenses                                    | `Activity` -> the search field                                          |    2 |
|   6 | Filter by category                                 | `Activity` -> the category select                                       |    2 |
|   6 | Local-date grouping                                | `Activity`; the day rides on every row as `Groceries · Fri, Jul 24`     |    1 |
|   6 | Correction path (future-dated expenses)            | `Activity` -> the `Needs correction` row                                |    2 |
|   6 | Beyond the first 100 rows                          | `Activity` -> `Load 100 more · N remaining`                             |    2 |
|   7 | Monthly Wrap: budget vs actual, under/over, impact | Home **or** Activity -> `Monthly wrap`                                  |  1–2 |
|   7 | Component-by-component explanation                 | on that page                                                            |  1–2 |
|   8 | Annual and monthly outcomes                        | `Plan`                                                                  |    1 |
|   8 | Optional starting savings                          | `Plan` -> the field                                                     |    2 |
|   8 | Projected change / ending result                   | `Plan`                                                                  |    1 |
|   8 | Accessible allocation chart                        | `Plan`                                                                  |    1 |
|   8 | Annual money-flow rail                             | `Plan`                                                                  |    1 |
|   8 | Budget editing from Plan                           | `Plan` -> `Edit budget`                                                 |    2 |
|   9 | Plan Details                                       | `Plan` -> `Plan details`                                                |    2 |
|   9 | Benefits (add, edit, rename, delete, ESPP, HSA)    | `Plan` -> `Benefits` -> the control                                     |    3 |
|   9 | Compare years                                      | `Plan` -> `Compare years`                                               |    2 |
|   9 | Start next year's plan                             | `Plan` -> `Start 2027` (top bar, Plan screens only)                     |    2 |
|  10 | Account, privacy and sync context                  | profile avatar (top right, every screen)                                |    1 |
|  10 | Export all years / this device                     | avatar -> the two export buttons                                        |    2 |
|  10 | Add to Home Screen instructions                    | avatar -> the three numbered steps                                      |    1 |
|  10 | Log out                                            | avatar -> `Log out`                                                     |    2 |
|  10 | Delete the account permanently                     | avatar -> `Delete account`                                              |    2 |
|  10 | Switch plan year                                   | year select, top bar, every screen                                      |    1 |
|  11 | Loading, offline, pending, sync failure, retry     | rendered in place, above the content region, on whatever screen is open |    0 |
|  11 | Update ready / export and deletion errors          | rendered in place                                                       |    0 |
|  12 | Over budget, zero allocations, saving categories   | rendered in place on Home, Budget and Category Detail                   |    0 |
|  12 | Infeasible payroll, tax limits, table fallback     | rendered in place on Benefits, Plan and the content region              |  0–3 |

**Maximum: 3 taps. Nothing in the surface map exceeds it, and nothing became
unreachable.** The only path that changed length changed downward: Monthly Wrap
is now 1 tap from two different tabs instead of one.

#### In-tab section order

The mission's required order is **the answer, then the primary action, then
exceptions, then context, then configuration.**

| Surface          | Order as built                                                                                                                                                 | Against the required order                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Home**         | header (`Home` + period control) -> runway card (label, figure, `exact:` line, savings impact) -> `Needs attention` -> `Recent activity` -> `Monthly wrap` row | Answer, exceptions, context, context. The **primary action is the floating Fast Log button**, which is `position: fixed` and therefore above everything at all times without spending a row — the strongest possible reading of "then the primary action". **Configuration is deliberately first, not last:** the period control scopes every number below it, and a reader who changes it after reading has read figures computed for a different period. |
| **Budget**       | header (`$123 safe to spend` + period control) -> four-cell math `dl` -> one note line -> `Edit budget` / `Manage categories` -> all categories                | Answer, answer's audit trail, primary actions, context. **Exceptions are inside the context block, not above it**, by L3a's deliberate choice: a separate `Needs attention` block rendered every over-budget row a second time and appeared and disappeared with the period. Over-budget rows escape in warning colour reading `$81 over` in the one list, so rule 2 holds without the duplicate.                                                          |
| **Activity**     | header (`$5,255.44 · 61 expenses` + period control) -> **`Monthly wrap` row** -> `Needs correction` -> search + category filter -> the list                    | Answer, answer, exceptions, configuration, context. Two deviations, both stated: the wrap row is **part of the answer region** — it is the same period's answer in retrospective form, which is exactly why the reviewer looked for it here — and **configuration precedes context** because a filter placed after a 61-row list cannot be reached by the reader who needs it.                                                                             |
| **Plan**         | header + outcome figures -> starting savings -> allocation chart -> money-flow rail -> `Plan details` / `Benefits` / `Compare years` / `Edit budget`           | Answer, configuration, context, then the four sub-page rows. Starting savings sits second because the projected ending result directly above it is the number it changes.                                                                                                                                                                                                                                                                                  |
| **Monthly Wrap** | back control + `July 2026 wrap` -> budget vs actual -> under budget / over budget -> savings impact -> how the impact is built                                 | Answer, exceptions, context. It has no primary action: it is a read-only retrospective.                                                                                                                                                                                                                                                                                                                                                                    |
| **Account**      | header -> exports -> install steps -> `Log out` -> `Delete account`                                                                                            | Configuration surface throughout, ordered by reversibility: the destructive action is last and the routine one first.                                                                                                                                                                                                                                                                                                                                      |

---

### FAIL-DEMO

Each check was proven red on this build, by browser-side injection only — no
application source touched — except the first row, which was proven red by
building the application **with the fix removed**, because no injection can
recreate a stale plan year.

| Check                      | How it was proven red                                | Result                                                             | Evidence                    |
| -------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ | --------------------------- |
| **D2 itself**              | build with `markPlanAwaitingAuthority` disabled      | `Left to spend $474` -> `$123`; headline swap + 2 answer paints ✗  | `l5-d2-before.json`         |
| **single answer paint**    | `--fail-demo answer` (repaint the answer, then undo) | 2 answer paints ✗ **while the generic headline check reads green** | `l5-faildemo-answer.json`   |
| CLS                        | `--fail-demo cls` (220px block at +900ms)            | 0.2203 ✗ on Home and Activity                                      | `l5-faildemo-cls.json`      |
| headline swap              | `--fail-demo headline`                               | swapped ✗ on Home and Activity                                     | `l5-faildemo-headline.json` |
| Activity chrome sub-bar    | `--fail-demo chrome` (400px block above the list)    | ✗ on Activity, row region still exempt                             | `l5-faildemo-chrome.json`   |
| long-list exemption earned | `--fail-demo listrows` (strip `data-density-row`)    | _exemption claimed but not earned_ ✗                               | `l5-faildemo-listrows.json` |
| touch target               | `--fail-demo touch` (20x20 button)                   | 1 and 2 targets under 44px ✗                                       | `l5-faildemo-touch.json`    |

The residual CLS shift was also proven red by the real build before the second
half of the fix landed: **0.0633 / 0.0700** with the moved elements named
(`l5-d2-cls-before.json`).

---

### Full matrix — 21 surface states x 3 viewports

`CLS native` is the browser's Layout Instability API; `CLS geometric` is the
compositor-independent sampler; the gate takes the larger. `Frames` is the
liveness evidence for the native column.

| Surface state                            | Viewport |    VH |      Bar | CLS native | CLS geometric | Frames | Headline swap | <44px | Overflow | Console errors | Chrome above list |
| ---------------------------------------- | -------- | ----: | -------: | ---------: | ------------: | -----: | ------------- | ----: | -------- | -------------: | ----------------: |
| Signed out · create account (cold load)  | 390x844  | 1.000 |      1.5 |     0.0000 |        0.0000 |    133 | no            |     0 | no       |              0 |                 — |
| Signed out · sign in                     | 390x844  | 1.000 |      1.5 |     0.0005 |        0.0000 |    228 | no            |     0 | no       |              0 |                 — |
| Onboarding · cold load                   | 390x844  | 1.000 |      1.5 |     0.0000 |        0.0000 |    473 | no            |     0 | no       |              0 |                 — |
| Home                                     | 390x844  | 1.000 |      1.0 |     0.0005 |        0.0000 |   6171 | no            |     0 | no       |              0 |                 — |
| Home · cold load                         | 390x844  | 1.000 |      1.0 |     0.0000 |        0.0000 |    853 | no            |     0 | no       |              0 |                 — |
| Budget                                   | 390x844  | 1.367 |      3.0 |     0.0075 |        0.0000 |   1042 | no            |     0 | no       |              0 |                 — |
| Budget · future month                    | 390x844  | 1.367 |      3.0 |     0.0042 |        0.0000 |   1244 | no            |     0 | no       |              0 |                 — |
| Activity                                 | 390x844  | 5.286 | 3.0 info |     0.0075 |        0.0000 |   1435 | no            |     0 | no       |              0 |  252.89px = 0.300 |
| Activity · empty search                  | 390x844  | 1.000 |      3.0 |     0.0000 |        0.0000 |   1638 | no            |     0 | no       |              0 |                 — |
| Category detail · Dining out             | 390x844  | 1.424 |      4.0 |     0.0000 |        0.0000 |   1841 | no            |     0 | no       |              0 |                 — |
| Edit budget                              | 390x844  | 1.608 |      4.0 |     0.0000 |        0.0000 |   2043 | no            |     0 | no       |              0 |                 — |
| Manage categories                        | 390x844  | 2.364 |      4.0 |     0.0000 |        0.0000 |   2245 | no            |     0 | no       |              0 |                 — |
| Monthly wrap                             | 390x844  | 2.098 |      3.0 |     0.0000 |        0.0000 |   2446 | no            |     0 | no       |              0 |                 — |
| Plan                                     | 390x844  | 2.359 |      3.0 |     0.0005 |        0.0000 |   2636 | no            |     0 | no       |              0 |                 — |
| Plan details                             | 390x844  | 2.845 |      4.0 |     0.0000 |        0.0000 |   2838 | no            |     0 | no       |              0 |                 — |
| Benefits                                 | 390x844  | 2.757 |      4.0 |     0.0000 |        0.0000 |   3038 | no            |     0 | no       |              0 |                 — |
| Compare years                            | 390x844  | 1.634 |      4.0 |     0.0000 |        0.0000 |   3240 | no            |     0 | no       |              0 |                 — |
| Account                                  | 390x844  | 1.000 |      3.0 |     0.0000 |        0.0000 |   3431 | no            |     0 | no       |              0 |                 — |
| Fast Log · new expense                   | 390x844  | 0.848 |      4.0 |     0.0000 |        0.0000 |   3624 | no            |     0 | no       |              0 |                 — |
| Fast Log · edit expense                  | 390x844  | 0.782 |      4.0 |     0.0000 |        0.0000 |   3830 | no            |     0 | no       |              0 |                 — |
| Home · cache restore awaiting the server | 390x844  | 1.000 |      1.0 |     0.0000 |        0.0000 |    778 | no            |     0 | no       |              0 |                 — |
| Signed out · create account (cold load)  | 360x740  | 1.000 |      1.5 |     0.0000 |        0.0000 |    102 | no            |     0 | no       |              0 |                 — |
| Signed out · sign in                     | 360x740  | 1.000 |      1.5 |     0.0007 |        0.0000 |    198 | no            |     0 | no       |              0 |                 — |
| Onboarding · cold load                   | 360x740  | 1.000 |      1.5 |     0.0000 |        0.0000 |    286 | no            |     0 | no       |              0 |                 — |
| Home                                     | 360x740  | 1.000 |      1.0 |     0.0007 |        0.0000 |   5276 | no            |     0 | no       |              0 |                 — |
| Home · cold load                         | 360x740  | 1.000 |      1.0 |     0.0001 |        0.0000 |    764 | no            |     0 | no       |              0 |                 — |
| Budget                                   | 360x740  | 1.565 |      3.0 |     0.0106 |        0.0000 |    954 | no            |     0 | no       |              0 |                 — |
| Budget · future month                    | 360x740  | 1.565 |      3.0 |     0.0038 |        0.0000 |   1156 | no            |     0 | no       |              0 |                 — |
| Activity                                 | 360x740  | 6.028 | 3.0 info |     0.0106 |        0.0000 |   1349 | no            |     0 | no       |              0 |  252.89px = 0.342 |
| Activity · empty search                  | 360x740  | 1.000 |      3.0 |     0.0000 |        0.0000 |   1551 | no            |     0 | no       |              0 |                 — |
| Category detail · Dining out             | 360x740  | 1.614 |      4.0 |     0.0000 |        0.0000 |   1754 | no            |     0 | no       |              0 |                 — |
| Edit budget                              | 360x740  | 1.847 |      4.0 |     0.0000 |        0.0000 |   1954 | no            |     0 | no       |              0 |                 — |
| Manage categories                        | 360x740  | 2.645 |      4.0 |     0.0000 |        0.0000 |   2155 | no            |     0 | no       |              0 |                 — |
| Monthly wrap                             | 360x740  | 2.750 |      3.0 |     0.0000 |        0.0000 |   2357 | no            |     0 | no       |              0 |                 — |
| Plan                                     | 360x740  | 2.399 |      3.0 |     0.0007 |        0.0000 |   2547 | no            |     0 | no       |              0 |                 — |
| Plan details                             | 360x740  | 3.265 |      4.0 |     0.0000 |        0.0000 |   2749 | no            |     0 | no       |              0 |                 — |
| Benefits                                 | 360x740  | 3.166 |      4.0 |     0.0000 |        0.0000 |   2951 | no            |     0 | no       |              0 |                 — |
| Compare years                            | 360x740  | 1.888 |      4.0 |     0.0000 |        0.0000 |   3153 | no            |     0 | no       |              0 |                 — |
| Account                                  | 360x740  | 1.208 |      3.0 |     0.0000 |        0.0000 |   3343 | no            |     0 | no       |              0 |                 — |
| Fast Log · new expense                   | 360x740  | 0.968 |      4.0 |     0.0000 |        0.0000 |   3536 | no            |     0 | no       |              0 |                 — |
| Fast Log · edit expense                  | 360x740  | 0.892 |      4.0 |     0.0000 |        0.0000 |   3741 | no            |     0 | no       |              0 |                 — |
| Home · cache restore awaiting the server | 360x740  | 1.000 |      1.0 |     0.0001 |        0.0000 |    823 | no            |     0 | no       |              0 |                 — |
| Signed out · create account (cold load)  | 430x932  | 1.000 |      1.5 |     0.0000 |        0.0000 |    102 | no            |     0 | no       |              0 |                 — |
| Signed out · sign in                     | 430x932  | 1.000 |      1.5 |     0.0004 |        0.0000 |    198 | no            |     0 | no       |              0 |                 — |
| Onboarding · cold load                   | 430x932  | 1.000 |      1.5 |     0.0000 |        0.0000 |    311 | no            |     0 | no       |              0 |                 — |
| Home                                     | 430x932  | 1.000 |      1.0 |     0.0005 |        0.0000 |   5727 | no            |     0 | no       |              0 |                 — |
| Home · cold load                         | 430x932  | 1.000 |      1.0 |     0.0000 |        0.0000 |   1580 | no            |     0 | no       |              0 |                 — |
| Budget                                   | 430x932  | 1.238 |      3.0 |     0.0056 |        0.0000 |   1769 | no            |     0 | no       |              0 |                 — |
| Budget · future month                    | 430x932  | 1.238 |      3.0 |     0.0039 |        0.0000 |   1971 | no            |     0 | no       |              0 |                 — |
| Activity                                 | 430x932  | 4.786 | 3.0 info |     0.0056 |        0.0000 |   2161 | no            |     0 | no       |              0 |  252.89px = 0.271 |
| Activity · empty search                  | 430x932  | 1.000 |      3.0 |     0.0000 |        0.0000 |   2363 | no            |     0 | no       |              0 |                 — |
| Category detail · Dining out             | 430x932  | 1.290 |      4.0 |     0.0000 |        0.0000 |   2567 | no            |     0 | no       |              0 |                 — |
| Edit budget                              | 430x932  | 1.411 |      4.0 |     0.0000 |        0.0000 |   2767 | no            |     0 | no       |              0 |                 — |
| Manage categories                        | 430x932  | 2.105 |      4.0 |     0.0000 |        0.0000 |   2969 | no            |     0 | no       |              0 |                 — |
| Monthly wrap                             | 430x932  | 1.823 |      3.0 |     0.0000 |        0.0000 |   3171 | no            |     0 | no       |              0 |                 — |
| Plan                                     | 430x932  | 2.100 |      3.0 |     0.0005 |        0.0000 |   3360 | no            |     0 | no       |              0 |                 — |
| Plan details                             | 430x932  | 2.488 |      4.0 |     0.0000 |        0.0000 |   3560 | no            |     0 | no       |              0 |                 — |
| Benefits                                 | 430x932  | 2.461 |      4.0 |     0.0000 |        0.0000 |   3761 | no            |     0 | no       |              0 |                 — |
| Compare years                            | 430x932  | 1.480 |      4.0 |     0.0000 |        0.0000 |   3964 | no            |     0 | no       |              0 |                 — |
| Account                                  | 430x932  | 1.000 |      3.0 |     0.0000 |        0.0000 |   4154 | no            |     0 | no       |              0 |                 — |
| Fast Log · new expense                   | 430x932  | 0.708 |      4.0 |     0.0000 |        0.0000 |   4348 | no            |     0 | no       |              0 |                 — |
| Fast Log · edit expense                  | 430x932  | 0.708 |      4.0 |     0.0000 |        0.0000 |   4552 | no            |     0 | no       |              0 |                 — |
| Home · cache restore awaiting the server | 430x932  | 1.000 |      1.0 |     0.0000 |        0.0000 |    812 | no            |     0 | no       |              0 |                 — |

**Totals across all 63 rows: max CLS 0.0106 against a 0.02 bar; minimum
`frameTicks` 102, so the native instrument was live on 63/63 rows and no figure
above is an artefact of a dead compositor; 0 headline swaps; 0 interactive
targets under 44px; 0 horizontal overflow; 0 console errors; 0 surfaces failing
to arrive; 0 violating rows; exit 0.**

---

### Tests

Two tests were added and one existing assertion was updated. No test was
deleted or weakened. **500 tests in 61 files pass** (498 before this loop).

| Test                                                                                                                                       | Change      | Why                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core-flow.integration.test.tsx` — _"reserves the headline while a cache restore waits for the server, and never paints the stale figure"_ | **added**   | Drives the real lifecycle through an online cache restore where the cached plan says `$750` and the server says `$1,750`. Asserts the reserved box is painted, `$750` and `Left to spend` never appear, the offline notice never appears, Budget's `<h1>` is reserved too, and the swap to the settled value happens in one step. Proven able to fail: with the one-line fix removed it fails on the first assertion. |
| `core-flow.integration.test.tsx` — _"keeps a genuinely offline cached plan rendering its own value"_                                       | **added**   | The rule-5 boundary, asserted rather than claimed: a device that cannot reach the server renders `Left to spend $750` normally, with no reservation, no `aria-busy`, and its offline notice and `Retry sync` control intact.                                                                                                                                                                                          |
| `core-flow.integration.test.tsx` — the Monthly Wrap walk                                                                                   | **updated** | It clicked `Back to Budget` on a control that navigated to **Home**. That assertion encoded a control lying about its destination; it now clicks `Back to Home` and asserts it lands on Home. This is behaviour this loop intentionally changed.                                                                                                                                                                      |

---

### What was refused

- **No bar was widened.** `VERTICAL_BARS`, `BAR_CLS` (0.02), `MINIMUM_TARGET_PX`
  (44) and `BAR_CHROME_ABOVE_LIST` (0.6) are byte-identical. The only gate
  changes are **additions**: the single-answer-paint check, and a 21st surface
  state that is red on the unfixed build.
- **`pnpm ui:tokens:check` was not touched and not loosened.** 217 canonical
  tokens, no raw px literal was authored; the reserved box uses `--radius-sm`,
  `--color-transparent`, `--alpha-white-13` and `--surface-accent`, and its only
  lengths are percentages for the bar widths, which are not lengths under the
  audit's own unit table.
- **`use-plan-sync.ts` was not edited at all**, nor was the outbox, the service
  worker, the IndexedDB schema, or anything under `src/server`. The restore in
  `use-account-lifecycle.ts` gained exactly one guarded call to a UI state
  setter, placed after every existing statement.
- **The tabs were not renamed or reordered**, and Monthly Wrap was not moved out
  of Budget's grouping. The reviewer's 9/10 placement evidence is only worth
  something if the thing it measured is the thing that ships.
- **`Plan` was not renamed** and `Activity` was not renamed, for the same reason.
- **The reservation was not extended past the headline.** Every number on a
  provisional draft is provisional, but the category rows, the recent-activity
  rows and the metric row carry their own labels and are not the surface's
  answer. Reserving them would have to guess a row count, which cannot be a
  zero-shift reservation. Recorded as a residual instead.

---

### Residual risk

- **The reservation covers the headline, not the whole surface.** During the
  provisional window Home's `Needs attention` and `Recent activity` rows still
  show the cached year's rows. They are labeled, they are not the answer, and
  they no longer move anything above them — the measured CLS at the transition
  is 0.0000 / 0.0001 / 0.0000 — but a reader who looks past the reserved box
  during those tens of milliseconds is looking at a year the app is replacing.
- **Budget's reservation is proven by test, not by the harness**, because the
  provisional window closes faster than a deterministic tap can reach Budget.
- **The `answer` fail-demo only binds where `singleAnswerPaint` is declared**,
  which is the one state that stages the defect. Extending it to every surface
  would be the stronger gate; it was not done this loop because several surfaces
  legitimately have no hero and the check has not been exercised against them.
- **`--disable-frame-rate-limit` is now load-bearing for the CLS instrument.**
  If a future Chromium ignores it, `frameTicks` will say so on every row, but
  the run will need a new flag rather than a new interpretation.
- **The fixture is still one data shape**, and the D2 row's determinism rests on
  it seeding exactly two plan years. If the fixture ever seeds one, the row
  fails loudly on arrival rather than passing silently — that is why the arrival
  assertion checks the remaining year count.
- Everything the harness cannot see is unchanged and still listed in
  [`mobile-density-baseline.md`](./mobile-density-baseline.md#what-this-harness-cannot-see).

---

## L8 — the four open defects, and the density floor

Every number below was read out of a live production build.
BEFORE is [`l8-before.json`](./l8-before.json) (63 rows, capture mode, measured
on `a4ed534` with the three new instruments added but nothing else changed);
AFTER is [`l8-after.json`](./l8-after.json) / [`l8-after.md`](./l8-after.md)
(63 rows, gate mode, exit 0). The red proofs are
`l8-faildemo-{tiny,clip,vh,deadband}.json`.

```
pnpm ui:density:measure -- --mode gate --viewports 390x844,360x740,430x932 --session l8-final2
# 63 measurement(s); 0 violating row(s); mode=gate   EXIT=0
```

| Signal                               | AFTER                                                         |
| ------------------------------------ | ------------------------------------------------------------- |
| rows                                 | 63                                                            |
| max CLS                              | **0.0106** (bar 0.02)                                         |
| headline swaps                       | 0                                                             |
| targets < 44px                       | 0                                                             |
| computed font-size < 11px            | 0 (smallest measured: **11.00px**)                            |
| boxes clipping text with no ellipsis | 0                                                             |
| horizontal overflow                  | 0                                                             |
| console errors                       | 0                                                             |
| min `frameTicks`                     | **115** (max 5668); `nativeLayoutShiftLive` true on **63/63** |

---

### 1. Three instruments added, because three of the four defects were invisible to the harness that shipped them

The harness measured six signals and every one of them read green on all four
defects. That is not the harness being unlucky; each defect lives in a dimension
it had no column for.

**`tinyType` — smallest computed font-size on the surface.** D3's two runs
(9.17px on Plan details, 10.83px in Fast Log) appear nowhere in the source as a
number, so nothing short of a computed-style sweep can find them. It is a gate
at 11px (HIG-T3), and it also found a third instance the defect report did not
name: `At least 10 characters.` at 10.83px on both signed-out surfaces.

**`clippedText` — boxes narrower than their own single-line content, without an
ellipsis.** Reproduced D1 to the tenth of a pixel on first run: `Health and
pharmacy` +22px, `Phone and internet` +3px, `Brokerage transfer` +2px, against
the report's +21.7 / +3.5 / +2.1. Visually-hidden labels are excluded by size —
an `srOnly` span is a 1x1 clipped box by construction and always "overflows".

**`innerScroll` — the real content extent of the scrolling region.** This is the
one that matters most. The app shell pins `<html>` to `100dvh` and scrolls its
content inside `<main>`, so `verticalCost` reads **exactly 1.000** on Home at all
three viewports whether Home fits, overflows by 86px, or leaves 91px of dead
band. `scrollHeight` cannot see it either, because `scrollHeight` is floored at
`clientHeight`: a region holding 626px of content in 723px of space reports 723
and is indistinguishable from a perfect fit. The content extent has to be
computed from the laid-out children, and once it is, D4 is two numbers:

| Viewport | region | content | verdict                                               |
| -------- | -----: | ------: | ----------------------------------------------------- |
| 390x844  |  635px | 632.1px | fits (2.9px slack) — the one viewport it was tuned to |
| 360x740  |  531px | 616.9px | **86px below the fold**                               |
| 430x932  |  723px | 632.1px | **91px of dead band**                                 |

A surface may now declare `fitsWithoutScrolling`, which Home's three rows do.
It gates on zero overflow and on **<= 64px** of slack — a compact two-line
transaction row is 48px and its group gap 16px, so 64px is the largest band that
cannot be blamed on a row that would have fitted in it.

All four new gates are proven red on demand and go green again:
`--fail-demo tiny` (one 9px paragraph), `--fail-demo clip` (a 40px box holding a
160px string), `--fail-demo vh` (overflow), and `--fail-demo deadband` (hides a
real group; **fails on slack alone while VH still reads 1.000 and every other
column stays green**, which is exactly the blind spot it was written for).

The two new static gates are also in `pnpm verify` as
[`src/app/type-legibility.test.ts`](../../src/app/type-legibility.test.ts) (510
tests, up from 506), each proven red by removing the rule it pins.

---

### 2. D1 — the ledger cut category names through their own glyphs

`flex: 1` against the fixed money field was **already there**, and was not the
fix: at 390px the name field still resolves to a ~142px content box and `Health
and pharmacy` needs 163.7px. An input clips at its content box however the box
was sized, so the missing floor was the ellipsis, and per-field ellipsis is the
shape of fix that produced this defect in the first place — the same class was
fixed on Benefits and missed here.

It is fixed once, globally, in `globals.css`: every non-toggle `input` and
`select` sets `text-overflow: ellipsis`. Blink applies `text-overflow` to an
input only while it is **not** focused, which is the wanted behaviour exactly —
an unfocused field says it is truncating, a field being typed into still scrolls
its caret into view.

The app-wide sweep is the `clippedText` column: **8 boxes across the catalogue
before, 0 after**, at all three viewports.

### 3. D2 — the month picker's arrow overlapped its own label

`appearance: auto` lets the platform draw the arrow _inside_ the content box
after layout has already given that box to the label, so the arrow's space is
never reserved and a fit at 390 and 430 is a coincidence rather than a
guarantee. The control now draws its own chevron and reserves it as padding, so
the label cannot be laid out into it at any width. The year came off the twelve
option labels as well: all twelve carried the same year, this control only ever
steps within `period.year`, and the year is on screen on every surface in the
top bar's own picker.

| Viewport |     box | content box | widest of all 12 options |       slack |    arrow band | height |
| -------- | ------: | ----------: | -----------------------: | ----------: | ------------: | -----: |
| 360x740  |  86.4px |      54.4px |                   32.3px | **+22.0px** | 16px reserved |   44px |
| 390x844  | 116.4px |      84.4px |                   32.3px |     +52.0px | 16px reserved |   44px |
| 430x932  | 156.4px |     124.4px |                   32.3px |     +92.0px | 16px reserved |   44px |

Before, at 360x740: an 86.4px box, a 78px content box, a 68.5px label and ~9.5px
left for an arrow wanting ~15 — it rendered `Jul 202⌄6`. The box is the same
86.4px; what changed is that the arrow is no longer competing for it.

### 4. D3 — illegible type, fixed at the cause

Both runs were the user agent's relative `smaller` keyword on `<small>`
**compounding** inside a block that was already reduced: 13px x 0.8333 = 10.83,
11px x 0.8333 = 9.17. No stylesheet names either number, which is why a grep
finds nothing and a reader of either rule sees only "small". One rule replaces
the keyword with the same ratio, floored:

```css
small {
  font-size: max(var(--text-scale-smaller), var(--text-xs));
}
```

The ratio is the UA's own, so a `small` in body text still sets at 13.33px and
**every reserved line box measured against that (the Home headline's qualifier,
C9) is unchanged to the sub-pixel** — which the CLS column confirms: Home stays
at 0.0000 / 0.0001 / 0.0000. `sub` and `sup` get the same treatment for the same
reason. Measured across all 63 rows: **smallest computed font-size 11.00px**,
zero elements under the floor, against three before (Plan details 9.17, Fast Log
10.83, signed-out 10.83).

### 5. D4 — Home is adaptive, not tuned to one viewport

The three viewports differ by 192px of scroll region while the rest of Home is
fixed by what it has to say. Something has to absorb 192px; nothing did.

The recent-activity list is the one block on Home whose length is a judgement
call rather than a fact — it is a preview of a ledger one labelled tap away on
Activity, and it was already an arbitrary two of sixty-one. So it is the single
lever, chosen per viewport in a media query (not a measurement, so no second
paint and no layout shift): three rows are rendered and the stylesheet reveals as
many as fit.

| Viewport | recent rows | region | content | overflow |  slack |    VH |
| -------- | ----------: | -----: | ------: | -------: | -----: | ----: |
| 390x844  |           2 |  635px | 632.1px |    **0** |  2.9px | 1.000 |
| 360x740  |           0 |  531px | 474.9px |    **0** | 56.1px | 1.000 |
| 430x932  |           3 |  723px | 686.1px |    **0** | 36.9px | 1.000 |

No row is clipped at 360x740, because nothing is below the fold at all. The
answer, its exact one-line qualifier (C7 — measured present at 360 as one 16px
line at 13.33px), all three attention rows and the wrap row are the whole
surface there and come to 474.9px of 531px. At 430x932 the band that was 91px is
37px, which is under one row and so cannot be filled by another.

---

### 6. The density axis

Method, matching the judge's: **leaf text nodes lying fully inside the first
viewport, per 100px of the scroll region's own visible height**, region at
scrollTop 0. Absolute values differ from the judge's (a full-height surface is
measured against the whole 844px viewport here, a scrolling one against its
635px region), so the comparison that matters is before-against-after on the
same instrument. Reported on every row as `datumPer100px`; **not** gated —
density is a judgement the harness informs, not one it should enforce.

| Surface                       | 390x844                 | 360x740          | 430x932          | VH at 390          |
| ----------------------------- | ----------------------- | ---------------- | ---------------- | ------------------ |
| **plan**                      | 2.03 -> **3.91** (+93%) | 2.04 -> **3.75** | 1.80 -> **3.47** | 2.076 -> **1.784** |
| **manage-categories**         | 2.03 -> **3.47** (+71%) | 1.87 -> **3.41** | 2.05 -> **3.59** | 2.245 -> **1.129** |
| **category-detail**           | 5.93 -> **7.96** (+34%) | 5.79 -> **7.84** | 6.29 -> **8.15** | 1.214 -> **1.037** |
| **monthly-wrap**              | 3.47 -> **4.20** (+21%) | 2.56 -> **3.07** | 4.36 -> **4.88** | 2.009 -> **1.912** |
| benefits                      | 3.91 -> 4.20            | 3.41 -> 3.41     | 4.11 -> 4.36     | 2.634 -> 2.584     |
| activity                      | 7.40 -> 7.56            | 6.97 -> 7.16     | 7.88 -> 7.47     | 4.660 (exempt)     |
| budget (benchmark, untouched) | 7.40                    | 6.78             | 7.75             | 1.282              |

**Plan (the least dense primary tab).** Three changes, and the largest was not
the one the defect report named.

1. The 46.8px two-line _sentence_ `$9,837 cash savings planned.` is now a 13px
   eyebrow and a 24px headline carrying the monthly outcome — the same shape
   Budget uses. The header went **~140px -> 42.4px**. The annual figure is not
   reprinted here at all, so it is now stated exactly once on the surface, in the
   money-flow legend that computes it (C2, C7).
2. The four destination **cards** were four homogeneous units scanned down a
   column with no more than one acted on at a time — a row list by C5's own
   terms, and a card-test failure on the "no more than 3 on the surface" clause.
   80px + 16px gap each became a 48px hairline-separated row each: **192px back**.
3. What actually capped the density was a **90px run-on sentence that is one text
   node**: `$28,500.00 start + $55,687.39 planned total (cash, payroll/employer,
allocations) + … spending variance + … funding variance`. It is now the row
   list this app already gives the identical concept on Monthly wrap — same four
   terms, same order, **same cents** (`Metric` is not reused precisely because it
   rounds to the dollar), and the four conditional branches reproduced term for
   term. The charts moved below the figures and the destinations, so a 300px
   donut restating one number is no longer what a reader meets first (DEN-6).

**Manage categories (was the worst in the app).** The two-row control grid found
nowhere else in the app cost 112px per category and showed **5 categories where
Budget shows 12**. The collapsed row is now the same 48px row every other list
uses — colour dot, name, type, chevron — and **15 rows are on screen at 360x740**
(measured: 48.0px each). VH halved, 2.245 -> 1.129.

The editing controls are behind a labelled disclosure on that row, and this is
the one place the loop did not do literally what was asked. See "What was
refused" below for the arithmetic.

**Category detail.** Three label/value pairs stacked down 197px with the entire
right half of the card empty. Side by side at ~96px per column each still sets on
one line, and the block is 64px: **133px of the first screen** handed back to the
transaction list the surface exists to show (C5, C1).

**Monthly wrap.** `Total remaining +$123` sat alone on a two-column row with the
cell beside it empty. The odd last cell now spans the full width, and each cell
puts its label and value on one baseline rather than stacking them: the
three-metric block 144px -> 104px, the six-metric one 224px -> 160px, no empty
cell on either (C5).

---

### 7. Coherence

**One "what screen is this" treatment.** There were three across four tabs. There
is now one: **a 13px eyebrow naming the screen, a 24px `h1` carrying the figure
the screen exists to report, and at most one 13px qualifier line.**

| Tab      | Before                                                     | After                                                                                                 |
| -------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Home     | no title (hero card)                                       | unchanged — the hero card _is_ label + amount + qualifier, the same three parts on an inverse surface |
| Budget   | eyebrow + 24px `$123 safe to spend`                        | unchanged; it is the pattern the others moved to                                                      |
| Plan     | 46.8px two-line sentence                                   | eyebrow `2026 annual plan` + 24px `$820 saved each month` + qualifier                                 |
| Activity | 18px `h1` repeating the tab label, answer demoted below it | eyebrow `Activity` + 24px `$4,478 logged` + count line                                                |

Both arrival assertions in the harness were rewritten to match, and both are
**stricter** than what they replaced: Activity's used to assert the literal
string `"Activity"` (that a label existed) and now pins the shape of a figure;
Plan's used to pin a trailing full stop and now pins a number.

**One numeric voice.** `SFMono-Regular` and `-apple-system + tabular-nums` were
both in use for figures and the boundary was not clean. The rule now is:
**every figure is set in the body/display face with `tabular-nums`;
`--font-data` is the _label_ face and carries no figures.** Applied to the
Plan-details ledger total, the money inputs and their `$` affixes, Benefits'
summary values, Compare's card values and deltas, the money-flow legend, the
account email and the install-step counts.

**Benefits' first datum.** It sat at y=323 against 178-190 for its seven sibling
detail surfaces, because a two-sentence explainer opened the screen. Not a word
of it is cut — it explains how the benefit rows are read, so it now sits with
them, under the four figures it was delaying.

---

### Tap paths walked after the change

Walked at 360x740, the tightest viewport, on the live build:

- **Home -> Budget -> Manage categories** (3 taps, unchanged) -> the row for a
  category. **15 category rows visible**, each measured at **48.0px**. The
  collapsed row states its name, its colour (the dot itself), its type, and
  `· Archived` when it applies. Expanding it exposes `Rent name`, `Rent type`,
  `Rent color`, `Move Rent up`, `Move Rent down`, `Archive` — all five
  capabilities the surface owns — with **0 controls under 44px**. Create is
  still the toolbar's `Add category`, untouched.
- **Home -> Plan -> {Plan details, Benefits, Compare years, Edit budget}**: all
  four are still one tap from Plan; only the row's shape changed. Monthly wrap
  is still reachable from Home and from Activity.
- Home at 360x740 with no recent-activity preview: the same rows are on the
  Activity tab, which is one tap from Home, so nothing became unreachable and
  nothing moved further away.

---

### What was refused

**"Collapse name/type/colour/reorder into one 48px row" — not literally, and the
arithmetic is why.** At 360px the row has 336px to spend. The controls that
would have to share it measure: type select ~85px (it has to hold `Saving`),
colour select ~75px, two 44px reorder buttons = 88px, archive ~80px, colour dot
12px. That is **340px of fixed controls plus four gaps before the name field
gets a single pixel** — over budget with the name at zero width, and never-cross
rule 4 forbids buying the difference by taking any control under 44px.

So the row is 48px and carries what a reader _reads_ — name, colour, type,
archived state — and the controls open in place on the same surface, one labelled
control away, in the same field idiom the Plan-details row editor already uses
(C12: an editing grid is promoted off the row, but this surface _is_ where those
capabilities live, so it is promoted off the row and not off the screen).
Nothing moved behind a bare chevron: the disclosure's accessible name is
`Rename, recolour, reorder, or archive {name}`, and the surface's own toolbar
line reads `Tap a category to rename, recolour, reorder, or archive it.` — which
was previously hidden below 740px tall and is now kept at every size, because it
is load-bearing.

**A two-column `planOutcome` at 390 and 430** was implemented, measured, and
reverted: it changed the surface height by **1px** (the projection text simply
re-wrapped to the height the stacking had saved) and improved nothing. It is
recorded here rather than shipped as an unjustified diff.

---

### Residual risk

- **`datumPer100px` is reported, never gated.** Density is a judgement; a gate on
  it would be a gate on a number that can be gamed by adding words. What is
  gated is what makes density possible without crowding — the 44px targets, the
  11px floor, the ellipsis, and the single-screen fit.
- **Home shows no recent-activity preview at 360x740.** The rows are one tap away
  on Activity and nothing is only available on Home, but a 360x740 reader loses
  the "correct it while it is fresh" glance. The alternative was leaving 86px
  below the fold with a row cut through its own subtitle.
- **The 64px dead-band bar is derived, not published.** It is one compact
  transaction row plus its group gap. A surface whose natural next unit is
  taller than 64px could pass with a band that unit would have filled.
- **`account` is now the least dense surface in the catalogue** (1.87 at
  360x740). It was outside this loop's brief and is untouched; it is the obvious
  next target.
- **The manage-categories editor is not gated by the harness.** The catalogue
  measures the collapsed list; the expanded editor's 44px targets were walked by
  hand at 360x740 (0 under 44px) rather than by a gated row.
- **`--text-scale-smaller` is a ratio token, not a size token.** It is the only
  relative value in the type scale, and it is only safe because the `max()`
  around it floors it. Using it anywhere without that floor reintroduces D3.

---

## L9 — the harness was measuring the wrong browser

Every number below was read out of a live production build. AFTER is
[`l9/full-green1.json`](./l9/full-green1.json) /
[`l9/full-green1.md`](./l9/full-green1.md) — **126 rows, gate mode, exit 0**,
the first run of this catalogue on two engines.

```
pnpm ui:density:measure -- --mode gate --viewports 390x844,360x740,430x932 --session l9-green1
# 126 measurement(s) across chromium + webkit; 0 violating row(s); mode=gate   EXIT=0
```

| Signal                               | AFTER (126 rows)                                     |
| ------------------------------------ | ---------------------------------------------------- |
| rows                                 | 126 (21 surface states x 3 viewports x 2 engines)    |
| max CLS                              | **0.0039** (bar 0.02; was 0.0106 at L8)              |
| headline swaps                       | 0                                                    |
| targets < 44px                       | **0** — on both engines, for the first time          |
| computed font-size < 11px            | 0 (smallest measured: **11.00px**)                   |
| boxes clipping text with no ellipsis | 0                                                    |
| horizontal overflow                  | 0                                                    |
| console errors                       | 0                                                    |
| arrival failures                     | 0                                                    |
| Chromium `frameTicks`                | **106** min, 5858 max; `nativeLayoutShiftLive` 63/63 |

---

### 1. The Chromium zero was true about Chromium and false about the product

Nine waves of this mission reported `smallTargets: 0`. The harness's target-size
filter was never wrong — it was pointed at the wrong engine.

The divergence is real and it is in the one place never-cross rule 4 lives,
native form controls. Same DOM, same stylesheet, 390x844:

| `<select>` as authored   | Chromium |    WebKit |
| ------------------------ | -------: | --------: |
| `min-height:44px`        |    75x44 |     75x44 |
| `+ padding:0 32px 0 8px` |   115x44 |    115x44 |
| `+ border:1px solid`     |   104x44 | **73x23** |
| `+ border-radius:6px`    |   104x44 | **73x23** |
| `+ background:#fff`      |   104x44 | **73x23** |
| `+ appearance:none`      |    41x44 |     41x44 |

The moment an author paints a `<select>` — any border, any radius, any
background — WebKit leaves the native menulist theme for its **styled-menulist**
path, and that path's user-agent rules beat the author's:
`getComputedStyle(select).minHeight` reads **18px** on a control the stylesheet
sets to 44px, and author padding computes to **0**. Chromium honours the author
value in every case. Every select in this app is painted, so the app's real
`select[aria-label="Plan year"]` measured **104x44 in Chromium and 76x23 in
WebKit** on the same run.

**How big the hole was, measured rather than argued.** `--fail-demo
menulist-real` puts `appearance: auto` back on every select in the document and
runs the whole catalogue:

| Engine       | Surface states red | Sub-44px control instances | Evidence                                  |
| ------------ | -----------------: | -------------------------: | ----------------------------------------- |
| **webkit**   |       **19 of 21** |                     **49** | `l9/faildemo-menulist-real-webkit.json`   |
| **chromium** |        **0 of 21** |                      **0** | `l9/faildemo-menulist-real-chromium.json` |

One injection, two answers, and the answer the product ships on is the red one.
The worst surface was **Benefits at 13 instances** (its seven benefit-type
selects, its `Add benefit` control and its `Modeling notes` summary); Fast Log
edit had 4, Plan details 4, Activity 3.

The fix is **one rule in `globals.css`**, not 49 patches: `appearance: none` —
the one setting both engines agree on — plus an author-drawn chevron and its
reserved `padding-inline-end`, because turning the native appearance off also
removes the platform's disclosure arrow. A rule that sets its own horizontal
padding on a select must therefore leave `padding-inline-end` alone or reserve
the chevron itself, which is why the six per-surface select rules moved from
`padding` shorthand to `padding-block` + `padding-inline-start`. `<summary>`
got the same treatment for the same reason: it is the only way to reach what its
`<details>` holds, so it is a touch target, and two of them shipped at 32px.

### 2. What the second engine is allowed to gate, and what it is not

WebKit does not implement the Layout Instability API, so gating a CLS bar on it
would be gating an instrument that is not there. The split is declared in the
harness and printed on every row:

- **Chromium (`gates: "all"`)** keeps every measurement it had — CLS, frame
  liveness, headline swaps, the answer-paint gate, the vertical bars, the
  long-list exemption.
- **WebKit (`gates: "geometry"`)** runs the same catalogue and gates the four
  checks whose answer depends on which engine laid the page out: **target size,
  the 11px legibility floor, text fit, and horizontal overflow.**

This adds coverage and removes none: a control that is 44px in Chromium and 23px
in WebKit now fails, and one that is small in Chromium still fails there. Every
row carries `engine` and the markdown table prints it, so no number is ambiguous
about where it came from. The run also states its own instrument condition:
`NOTE: 63 row(s) came from an engine with no Layout Instability API.`

### 3. The rest of the wave: seven defects the judge panel raised

| ID      | Surface                     | What a reader saw                                                                                                                                                            | Fix                                                                                                                                                    |
| ------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D3**  | Plan details ledger         | `Health and pharmacy` in a 158px box needing 182px — an ellipsis over 42% of the name                                                                                        | The row spans the card's own 24px padding at phone widths and the money field steps to 96px at 360px; **none of it comes out of the name**             |
| **D4**  | Budget / Home / wrap        | One quantity under four names: `safe to spend`, `Left to spend`, `currently unspent`, `Total remaining`                                                                      | One name — **`left to spend`** — everywhere the same cents are printed                                                                                 |
| **D5**  | Budget, Activity            | Fast Log rendered a labelled pill on Home and a bare 48px circle on two other tabs, named only by aria-label                                                                 | One labelled treatment on every tab (rule 2: no capability behind an unlabelled affordance)                                                            |
| **D7**  | Plan details, wrap, compare | Section `<h2>`s set at 24px/700 — identical to the page `<h1>`, so there was no hierarchy step at all                                                                        | Section headings step one rung down to `--text-lg`/1.2; Plan details' second `<h1>` became an `<h2>`                                                   |
| **C5**  | Monthly wrap                | An eyebrow and a heading saying the same thing twice, the heading spending 55px and two lines on it                                                                          | One heading, `Budget versus actual`                                                                                                                    |
| **C6**  | everywhere                  | 16 per-component `tabular-nums` declarations covering ~115 numeric runs and **missing 50**, including the two largest figures in the product and Plan's 15-row dollar column | **One inherited `font-variant-numeric: tabular-nums` on `body`** — it reaches every amount, percentage, count and date, including ones not written yet |
| **C12** | Category detail             | The category name printed on all 11 rows, repeating what the `<h1>` had already said                                                                                         | `showCategory={false}` on that surface only; Activity mixes categories and still names them                                                            |

One further defect was found by the CLS instrument rather than by a judge: the
top-bar sync status was right-anchored with `margin-left: auto`, so it absorbed
the header's free space and **slid 111px left the moment the `Start 2027`
control mounted** on arrival at a Plan screen. It now grows instead of being
pushed. That single change is why **Budget and Activity moved from 0.0075 /
0.0106 / 0.0056 CLS to 0.0000 at all three viewports.**

### 4. No surface regressed

Comparing all 63 Chromium rows against `l8-after.json`: **13 rows moved on
vertical cost, none by more than 0.108 VH, and every one of them stayed inside
its bar.** The other 50 are identical to three decimals.

| Surface      | Viewport | L8 VH | L9 VH | Bar | Why                                    |
| ------------ | -------- | ----: | ----: | --: | -------------------------------------- |
| Monthly wrap | 390x844  | 1.912 | 1.818 | 3.0 | C5 removed a two-line restatement      |
| Monthly wrap | 360x740  | 2.478 | 2.370 | 3.0 | same                                   |
| Monthly wrap | 430x932  | 1.672 | 1.616 | 3.0 | same                                   |
| Compare      | 390x844  | 1.534 | 1.519 | 4.0 | D7 stepped the card heading down       |
| Compare      | 360x740  | 1.774 | 1.757 | 4.0 | same                                   |
| Compare      | 430x932  | 1.389 | 1.376 | 4.0 | same                                   |
| Plan         | 390x844  | 1.782 | 1.807 | 3.0 | the drawn chevron reserves its own box |
| Plan details | 390x844  | 2.724 | 2.757 | 4.0 | same                                   |
| Plan details | 360x740  | 3.127 | 3.141 | 4.0 | same                                   |
| Plan details | 430x932  | 2.379 | 2.388 | 4.0 | same                                   |
| Benefits     | 390x844  | 2.584 | 2.598 | 4.0 | same, x7 selects                       |
| Benefits     | 360x740  | 2.969 | 2.985 | 4.0 | same                                   |
| Benefits     | 430x932  | 2.270 | 2.283 | 4.0 | same                                   |

The chevron costs **0.009-0.033 VH** on the four surfaces that carry selects.
That is the price of the control being the size it claims to be, and it is paid
inside every bar.

### FAIL-DEMO — all 14 gates red on this build, control green

Injection only; no application source was touched. Each row is the gate's own
message, and the intended gate fired on every one of them (several also tripped
Home's single-screen gate, since prepending any node to a surface that fits
exactly makes it stop fitting — that is the gate working, and both failures are
printed).

| Demo            | Engine   | Gate it proves                  | Message (truncated)                                                            | Exit |
| --------------- | -------- | ------------------------------- | ------------------------------------------------------------------------------ | ---: |
| `vh`            | chromium | vertical bar                    | vertical cost 5.479 VH exceeds 1.0 VH                                          |    1 |
| `cls`           | chromium | CLS bar                         | CLS 0.2203 exceeds 0.02                                                        |    1 |
| `headline`      | chromium | headline swap (**D2**)          | `"$123 left to spend" -> "$0 planned spending"`                                |    1 |
| `answer`        | chromium | provisional answer repaint      | the primary answer was painted 2 times with different values                   |    1 |
| `touch`         | chromium | 44px targets                    | 1 interactive target(s) under 44px: 20x20                                      |    1 |
| `menulist`      | webkit   | 44px targets, WebKit            | 1 target under 44px: 74x23 on a control declared 44px                          |    1 |
| `menulist-real` | webkit   | 44px targets, **real controls** | 19 of 21 surfaces red, 49 instances                                            |    1 |
| `menulist-real` | chromium | (contrast)                      | **0 of 21 — same injection, same DOM**                                         |    0 |
| `chrome`        | chromium | long-list chrome sub-bar        | chrome above the first list row 0.782 VH exceeds 0.60 VH                       |    1 |
| `listrows`      | chromium | exemption earned                | long-list exemption claimed but not earned                                     |    1 |
| `tiny`          | chromium | 11px legibility floor           | 1 element below the 11px floor (smallest 9px)                                  |    1 |
| `clip`          | chromium | text fit                        | 1 box narrower than its own text (`ellipsis: false`)                           |    1 |
| `fit`           | chromium | text fit, ellipsised            | 1 box narrower than its own text (`ellipsis: true` — an ellipsis is not a fit) |    1 |
| `deadband`      | chromium | single-screen dead band         | 144.9px of dead band, over the 64px that would have held another row           |    1 |
| `overflow`      | chromium | horizontal overflow             | clientWidth 390 !== scrollWidth 3000                                           |    1 |
| `console`       | chromium | console errors                  | 1 console error(s)                                                             |    1 |
| **control**     | both     | (no injection)                  | 6 rows, 0 violating                                                            |    0 |

The `headline` demo is worth naming: it reproduces **D2 exactly as the mission
describes it** — a Budget headline that reads `$123 left to spend` at first paint
and `$0 planned spending` when settled — and the gate catches it. D2 is fixed at
the root (L5 §2); this is the trap that would catch it coming back.

### What was refused

**Patching the 49 controls individually.** Each one would have needed a
`min-height` WebKit ignores, so the patch would have measured green in Chromium
and shipped broken anyway. The defect is not in 49 declarations, it is in one
missing one.

**Gating CLS on WebKit.** The engine has no Layout Instability API. The harness
would have had to fall back to its own geometric figure and call it CLS, which
is exactly the "dead instrument reporting green" failure L4 and L5 were spent
curing. WebKit rows print a geometry-derived CLS column that explicitly does not
gate, and the run says so in its own output.

### Residual risk

- **`--fail-demo menulist-real` is the only product-wide demo.** The other
  thirteen inject one synthetic node. A gate whose demo is synthetic is proven
  to fire; it is not proven to fire on the shapes this product actually builds.
- **WebKit here is Playwright's WebKit, not iPhone Safari.** It is the same
  engine family and it reproduced the styled-menulist divergence exactly, but it
  is not the shipping browser on the shipping hardware. The real-device pass
  remains a residual risk for the human, unchanged.
- **The chevron is drawn in CSS gradients.** It is two linear-gradients sized in
  `--space-1`, so it scales with the token scale and not with the font. At a
  much larger accessibility text size the arrow stays 4px.
- **Only 390x844 was measured under `menulist-real`.** The count at 360x740 and
  430x932 is unmeasured; the fix is viewport-independent, but the number 49 is
  specific to the primary viewport.

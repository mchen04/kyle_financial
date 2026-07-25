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

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

# L5 judge panel — cycle 5

Judged against `e66902c`, the production build, 21 surface states captured at
390x844 / devicePixelRatio 3. Four independent fresh-context reviewers, one axis
each, images only. Unlike cycle 4, each judge was told which observations are
**capture artifacts** (safe-area `env()` resolving to 0 in headless Chromium,
Chromium's `<input type="date">` spinner, Chromium focus rings) so those would
not be re-reported as product defects.

## Scores, cycle 4 -> cycle 5

| Axis                     | Cycle 4 |  Cycle 5 |     Δ |   Bar | Verdict  |
| ------------------------ | ------: | -------: | ----: | ----: | -------- |
| Visual coherence         |     7.2 |  **7.4** |  +0.2 | > 8.0 | FAIL     |
| Typographic hierarchy    |     7.6 |  **7.8** |  +0.2 | > 8.0 | FAIL     |
| Density without crowding |     7.4 |  **7.2** |  -0.2 | > 8.0 | FAIL     |
| iOS nativeness           |     5.5 |  **6.5** |  +1.0 | > 8.0 | FAIL     |
| **Panel average**        |    6.93 | **7.23** | +0.30 | > 8.5 | **FAIL** |

Every cycle-4 convergent finding was verified fixed by the panel — none of the
nine was raised again. The score moved up on three axes; density moved down by
0.2 because the wave **introduced a new defect**, below.

## The regression this wave shipped, caught by the next panel

Cycle 4's iOS judge asked for a chevron instead of the solid triangle drawn
beside every `<select>`. It was implemented as two diagonal gradient _bands_
over one box. Two diagonal bands over the same box do not meet in a caret — they
cross. Two cycle-5 judges independently caught it:

> "the caret is drawn as two crossed strokes (an ✗ with a tail) rather than a
> chevron ... its left arm overlaps the right edge of the '6' in '2026', so the
> two read as one malformed glyph"

Confirmed by cropping the capture at 4x. **Reverted** to the two-half-gradient
triangle, which renders a clean glyph in both engines, plus a wider reserved
gutter (`padding-inline-end` 20px -> 24px, glyph starts 12px in).

The shape critique is now **refused with a stated reason**: a `<select>` cannot
carry a pseudo-element, and the token authority forbids raw colours, so an SVG
data URI with a fill is unavailable. Two half-gradients meeting at a shared edge
is the only construction that renders a clean glyph under both constraints.

## Cycle-5 convergent findings, all fixed

| Finding                                                              | Judges | Fix                                                                 |
| -------------------------------------------------------------------- | -----: | ------------------------------------------------------------------- |
| The malformed caret overlapping the year digit                       |  **2** | reverted to the triangle; gutter widened                            |
| Two competing section-heading forms on adjacent cards                |  **2** | one rung product-wide: grey letterspaced caps. `<h2>` elements kept |
| The auth card is ~252px wide inside a 390px viewport                 |  **2** | `place-content` -> `align-content`; panel takes onboarding's gutter |
| The Fast Log pill's bottom edge is tangent to the tab bar's hairline |  **2** | 8px clearance; the button is `position: fixed` so this costs no VH  |
| Plan's hero card is more than half empty                             |      1 | input and projected figure sit side by side instead of stacked      |
| Compare's explainer is the largest text in its own card              |      1 | demoted to the secondary size its peers use for footnotes           |

The auth-card width was raised by cycle 4's density judge as a nit and by two
cycle-5 judges as a defect, so it carries three mentions across two rounds.

## Why this loop is being stopped at cycle 6 of 8

The three design axes are converging slowly and honestly (+0.2, +0.2, and a
regression that was caught and fixed). **iOS nativeness is not converging, and
its remaining findings are out of this mission's scope by construction.** What
the cycle-5 iOS judge now asks for, in its own words:

- delete the floating action button ("the signature Android/Material affordance")
- convert every form screen to "inset grouped rows with borderless inline
  fields"
- give the Fast Log sheet a grabber and a `Cancel` / `Save` navigation bar
- make the tab bar "a translucent material" with "filled symbol variants"
- move the icon set from Lucide to SF Symbols
- pin the back control in a fixed navigation bar and collapse the app header
  into it on pushed screens

Every item is a rebuild of an interaction or an asset system. The mission's scope
section names its non-goals explicitly — "new product features", "new
iconography", "redesigned iconography" — and its north star says anything the
north star does not justify is cut. A web PWA that deliberately keeps a
persistent add-affordance and native form controls has a ceiling on this axis
that only a native-shell rewrite would lift.

The bar is **not** lowered to exit. It is reported unmet: **7.23 average against
8.5, with all four axes under 8.0**, and the true scores stand in the final
report.

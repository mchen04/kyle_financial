# L5 judge panel — cycle 4

Judged against `7d1312b`, the production build, 21 surface states captured at
390x844 / devicePixelRatio 3 by
`pnpm ui:density:measure -- --mode capture --screenshots docs/evidence/l5-judge-cycle4`.
Four independent fresh-context reviewers, one axis each, no implementation
context, no access to the source — images only. PNGs are retained on disk beside
this file and are gitignored.

## Scores

| Axis                     |    Score |   Bar | Verdict  |
| ------------------------ | -------: | ----: | -------- |
| Visual coherence         |  **7.2** | > 8.0 | FAIL     |
| Typographic hierarchy    |  **7.6** | > 8.0 | FAIL     |
| Density without crowding |  **7.4** | > 8.0 | FAIL     |
| iOS nativeness           |  **5.5** | > 8.0 | FAIL     |
| **Panel average**        | **6.93** | > 8.5 | **FAIL** |

Cycle 4 of a hard cap of 8.

## Where the panel converged

A finding raised independently by more than one judge, who could not see each
other's work, is weighted above a single opinion.

| Finding                                                                    | Judges | Status |
| -------------------------------------------------------------------------- | -----: | ------ |
| Plan's four-up stat block: labels wrap, figures do not form a column       |  **3** | fix    |
| Activity empty search: a dashed ~280px box holding two centred lines       |  **3** | fix    |
| Fast Log: the new and edit sheets end in two different action rows         |  **3** | fix    |
| Monthly wrap: figures unaligned; a card heading and an eyebrow at one rank |  **3** | fix    |
| The letterspaced caps eyebrow is blue for page identity _and_ for sections |  **2** | fix    |
| Category detail: `Allocated` capitalised, `spent` / `remaining` not        |  **2** | fix    |
| Account: two heading sizes for peer sections; buttons 7px apart            |  **2** | fix    |
| Monthly wrap opened from Home says `Back to Home` while Budget stays lit   |  **2** | fix    |
| `Note` / `Optional` spend two lines on one field's label                   |  **2** | fix    |

## Measured, not judged by eye

The Plan finding was confirmed against the live DOM rather than the image, and
the measurement is worse than the description. The cells are
`display: flex; justify-content: space-between` inside a two-column grid:

| Cell              | Label box (px) |     Label height | Value box (px)   | Cell content ends | Verdict                 |
| ----------------- | -------------- | ---------------: | ---------------- | ----------------: | ----------------------- |
| Starting balance  | 24 – 72.1      | **32** (2 lines) | 80.1 – **183.9** |               175 | **overflows by 8.9px**  |
| Spending variance | 24 – 81.3      | **32** (2 lines) | 89.3 – **193.5** |               175 | **overflows by 18.5px** |
| Planned total     | 215 – 263.8    | **32** (2 lines) | 271.8 – 375.6    |               366 | overflows by 9.6px      |
| Funding variance  | 215 – 306.1    | **32** (2 lines) | 314.1 – 366      |               366 | flush, 0px              |

`justify-content: space-between` cannot right-align content that is already
wider than its box. Two cells overflow to the right, one lands flush, so the
four figures end at four different x positions — which is exactly what the
typography judge saw and could not explain from the image alone.

## Rejected, with reasons

| Finding                                                                          | Judge | Why it is not actioned                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The tab bar reserves no home-indicator room"                                    | iOS   | **Capture artifact.** `.bottomNav` pads `max(var(--space-1), env(safe-area-inset-bottom))`. Chromium emulation resolves that `env()` to 0, so the judge measured an inset that does not exist off-device. The rule is correct and unchanged.                |
| "Replace `<input type=\"date\">` with an in-app picker"                          | iOS   | **Capture artifact plus scope.** The MM/DD/YYYY segment spinner the judge saw is Chromium's date control; iOS Safari renders the same element as a native wheel. Building a bespoke picker is new interaction design, not density, stability or navigation. |
| "Every dropdown shows the triangle Chromium paints on selects"                   | iOS   | **Factually superseded by L9.** Every select is `appearance: none`; the glyph is drawn by this stylesheet, not by the UA. The _shape_ critique is fair and is actioned — the triangle becomes a chevron.                                                    |
| "Convert Account/Budget buttons to grouped list rows with chevrons"              | iOS   | Would erase the primary/secondary distinction these screens rely on and is a redesign of surfaces already converged. The spacing and heading-rank half of the finding is actioned.                                                                          |
| "Add trailing chevrons and hairline separators to every Budget and Activity row" | iOS   | L3a and L3b deliberately removed per-row separators to buy vertical cost on the two densest surfaces. Re-adding a chevron column and a hairline to 61 transaction rows and 15 category rows spends VH on the two surfaces with the least to spare.          |
| "Add a sheet grabber and a Cancel/Save nav bar to Fast Log"                      | iOS   | New modal interaction design. The half both other judges also raised — that the two sheet states end in different action rows — is actioned.                                                                                                                |

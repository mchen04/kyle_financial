# Mobile density and layout research — 2026-07

**Research date / access date for every source below: 2026-07-24.**
**Scope:** Kyle Financial ("House by 30") — a private budgeting PWA for exactly two
users, targeted at iPhone Safari added to the Home Screen (`display: standalone`),
390x844pt portrait. No customers, no funnel, no marketing surface.

**Why this file exists.** Two named defects drive it:

- **D1 Vertical sprawl** — the budget surface takes roughly two minutes of
  scrolling on an iPhone; sections are spaced like a desktop marketing page.
- **D2 Settle shift** — the budget headline renders `$0 safe to spend`, then
  re-renders as `$0 planned spending`, and everything below jumps.

**How to use it.** Every source below carries a stable ID (`HIG-L1`, `CLS-2`, …).
Later loops cite an ID plus a convention ID (`C1`–`C14`) from the
[Applied conventions](#applied-conventions) section to justify a layout decision.
A source with no **ADOPT** / **REJECT** decision is not evidence and must not be
cited.

**Standing constraints that no source can override** (inherited from the frozen
mission): touch targets stay >= 44px; input font-size stays >= 16px; no
marketing/promotional/persuasive copy; density never comes from hiding true
information behind an unlabeled affordance; never lower a bar to make something
pass.

**Method note.** Apple's Human Interface Guidelines are a client-rendered site;
its prose was read through the same content API the site itself consumes
(`https://developer.apple.com/tutorials/data/design/human-interface-guidelines/<page>.json`),
so the quotes below are the current published text, not recall. Page URLs are
given in their human-readable form.

---

## 1. Apple HIG — layout, typography, tab bars, sheets, modality, touch targets, safe areas

### HIG-L1 — Space is spent on essential information, not on everything

- **Source:** Apple, Human Interface Guidelines, "Layout" —
  <https://developer.apple.com/design/human-interface-guidelines/layout> —
  accessed 2026-07-24
- **Claim:** "Make essential information easy to find by giving it sufficient
  space. People want to view the most important information right away, so don't
  obscure it by crowding it with nonessential details. You can make secondary
  information available in other parts of the window, or include it in an
  additional view."
- **Decision: ADOPT**
- **Reasoning:** This is the exact charter for fixing D1 — the budget answer
  earns generous space, and everything currently competing with it for the first
  screenful gets demoted to Category Detail or a sub-page rather than being given
  equal vertical weight.

### HIG-L2 — Grouping is done with separators and negative space, not with boxes by default

- **Source:** Apple HIG, "Layout" —
  <https://developer.apple.com/design/human-interface-guidelines/layout> —
  accessed 2026-07-24
- **Claim:** "Group related items to help people find the information they want.
  For example, you might use negative space, background shapes, colors,
  materials, or separator lines to show when elements are related and to separate
  information into distinct areas."
- **Decision: ADOPT**
- **Reasoning:** Separator lines and a single grouped background cost ~1px per
  boundary where a per-item card costs ~40px of padding and gap, so grouping via
  separators is the cheapest correct way to keep semantic grouping while removing
  D1's sprawl.

### HIG-L3 — Safe areas exist to avoid Dynamic Island and system chrome

- **Source:** Apple HIG, "Layout" —
  <https://developer.apple.com/design/human-interface-guidelines/layout> —
  accessed 2026-07-24
- **Claim:** "A safe area defines the area within a view that isn't covered by a
  toolbar, tab bar, or other views a window might provide. Safe areas are
  essential for avoiding a device's interactive and display features, like
  Dynamic Island on iPhone."
- **Decision: ADOPT**
- **Reasoning:** In a standalone Home Screen web app the status bar area and the
  home indicator are ours to pad around, so the bottom tab bar and the Fast Log
  floating action must both be inset by `env(safe-area-inset-*)` or the two users
  will mis-tap them on every 390x844 device with Dynamic Island.

### HIG-L4 — Reference device size

- **Source:** Apple HIG, "Layout" (Specifications: device screen sizes) —
  <https://developer.apple.com/design/human-interface-guidelines/layout> —
  accessed 2026-07-24
- **Claim:** iPhone 16e / 14 / 13 / 13 Pro / 12 / 12 Pro are each listed at
  "390x844 pt (1170x2532 px @3x)".
- **Decision: ADOPT**
- **Reasoning:** 390x844 is confirmed as a current, non-legacy Apple-published
  size, so it is a legitimate single design target for a two-user private app —
  we do not need a device matrix.

### HIG-L5 — Avoid full-width buttons

- **Source:** Apple HIG, "Layout" (iOS platform considerations) —
  <https://developer.apple.com/design/human-interface-guidelines/layout> —
  accessed 2026-07-24
- **Claim:** "Avoid full-width buttons. Buttons feel at home in iOS when they
  respect system-defined margins and are inset from the edges of the screen."
- **Decision: REJECT** (for the Fast Log sheet's primary commit control and for
  full-width tappable list rows)
- **Reasoning:** This guidance protects the _native-app feel_ of a consumer app;
  in a two-user logging instrument the widest possible one-handed target for the
  single most repeated action is worth more than platform-idiom fidelity — we
  keep the 16px side margin but let the row/commit control span it.

### HIG-L6 — Keep the status bar

- **Source:** Apple HIG, "Layout" (iOS) —
  <https://developer.apple.com/design/human-interface-guidelines/layout> —
  accessed 2026-07-24
- **Claim:** "Hide the status bar only when it adds value or enhances your
  experience. … The exception is if you offer an in-depth experience like playing
  a game or viewing media."
- **Decision: ADOPT**
- **Reasoning:** A budgeting instrument is checked in short bursts where knowing
  the time and battery matters more than the ~47px it costs, so we never claim
  the status bar area for content.

### HIG-T1 — iOS Dynamic Type size/leading pairs (Large, the default)

- **Source:** Apple HIG, "Typography" (Specifications → iOS, iPadOS Dynamic Type
  sizes → Large (default)) —
  <https://developer.apple.com/design/human-interface-guidelines/typography> —
  accessed 2026-07-24
- **Claim:** Style | Size (pt) | Leading (pt): Large Title 34/41; Title 1 28/34;
  Title 2 22/28; Title 3 20/25; Headline 17/22 (Semibold); Body 17/22; Callout
  16/21; Subhead 15/20; Footnote 13/18; Caption 1 12/16; Caption 2 11/13.
- **Decision: ADOPT**
- **Reasoning:** These are Apple's own numbers for the exact platform we ship on,
  and they give us defensible line-height ratios (Body 22/17 = 1.29, Footnote
  18/13 = 1.38, Caption 2 13/11 = 1.18) instead of the arbitrary 1.5 currently
  applied to short single-line rows, which is a direct contributor to D1.

### HIG-T2 — Tight leading is legitimate in a list row, but not for 3+ lines

- **Source:** Apple HIG, "Typography" —
  <https://developer.apple.com/design/human-interface-guidelines/typography> —
  accessed 2026-07-24
- **Claim:** "if you need to display multiple lines of text in an area where
  height is constrained — for example, in a list row — decreasing the space
  between lines (tight leading) can help the text fit well. If you need to
  display three or more lines of text, avoid tight leading even in areas where
  height is limited."
- **Decision: ADOPT**
- **Reasoning:** This is Apple explicitly licensing the density fix for D1 and
  simultaneously fencing it — we may tighten one- and two-line rows, and we may
  not tighten the few genuinely multi-line blocks (tax notices, warnings, wrap
  narrative).

### HIG-T3 — Minimum legible text size on iOS is 11pt

- **Source:** Apple HIG, "Typography" (Ensuring legibility) —
  <https://developer.apple.com/design/human-interface-guidelines/typography> —
  accessed 2026-07-24
- **Claim:** "iOS, iPadOS | Default size 17 pt | Minimum size 11 pt."
- **Decision: ADOPT as a floor for non-interactive labels only; REJECT as an
  input floor**
- **Reasoning:** 11pt is fine for a caption but is 5px below our hard input rule,
  so the 16px input minimum (see WK-5) always wins over Apple's general minimum —
  we never let a "HIG-compliant" 11pt label become an input.

### HIG-T4 — Light weights are to be avoided

- **Source:** Apple HIG, "Typography" —
  <https://developer.apple.com/design/human-interface-guidelines/typography> —
  accessed 2026-07-24
- **Claim:** "In general, avoid light font weights. … prefer Regular, Medium,
  Semibold, or Bold font weights, and avoid Ultralight, Thin, and Light font
  weights, which can be difficult to see, especially when text is small."
- **Decision: ADOPT**
- **Reasoning:** Density pushes type down toward 13px in secondary rows, and at
  that size a light weight is the difference between a readable ledger and a
  guess — the existing `--weight-medium: 600` / `--weight-bold: 700` tokens
  already comply and must not be joined by a lighter one.

### HIG-A1 — 44x44pt control size on iOS, 28x28pt absolute minimum

- **Source:** Apple HIG, "Accessibility" (Mobility) —
  <https://developer.apple.com/design/human-interface-guidelines/accessibility> —
  accessed 2026-07-24
- **Claim:** "Platform | Default control size | Minimum control size … iOS,
  iPadOS | 44x44 pt | 28x28 pt."
- **Decision: ADOPT the 44x44pt figure; explicitly REJECT the 28x28pt minimum**
- **Reasoning:** 44px is a frozen never-cross rule for this app, and shrinking a
  control to 28pt is exactly the "lower a bar to make something pass" move the
  mission forbids — a dense row must reach 44px by expanding its hit area, never
  by shrinking the target.

### HIG-A2 — Padding around controls

- **Source:** Apple HIG, "Accessibility" (Mobility) —
  <https://developer.apple.com/design/human-interface-guidelines/accessibility> —
  accessed 2026-07-24
- **Claim:** "Consider spacing between controls as important as size. … In
  general, it works well to add about 12 points of padding around elements that
  include a bezel. For elements without a bezel, about 24 points of padding works
  well around the element's visible edges."
- **Decision: ADOPT the 12pt bezel figure; REJECT the 24pt bezel-less figure as a
  layout spacing default**
- **Reasoning:** 24pt of visual padding around every bezel-less control is
  precisely the desktop-marketing rhythm that produced D1; we instead meet the
  intent by expanding the _invisible_ hit area to 44px while keeping visible
  vertical padding at 12px.

### HIG-B1 — Hit region and the iOS control size ladder

- **Source:** Apple HIG, "Buttons" —
  <https://developer.apple.com/design/human-interface-guidelines/buttons> —
  accessed 2026-07-24
- **Claim:** "As a general rule, a button needs a hit region of at least 44x44 pt
  … to ensure that people can select it easily." Control sizes are published as
  "Mini (28 pt) | Small (32 pt) | Regular (44 pt) | Large (52 pt) | Extra large
  (64 pt)".
- **Decision: ADOPT Regular (44pt) and Large (52pt); REJECT Mini (28pt) and Small
  (32pt)**
- **Reasoning:** The 44/52 pair maps cleanly onto the app's existing control
  tokens (44px and 56px), while 28/32 are unusable here because they sit below
  the frozen 44px floor.

### HIG-LT1 — Rows are the default container for text

- **Source:** Apple HIG, "Lists and tables" —
  <https://developer.apple.com/design/human-interface-guidelines/lists-and-tables> —
  accessed 2026-07-24
- **Claim:** "Prefer displaying text in a list or table. A table can include any
  type of content, but the row-based format is especially well suited to making
  text easy to scan and read. If you have items that vary widely in size — or you
  need to display a large number of images — consider using a collection
  instead."
- **Decision: ADOPT**
- **Reasoning:** Every repeated unit in this app (categories, transactions,
  benefits, plan line items) is homogeneous short text plus a number and contains
  no imagery, so Apple's own test lands squarely on "row", which is the primary
  structural fix for D1.

### HIG-LT2 — Long item text is a signal to promote to a detail view

- **Source:** Apple HIG, "Lists and tables" (Content) —
  <https://developer.apple.com/design/human-interface-guidelines/lists-and-tables> —
  accessed 2026-07-24
- **Claim:** "Keep item text succinct so row content is comfortable to read. … If
  each item consists of a large amount of text, consider alternatives that help
  you avoid displaying over-large table rows. For example, you could list item
  titles only, letting people choose an item to reveal its content in a detail
  view."
- **Decision: ADOPT**
- **Reasoning:** This is the promote-to-sub-page rule stated by Apple: the budget
  list shows name + number + state per row, and the per-category prose,
  history, and edits live in Category Detail — and because the row is labeled and
  tappable, this is disclosure, not the forbidden "hide information behind an
  unlabeled affordance".

### HIG-LT3 — The iOS grouped list style buys separation with extra space

- **Source:** Apple HIG, "Lists and tables" (Style) —
  <https://developer.apple.com/design/human-interface-guidelines/lists-and-tables> —
  accessed 2026-07-24
- **Claim:** "In iOS and iPadOS, for example, the grouped style uses headers,
  footers, and additional space to separate groups of data."
- **Decision: REJECT the grouped style's footers and per-group extra space; ADOPT
  its headers**
- **Reasoning:** Group footers and inter-group padding are the single largest
  repeated vertical cost on the budget surface, and with only two users who
  already know what each group means, one 13px header per group carries the same
  meaning at roughly a quarter of the height.

### HIG-TB1 — Tabs are destinations, never actions

- **Source:** Apple HIG, "Tab bars" —
  <https://developer.apple.com/design/human-interface-guidelines/tab-bars> —
  accessed 2026-07-24
- **Claim:** "Use a tab bar to support navigation, not to provide actions. A tab
  bar lets people navigate among different sections of an app … If you need to
  provide controls that act on elements in the current view, use a toolbar
  instead."
- **Decision: ADOPT**
- **Reasoning:** This settles Fast Log permanently: it is an action, so it stays a
  floating control and never becomes a fifth tab, no matter how often it is used.

### HIG-TB2 — The tab bar stays visible and complete

- **Source:** Apple HIG, "Tab bars" —
  <https://developer.apple.com/design/human-interface-guidelines/tab-bars> —
  accessed 2026-07-24
- **Claim:** "Make sure the tab bar is visible when people navigate to different
  sections of your app. If you hide the tab bar, people can forget which area of
  the app they're in. The exception is when a modal view covers the tab bar." And:
  "Don't disable or hide tab bar buttons, even when their content is unavailable.
  … If a section is empty, explain why its content is unavailable."
- **Decision: ADOPT**
- **Reasoning:** Because every surface in this app is a client-side state under
  one route, the tab bar is the only persistent orientation cue the two users
  have, so it must render identically on Home, Budget, Activity, Plan and their
  sub-pages, and may only be covered by the Fast Log sheet.

### HIG-TB3 — Tab labels are mandatory; use few tabs

- **Source:** Apple HIG, "Tab bars" —
  <https://developer.apple.com/design/human-interface-guidelines/tab-bars> —
  accessed 2026-07-24
- **Claim:** "Include tab labels to help with navigation. … Use single words
  whenever possible." And: "it's generally easier to navigate among fewer tabs."
  And: "Avoid overflow tabs. … The More tab makes it harder for people to reach
  and notice content on tabs that are hidden."
- **Decision: ADOPT**
- **Reasoning:** Four single-word labeled tabs is already the maximum this app
  should carry, and an unlabeled or overflowed tab would violate the mission rule
  that density never comes from an unlabeled affordance.

### HIG-TB4 — Tab bar badges

- **Source:** Apple HIG, "Tab bars" —
  <https://developer.apple.com/design/human-interface-guidelines/tab-bars> —
  accessed 2026-07-24
- **Claim:** "Use a badge to indicate that critical information is available. …
  Reserve badges for critical information so you don't dilute their impact and
  meaning."
- **Decision: REJECT**
- **Reasoning:** Badges are an attention-economy device built to pull users back
  into a consumer app; with two users who open this deliberately to answer a
  question, a red oval is noise that competes with the one number that matters.

### HIG-TB5 — Minimizing the tab bar on scroll

- **Source:** Apple HIG, "Tab bars" (iOS) —
  <https://developer.apple.com/design/human-interface-guidelines/tab-bars> —
  accessed 2026-07-24
- **Claim:** "For tab bars with an attached accessory … you can choose to
  minimize the tab bar and move the accessory inline with it when a person scrolls
  down."
- **Decision: REJECT**
- **Reasoning:** Recovering ~72px by hiding navigation behind a scroll gesture is
  buying density with concealment, which the mission forbids outright — the
  correct way to win that space is to shorten the content, not to hide the
  chrome.

### HIG-S1 — Sheets are for short scoped tasks, one at a time

- **Source:** Apple HIG, "Sheets" —
  <https://developer.apple.com/design/human-interface-guidelines/sheets> —
  accessed 2026-07-24
- **Claim:** "A sheet is useful for requesting specific information from people or
  presenting a simple task that they can complete before returning to the parent
  view." And: "Display only one sheet at a time from the main interface. … If
  something people do within a sheet results in another sheet appearing, close the
  first sheet before displaying the new one." And: "For complex or prolonged user
  flows, consider alternatives to sheets."
- **Decision: ADOPT**
- **Reasoning:** Fast Log (amount, category, title, note, date) is exactly a short
  scoped task, while Edit Budget and Manage Categories are prolonged structural
  work, so the boundary is drawn at the sheet edge and no second sheet may stack
  on top of Fast Log.

### HIG-S2 — Sheet detents

- **Source:** Apple HIG, "Sheets" (iOS, iPadOS) —
  <https://developer.apple.com/design/human-interface-guidelines/sheets> —
  accessed 2026-07-24
- **Claim:** "Sheets resize according to their detents … The system defines two
  detents: large is the height of a fully expanded sheet and medium is about half
  of the fully expanded height."
- **Decision: ADOPT the medium/large concept; REJECT resizable detents as an
  interaction**
- **Reasoning:** A fixed sheet height that reserves its full content box up front
  cannot generate a settle shift (D2) when the keyboard appears, whereas a
  user-draggable detent adds a gesture two known users never asked for.

### HIG-S3 — Always pair Done with Cancel

- **Source:** Apple HIG, "Sheets" —
  <https://developer.apple.com/design/human-interface-guidelines/sheets> —
  accessed 2026-07-24
- **Claim:** "Provide an alternative to the Done button. If you provide a Done
  button, always pair it with a Cancel button … Relying solely on the Done button
  implies that completing the task is the only way to exit the sheet."
- **Decision: ADOPT**
- **Reasoning:** Both sheet header slots are already spent on Cancel and Done, so
  no density change may reclaim them, and this fixes the sheet header at a single
  44px row.

### HIG-M1 — Modal tasks stay simple, short, and non-hierarchical

- **Source:** Apple HIG, "Modality" —
  <https://developer.apple.com/design/human-interface-guidelines/modality> —
  accessed 2026-07-24
- **Claim:** "Aim to keep modal tasks simple, short, and streamlined." And: "Take
  care to avoid creating a modal experience that feels like an app within your
  app. In particular, presenting a hierarchy of views within a modal task can make
  people forget how to retrace their steps."
- **Decision: ADOPT**
- **Reasoning:** This is the rule that keeps inline category creation returning to
  Fast Log rather than opening a nested management hierarchy inside the sheet.

### HIG-M2 — Name the modal task

- **Source:** Apple HIG, "Modality" —
  <https://developer.apple.com/design/human-interface-guidelines/modality> —
  accessed 2026-07-24
- **Claim:** "Make it easy to identify a modal view's task. … When you provide a
  title that names the modal view's task … you can help people keep their place in
  your app."
- **Decision: ADOPT**
- **Reasoning:** A named sheet title is the cheapest possible orientation cue
  (~22px) and it is a _label_, so it is the kind of vertical spend density work
  must not remove.

### HIG-NB1 — Toolbars act on content; tab bars navigate

- **Source:** Apple HIG, "Toolbars / navigation bars" —
  <https://developer.apple.com/design/human-interface-guidelines/toolbars> —
  accessed 2026-07-24
- **Claim:** "Toolbars act on content in the view, facilitate navigation, and help
  orient people in the app. They include … The title of the current view;
  Navigation controls, like back and forward … In contrast to a toolbar, a tab bar
  is specifically for navigating between areas of an app." And: "Choose items
  deliberately to avoid overcrowding."
- **Decision: ADOPT**
- **Reasoning:** This assigns the return path for Category Detail / Edit Budget /
  Manage Categories to a top toolbar back control and keeps Account as a
  deliberate top-right item rather than a tab, exactly matching the current
  layout.

---

## 2. WebKit / Apple web platform — safe areas, standalone web apps, viewport units, scrolling, input zoom

### WK-1 — `viewport-fit=cover` and the safe-area environment variables

- **Source:** WebKit blog, "Designing Websites for iPhone X" —
  <https://webkit.org/blog/7929/designing-websites-for-iphone-x/> — accessed
  2026-07-24
- **Claim:** The default value of `viewport-fit` is `auto`, which automatically
  insets content within the safe area; opting into edge-to-edge layout requires
  `<meta name="viewport" content="initial-scale=1, viewport-fit=cover">`, after
  which four environment variables — `safe-area-inset-top`, `-right`, `-bottom`,
  `-left` — must be applied (e.g. `padding-left: env(safe-area-inset-left)`), or
  "some of the page's content is obscured by the device's sensor housing, and the
  bottom navigation bar is very hard to use". `env()` shipped in iOS 11 as
  `constant()`, which was removed in iOS 11.2.
- **Decision: ADOPT `viewport-fit=cover` + `env()`; REJECT the `constant()`
  fallback**
- **Reasoning:** Our bottom tab bar and Fast Log floating action are exactly the
  "bottom navigation bar is very hard to use" case, and `constant()` fallbacks
  are dead weight for two users on current iOS.

### WK-2 — Safe-area insets are not margins

- **Source:** WebKit blog, "Designing Websites for iPhone X" —
  <https://webkit.org/blog/7929/designing-websites-for-iphone-x/> — accessed
  2026-07-24
- **Claim:** Safe-area insets alone are insufficient as margins — in portrait
  `safe-area-inset-left` is `0px`, so they must be combined with `max()` to
  preserve a baseline padding.
- **Decision: ADOPT**
- **Reasoning:** Our design target is portrait 390x844, where the left/right
  insets are 0, so every edge rule must be written as
  `max(<token>, env(safe-area-inset-*))` or the layout silently loses its side
  margin.

### WK-3 — Small, large, and dynamic viewport units

- **Source:** WebKit blog, "New WebKit Features in Safari 15.4" —
  <https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/> — accessed
  2026-07-24
- **Claim:** "100svh refers to 100% of the height of the smallest possible
  viewport"; "100lvh refers to 100% of the height of the largest possible
  viewport"; "100dvh refers to 100% of the dynamic viewport height — meaning the
  value will change as the user scrolls." The units exist because "the dimensions
  of the browser's viewport change as a user scrolls the page".
- **Decision: ADOPT `dvh` for the app shell and `svh` for the sheet ceiling;
  REJECT `vh`/`100vh`**
- **Reasoning:** `100vh` on iOS resolves to the _large_ viewport, so a
  `100vh` shell is taller than the visible area and pushes the tab bar off screen
  — a permanent, invisible contributor to "it scrolls forever" (D1).

### WK-4 — Home Screen web apps and `display: standalone`

- **Source:** WebKit blog, "Web Push for Web Apps on iOS and iPadOS" —
  <https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/> —
  accessed 2026-07-24
- **Claim:** A site becomes a Home Screen web app when its manifest's `display`
  member is `standalone` or `fullscreen`; it then "opens like any other app on
  iOS or iPadOS instead of opening in a browser" and appears in the App Switcher
  separately from Safari. Manifest `icons` are used when no `apple-touch-icon` is
  declared; `apple-touch-icon` takes precedence when both exist.
- **Decision: ADOPT**
- **Reasoning:** Confirms the app's shipping target — standalone, no browser
  chrome — which means _we_ own the top and bottom chrome budget entirely and
  cannot borrow Safari's toolbar for orientation.

### WK-5 — Momentum scrolling is the default; `-webkit-overflow-scrolling` is dead

- **Source:** WebKit blog, "New WebKit Features in Safari 13" —
  <https://webkit.org/blog/9674/new-webkit-features-in-safari-13/> — accessed
  2026-07-24
- **Claim:** "developers could use a CSS property called
  `-webkit-overflow-scrolling` to opt-in to fast scrolling for overflow scroll";
  now "`overflow: scroll;` and iframe always get accelerated scrolling" and
  "`-webkit-overflow-scrolling: touch;` is a no-op".
- **Decision: ADOPT (rely on the default); REJECT adding
  `-webkit-overflow-scrolling`**
- **Reasoning:** Native momentum scrolling in the sheet and in any inner scroller
  is free on our target, so the legacy property is pure noise in a token-audited
  stylesheet.

### WK-6 — 16px inputs prevent zoom-on-focus (SECONDARY sources; no Apple primary found)

- **Sources (both secondary, explicitly flagged):** CSS-Tricks, "16px or Larger
  Text Prevents iOS Form Zoom" —
  <https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/>; Defensive
  CSS, "Input zoom on iOS Safari" —
  <https://defensivecss.dev/tip/input-zoom-safari/> — both accessed 2026-07-24
- **Claim:** iOS Safari auto-zooms the page when a text input or textarea whose
  computed `font-size` is below 16px receives focus; setting `font-size: 16px` or
  larger on the control suppresses the zoom. macOS Safari does not do this.
- **Decision: ADOPT**
- **Reasoning:** Zoom-on-focus is itself a violent layout shift on the Fast Log
  sheet — the D2 class of defect, triggered by input — so the frozen >= 16px
  input rule is doubly justified; `--text-sm: 0.8125rem` (13px) and
  `--text-xs: 0.6875rem` (11px) are therefore forbidden on any focusable text
  input even where they would be legal on a label.
- **Caveat recorded deliberately:** Apple publishes no primary document stating
  the 16px threshold; the behavior is observable and universally documented by
  practitioners. Treated as a hard constraint anyway because the mission already
  freezes it.

---

## 3. web.dev / W3C — Cumulative Layout Shift

### CLS-1 — What CLS is and the thresholds

- **Source:** web.dev, "Cumulative Layout Shift (CLS)" —
  <https://web.dev/articles/cls> — accessed 2026-07-24
- **Claim:** "CLS is a measure of the largest burst of layout shift scores for
  every unexpected layout shift that occurs during the entire lifecycle of a
  page." Good <= 0.1; needs improvement 0.1–0.25; poor > 0.25; assessed at the
  75th percentile.
- **Decision: ADOPT 0.1 as an outer ceiling; REJECT it as the working target**
- **Reasoning:** 0.1 is calibrated for public sites measured across a field
  population, but this app has two users and one screen size, so we can and must
  hold the Home and Budget headline to **zero** unexpected shifts — accepting 0.1
  here would be lowering a bar we can actually clear.

### CLS-2 — Session windows

- **Source:** web.dev, "Cumulative Layout Shift (CLS)" —
  <https://web.dev/articles/cls> — accessed 2026-07-24
- **Claim:** A session window is "a burst of layout shifts occurring in rapid
  succession with less than 1 second between shifts and a maximum total duration
  of 5 seconds"; CLS reports the largest such window, not the sum over the page.
- **Decision: ADOPT**
- **Reasoning:** D2 is precisely one burst — headline text swaps, then everything
  below jumps within the same window — so it will be reported as a single large
  score and cannot be averaged away by an otherwise-quiet session.

### CLS-3 — The shift score formula

- **Source:** web.dev, "Cumulative Layout Shift (CLS)" —
  <https://web.dev/articles/cls> — accessed 2026-07-24
- **Claim:** "layout shift score = impact fraction \* distance fraction", where
  impact fraction is the share of the viewport occupied by unstable elements and
  distance fraction is the greatest distance moved divided by the viewport's
  largest dimension.
- **Decision: ADOPT**
- **Reasoning:** It explains why D2 is severe rather than cosmetic: a headline at
  the top of a 844pt viewport makes nearly the whole page below it unstable, so
  even a 20px text-height change produces a large impact fraction.

### CLS-4 — `hadRecentInput` and the 500ms input window

- **Source:** web.dev, "Cumulative Layout Shift (CLS)" —
  <https://web.dev/articles/cls> — accessed 2026-07-24
- **Claim:** "Layout shifts that occur within 500 milliseconds of user input will
  have the `hadRecentInput` flag set, so they can be excluded from
  calculations"; this applies to discrete events (tap, click, keypress) and not to
  scrolling or pinching. Expected shifts include those responding closely to a
  user interaction and well-designed transitions.
- **Decision: ADOPT for measurement; REJECT as a design excuse**
- **Reasoning:** A shift that follows a tap within 500ms is excluded from the
  _score_ but is still visible to the two people using the app, so we must not
  "fix" a jumpy Fast Log commit by making sure it happens right after a tap.

### CLS-5 — Causes and size-reserving fixes

- **Source:** web.dev, "Optimize Cumulative Layout Shift" —
  <https://web.dev/articles/optimize-cls> — accessed 2026-07-24
- **Claim:** The named causes are images without dimensions, ads/embeds/iframes
  without reserved space, dynamically injected content, web fonts (FOUT/FOIT), and
  actions awaiting a network response before updating the DOM. The prescribed
  fixes are explicit `width`/`height` or CSS `aspect-ratio`, "Reserve sufficient
  space in the viewport for it in advance (for example, using a placeholder or
  skeleton UI)", `min-height` reservation, having the user initiate loading of new
  content, and avoiding inserting content above existing content.
- **Decision: ADOPT**
- **Reasoning:** D2 is the "dynamically injected content" and "action waiting for
  a response before updating the DOM" case verbatim, and the prescribed fix —
  reserve the headline's final box with `min-height` before the number settles —
  is exactly the convention encoded in C9 below.

### CLS-6 — Text/content swaps are a first-class shift source

- **Source:** web.dev, "Debug layout shifts" —
  <https://web.dev/articles/debug-layout-shifts> — accessed 2026-07-24
- **Claim:** Layout shifts are observed with
  `new PerformanceObserver(...).observe({type: 'layout-shift', buffered: true})`;
  the `sources` array lists up to five DOM elements that moved, each with
  `previousRect` and `currentRect`; "Elements listed as sources shifted visibly,
  but may not be the root cause" — a size change in a preceding element often
  triggers shifts in following elements. Text blocks without reserved dimensions
  that change after rendering are called out explicitly.
- **Decision: ADOPT**
- **Reasoning:** This gives a runnable oracle for D2 and warns the fix loop off
  the wrong target — the reported sources will be the _rows below_ the headline,
  while the root cause is the headline block itself.

### CLS-7 — Layout Instability API (normative)

- **Source:** WICG, "Layout Instability" specification —
  <https://wicg.github.io/layout-instability/> — accessed 2026-07-24
- **Claim:** Defines the `LayoutShift` entry with `value`, `hadRecentInput`,
  `lastInputTime`, and `sources`. "Set newEntry's `hadRecentInput` attribute to
  `true` if `lastInputTime` is less than 500 milliseconds in the past, and `false`
  otherwise." `sources` holds up to five nodes "sorted in descending order by
  impact area". "The layout shift value of a Document D is the impact fraction of
  D multiplied by the distance fraction of D."
- **Decision: ADOPT**
- **Reasoning:** It is the normative definition behind web.dev's prose, so any
  verifier a later loop builds for D2 can assert on spec-defined fields rather
  than on a vendor tool's summary.

### CLS-8 — Skeleton vs spinner vs progress bar

- **Source:** Nielsen Norman Group, "Skeleton Screens 101" —
  <https://www.nngroup.com/articles/skeleton-screens/> — accessed 2026-07-24
- **Claim:** "If a page takes less than 1 second to load, skeleton screens or
  spinners aren't necessary"; spinners "are best used when the page takes 2–10
  seconds to load"; progress bars are "strongly recommended for any page that
  takes longer that 10 seconds"; spinners suit a single module while skeletons
  suit a full-screen load; and "The structure of the gray boxes mimics the
  structure of the final page with content."
- **Decision: ADOPT the structure-mimicry rule and the module/page split; REJECT
  the "under 1 second, no indicator needed" corollary**
- **Reasoning:** Our data comes from local IndexedDB and usually settles well
  under 1 second, and NN/g's rule would license exactly the D2 behavior of
  painting a placeholder headline and swapping it — **where NN/g and web.dev
  conflict we follow web.dev (CLS-5): space is reserved regardless of duration**,
  and the only legal renders of the headline are (a) a reserved-height skeleton or
  (b) the settled value, never a third, differently-worded string.

---

## 4. Information density in dense mobile utilities

### DEN-1 — Cards cost density and scannability

- **Source:** Nielsen Norman Group, "Cards: UI-Component Definition" —
  <https://www.nngroup.com/articles/cards-component/> — accessed 2026-07-24
- **Claim:** "Cards take more space. Because cards are bigger than a line of text,
  any given screen size can't show as many cards in a single view as would be
  possible in a list view." "Card layouts are less scannable than lists." Cards
  are advised against for search tasks, for comparison scenarios, and for
  homogeneous content, with vertical lists, grids, and tables named as the better
  alternatives.
- **Decision: ADOPT**
- **Reasoning:** The budget surface is _nothing but_ homogeneous items being
  compared against each other, which is two of NN/g's three explicit
  counter-indications, making the current card-per-category treatment the direct
  structural cause of D1.

### DEN-2 — Published row-height ladder for data-dense rows

- **Source:** IBM Carbon Design System, "Data table — Style" —
  <https://carbondesignsystem.com/components/data-table/style/> (source of truth:
  `carbon-website/src/pages/components/data-table/style.mdx`) — accessed
  2026-07-24
- **Claim:** Row heights are Extra small 24px, Small 32px, Medium 40px, Large
  48px, Extra large 64px; row text is 14px Regular; "Extra large row heights are
  only recommended if your data is expected to have two lines of content in a
  single row"; column header 14px SemiBold; horizontal cell padding 16px.
- **Decision: ADOPT Large (48px) as the single-line row and Extra large (64px) as
  the two-line row; explicitly REJECT 24/32/40px**
- **Reasoning:** Carbon is a production design system for dense operational
  software, so its ladder is real evidence for how short a row may be — but the
  three shortest rungs sit below our frozen 44px touch floor and are unusable
  here, which is why 48px is the correct densest legal row and not a compromise.

### DEN-3 — Tabular figures, normatively

- **Source:** Microsoft OpenType specification (OpenType 1.9.1), registered
  feature `tnum` —
  <https://learn.microsoft.com/en-us/typography/opentype/spec/features_pt> —
  accessed 2026-07-24
- **Claim:** "_Function:_ Replaces figure glyphs set on proportional widths with
  corresponding glyphs set on uniform (tabular) widths. Tabular widths will
  generally, but not always, be the default. This feature would not be used in
  monospaced designs." "_Example:_ The user applies this feature to get oldstyle
  figures that align vertically in a column."
- **Decision: ADOPT**
- **Reasoning:** Every budget row ends in a dollar amount in a scanned column, and
  uniform advance widths are what make that column readable — and, critically for
  D2, they stop a digit-count change (`$0` → `$1,240`) from re-measuring the line
  box and nudging its neighbors.

### DEN-4 — The CSS property that turns it on

- **Source:** W3C CSS Fonts Module Level 4, `font-variant-numeric` —
  <https://drafts.csswg.org/css-fonts-4/#font-variant-numeric-prop> — accessed
  2026-07-24
- **Claim:** `<numeric-spacing-values> = [ proportional-nums | tabular-nums ]`;
  `tabular-nums` "Enables display of tabular numerals (OpenType feature: tnum)".
  The same property offers `slashed-zero` (OpenType `zero`) and `oldstyle-nums`.
- **Decision: ADOPT `tabular-nums`; REJECT `slashed-zero` and `oldstyle-nums`**
- **Reasoning:** `tabular-nums` is a one-line, zero-height-cost density win on the
  existing `--font-body` stack, while a slashed zero is an aviation/terminal
  convention that would look like an error state to two people reading their own
  grocery budget, and oldstyle figures break vertical alignment outright.

### DEN-5 — Aviation/ops guidance on display density

- **Source:** Mejdal, McCauley & Beringer, _Human Factors Design Guidelines for
  Multifunction Displays_, DOT/FAA/AM-01/17, FAA Office of Aerospace Medicine
  (October 2001) —
  <https://www.faa.gov/sites/faa.gov/files/data_research/research/med_humanfacs/oamtechreports/0117.pdf>
  — accessed 2026-07-24
- **Claim:** Reproducing US NRC display guidelines: "Minimal information density —
  The amount of information per unit area should be minimized by presenting only
  information that is essential to a user at any given time." "Screen density —
  For text displays, the ratio of characters to blank spaces should not exceed 60
  percent." "Integrated information — If a user needs a variety of data to
  complete a task, those data should be provided in an integrated display, not
  partitioned in separate windows or screens." "Consistent screen structure —
  Screens throughout a system shall have a consistent structure."
- **Decision: ADOPT "minimal information density", "integrated information" and
  "consistent screen structure"; REJECT the literal 60% character-to-blank ratio**
- **Reasoning:** "Integrated information" is the strongest available justification
  for putting the budget answer and its inputs on one screen instead of behind
  three taps, but the 60% ratio is a character-cell CRT metric with no meaning for
  proportional type at @3x — and note the direction of the guidance: aviation
  practice caps density rather than maximizing it, so our fix for D1 is _removing
  chrome_, not cramming more facts per screen.

### DEN-6 — Where attention actually goes on a scrolling page

- **Source:** Nielsen Norman Group, "Scrolling and Attention" —
  <https://www.nngroup.com/articles/scrolling-and-attention/> — accessed
  2026-07-24
- **Claim:** "users spent about 57% of their page-viewing time above the fold" and
  "74% of the viewing time was spent in the first two screenfuls, up to 2160px";
  more than 42% of viewing time falls within the top 20% of the page.
- **Decision: ADOPT the prioritization finding; REJECT the "keep major CTAs above
  the fold" framing**
- **Reasoning:** The distribution argument is what makes D1 a real defect rather
  than a taste complaint — content past screenful two is effectively unread — but
  "CTA" is conversion vocabulary for an app with a funnel, and this app has two
  users and no call to action.

### DEN-7 — Apple's own row-first stance (cross-reference)

- **Source:** Apple HIG, "Lists and tables" (see HIG-LT1, HIG-LT2, HIG-LT3) —
  <https://developer.apple.com/design/human-interface-guidelines/lists-and-tables> —
  accessed 2026-07-24
- **Claim:** iOS system apps express hierarchy through rows: "iOS Settings uses a
  hierarchy of lists to help people choose options."
- **Decision: ADOPT**
- **Reasoning:** Settings, Health, and Wallet are the density reference points the
  two users' hands already know, and all three are row hierarchies with detail
  pages — matching them is free familiarity at the densest legal layout.

---

## 5. Navigation ordering conventions

### NAV-1 — Three to five top-level destinations of similar importance

- **Source:** Google, Material Design, "Bottom navigation" —
  <https://m1.material.io/components/bottom-navigation.html> (guidance carried
  forward in Material 3, <https://m3.material.io/components/navigation-bar/guidelines>)
  — accessed 2026-07-24
- **Claim:** "Bottom navigation should be used for: Three to five top-level
  destinations of similar importance … Destinations requiring direct access from
  anywhere in the app". "If there are fewer than three destinations, consider
  using tabs instead." "Avoid using more than five destinations in bottom
  navigation as tap targets will be situated too close to one another." "Views are
  fixed in a bottom navigation bar." Bar height is specified as 56dp.
- **Decision: ADOPT the 3–5 range and the "direct access from anywhere" test;
  REJECT the 56dp height figure**
- **Reasoning:** The direct-access test is exactly why Home/Budget/Activity/Plan
  are tabs and Account is not, while 56dp is a bare Android bar height that
  ignores `env(safe-area-inset-bottom)` — our `--bottom-nav-height: 72px` is the
  correct figure once the home indicator is paid for.

### NAV-2 — Hiding labels to fit more tabs

- **Source:** Google, Material Design, "Bottom navigation" —
  <https://m1.material.io/components/bottom-navigation.html> — accessed
  2026-07-24
- **Claim:** "When there are only three actions, display both icons and text
  labels at all times. If there are four or five actions, display inactive views
  as icons only."
- **Decision: REJECT**
- **Reasoning:** With four tabs this rule would strip labels from three of them,
  which contradicts Apple (HIG-TB3, "Include tab labels to help with navigation")
  and violates the mission rule that density must never come from an unlabeled
  affordance — **where Material and Apple conflict on labels we follow Apple**,
  because we ship only to iPhone.

### NAV-3 — Mixing tabs with in-page tabs

- **Source:** Google, Material Design, "Bottom navigation" —
  <https://m1.material.io/components/bottom-navigation.html> — accessed
  2026-07-24
- **Claim:** "Be cautious when combining bottom navigation with tabs, as the
  combination may cause confusion when navigating an app."
- **Decision: ADOPT**
- **Reasoning:** Compare, Benefits, and Monthly Wrap are reached from within Plan
  and Budget, so they must be presented as sub-pages with a back path — not as a
  second row of tabs stacked under the bottom bar.

### NAV-4 — Tabs are navigation, tab bar is stable (cross-reference)

- **Source:** Apple HIG, "Tab bars" (see HIG-TB1, HIG-TB2, HIG-TB3, HIG-TB5) —
  <https://developer.apple.com/design/human-interface-guidelines/tab-bars> —
  accessed 2026-07-24
- **Claim:** Tabs navigate rather than act; the tab bar stays visible across
  sections and its buttons are never disabled or hidden; labels are included;
  fewer tabs are easier.
- **Decision: ADOPT**
- **Reasoning:** In an app where every surface is a client-side state under one
  route with no URL to fall back on, a tab bar that ever changes shape leaves the
  two users with no way to tell where they are.

### NAV-5 — The return path belongs to the top toolbar (cross-reference)

- **Source:** Apple HIG, "Toolbars / navigation bars" (see HIG-NB1) —
  <https://developer.apple.com/design/human-interface-guidelines/toolbars> —
  accessed 2026-07-24
- **Claim:** Toolbars carry "The title of the current view" and "Navigation
  controls, like back and forward"; a tab bar is specifically for moving between
  areas.
- **Decision: ADOPT**
- **Reasoning:** Category Detail, Edit Budget, and Manage Categories each need an
  unambiguous single back target, and putting it in the top toolbar keeps the tab
  bar unchanged underneath, satisfying HIG-TB2 at the same time.

### NAV-6 — Promote a section to a sub-page when its rows stop being succinct (cross-reference)

- **Source:** Apple HIG, "Lists and tables" (see HIG-LT2) —
  <https://developer.apple.com/design/human-interface-guidelines/lists-and-tables> —
  accessed 2026-07-24
- **Claim:** "If each item consists of a large amount of text, consider
  alternatives … you could list item titles only, letting people choose an item to
  reveal its content in a detail view."
- **Decision: ADOPT**
- **Reasoning:** Combined with DEN-6's attention distribution, this gives the
  inline-vs-sub-page rule numeric teeth (C12): anything that cannot be said in one
  or two lines per row, or that pushes the surface past its scroll budget, is a
  sub-page.

### NAV-7 — Frequency-first ordering

- **Source:** Apple HIG, "Layout" (Visual hierarchy) —
  <https://developer.apple.com/design/human-interface-guidelines/layout> —
  accessed 2026-07-24, combined with NN/g "Scrolling and Attention" (DEN-6)
- **Claim:** "Place items to convey their relative importance. People often start
  by viewing items in reading order — that is, from top to bottom and from the
  leading to trailing side — so it generally works well to place the most
  important items near the top and leading side."
- **Decision: ADOPT**
- **Reasoning:** Applied horizontally to a bottom tab bar, "leading first" means
  the leftmost tab should be the most frequently opened destination, which
  independently confirms the existing Home → Budget → Activity → Plan order for a
  household that checks the answer daily and revises the plan rarely.

---

## Applied conventions

These are the numeric rules later loops cite. Each carries the source IDs it
derives from. Where a rule and a source disagree, the rule wins and the
disagreement is stated in its source line.

**C1 — Row height.** A single-line list row is **48px** tall (`min-height: 48px`),
with **12px** vertical and **16px** horizontal padding, separated by a **1px**
hairline (`--border-subtle`) and **0px** gap. A two-line row is **64px**. A row
that carries an interactive control expands the control's hit area to **44px
minimum** without growing the row. No row may be shorter than **44px** under any
condition. _(DEN-2 ADOPT Large=48/XL=64, REJECT 24/32/40; HIG-A1; HIG-B1)_

**C1b — Three-line row height (added 2026-07-25, L4).** A list row carrying a
genuine third line is **80px** tall (`min-height: var(--space-20)`), sets
**1.5** leading on its text block, and uses a **0px** gap between its lines.

_Why this rung exists._ C1 as first written stopped at the two-line row because
DEN-2's published ladder stops at Extra large = 64px, and Carbon states that rung
is "only recommended if your data is expected to have two lines of content in a
single row." Carbon publishes no three-line rung, so a three-line row cannot be
adopted from it and must be **derived**. Leaving it underived is not neutral: an
undefined row height is a height nobody has justified, and Activity was shipping
one (74px) on the 15 fixture transactions that carry a note.

_The derivation, and why it is not simply "64 + something"._ The binding
constraint on a three-line block is not the ladder, it is **HIG-T2**, which
licenses tight leading in a list row and then fences it: "If you need to display
three or more lines of text, avoid tight leading even in areas where height is
limited." **C3** already turns that fence into a number — any block of three or
more lines sets 1.5 leading. So the height of a three-line row is not a free
choice; it is what 1.5 leading costs:

| Line                            | Size | Leading | Line box |
| ------------------------------- | ---: | ------: | -------: |
| title (`--text-md`)             | 16px |     1.5 |     24px |
| meta, `category · Fri, Jul 24`  | 13px |     1.5 |   19.5px |
| note (`--text-sm`)              | 13px |     1.5 |   19.5px |
| **text block**                  |      |         | **63px** |
| row padding (`--space-2` twice) |      |         |     16px |
| **total**                       |      |         | **79px** |

79px rounds up to **80px** on the 8px rhythm C4 keeps (`--space-20`), so the rung
is 80px and the row is sized by the rung rather than by whatever the text
reflowed to. The **gap is 0px**, not the 4px a two-line row uses: at 1.5 leading
a 16px line box already carries 8px of internal leading, so an added gap would
double-count the separation C4 asks for once.

_What this rejects._ It rejects the 74px the surface was rendering, which was
`normal` leading (≈1.18) on a three-line block — that is tight leading at three
lines, exactly what HIG-T2 forbids. It also rejects reaching 74px legitimately by
dropping the note to `--text-xs` (11px): 24 + 19.5 + 16.5 + 16 = 76px still lands
on the same 80px rung after rounding, so shrinking the note would buy less
legible text for zero pixels. The 80px rung costs **+6px per noted row** against
what shipped — 90px across the 15 noted rows in the fixture, 0.107 VH at
390x844. That is a density cost paid deliberately to stop violating HIG-T2/C3,
and it is recorded rather than absorbed.

_(HIG-T2 as the binding fence; C3 for the 1.5 figure; DEN-2 for the ladder this
rung extends and for why it cannot simply be read off it; C4 for the 8px rhythm
and for not double-counting separation; HIG-A1/HIG-B1 unaffected — 80px clears
the 44px floor.)_

**C2 — Section header vertical budget.** A section header costs at most **32px
total**: a 13px/18px label (`--text-sm`, `--leading` 1.38) plus **8px** above and
**6px** below, and it never carries a subtitle, a description, or a divider of
its own. A group of **fewer than 3 rows must not get a header** — fold it into
the neighboring group. A surface may carry at most **5 section headers**.
_(HIG-LT3 REJECT of grouped footers/extra space; HIG-T1 Footnote 13/18)_

**C3 — Line heights.** Single-line row labels and values: **1.25**. Two-line
blocks: **1.35**. Any block of **3 or more lines**: **1.5** (`--leading-body`,
unchanged). Numeric headline: **1.1** (`--leading-tight`). Tight leading is
forbidden at 3+ lines. _(HIG-T1 Body 17/22=1.29, Caption 2 11/13=1.18; HIG-T2)_

**C4 — Vertical rhythm.** Inside a group: **0px** between rows (hairline only).
Between groups: **16px**. Between major sections: **24px**. **32px and above is
banned on mobile surfaces**; the 40/48/64/80px spacing tokens
(`--space-10`/`-12`/`-16`/`-20`) are desktop-only. Page bottom padding is
`calc(16px + var(--bottom-nav-height) + env(safe-area-inset-bottom))`.
_(HIG-L2; DEN-1; WK-1; WK-2)_

**C5 — Row vs card.** Use a **row** by default. A **card** is permitted only when
**all three** hold: the unit carries **3 or more distinct facts**, it is acted on
**as a whole**, and **no more than 3** of them appear on the surface. Any unit
that repeats **more than 3 times**, is homogeneous with its siblings, or is
scanned/compared down a column **must be a row**. Rationale to cite: a card
spends **16px top + 16px bottom padding + 12px inter-card gap = 44px** of chrome
per item against a row's **12 + 12 + 1px = 25px**, so each card costs about
**20px extra**; at 10 categories that is **~200px**, roughly a quarter of an
844pt viewport, bought with no added information. _(DEN-1; HIG-LT1)_

**C6 — Tabular numerals.** Every currency amount, percentage, count, and date
figure sets `font-variant-numeric: tabular-nums`. `slashed-zero` and
`oldstyle-nums` are forbidden. _(DEN-3; DEN-4)_

**C7 — Screen-one rule.** On 390x844 the budget answer — headline label, amount,
and its one-line qualifier — must be **fully visible without scrolling**, i.e.
within the first **~640px** of content once the top chrome
(`--topbar-height: 72px`), status bar, and safe-area top inset are subtracted.
_(HIG-L1; DEN-6: 57% of viewing time is above the fold)_

**C8 — Scroll budget.** The Budget surface with **8 categories** must render in
**<= 2532px** of total content height — three 844pt viewports — measured at
390px wide with the default text size. The current ~2-minute scroll (D1) is a
budget violation, not an aesthetic complaint. _(DEN-6: 74% of viewing time is in
the first two screenfuls; C1; C4; C5)_

**C9 — Skeleton reservation rule.** Any element whose content is not known at
first paint must **reserve its settled box before the data arrives**:

1. Reserve height with an explicit `min-height` in px equal to the settled line
   box (the budget headline block reserves **96px**: 18px label + 44px amount +
   18px qualifier + 2x8px gaps).
2. Render **only one of two states**: a reserved-height skeleton, or the settled
   value. A third, differently-worded provisional string
   (`$0 safe to spend` → `$0 planned spending`) is **forbidden** — that is D2.
3. The **label may never change identity** between renders; if the label depends
   on data, the label is part of the skeleton, not part of the placeholder.
4. Amounts use `tabular-nums` (C6) so digit-count changes cannot re-measure the
   line box.
5. Skeleton geometry **mimics the final layout** exactly — same row count, same
   heights.
6. Under **1 second** of expected wait, still reserve the box; you may skip the
   animated skeleton and show the reserved empty space. Never skip the
   reservation.
7. **Budget: zero unexpected layout shifts** on Home and Budget after hydration
   (measured via `PerformanceObserver` on `layout-shift`, ignoring entries with
   `hadRecentInput`). The public 0.1 CLS "good" threshold is the outer ceiling we
   must never approach, not the target.

_(CLS-1 ADOPT-as-ceiling; CLS-5; CLS-6; CLS-7; CLS-8 with the explicit REJECT of
"under 1 second needs no indicator")_

**C10 — Input font size.** Every focusable text input and textarea sets
`font-size: 1rem` (**16px**) or larger. `--text-sm` (13px) and `--text-xs` (11px)
are forbidden on inputs. Zoom-on-focus is treated as a layout-shift defect.
_(WK-6; HIG-T3 with the input-floor REJECT)_

**C11 — Viewport and safe areas.** `viewport-fit=cover` on the viewport meta.
App shell height uses **`100dvh`**, never `100vh`. The Fast Log sheet caps at
**`92svh`**. Every edge rule is written `max(<token>, env(safe-area-inset-*))`;
the bottom bar and floating action always add `env(safe-area-inset-bottom)`.
`-webkit-overflow-scrolling` is never added. _(WK-1; WK-2; WK-3; WK-5)_

**C12 — Inline vs sub-page.** Keep a section **inline** when it fits in **<= 6
rows** and **<= 400px**. Promote it to a **sub-page** when any of these hold: it
would exceed **400px** inline, it contains an **editing grid** (multiple inputs
per row), or it is opened **less than once per session**. A promoted section
leaves behind a **labeled 48px row** stating what is inside plus its current
summary value — never a bare chevron, never an unlabeled icon. _(HIG-LT2; NAV-6;
C1; C8)_

**C13 — Tab ordering principle.** The tab bar holds **4 destinations**
(3–5 permitted), ordered **left to right by expected open frequency**:
**Home → Budget → Activity → Plan**. It is **identical on every surface**,
labels are **always visible**, no tab is ever disabled, hidden, badged, or
minimized on scroll, and it is covered only by the Fast Log sheet. **Tabs are
destinations, never actions** — Fast Log stays a floating action, Account stays a
top-right toolbar control, because neither passes the "needs direct access from
anywhere as a place" test. _(HIG-TB1; HIG-TB2; HIG-TB3; HIG-TB4 REJECT; HIG-TB5
REJECT; NAV-1; NAV-2 REJECT; NAV-7)_

**C14 — Return path.** Every sub-page (Category Detail, Edit Budget, Manage
Categories, Plan Details, Benefits, Compare, Monthly Wrap) shows a **top toolbar
with the view title and exactly one back control**, at **44px minimum**, while
the tab bar stays unchanged below. No sub-page opens a second sheet on top of an
open sheet. _(HIG-NB1; NAV-3; NAV-5; HIG-S1; HIG-M1)_

---

## Source ledger

| Decision                      | Count  |
| ----------------------------- | ------ |
| ADOPT (unqualified)           | 34     |
| REJECT (unqualified)          | 4      |
| Mixed (explicit ADOPT+REJECT) | 17     |
| **Total source entries**      | **55** |

Unqualified REJECT: HIG-L5, HIG-TB4, HIG-TB5, NAV-2.

Mixed entries state an explicit ADOPT **and** an explicit REJECT on the same
source: HIG-T3, HIG-A1, HIG-A2, HIG-B1, HIG-LT3, HIG-S2, WK-1, WK-3, WK-5,
CLS-1, CLS-4, CLS-8, DEN-2, DEN-4, DEN-5, DEN-6, NAV-1.

Counting REJECT-bearing entries together (4 unqualified + 17 mixed = 21 of 55),
just under 40% of the evidence in this file was rejected in whole or in part —
mostly guidance written for consumer-acquisition apps. No source in this file is
quoted without a decision.

## Known gaps and residual risk

- **No Apple primary source exists for the 16px input zoom threshold** (WK-6).
  The rule is adopted on secondary evidence plus the frozen mission constraint;
  it is observable but undocumented by Apple.
- **Material Design 3's live navigation-bar page is client-rendered** and could
  not be fetched as text; the 3–5 destination rule and the icons-only-at-4-5 rule
  were read from Material's server-rendered original
  (`m1.material.io`), which states the same guidance. Treat the Material 3 URL as
  corroboration, not as the quoted text.
- **iOS system-app row heights (Settings, Health, Wallet) are not published as
  numbers.** DEN-7 asserts the structural pattern (row hierarchies with detail
  pages), not specific pixel values; the numeric row ladder in C1 comes from
  Carbon (DEN-2) bounded by Apple's 44pt control floor (HIG-A1).
- **HIG content is versioned to the current Liquid Glass era** and mentions
  material and scroll-edge treatments this app does not use; those claims were
  read but not adopted, since a two-user web app cannot render Liquid Glass.
- **The FAA guidance is from 2001** (DEN-5) and its numeric density metric was
  rejected for that reason; only its qualitative principles were adopted.

import { describe, expect, it } from "vitest";
import {
  auditUiTokens,
  componentStyleNames,
  type UiTokenAuditInput,
} from "./ui-token-audit";

const globalSource = `
:root {
  --color-paper-50: paper;
  --space-0: 0;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --control-sm: 44px;
  --control-md: 48px;
  --control-lg: 56px;
  --data-blue: blue;
}
`;

function input(componentSource: string): UiTokenAuditInput {
  return {
    global: { file: "globals.css", source: globalSource },
    media: {
      file: "media-queries.css",
      source: "@custom-media --viewport-compact (max-width: 720px);",
    },
    components: [{ file: "surface.module.css", source: componentSource }],
    authoredUi: [],
    categoryColors: ["blue"],
    pwaBackgroundColor: "paper",
  };
}

describe("UI token audit", () => {
  it("accepts canonical declarations and centralized media aliases", () => {
    const result = auditUiTokens(
      input(`
        .surface { width: var(--control-md); }
        @media (--viewport-compact) {
          .surface { padding: var(--space-2); }
        }
      `),
    );

    expect(result.failures).toEqual([]);
  });

  it.each([
    ["raw sizes", ".surface { width: 13px; }", "raw size 13px"],
    ["character sizes", ".surface { width: 18ch; }", "raw size 18ch"],
    ["viewport sizes", ".surface { height: 90dvh; }", "raw size 90dvh"],
    ["container sizes", ".surface { width: 50cqw; }", "raw size 50cqw"],
    ["logical viewport sizes", ".surface { width: 1vi; }", "raw size 1vi"],
    ["dynamic block sizes", ".surface { height: 1dvb; }", "raw size 1dvb"],
    ["root cap sizes", ".surface { width: 1rcap; }", "raw size 1rcap"],
    ["exponential sizes", ".surface { width: 1e2px; }", "raw size 1e2px"],
    ["escaped size units", ".surface { width: 1p\\78; }", "raw size 1px"],
    ["comment-spliced sizes", ".surface { width: 1/**/px; }", "raw size 1px"],
    ["raw colors", ".surface { color: #123456; }", "raw color #123456"],
    [
      "modern colors",
      ".surface { color: oklch(50% 0.2 30); }",
      "raw color oklch(...)",
    ],
    [
      "wide-gamut colors",
      ".surface { color: color(display-p3 1 0 0); }",
      "raw color color(...)",
    ],
    [
      "named colors",
      ".surface { color: rebeccapurple; }",
      "raw color rebeccapurple",
    ],
    [
      "system colors",
      ".surface { color: CanvasText; }",
      "raw color CanvasText",
    ],
    [
      "deprecated system colors",
      ".surface { color: WindowText; }",
      "raw color WindowText",
    ],
    [
      "transparent colors",
      ".surface { background: transparent; }",
      "raw color transparent",
    ],
    ["escaped named colors", ".surface { color: r\\65 d; }", "raw color red"],
    [
      "comment-spliced named colors",
      ".surface { color: r/**/ed; }",
      "raw color red",
    ],
    [
      "escaped color functions",
      ".surface { color: r\\67 b(1 2 3); }",
      "raw color rgb(...)",
    ],
    [
      "comment-spliced color functions",
      ".surface { color: rgb/**/(1 2 3); }",
      "raw color rgb(...)",
    ],
    [
      "local token authorities",
      ".surface { --local-gap: var(--space-2); }",
      "component styles cannot define token authority --local-gap",
    ],
    [
      "escaped local token authorities",
      ".surface { \\2d\\2d local-gap: var(--space-2); }",
      "component styles cannot define token authority --local-gap",
    ],
    [
      "unknown references",
      ".surface { gap: var(--missing); }",
      "unknown token reference --missing",
    ],
    [
      "escaped unknown references",
      ".surface { gap: var(--m\\69 ssing); }",
      "unknown token reference --missing",
    ],
    [
      "spaced unknown references",
      ".surface { gap: var( --missing); }",
      "unknown token reference --missing",
    ],
    [
      "commented unknown references",
      ".surface { gap: var(/**/--missing); }",
      "unknown token reference --missing",
    ],
    [
      "escaped var functions",
      ".surface { gap: v\\61 r( --missing); }",
      "unknown token reference --missing",
    ],
    [
      "numeric prefixes adjoining var",
      ".surface { padding: 2var (--space-2); }",
      "invalid CSS dimension 2var",
    ],
    [
      "signed var functions",
      ".surface { margin: -var(--space-2); }",
      "invalid CSS variable function -var(...)",
    ],
    [
      "comment-separated signed var functions",
      ".surface { margin: - /**/ var(--space-2); }",
      "invalid CSS variable function - var(...)",
    ],
    [
      "whitespace-separated signed var functions",
      ".surface { margin: + \n var(--space-2); }",
      "invalid CSS variable function + var(...)",
    ],
    [
      "separated dimensions",
      ".surface { margin: 1 px; }",
      "invalid separated CSS dimension 1 px",
    ],
    [
      "empty var functions",
      ".surface { margin: var(); }",
      "invalid CSS variable function var(...)",
    ],
    [
      "non-custom var names",
      ".surface { margin: var(space-2); }",
      "invalid CSS variable function var(...)",
    ],
    [
      "junk var arguments",
      ".surface { margin: var(--space-2 junk); }",
      "invalid CSS variable function var(...)",
    ],
    [
      "raw media sizes",
      "@media (max-width: 720px) { .surface { display: block; } }",
      "raw size 720px in @media",
    ],
    [
      "logical media sizes",
      "@supports (width: 1vi) { .surface { display: block; } }",
      "raw size 1vi in @supports",
    ],
    [
      "comment-spliced at-rule sizes",
      "@supports (width: 1/**/px) { .surface { display: block; } }",
      "raw size 1px in @supports",
    ],
    [
      "invalid at-rule dimensions",
      "@supports (width: 2var (--space-2)) { .surface { display: block; } }",
      "invalid CSS dimension 2var in @supports",
    ],
    [
      "invalid at-rule var functions",
      "@supports (width: -var(--space-2)) { .surface { display: block; } }",
      "invalid CSS variable function -var(...) in @supports",
    ],
    [
      "comment-separated at-rule var functions",
      "@supports (width: - /**/ var(--space-2)) { .surface { display: block; } }",
      "invalid CSS variable function - var(...) in @supports",
    ],
    [
      "at-rule colors",
      "@supports (color: red) { .surface { display: block; } }",
      "raw color red in @supports",
    ],
    [
      "escaped at-rule colors",
      "@supports (color: r\\65 d) { .surface { display: block; } }",
      "raw color red in @supports",
    ],
    [
      "comment-spliced at-rule colors",
      "@supports (color: r/**/ed) { .surface { display: block; } }",
      "raw color red in @supports",
    ],
    [
      "unknown at-rule references",
      "@supports (color: var(--m\\69 ssing)) { .surface { display: block; } }",
      "unknown token reference --missing",
    ],
    [
      "commented at-rule references",
      "@supports (color: var(/**/--missing)) { .surface { display: block; } }",
      "unknown token reference --missing",
    ],
    [
      "unknown media aliases",
      "@media (--missing) { .surface { display: block; } }",
      "unknown custom media --missing",
    ],
    [
      "non-alias media queries",
      "@media (orientation: landscape) { .surface { display: block; } }",
      "must contain exactly one canonical custom-media alias",
    ],
    [
      "compound media queries",
      "@media screen and (--viewport-compact) { .surface { display: block; } }",
      "must contain exactly one canonical custom-media alias",
    ],
    [
      "case-variant media queries",
      "@MEDIA (orientation: landscape) { .surface { display: block; } }",
      "must contain exactly one canonical custom-media alias",
    ],
    [
      "escaped media queries",
      "@m\\65 dia (orientation: landscape) { .surface { display: block; } }",
      "escaped @m syntax is outside the canonical at-rule contract",
    ],
  ])("rejects %s", (_name, source, expected) => {
    expect(auditUiTokens(input(source)).failures).toContainEqual(
      expect.stringContaining(expected),
    );
  });

  it("fails closed on malformed CSS", () => {
    expect(
      auditUiTokens(input(".surface { width: var(--control-md);")).failures,
    ).toContainEqual(expect.stringContaining("invalid CSS"));
  });

  it("preserves comment markers inside quoted strings", () => {
    expect(
      auditUiTokens(input('.surface { content: "r/**/ed 1/**/px"; }')).failures,
    ).toEqual([]);
  });

  it("includes nested component modules in recursive discovery results", () => {
    expect(
      componentStyleNames([
        "surface.module.css",
        "nested/panel.module.css",
        "nested/panel.css",
      ]),
    ).toEqual(["surface.module.css", "nested/panel.module.css"]);
  });
});

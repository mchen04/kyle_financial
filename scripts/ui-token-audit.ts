import { parse, type Root } from "postcss";
import colorNames from "color-name";
import valueParser from "postcss-value-parser";

export interface UiSource {
  file: string;
  source: string;
}

export interface UiTokenAuditInput {
  global: UiSource;
  media: UiSource;
  components: readonly UiSource[];
  authoredUi: readonly UiSource[];
  categoryColors: readonly string[];
  pwaBackgroundColor: string;
}

export interface UiTokenAuditResult {
  failures: string[];
  tokenCount: number;
}

const rawAuthoredColorPattern =
  /#[0-9a-f]{3,8}\b|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark|contrast-color|device-cmyk)\([^)]*\)/gi;
const customMediaReferencePattern = /^\(\s*(--[a-z0-9-]+)\s*\)$/i;
const cssLengthUnits = new Set([
  "cap",
  "ch",
  "cm",
  "cqb",
  "cqh",
  "cqi",
  "cqmax",
  "cqmin",
  "cqw",
  "dvb",
  "dvh",
  "dvi",
  "dvmax",
  "dvmin",
  "dvw",
  "em",
  "ex",
  "ic",
  "in",
  "lh",
  "lvb",
  "lvh",
  "lvi",
  "lvmax",
  "lvmin",
  "lvw",
  "mm",
  "pc",
  "pt",
  "px",
  "q",
  "rcap",
  "rch",
  "rem",
  "rex",
  "ric",
  "rlh",
  "svb",
  "svh",
  "svi",
  "svmax",
  "svmin",
  "svw",
  "vb",
  "vh",
  "vi",
  "vmax",
  "vmin",
  "vw",
]);
const cssDimensionUnits = new Set([
  ...cssLengthUnits,
  "%",
  "deg",
  "dpcm",
  "dpi",
  "dppx",
  "fr",
  "grad",
  "hz",
  "khz",
  "ms",
  "rad",
  "s",
  "turn",
  "x",
]);
const cssColorFunctions = new Set([
  "color",
  "color-contrast",
  "color-mix",
  "contrast-color",
  "device-cmyk",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "light-dark",
  "oklab",
  "oklch",
  "rgb",
  "rgba",
]);
const cssSystemColors = [
  "accentcolor",
  "accentcolortext",
  "activetext",
  "buttonborder",
  "buttonface",
  "buttontext",
  "canvas",
  "canvastext",
  "field",
  "fieldtext",
  "graytext",
  "highlight",
  "highlighttext",
  "linktext",
  "mark",
  "marktext",
  "selecteditem",
  "selecteditemtext",
  "visitedtext",
];
const cssDeprecatedSystemColors = [
  "activeborder",
  "activecaption",
  "appworkspace",
  "background",
  "buttonhighlight",
  "buttonshadow",
  "captiontext",
  "inactiveborder",
  "inactivecaption",
  "inactivecaptiontext",
  "infobackground",
  "infotext",
  "menu",
  "menutext",
  "scrollbar",
  "threedarkshadow",
  "threedface",
  "threedhighlight",
  "threedlightshadow",
  "threedshadow",
  "window",
  "windowframe",
  "windowtext",
];
const cssNamedColors = new Set([
  ...Object.keys(colorNames).map((name) => name.toLowerCase()),
  ...cssSystemColors,
  ...cssDeprecatedSystemColors,
  "currentcolor",
  "transparent",
]);

function decodeCssEscapes(value: string): string {
  return value.replace(
    /\\([0-9a-f]{1,6})(?:\r\n|[ \n\r\t\f])?|\\([^\n\r\f0-9a-f])/gi,
    (_match, hexadecimal: string | undefined, escaped: string | undefined) =>
      hexadecimal
        ? String.fromCodePoint(
            Math.min(Number.parseInt(hexadecimal, 16), 0x10ffff),
          )
        : (escaped ?? ""),
  );
}

function stripCssComments(value: string): string {
  let normalized = "";
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      normalized += character;
      if (character === "\\" && index + 1 < value.length)
        normalized += value[++index];
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      normalized += character;
      continue;
    }
    if (character === "\\" && index + 1 < value.length) {
      normalized += character + value[++index];
      continue;
    }
    if (character === "/" && value[index + 1] === "*") {
      const end = value.indexOf("*/", index + 2);
      if (end < 0) return normalized;
      index = end + 1;
      continue;
    }
    normalized += character;
  }
  return normalized;
}

function normalizedCssValue(value: string): string {
  return decodeCssEscapes(stripCssComments(value));
}

function normalizedCssIdentifier(value: string): string {
  return decodeCssEscapes(value).toLowerCase();
}

function normalizedDeclarationProperty(value: string): string {
  const decoded = decodeCssEscapes(value);
  return decoded.startsWith("--") ? decoded : decoded.toLowerCase();
}

function tokenReferences(value: string): string[] {
  const references: string[] = [];
  valueParser(normalizedCssValue(value)).walk((node) => {
    if (
      node.type !== "function" ||
      normalizedCssIdentifier(node.value) !== "var"
    )
      return;
    const token = node.nodes.find(
      (child) => child.type !== "comment" && child.type !== "space",
    );
    if (token?.type === "word" && token.value.startsWith("--"))
      references.push(token.value);
  });
  return references;
}

function dimensionUnit(value: string): string | undefined {
  return value.match(
    /^[+-]?(?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?([a-z]+|%)$/i,
  )?.[1];
}

function firstRawLength(value: string): string | undefined {
  let raw: string | undefined;
  valueParser(normalizedCssValue(value)).walk((node) => {
    if (node.type !== "word") return;
    const unit = dimensionUnit(node.value);
    if (!unit || !cssLengthUnits.has(normalizedCssIdentifier(unit))) return;
    raw = node.value;
    return false;
  });
  return raw;
}

function firstInvalidDimension(value: string): string | undefined {
  let invalid: string | undefined;
  valueParser(normalizedCssValue(value)).walk((node) => {
    if (node.type !== "word") return;
    const unit = dimensionUnit(node.value);
    if (!unit || cssDimensionUnits.has(normalizedCssIdentifier(unit))) return;
    invalid = node.value;
    return false;
  });
  return invalid;
}

function firstSeparatedDimension(value: string): string | undefined {
  let invalid: string | undefined;
  valueParser(normalizedCssValue(value)).walk((node, index, nodes) => {
    if (
      invalid ||
      node.type !== "word" ||
      !/^[+-]?(?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?$/i.test(node.value)
    )
      return;
    let nextIndex = index + 1;
    let separated = false;
    while (
      nodes[nextIndex]?.type === "space" ||
      nodes[nextIndex]?.type === "comment"
    ) {
      separated = true;
      nextIndex += 1;
    }
    const unit = nodes[nextIndex];
    if (
      separated &&
      unit?.type === "word" &&
      cssDimensionUnits.has(normalizedCssIdentifier(unit.value))
    )
      invalid = `${node.value} ${unit.value}`;
  });
  return invalid;
}

function firstInvalidVariableFunction(value: string): string | undefined {
  let invalid: string | undefined;
  valueParser(normalizedCssValue(value)).walk((node) => {
    if (invalid || node.type !== "function") return;
    const name = normalizedCssIdentifier(node.value);
    if (name === "-var" || name === "+var") {
      invalid = `${node.value}(...)`;
      return;
    }
    if (name !== "var") return;
    const significant = node.nodes.filter(
      (child) => child.type !== "comment" && child.type !== "space",
    );
    const token = significant[0];
    const separator = significant[1];
    if (
      token?.type !== "word" ||
      !token.value.startsWith("--") ||
      token.value.length === 2 ||
      (separator !== undefined &&
        (separator.type !== "div" || separator.value !== ","))
    )
      invalid = "var(...)";
  });
  if (invalid) return invalid;

  valueParser(normalizedCssValue(value)).walk((node, index, nodes) => {
    if (
      invalid ||
      node.type !== "word" ||
      (node.value !== "-" && node.value !== "+")
    )
      return;
    let nextIndex = index + 1;
    while (
      nodes[nextIndex]?.type === "space" ||
      nodes[nextIndex]?.type === "comment"
    )
      nextIndex += 1;
    let previousIndex = index - 1;
    while (
      nodes[previousIndex]?.type === "space" ||
      nodes[previousIndex]?.type === "comment"
    )
      previousIndex -= 1;
    const previous = nodes[previousIndex];
    const next = nodes[nextIndex];
    if (
      next?.type === "function" &&
      normalizedCssIdentifier(next.value) === "var" &&
      (previous === undefined ||
        previous.type === "div" ||
        (previous.type === "word" && /^[+\-*/]$/.test(previous.value)))
    )
      invalid = `${node.value} var(...)`;
  });
  return invalid;
}

function firstRawColor(value: string): string | undefined {
  let raw: string | undefined;
  valueParser(normalizedCssValue(value)).walk((node) => {
    if (
      node.type === "function" &&
      cssColorFunctions.has(normalizedCssIdentifier(node.value))
    ) {
      raw = `${node.value}(...)`;
      return false;
    }
    if (
      node.type === "word" &&
      (/^#[0-9a-f]{3,8}$/i.test(node.value) ||
        cssNamedColors.has(normalizedCssIdentifier(node.value)))
    ) {
      raw = node.value;
      return false;
    }
  });
  return raw;
}

export function componentStyleNames(
  relativeNames: readonly string[],
): string[] {
  return relativeNames.filter((name) => name.endsWith(".module.css"));
}

const requiredValues = new Map([
  ["--space-0", "0"],
  ["--space-1", "4px"],
  ["--space-2", "8px"],
  ["--space-3", "12px"],
  ["--space-4", "16px"],
  ["--space-6", "24px"],
  ["--space-8", "32px"],
  ["--control-sm", "44px"],
  ["--control-md", "48px"],
  ["--control-lg", "56px"],
]);

function parseStylesheet(source: UiSource, failures: string[]): Root | null {
  try {
    return parse(source.source, { from: source.file });
  } catch (error) {
    failures.push(
      `${source.file}: invalid CSS: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

export function auditUiTokens({
  global,
  media,
  components,
  authoredUi,
  categoryColors,
  pwaBackgroundColor,
}: UiTokenAuditInput): UiTokenAuditResult {
  const failures: string[] = [];
  const definitions = new Map<string, { file: string; value: string }>();
  const customMedia = new Map<string, string>();
  const stylesheets = [global, media, ...components].flatMap((source) => {
    const root = parseStylesheet(source, failures);
    return root ? [{ ...source, root }] : [];
  });

  for (const { file, root } of stylesheets) {
    root.walkDecls((declaration) => {
      const property = normalizedDeclarationProperty(declaration.prop);
      if (!property.startsWith("--")) return;
      if (file !== global.file) {
        failures.push(
          `${file}: component styles cannot define token authority ${property}`,
        );
      }
      const existing = definitions.get(property);
      if (existing) {
        failures.push(
          `${file}: duplicate token ${property}; first defined in ${existing.file}`,
        );
        return;
      }
      definitions.set(property, {
        file,
        value: declaration.value.trim(),
      });
    });
    root.walkAtRules((atRule) => {
      if (atRule.name.toLowerCase() !== "custom-media") return;
      const name = atRule.params.trim().split(/\s+/, 1)[0];
      if (file !== media.file) {
        failures.push(
          `${file}: custom media ${name} is outside the media-query authority`,
        );
      }
      const existing = customMedia.get(name);
      if (existing) {
        failures.push(
          `${file}: duplicate custom media ${name}; first defined in ${existing}`,
        );
      } else {
        customMedia.set(name, file);
      }
    });
  }

  for (const { file, source } of authoredUi) {
    for (const match of source.matchAll(rawAuthoredColorPattern)) {
      failures.push(`${file}: raw authored UI color ${match[0]}`);
    }
  }

  if (definitions.get("--color-paper-50")?.value !== pwaBackgroundColor) {
    failures.push(
      `${global.file}: --color-paper-50 must match the PWA background registry`,
    );
  }

  for (const { file, root } of stylesheets) {
    root.walkDecls((declaration) => {
      const property = normalizedDeclarationProperty(declaration.prop);
      if (!property.startsWith("--") && file !== global.file) {
        const rawColor = firstRawColor(declaration.value);
        if (rawColor) {
          failures.push(
            `${file}: raw color ${rawColor} is outside the primitive registry`,
          );
        }
        const invalidDimension = firstInvalidDimension(declaration.value);
        if (invalidDimension) {
          failures.push(
            `${file}: invalid CSS dimension ${invalidDimension} in ${property}`,
          );
        }
        const separatedDimension = firstSeparatedDimension(declaration.value);
        if (separatedDimension) {
          failures.push(
            `${file}: invalid separated CSS dimension ${separatedDimension} in ${property}`,
          );
        }
        const invalidVariable = firstInvalidVariableFunction(declaration.value);
        if (invalidVariable) {
          failures.push(
            `${file}: invalid CSS variable function ${invalidVariable} in ${property}`,
          );
        }
        const rawSize = firstRawLength(declaration.value);
        if (rawSize) {
          failures.push(
            `${file}: raw size ${rawSize} in ${property}; use the canonical size, type, or component-role scale`,
          );
        }
      }
      for (const reference of tokenReferences(declaration.value)) {
        if (!definitions.has(reference)) {
          failures.push(`${file}: unknown token reference ${reference}`);
        }
      }
    });
    root.walkAtRules((atRule) => {
      const normalizedName = normalizedCssIdentifier(atRule.name);
      if (
        file !== global.file &&
        file !== media.file &&
        (atRule.name.includes("\\") || atRule.params.includes("\\"))
      ) {
        failures.push(
          `${file}: escaped @${atRule.name} syntax is outside the canonical at-rule contract`,
        );
      }
      if (file !== global.file && file !== media.file) {
        const rawColor = firstRawColor(atRule.params);
        if (rawColor) {
          failures.push(
            `${file}: raw color ${rawColor} in @${atRule.name} is outside the primitive registry`,
          );
        }
        const invalidDimension = firstInvalidDimension(atRule.params);
        if (invalidDimension) {
          failures.push(
            `${file}: invalid CSS dimension ${invalidDimension} in @${atRule.name}`,
          );
        }
        const separatedDimension = firstSeparatedDimension(atRule.params);
        if (separatedDimension) {
          failures.push(
            `${file}: invalid separated CSS dimension ${separatedDimension} in @${atRule.name}`,
          );
        }
        const invalidVariable = firstInvalidVariableFunction(atRule.params);
        if (invalidVariable) {
          failures.push(
            `${file}: invalid CSS variable function ${invalidVariable} in @${atRule.name}`,
          );
        }
        const rawSize = firstRawLength(atRule.params);
        if (rawSize) {
          failures.push(
            `${file}: raw size ${rawSize} in @${atRule.name}; use the canonical media-query authority`,
          );
        }
        for (const reference of tokenReferences(atRule.params)) {
          if (!definitions.has(reference)) {
            failures.push(`${file}: unknown token reference ${reference}`);
          }
        }
      }
      if (
        normalizedName === "media" &&
        file !== global.file &&
        file !== media.file
      ) {
        const reference = atRule.params.match(customMediaReferencePattern)?.[1];
        if (!reference) {
          failures.push(
            `${file}: component @media must contain exactly one canonical custom-media alias`,
          );
        } else if (!customMedia.has(reference)) {
          failures.push(`${file}: unknown custom media ${reference}`);
        }
      }
    });
  }

  for (const [token, value] of requiredValues) {
    if (definitions.get(token)?.value !== value) {
      failures.push(`${global.file}: ${token} must remain ${value}`);
    }
  }

  for (const color of categoryColors) {
    if (!definitions.has(`--data-${color}`)) {
      failures.push(
        `${global.file}: category color ${color} has no data token`,
      );
    }
  }

  return { failures, tokenCount: definitions.size };
}

import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { CATEGORY_COLOR_TOKENS } from "../src/domain/budget.ts";
import { PWA_BACKGROUND_COLOR } from "../src/domain/ui-tokens.ts";
import { auditUiTokens, auditedStylesheetNames } from "./ui-token-audit.ts";

const sourceDirectory = resolve("src");
const globalPath = resolve("src/app/globals.css");
const mediaPath = resolve("src/app/media-queries.css");
const colorRegistryPath = resolve("src/domain/ui-tokens.ts");

const sourceNames = await readdir(sourceDirectory, { recursive: true });
const componentFiles = auditedStylesheetNames(sourceNames)
  .map((name) => resolve(sourceDirectory, name))
  .filter((file) => file !== globalPath && file !== mediaPath);
const authoredUiFiles = sourceNames
  .filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"))
  .map((name) => resolve(sourceDirectory, name));

const readSources = async (paths) =>
  Promise.all(
    paths.map(async (file) => ({ file, source: await readFile(file, "utf8") })),
  );
const [global] = await readSources([globalPath]);
const [media] = await readSources([mediaPath]);
const result = auditUiTokens({
  global,
  media,
  components: await readSources(componentFiles),
  authoredUi: await readSources(authoredUiFiles),
  categoryColors: CATEGORY_COLOR_TOKENS,
  pwaBackgroundColor: PWA_BACKGROUND_COLOR,
  colorRegistryFile: colorRegistryPath,
});

if (result.failures.length > 0) {
  console.error(result.failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `UI token audit passed: ${result.tokenCount} canonical tokens across ${componentFiles.length + 2} stylesheets and ${authoredUiFiles.length} authored modules, no raw colors or sizes, no unknown references.`,
  );
}

import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { CATEGORY_COLOR_TOKENS } from "../src/domain/budget.ts";
import { PWA_BACKGROUND_COLOR } from "../src/domain/ui-tokens.ts";
import { auditUiTokens, componentStyleNames } from "./ui-token-audit.ts";

const componentDirectory = resolve("src/components");
const globalPath = resolve("src/app/globals.css");
const mediaPath = resolve("src/app/media-queries.css");
const componentFiles = componentStyleNames(
  await readdir(componentDirectory, { recursive: true }),
).map((name) => resolve(componentDirectory, name));
const authoredUiFiles = (await readdir(resolve("src"), { recursive: true }))
  .filter(
    (name) =>
      (name.endsWith(".ts") || name.endsWith(".tsx")) &&
      (name.startsWith("app/") || name.startsWith("components/")),
  )
  .map((name) => resolve("src", name));
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
});

if (result.failures.length > 0) {
  console.error(result.failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `UI token audit passed: ${result.tokenCount} canonical tokens, no raw component colors or sizes, no unknown references.`,
  );
}

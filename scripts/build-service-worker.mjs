import { mkdir, readFile, writeFile } from "node:fs/promises";
import prettier from "prettier";
import ts from "typescript";

const sourcePath = new URL(
  "../src/pwa/service-worker-runtime.ts",
  import.meta.url,
);
const outputPath = new URL("../public/sw-runtime.js", import.meta.url);
const source = await readFile(sourcePath, "utf8");
const { outputText, diagnostics } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    removeComments: true,
  },
  fileName: "service-worker-runtime.ts",
  reportDiagnostics: true,
});

if (diagnostics?.length) {
  throw new Error(
    diagnostics
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      )
      .join("\n"),
  );
}

await mkdir(new URL("../public/", import.meta.url), { recursive: true });
await writeFile(
  outputPath,
  await prettier.format(outputText, { parser: "babel" }),
);

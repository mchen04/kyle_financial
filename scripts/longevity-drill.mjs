import { execFile } from "node:child_process";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const repository = new URL("../", import.meta.url);
const tables = new URL("../src/domain/tax/tables/", import.meta.url);
const generatedRegistry = new URL(
  "../src/domain/tax/table-registry.generated.ts",
  import.meta.url,
);
const generator = new URL("./build-tax-table-registry.mjs", import.meta.url);
const tableFiles = await readdir(tables);
const sourceYear = Math.max(
  ...tableFiles.flatMap((fileName) => {
    const match = /^(\d{4})\.federal\.json$/.exec(fileName);
    return match ? [Number(match[1])] : [];
  }),
);
if (!Number.isFinite(sourceYear)) throw new Error("No source tax year found");
const fakeYear = sourceYear + 1;
const futureYear = fakeYear + 1;
const fakeFederal = new URL(`${fakeYear}.federal.json`, tables);
const fakeStates = new URL(`${fakeYear}.states.json`, tables);

async function copyAsFakeYear(kind, destination) {
  const source = JSON.parse(
    await readFile(new URL(`${sourceYear}.${kind}.json`, tables), "utf8"),
  );
  await writeFile(
    destination,
    `${JSON.stringify({ ...source, year: fakeYear })}\n`,
  );
}

try {
  await copyAsFakeYear("federal", fakeFederal);
  await copyAsFakeYear("states", fakeStates);
  await run(process.execPath, [generator.pathname], {
    cwd: repository.pathname,
  });

  const generated = await readFile(generatedRegistry, "utf8");
  if (!generated.includes(`from "./tables/${fakeYear}.federal.json"`)) {
    throw new Error(
      `The generated registry did not discover federal ${fakeYear}`,
    );
  }
  if (!generated.includes(`from "./tables/${fakeYear}.states.json"`)) {
    throw new Error(
      `The generated registry did not discover states ${fakeYear}`,
    );
  }

  await run("pnpm", ["exec", "vitest", "run", "src/domain/tax"], {
    cwd: repository.pathname,
  });

  const evaluation = await run(
    "pnpm",
    [
      "exec",
      "tsx",
      "-e",
      `import { selectTaxTable } from "./src/domain/tax/table-registry"; const exact = selectTaxTable(${fakeYear}); const fallback = selectTaxTable(${futureYear}); console.log(JSON.stringify({ exact: [exact.appliedYear, exact.isFallback], fallback: [fallback.appliedYear, fallback.isFallback] }));`,
    ],
    { cwd: repository.pathname },
  );
  const result = JSON.parse(evaluation.stdout.trim());
  if (
    JSON.stringify(result) !==
    JSON.stringify({
      exact: [fakeYear, false],
      fallback: [fakeYear, true],
    })
  ) {
    throw new Error(`Unexpected table selection: ${JSON.stringify(result)}`);
  }
  console.log(
    `PASS: ${fakeYear} was discovered from data files; ${futureYear} fell back visibly to ${fakeYear}.`,
  );
} finally {
  await Promise.all([
    rm(fakeFederal, { force: true }),
    rm(fakeStates, { force: true }),
  ]);
  await run(process.execPath, [generator.pathname], {
    cwd: repository.pathname,
  });
}

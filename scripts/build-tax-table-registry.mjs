import { readdir, readFile, writeFile } from "node:fs/promises";
import prettier from "prettier";

const tablesDirectory = new URL("../src/domain/tax/tables/", import.meta.url);
const outputPath = new URL(
  "../src/domain/tax/table-registry.generated.ts",
  import.meta.url,
);
const fileNames = await readdir(tablesDirectory);
const years = [
  ...new Set(
    fileNames.flatMap((fileName) => {
      const match = /^(\d{4})\.(federal|states)\.json$/.exec(fileName);
      return match ? [Number(match[1])] : [];
    }),
  ),
].toSorted((left, right) => left - right);

if (years.length === 0) throw new Error("No tax table files were found");

for (const year of years) {
  for (const kind of ["federal", "states"]) {
    const fileName = `${year}.${kind}.json`;
    if (!fileNames.includes(fileName)) {
      throw new Error(`Tax year ${year} is missing ${fileName}`);
    }
    const table = JSON.parse(
      await readFile(new URL(fileName, tablesDirectory), "utf8"),
    );
    if (table.year !== year) {
      throw new Error(`${fileName} declares year ${String(table.year)}`);
    }
  }
}

const imports = years.flatMap((year) => [
  `import federal${year} from "./tables/${year}.federal.json";`,
  `import states${year} from "./tables/${year}.states.json";`,
]);
const entries = years.map(
  (year) =>
    `${year}: taxTableSchema.parse({ ...federal${year}, states: states${year}.states }),`,
);
const source = [
  ...imports,
  'import { taxTableSchema } from "./table-schema";',
  'import type { TaxTable } from "./types";',
  "",
  "export const GENERATED_TAX_TABLES = {",
  ...entries,
  "} satisfies Record<number, TaxTable>;",
  "",
].join("\n");

await writeFile(
  outputPath,
  await prettier.format(source, { parser: "typescript" }),
);

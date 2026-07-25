import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const migrationsDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
);

function checksum(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

export async function migrate(databaseUrl: string): Promise<string[]> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
  const applied: string[] = [];
  try {
    await sql`SELECT pg_advisory_lock(873421590)`;
    await sql`
      CREATE TABLE IF NOT EXISTS app_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`ALTER TABLE app_migrations ADD COLUMN IF NOT EXISTS checksum text`;
    const files = (await readdir(migrationsDirectory))
      .filter((name) => /^\d+_.+\.sql$/.test(name))
      .sort();
    const existing = await sql<{ name: string; checksum: string | null }[]>`
      SELECT name, checksum FROM app_migrations
    `;
    const known = new Map(existing.map((row) => [row.name, row.checksum]));

    // A ledger entry with no file means a migration was renamed or removed.
    // Under name-keyed bookkeeping a rename re-runs the migration under its new
    // name, which for anything not idempotent is data loss.
    const orphaned = [...known.keys()]
      .filter((name) => !files.includes(name))
      .sort();
    if (orphaned.length > 0) {
      throw new Error(
        `Applied migrations have no file: ${orphaned.join(", ")}. Applied migrations are immutable; restore the file rather than renaming or deleting it.`,
      );
    }
    // There is deliberately no out-of-order guard. A file that sorts before the
    // highest applied migration is indistinguishable, by name alone, from an
    // older migration being re-applied on purpose after its ledger row was
    // removed — which is a supported repair path. Checksums catch the case that
    // actually diverges environments: an applied migration whose content moved.
    for (const file of files) {
      const body = await readFile(resolve(migrationsDirectory, file), "utf8");
      const digest = checksum(body);
      if (known.has(file)) {
        const recorded = known.get(file);
        if (recorded === null) {
          // Ledgers written before checksums existed adopt the current file as
          // their baseline; every later edit is caught.
          await sql`
            UPDATE app_migrations SET checksum = ${digest} WHERE name = ${file}
          `;
        } else if (recorded !== digest) {
          throw new Error(
            `Migration ${file} changed after it was applied. Applied migrations are immutable; add a new forward migration instead.`,
          );
        }
        continue;
      }
      await sql.begin(async (transaction) => {
        await transaction.unsafe(body);
        await transaction`
          INSERT INTO app_migrations (name, checksum) VALUES (${file}, ${digest})
        `;
      });
      applied.push(file);
    }
    return applied;
  } finally {
    await sql`SELECT pg_advisory_unlock(873421590)`.catch(() => undefined);
    await sql.end();
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const applied = await migrate(databaseUrl);
  console.log(
    applied.length ? `Applied: ${applied.join(", ")}` : "Database is current",
  );
}

if (
  process.argv[1] &&
  /scripts[/\\]migrate\.ts$/.test(resolve(process.argv[1]))
) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Migration failed");
    process.exitCode = 1;
  });
}

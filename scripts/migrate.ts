import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

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
    const files = (await readdir(resolve("migrations")))
      .filter((name) => /^\d+_.+\.sql$/.test(name))
      .sort();
    const existing = await sql<
      { name: string }[]
    >`SELECT name FROM app_migrations`;
    const known = new Set(existing.map(({ name }) => name));

    for (const file of files) {
      if (known.has(file)) continue;
      const body = await readFile(resolve("migrations", file), "utf8");
      await sql.begin(async (transaction) => {
        await transaction.unsafe(body);
        await transaction`INSERT INTO app_migrations (name) VALUES (${file})`;
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

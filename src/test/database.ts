import postgres, { type Sql } from "postgres";
import { randomUUID } from "node:crypto";
import { migrate } from "../../scripts/migrate";

function baseTestDatabaseUrl(): string {
  const value =
    process.env.TEST_DATABASE_URL ??
    "postgresql://michaelchen@localhost:5432/kyle_financial_test";
  const name = new URL(value).pathname.slice(1);
  if (!name.endsWith("_test")) {
    throw new Error(`Refusing destructive tests against database ${name}`);
  }
  return value;
}

function testSchema(): string {
  const schema = process.env.TEST_DATABASE_SCHEMA;
  if (!schema || !/^kf_test_[a-z0-9_]+$/.test(schema)) {
    throw new Error(
      "The isolated test database schema has not been initialized",
    );
  }
  return schema;
}

export function testDatabaseUrl(): string {
  const url = new URL(baseTestDatabaseUrl());
  const schema = testSchema();
  const existingOptions = url.searchParams.get("options");
  url.searchParams.set(
    "options",
    [existingOptions, `-csearch_path=${schema}`].filter(Boolean).join(" "),
  );
  return url.toString();
}

export async function createTestDatabaseSchema(): Promise<void> {
  const schema = `kf_test_${process.pid}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  process.env.TEST_DATABASE_SCHEMA = schema;
  const sql = postgres(baseTestDatabaseUrl(), {
    max: 1,
    onnotice: () => undefined,
  });
  try {
    await sql`CREATE SCHEMA ${sql(schema)}`;
  } finally {
    await sql.end();
  }
  try {
    await migrate(testDatabaseUrl());
  } catch (error) {
    await dropTestDatabaseSchema();
    throw error;
  }
}

export async function dropTestDatabaseSchema(): Promise<void> {
  const schema = process.env.TEST_DATABASE_SCHEMA;
  if (!schema) return;
  const sql = postgres(baseTestDatabaseUrl(), {
    max: 1,
    onnotice: () => undefined,
  });
  try {
    await sql`DROP SCHEMA IF EXISTS ${sql(schema)} CASCADE`;
  } finally {
    await sql.end();
    delete process.env.TEST_DATABASE_SCHEMA;
  }
}

export function testSql(): Sql {
  return postgres(testDatabaseUrl(), { max: 2, onnotice: () => undefined });
}

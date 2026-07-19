import "server-only";

import postgres, { type Sql } from "postgres";

let client: Sql | undefined;

export function database(): Sql {
  if (client) return client;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured");
  client = postgres(databaseUrl, { max: 5, idle_timeout: 20 });
  return client;
}

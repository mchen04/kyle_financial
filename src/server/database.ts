import "server-only";

import postgres, { type Sql } from "postgres";

let client: Sql | undefined;

export function database(): Sql {
  if (client) return client;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured");
  client = postgres(databaseUrl, {
    max: 5,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
    connection: {
      // Milliseconds. A runaway statement or an abandoned transaction would
      // otherwise pin one of five pool slots indefinitely.
      statement_timeout: 15_000,
      lock_timeout: 5_000,
      idle_in_transaction_session_timeout: 30_000,
    },
  });
  return client;
}

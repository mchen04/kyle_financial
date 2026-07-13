import { createTestDatabaseSchema, dropTestDatabaseSchema } from "./database";

export async function setup(): Promise<() => Promise<void>> {
  await createTestDatabaseSchema();
  return dropTestDatabaseSchema;
}

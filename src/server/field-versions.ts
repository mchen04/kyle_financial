import { persistedFieldVersionsSchema } from "@/domain/plan-schema";
import type { FieldVersions } from "@/domain/stored-plan";

export function parseFieldVersions(value: unknown): FieldVersions {
  return persistedFieldVersionsSchema.parse(
    typeof value === "string" ? JSON.parse(value) : (value ?? {}),
  );
}

import { z } from "zod";
import { canonicalUuidSchema } from "./sync-field";

export interface FieldVersion {
  updatedAt: string;
  mutationId: string;
}

export const fieldVersionSchema = z.object({
  updatedAt: z.iso.datetime(),
  mutationId: canonicalUuidSchema,
});

export const persistedFieldVersionSchema = z.object({
  updatedAt: z.iso.datetime(),
  mutationId: z
    .string()
    .min(1)
    .transform((mutationId) => {
      const parsed = canonicalUuidSchema.safeParse(mutationId);
      return parsed.success ? parsed.data : mutationId;
    }),
});

export function transportSafeFieldVersion(
  version: FieldVersion | null | undefined,
): FieldVersion | null | undefined {
  if (version === null || version === undefined) return version;
  const parsed = fieldVersionSchema.safeParse(version);
  return parsed.success ? parsed.data : null;
}

export function isIncomingVersionNewer(
  incoming: FieldVersion,
  current: FieldVersion | undefined,
): boolean {
  if (!current) return true;
  const incomingTime = Date.parse(incoming.updatedAt);
  const currentTime = Date.parse(current.updatedAt);
  if (incomingTime !== currentTime) return incomingTime > currentTime;
  return incoming.mutationId > current.mutationId;
}

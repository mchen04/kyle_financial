import { createHmac, timingSafeEqual } from "node:crypto";

const INVITE_CONTEXT = "kyle-financial-registration-v1\0";
const MINIMUM_SECRET_BYTES = 32;
const UNSAFE_EXAMPLE_SECRET = "replace-with-at-least-32-random-bytes";

function requireRegistrationSecret(secret: string | undefined): string {
  if (
    !secret ||
    secret === UNSAFE_EXAMPLE_SECRET ||
    Buffer.byteLength(secret, "utf8") < MINIMUM_SECRET_BYTES
  ) {
    throw new Error(
      `REGISTRATION_SECRET must contain at least ${MINIMUM_SECRET_BYTES} bytes`,
    );
  }
  return secret;
}

export function createRegistrationInvite(
  secret: string | undefined,
  email: string,
): string {
  return createHmac("sha256", requireRegistrationSecret(secret))
    .update(INVITE_CONTEXT)
    .update(email.trim().toLowerCase())
    .digest("base64url");
}

export function isRegistrationInviteValid(
  secret: string | undefined,
  email: string,
  candidate: string,
): boolean {
  const expected = Buffer.from(createRegistrationInvite(secret, email));
  const provided = Buffer.from(candidate.trim());
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

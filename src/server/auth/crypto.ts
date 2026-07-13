import { pbkdf2, randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2Async = promisify(pbkdf2);
const PBKDF2_ITERATIONS = 600_000;
const PASSWORD_BYTES = 32;
const DUMMY_PASSWORD_HASH =
  "pbkdf2_sha256$600000$a3lsZS1maW5hbmNpYWwtbA$u774jbXg_k5ovTbvvewx8bpaXy5OHE2moN7mqijRIeo";

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const digest = await pbkdf2Async(
    password,
    salt,
    PBKDF2_ITERATIONS,
    PASSWORD_BYTES,
    "sha256",
  );
  return [
    "pbkdf2_sha256",
    PBKDF2_ITERATIONS,
    salt.toString("base64url"),
    digest.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const [algorithm, iterationsText, saltText, expectedText] =
    encoded.split("$");
  if (algorithm !== "pbkdf2_sha256") return false;
  const iterations = Number(iterationsText);
  if (!Number.isSafeInteger(iterations) || iterations < 100_000) return false;
  try {
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(expectedText, "base64url");
    const actual = await pbkdf2Async(
      password,
      salt,
      iterations,
      expected.length,
      "sha256",
    );
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}

export function verifyAuthenticationPassword(
  password: string,
  encoded: string | undefined,
): Promise<boolean> {
  return verifyPassword(password, encoded ?? DUMMY_PASSWORD_HASH);
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

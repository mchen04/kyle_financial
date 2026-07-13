import { describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyAuthenticationPassword,
  verifyPassword,
} from "./crypto";

describe("authentication password verification", () => {
  it("verifies stored hashes", async () => {
    const encoded = await hashPassword("correct horse battery staple");

    await expect(
      verifyPassword("correct horse battery staple", encoded),
    ).resolves.toBe(true);
    await expect(verifyPassword("wrong password", encoded)).resolves.toBe(
      false,
    );
  });

  it("performs the same PBKDF2 path when an identity is absent", async () => {
    await expect(
      verifyAuthenticationPassword("untrusted password", undefined),
    ).resolves.toBe(false);
  });
});

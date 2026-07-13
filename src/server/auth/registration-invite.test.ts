import { describe, expect, it } from "vitest";
import {
  createRegistrationInvite,
  isRegistrationInviteValid,
} from "./registration-invite";

const secret = "a-production-secret-with-more-than-32-bytes";

describe("email-bound registration invitations", () => {
  it("normalizes the address and authorizes only that address", () => {
    const invitation = createRegistrationInvite(secret, "  Owner@Example.com ");

    expect(invitation).toHaveLength(43);
    expect(
      isRegistrationInviteValid(secret, "owner@example.com", invitation),
    ).toBe(true);
    expect(
      isRegistrationInviteValid(secret, "other@example.com", invitation),
    ).toBe(false);
    expect(
      isRegistrationInviteValid(secret, "owner@example.com", "x".repeat(43)),
    ).toBe(false);
  });

  it("fails closed when the server secret is absent, unsafe, or too short", () => {
    expect(() => createRegistrationInvite(undefined, "a@example.com")).toThrow(
      "REGISTRATION_SECRET",
    );
    expect(() =>
      createRegistrationInvite("too-short", "a@example.com"),
    ).toThrow("REGISTRATION_SECRET");
    expect(() =>
      createRegistrationInvite(
        "replace-with-at-least-32-random-bytes",
        "a@example.com",
      ),
    ).toThrow("REGISTRATION_SECRET");
  });
});

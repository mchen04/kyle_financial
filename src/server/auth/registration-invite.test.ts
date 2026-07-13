import { describe, expect, it } from "vitest";
import {
  createRegistrationInvite,
  isRegistrationInviteValid,
} from "./registration-invite";

const secret = "a-production-secret-with-more-than-32-bytes";

describe("universal registration invitations", () => {
  it("authorizes the universal invitation", () => {
    const invitation = createRegistrationInvite(secret);

    expect(invitation).toHaveLength(43);
    expect(isRegistrationInviteValid(secret, invitation)).toBe(true);
    expect(isRegistrationInviteValid(secret, "x".repeat(43))).toBe(false);
  });

  it("fails closed when the server secret is absent, unsafe, or too short", () => {
    expect(() => createRegistrationInvite(undefined)).toThrow(
      "REGISTRATION_SECRET",
    );
    expect(() => createRegistrationInvite("too-short")).toThrow(
      "REGISTRATION_SECRET",
    );
    expect(() =>
      createRegistrationInvite("replace-with-at-least-32-random-bytes"),
    ).toThrow("REGISTRATION_SECRET");
  });
});

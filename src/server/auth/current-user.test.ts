import { describe, expect, it } from "vitest";
import {
  EXPECTED_ACCOUNT_HEADER,
  EXPECTED_SESSION_HEADER,
  requestMatchesSession,
  requestMatchesUser,
} from "./current-user";

describe("account-bound authenticated requests", () => {
  const user = {
    id: "user-a",
    email: "a@example.com",
    sessionId: "00000000-0000-4000-8000-000000000001",
  };

  it("accepts only the session account expected by the client", () => {
    expect(
      requestMatchesUser(
        new Request("https://example.test/api/plans", {
          headers: { [EXPECTED_ACCOUNT_HEADER]: user.id },
        }),
        user,
      ),
    ).toBe(true);
    expect(
      requestMatchesUser(
        new Request("https://example.test/api/plans", {
          headers: { [EXPECTED_ACCOUNT_HEADER]: "user-b" },
        }),
        user,
      ),
    ).toBe(false);
    expect(
      requestMatchesUser(new Request("https://example.test/api/plans"), user),
    ).toBe(false);
  });

  it("binds destructive requests to the rendered session instance", () => {
    const request = (sessionId: string) =>
      new Request("https://example.test/api/account", {
        headers: {
          [EXPECTED_ACCOUNT_HEADER]: user.id,
          [EXPECTED_SESSION_HEADER]: sessionId,
        },
      });

    expect(requestMatchesSession(request(user.sessionId), user)).toBe(true);
    expect(
      requestMatchesSession(
        request("00000000-0000-4000-8000-000000000002"),
        user,
      ),
    ).toBe(false);
  });
});

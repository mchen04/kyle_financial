import { beforeEach, describe, expect, it, vi } from "vitest";

const { revokeSession, requestMatchesSession } = vi.hoisted(() => ({
  revokeSession: vi.fn(),
  requestMatchesSession: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "session-a" }) }),
}));
vi.mock("@/server/auth/current-user", () => ({
  currentUser: async () => ({
    id: "user-a",
    email: "a@example.com",
    sessionId: "00000000-0000-4000-8000-000000000001",
  }),
  requestMatchesSession,
}));
vi.mock("@/server/auth/repository", () => ({
  revokeSession,
  SESSION_COOKIE: "kyle_session",
}));
vi.mock("@/server/database", () => ({ database: () => ({}) }));

import { POST } from "./route";

describe("logout cookie causality", () => {
  beforeEach(() => {
    revokeSession.mockReset();
    requestMatchesSession.mockReturnValue(true);
  });

  it("revokes the presented session without overwriting a newer login cookie", async () => {
    const response = await POST(
      new Request("https://example.test/api/auth/logout", { method: "POST" }),
    );

    expect(response.status).toBe(200);
    expect(revokeSession).toHaveBeenCalledWith({}, "session-a");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a stale same-account session before revocation", async () => {
    requestMatchesSession.mockReturnValue(false);

    const response = await POST(
      new Request("https://example.test/api/auth/logout", { method: "POST" }),
    );

    expect(response.status).toBe(409);
    expect(revokeSession).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXPECTED_SESSION_HEADER } from "@/domain/api-contracts";

const { deleteUser, currentUser, requestMatchesSession } = vi.hoisted(() => ({
  deleteUser: vi.fn(),
  currentUser: vi.fn(),
  requestMatchesSession: vi.fn(),
}));

vi.mock("@/server/auth/current-user", () => ({
  currentUser,
  requestMatchesSession,
}));
vi.mock("@/server/auth/repository", () => ({ deleteUser }));
vi.mock("@/server/database", () => ({ database: () => ({}) }));

import { DELETE } from "./route";

describe("account deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser.mockResolvedValue({
      id: "user-a",
      email: "a@example.com",
      sessionId: "00000000-0000-4000-8000-000000000002",
    });
    requestMatchesSession.mockImplementation(
      (request: Request, user: { id: string; sessionId: string }) =>
        request.headers.get("X-Kyle-Account-Id") === user.id &&
        request.headers.get(EXPECTED_SESSION_HEADER) === user.sessionId,
    );
    deleteUser.mockResolvedValue(true);
  });

  it("deletes only the authenticated, matching account", async () => {
    const response = await DELETE(
      new Request("https://example.test/api/account", {
        method: "DELETE",
        headers: {
          "X-Kyle-Account-Id": "user-a",
          [EXPECTED_SESSION_HEADER]: "00000000-0000-4000-8000-000000000002",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(deleteUser).toHaveBeenCalledWith({}, "user-a");
  });

  it("rejects a stale same-account session before deletion", async () => {
    const response = await DELETE(
      new Request("https://example.test/api/account", {
        method: "DELETE",
        headers: {
          "X-Kyle-Account-Id": "user-a",
          [EXPECTED_SESSION_HEADER]: "00000000-0000-4000-8000-000000000001",
        },
      }),
    );

    expect(response.status).toBe(409);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { exportAccount } = vi.hoisted(() => ({ exportAccount: vi.fn() }));

vi.mock("@/server/auth/current-user", () => ({
  currentUser: async () => ({ id: "user-a", email: "a@example.com" }),
}));
vi.mock("@/server/database", () => ({ database: () => ({}) }));
vi.mock("@/server/plans/repository", () => ({ exportAccount }));

import { GET } from "./route";

const request = () =>
  new Request("https://example.test/api/export?accountId=user-a");

describe("account export response boundary", () => {
  beforeEach(() => exportAccount.mockReset());

  it("serializes a valid complete-account export as a download", async () => {
    exportAccount.mockResolvedValue({
      format: "kyle-financial-export",
      version: 1,
      exportedAt: "2026-07-13T00:00:00.000Z",
      account: { email: "a@example.com" },
      plans: [],
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(
      "kyle-financial-export.json",
    );
    expect(await response.json()).toEqual({
      format: "kyle-financial-export",
      version: 1,
      exportedAt: "2026-07-13T00:00:00.000Z",
      account: { email: "a@example.com" },
      plans: [],
    });
  });

  it("rejects malformed repository output before serialization", async () => {
    exportAccount.mockResolvedValue({
      version: 1,
      exportedAt: "not-a-date",
      account: { email: "not-an-email" },
      plans: [],
    });

    const response = await GET(request());

    expect(response.status).toBe(500);
  });
});

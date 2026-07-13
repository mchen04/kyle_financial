import { beforeEach, describe, expect, it, vi } from "vitest";

const { databaseValue, getPlanByYear } = vi.hoisted(() => ({
  databaseValue: {},
  getPlanByYear: vi.fn(),
}));

vi.mock("@/server/auth/current-user", () => ({
  currentUser: async () => ({ id: "user-a", email: "a@example.com" }),
  requestMatchesUser: () => true,
}));
vi.mock("@/server/database", () => ({ database: () => databaseValue }));
vi.mock("@/server/plans/repository", () => ({ getPlanByYear }));

import * as route from "./route";

describe("plan year read boundary", () => {
  beforeEach(() => {
    getPlanByYear.mockReset();
  });

  it("exposes reads without a parallel write lifecycle", async () => {
    getPlanByYear.mockResolvedValue(null);

    const response = await route.GET(
      new Request("https://example.test/api/plans/2026"),
      { params: Promise.resolve({ year: "2026" }) },
    );

    expect(response.status).toBe(404);
    expect(getPlanByYear).toHaveBeenCalledWith(databaseValue, "user-a", 2026);
    expect(route).not.toHaveProperty("PATCH");
    expect(route).not.toHaveProperty("PUT");
  });
});

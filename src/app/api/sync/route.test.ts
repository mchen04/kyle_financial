import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const { applySyncMutations, SyncPlanNotFoundError } = vi.hoisted(() => ({
  applySyncMutations: vi.fn(),
  SyncPlanNotFoundError: class extends Error {},
}));

vi.mock("@/server/auth/current-user", () => ({
  currentUser: async () => ({ id: "user-a", email: "a@example.com" }),
  requestMatchesUser: () => true,
}));
vi.mock("@/server/database", () => ({ database: () => ({}) }));
vi.mock("@/server/sync/repository", () => ({
  applySyncMutations,
  SyncPlanNotFoundError,
}));

import { POST } from "./route";

describe("sync response boundary", () => {
  beforeEach(() => applySyncMutations.mockReset());

  it("acknowledges a quarantined non-UUID envelope beside valid peers", async () => {
    applySyncMutations.mockResolvedValue({
      acknowledgements: [
        { mutationId: "not-a-uuid", applied: false, rejected: true },
        {
          mutationId: "00000000-0000-4000-8000-000000000082",
          applied: true,
        },
      ],
      plans: [],
    });

    const response = await POST(
      new Request("https://example.test/api/sync", {
        method: "POST",
        body: JSON.stringify({
          mutations: [
            { mutationId: "not-a-uuid" },
            { mutationId: "00000000-0000-4000-8000-000000000082" },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      acknowledgements: [
        { mutationId: "not-a-uuid", rejected: true },
        { mutationId: "00000000-0000-4000-8000-000000000082" },
      ],
      plans: [],
    });
  });

  it("rejects a non-UUID acknowledgement that is not quarantined", async () => {
    applySyncMutations.mockResolvedValue({
      acknowledgements: [{ mutationId: "not-a-uuid", applied: true }],
      plans: [],
    });

    const response = await POST(
      new Request("https://example.test/api/sync", {
        method: "POST",
        body: JSON.stringify({ mutations: [{ mutationId: "not-a-uuid" }] }),
      }),
    );

    expect(response.status).toBe(500);
  });

  it("returns 400 for malformed JSON without entering the repository", async () => {
    const response = await POST(
      new Request("https://example.test/api/sync", {
        method: "POST",
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
    expect(applySyncMutations).not.toHaveBeenCalled();
  });

  it("returns 400 for a schema-invalid request", async () => {
    const response = await POST(
      new Request("https://example.test/api/sync", {
        method: "POST",
        body: JSON.stringify({ mutations: [] }),
      }),
    );

    expect(response.status).toBe(400);
    expect(applySyncMutations).not.toHaveBeenCalled();
  });

  it("does not misclassify repository validation failures as client errors", async () => {
    applySyncMutations.mockImplementationOnce(async () => {
      throw new ZodError([
        { code: "custom", path: [], message: "Invalid persisted state" },
      ]);
    });

    const response = await POST(
      new Request("https://example.test/api/sync", {
        method: "POST",
        body: JSON.stringify({
          mutations: [{ mutationId: "not-a-uuid" }],
        }),
      }),
    );

    expect(response.status).toBe(500);
    expect(applySyncMutations).toHaveBeenCalledOnce();
  });
});

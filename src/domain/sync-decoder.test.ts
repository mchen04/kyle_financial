import { describe, expect, it } from "vitest";
import { storedPlan } from "@/test/fixtures/plans";
import { applyDecodedSyncMutation, decodeSyncMutation } from "./sync-decoder";
import { syncMutationSchema } from "./sync";

describe("sync decoder", () => {
  it("canonicalizes whole expense values once at the validated boundary", () => {
    const categoryId = "00000000-0000-4000-8000-000000000101";
    const mutation = decodeSyncMutation(
      syncMutationSchema.parse({
        mutationId: "00000000-0000-4000-8000-000000000102",
        planYear: 2026,
        field: `expense:${categoryId}`,
        value: {
          id: categoryId,
          name: "Rent",
          group: "Housing",
          cadence: "monthly",
          amountCents: 200_000,
          sortOrder: 0,
        },
        updatedAt: "2026-07-24T12:00:00.000Z",
      }),
    );

    expect(mutation).toMatchObject({
      kind: "expense",
      property: null,
      value: {
        guidanceBucket: "needs",
        colorToken: "blue",
        archived: false,
      },
    });

    const applied = applyDecodedSyncMutation(storedPlan(), mutation);
    expect(applied.expenses).toContainEqual(
      expect.objectContaining({
        id: categoryId,
        guidanceBucket: "needs",
        colorToken: "blue",
        archived: false,
      }),
    );
  });
});

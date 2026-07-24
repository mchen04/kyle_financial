import { describe, expect, it } from "vitest";
import { syncFieldForTarget } from "@/domain/sync";
import { planMutationBatch, type SequencedSyncMutation } from "./queue-planner";

describe("offline mutation compaction", () => {
  it("reconstitutes a corrected transaction under a fresh mutation ID", () => {
    const transactionId = "00000000-0000-4000-8000-000000000101";
    const creation: SequencedSyncMutation = {
      mutationId: "00000000-0000-4000-8000-000000000102",
      planYear: 2026,
      field: syncFieldForTarget({ kind: "transaction", id: transactionId }),
      value: {
        id: transactionId,
        categoryId: "00000000-0000-4000-8000-000000000100",
        amountCents: 500,
        title: "Needs a date correction",
        date: "2026-12-31",
        createdAt: "2026-07-24T12:00:00.000Z",
        updatedAt: "2026-07-24T12:00:00.000Z",
      },
      updatedAt: "2026-07-24T12:00:00.000Z",
      localSequence: 1,
      deliveryUpdatedAt: "2026-07-24T12:00:00.000Z",
    };
    const correction: SequencedSyncMutation = {
      mutationId: "00000000-0000-4000-8000-000000000103",
      planYear: 2026,
      field: syncFieldForTarget({
        kind: "transaction",
        id: transactionId,
        property: "date",
      }),
      value: "2026-07-24",
      updatedAt: "2026-07-24T12:01:00.000Z",
      localSequence: 2,
      deliveryUpdatedAt: "2026-07-24T12:01:00.000Z",
    };
    const replacementId = "00000000-0000-4000-8000-000000000104";

    const plan = planMutationBatch([creation, correction], () => replacementId);

    expect(plan.discardedMutationIds).toEqual([
      creation.mutationId,
      correction.mutationId,
    ]);
    expect(plan.batch).toEqual([
      expect.objectContaining({
        mutationId: replacementId,
        field: creation.field,
        value: expect.objectContaining({ date: "2026-07-24" }),
      }),
    ]);
  });
});

import { describe, expect, expectTypeOf, it } from "vitest";
import { planInput } from "@/test/fixtures/plans";
import {
  fieldVersionsSchema,
  fullPlanSchema,
  persistedFieldVersionsSchema,
} from "./plan-schema";
import {
  diffPlanMutations,
  isSyncField,
  latestVersionForField,
  normalizeClientTimestamp,
  syncFieldForTarget,
  syncMutationSchema,
  type SyncField,
} from "./sync";

describe("sync field boundary", () => {
  it("keeps causal field versions monotonic when a client clock is slow", () => {
    expect(
      normalizeClientTimestamp(
        "2000-01-01T00:00:00.000Z",
        new Date("2026-01-01T00:00:00.000Z"),
        "2025-12-31T23:59:59.999Z",
      ),
    ).toBe("2026-01-01T00:00:00.000Z");
  });

  it("creates validated collection fields through the canonical factory", () => {
    const field = syncFieldForTarget({
      kind: "benefit",
      id: "00000000-0000-4000-8000-000000000001",
      property: "label",
    });

    expect(field).toBe("benefit:00000000-0000-4000-8000-000000000001:label");
    expect(isSyncField(field)).toBe(true);
    expect(isSyncField(`${field}:type`)).toBe(false);
  });

  it("rejects invalid collection targets instead of minting branded fields", () => {
    expect(() =>
      syncFieldForTarget({
        kind: "benefit",
        id: "not-a-uuid",
        property: "label",
      }),
    ).toThrow("Cannot create a sync field from an invalid target");
  });

  it("rejects noncanonical collection discriminants", () => {
    expect(
      isSyncField("BENEFIT:00000000-0000-4000-8000-000000000001:label"),
    ).toBe(false);
    expect(
      isSyncField("benefit:00000000-0000-4000-8000-000000000001:LABEL"),
    ).toBe(false);
  });

  it("canonicalizes UUID spelling across plans, mutations, and versions", () => {
    const uppercaseId = "F09AF018-F6C2-4EB1-9380-123173BD9802";
    const lowercaseId = uppercaseId.toLowerCase();
    const parsedPlan = fullPlanSchema.parse(
      planInput({
        benefits: [
          {
            id: uppercaseId,
            type: "traditional401k",
            label: "401(k)",
            amount: { kind: "percent", ratePpm: 50_000 },
          },
        ],
      }),
    );
    const version = {
      updatedAt: "2026-07-12T00:00:00.000Z",
      mutationId: "00000000-0000-4000-8000-000000000010",
    };
    const versions = fieldVersionsSchema.parse({
      [`benefit:${uppercaseId}`]: version,
    });
    const parsedMutation = syncMutationSchema.parse({
      mutationId: "00000000-0000-4000-8000-000000000011",
      planYear: 2026,
      field: `benefit:${uppercaseId}:label`,
      value: "Retirement",
      updatedAt: "2026-07-12T00:00:01.000Z",
    });

    expect(parsedPlan.benefits[0].id).toBe(lowercaseId);
    expect(isSyncField(`benefit:${uppercaseId}:label`)).toBe(false);
    expect(parsedMutation.field).toBe(`benefit:${lowercaseId}:label`);
    expect(Object.keys(versions)).toEqual([`benefit:${lowercaseId}`]);
    expect(latestVersionForField(parsedMutation.field, versions)).toEqual(
      version,
    );
  });

  it("rejects version maps that alias one field through UUID casing", () => {
    const id = "f09af018-f6c2-4eb1-9380-123173bd9802";
    const version = {
      updatedAt: "2026-07-12T00:00:00.000Z",
      mutationId: "00000000-0000-4000-8000-000000000012",
    };

    expect(() =>
      fieldVersionsSchema.parse({
        [`benefit:${id}`]: version,
        [`benefit:${id.toUpperCase()}`]: version,
      }),
    ).toThrow();
  });

  it("merges persisted field aliases by the canonical version ordering", () => {
    const id = "f09af018-f6c2-4eb1-9380-123173bd9802";
    const older = {
      updatedAt: "2026-07-12T00:00:00.000Z",
      mutationId: "00000000-0000-4000-8000-000000000013",
    };
    const newer = {
      updatedAt: "2026-07-12T00:00:01.000Z",
      mutationId: "00000000-0000-4000-8000-000000000014",
    };

    expect(
      persistedFieldVersionsSchema.parse({
        [`benefit:${id.toUpperCase()}`]: older,
        [`benefit:${id}`]: newer,
      }),
    ).toEqual({ [`benefit:${id}`]: newer });
  });

  it("rejects entity ID aliases that collide after normalization", () => {
    const id = "f09af018-f6c2-4eb1-9380-123173bd9802";
    const expense = {
      name: "Rent",
      group: "Needs",
      cadence: "monthly" as const,
      amountCents: 200_000,
      sortOrder: 0,
    };

    expect(
      fullPlanSchema.safeParse(
        planInput({
          expenses: [
            { ...expense, id },
            { ...expense, id: id.toUpperCase() },
          ],
        }),
      ).success,
    ).toBe(false);
  });

  it("canonicalizes mutation and delivery UUID identities", () => {
    const mutationId = "F09AF018-F6C2-4EB1-9380-123173BD9802";
    const dependencyId = "A09AF018-F6C2-4EB1-9380-123173BD9803";

    expect(
      syncMutationSchema.parse({
        mutationId,
        planYear: 2026,
        field: "grossSalaryCents",
        value: 10_000_000,
        updatedAt: "2026-07-12T00:00:00.000Z",
        deliveryAfterMutationId: dependencyId,
      }),
    ).toMatchObject({
      mutationId: mutationId.toLowerCase(),
      deliveryAfterMutationId: dependencyId.toLowerCase(),
    });
  });

  it("keeps request base versions strict while repairing persisted UUIDs", () => {
    const field = syncFieldForTarget({
      kind: "benefit",
      id: "f09af018-f6c2-4eb1-9380-123173bd9802",
    });
    const timestamp = "2026-07-12T00:00:00.000Z";
    const uppercaseWinner = "F09AF018-F6C2-4EB1-9380-123173BD9802";
    const lowercaseLoser = "e09af018-f6c2-4eb1-9380-123173bd9802";
    const persisted = persistedFieldVersionsSchema.parse({
      [field]: { updatedAt: timestamp, mutationId: uppercaseWinner },
      [String(field).replace("f09", "F09")]: {
        updatedAt: timestamp,
        mutationId: lowercaseLoser,
      },
    });

    expect(persisted[field]?.mutationId).toBe(uppercaseWinner.toLowerCase());
    expect(
      syncMutationSchema.safeParse({
        mutationId: "00000000-0000-4000-8000-000000000015",
        planYear: 2026,
        field: "grossSalaryCents",
        value: 10_000_000,
        updatedAt: timestamp,
        baseVersion: { updatedAt: timestamp, mutationId: "not-a-uuid" },
      }).success,
    ).toBe(false);
  });

  it("drops unrepresentable persisted base versions when diffing", () => {
    const previous = {
      id: "00000000-0000-4000-8000-000000000001",
      ...planInput(),
      updatedAt: "2026-07-12T00:00:00.000Z",
      fieldVersions: persistedFieldVersionsSchema.parse({
        grossSalaryCents: {
          updatedAt: "2026-07-11T00:00:00.000Z",
          mutationId: "legacy-non-uuid-version",
        },
      }),
    };

    expect(
      diffPlanMutations(
        previous,
        { ...previous, grossSalaryCents: 11_000_000 },
        "2026-07-12T01:00:00.000Z",
      )[0].baseVersion,
    ).toBeNull();
  });

  it.each([
    "00000000-0000-0000-0000-000000000000",
    "ffffffff-ffff-ffff-ffff-ffffffffffff",
  ])("uses the plan schema's complete UUID domain for %s", (id) => {
    const parsed = fullPlanSchema.parse(
      planInput({
        expenses: [
          {
            id,
            name: "Rent",
            group: "Needs",
            cadence: "monthly",
            amountCents: 200_000,
            sortOrder: 0,
          },
        ],
      }),
    );
    const previous = {
      id: "00000000-0000-4000-8000-000000000001",
      ...parsed,
      year: 2026,
      expenses: [],
      updatedAt: "2026-07-12T00:00:00.000Z",
      fieldVersions: {},
    };
    const current = { ...previous, expenses: parsed.expenses };

    expect(
      diffPlanMutations(
        previous,
        current,
        "2026-07-12T01:00:00.000Z",
        () => "00000000-0000-4000-8000-000000000002",
      ).map(({ field }) => field),
    ).toEqual([`expense:${id}`]);
  });

  it("does not admit arbitrary collection suffixes at compile time", () => {
    type UnsupportedBenefitFieldIsSyncField =
      `benefit:${string}:type` extends SyncField ? true : false;

    expectTypeOf<UnsupportedBenefitFieldIsSyncField>().toEqualTypeOf<false>();
  });
});

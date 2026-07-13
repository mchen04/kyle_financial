import { describe, expect, it, vi } from "vitest";
import {
  EXPECTED_SESSION_HEADER,
  okResponseSchema,
} from "@/domain/api-contracts";
import {
  acceptCalculablePlanDraft,
  benefitAmountFromInput,
  centsFromInput,
  esppDiscountFromInput,
  HttpError,
  isExpiredSessionError,
  isRetryablePlanCreationRecoveryError,
  isUncertainPlanCreationError,
  jsonRequest,
  money,
  planCalculationError,
  reconciliationFailureState,
  REQUEST_TIMEOUT_MS,
  retryActionForSaveState,
  type StoredPlan,
} from "./plan-types";

describe("plan numeric input conversion", () => {
  it("never returns unsafe cents for oversized, non-finite, or negative input", () => {
    expect(centsFromInput("90071992547410")).toBe(Number.MAX_SAFE_INTEGER);
    expect(Number.isSafeInteger(centsFromInput("90071992547410"))).toBe(true);
    expect(centsFromInput("Infinity")).toBe(0);
    expect(centsFromInput("-1")).toBe(0);
    expect(centsFromInput("12.345")).toBe(1_235);
  });

  it("bounds configured benefit amounts before the tax engine sees them", () => {
    expect(benefitAmountFromInput("percent", "100.1")).toEqual({
      kind: "percent",
      ratePpm: 1_000_000,
    });
    expect(benefitAmountFromInput("percent", "-1")).toEqual({
      kind: "percent",
      ratePpm: 0,
    });
    const monthly = benefitAmountFromInput("fixedMonthly", "90071992547410");
    expect(monthly.kind).toBe("fixedMonthly");
    if (monthly.kind === "percent") throw new Error("Expected a fixed amount");
    expect(monthly.cents * 12).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
  });

  it("bounds the modeled ESPP discount to zero through fifteen percent", () => {
    expect(esppDiscountFromInput("15.1")).toBe(150_000);
    expect(esppDiscountFromInput("-1")).toBe(0);
    expect(esppDiscountFromInput("7.25")).toBe(72_500);
  });

  it("renders exact cents so displayed monthly components reconcile", () => {
    const takeHomeMonthlyCents = 659_833;
    const expensesMonthlyCents = 51;
    const savingsMonthlyCents = takeHomeMonthlyCents - expensesMonthlyCents;

    expect(money(takeHomeMonthlyCents, 2)).toBe("$6,598.33");
    expect(money(expensesMonthlyCents, 2)).toBe("$0.51");
    expect(money(savingsMonthlyCents, 2)).toBe("$6,597.82");
    expect(money(takeHomeMonthlyCents)).toBe("$6,598");
  });

  it("renders exact cents for annual plan and comparison identities", () => {
    expect(money(1_481_472, 2)).toBe("$14,814.72");
    expect(money(1_200_012, 2)).toBe("$12,000.12");
  });

  it("rejects a combined unsafe draft before the render calculation", () => {
    const draft: StoredPlan = {
      id: "00000000-0000-4000-8000-000000000001",
      year: 2026,
      stateCode: "TX",
      filingStatus: "single",
      grossSalaryCents: Number.MAX_SAFE_INTEGER,
      additionalWageIncomeCents: 1,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
      primaryHsaEligible: true,
      spouseHsaEligible: false,
      primaryHsaCatchUpEligible: false,
      spouseHsaCatchUpEligible: false,
      primaryHsaFamilyAllocationPpm: 1_000_000,
      spouseHsaFamilyAllocationPpm: 0,
      benefits: [],
      expenses: [],
      updatedAt: "2026-07-12T00:00:00.000Z",
      fieldVersions: {},
    };
    const accept = vi.fn();
    const error = acceptCalculablePlanDraft(draft, accept);

    expect(error).toBe(
      "Combined plan amounts are too large to calculate safely.",
    );
    expect(planCalculationError(draft)).toBe(error);
    expect(accept).not.toHaveBeenCalled();

    const safeDraft = {
      ...draft,
      grossSalaryCents: Number.MAX_SAFE_INTEGER - 1,
    };
    expect(acceptCalculablePlanDraft(safeDraft, accept)).toBeNull();
    expect(accept).toHaveBeenCalledOnce();
    expect(accept).toHaveBeenCalledWith(safeDraft);
  });

  it.each([
    {
      label: "expense",
      change: {
        expenses: [
          {
            id: "00000000-0000-4000-8000-000000000002",
            name: "Extreme expense",
            group: "Other",
            cadence: "yearly" as const,
            amountCents: 5_000_000_000_000_000,
            sortOrder: 0,
          },
        ],
      },
    },
    {
      label: "benefit",
      change: {
        benefits: [
          {
            id: "00000000-0000-4000-8000-000000000003",
            type: "employer401kMatch" as const,
            label: "Extreme employer match",
            amount: {
              kind: "fixedAnnual" as const,
              cents: 5_000_000_000_000_000,
            },
          },
        ],
      },
    },
  ])(
    "rejects a server-unsafe aggregate $label before forwarding it for persistence",
    ({ change }) => {
      const draft: StoredPlan = {
        id: "00000000-0000-4000-8000-000000000001",
        year: 2026,
        stateCode: "TX",
        filingStatus: "single",
        grossSalaryCents: 5_000_000_000_000_000,
        additionalWageIncomeCents: 0,
        spouseWageIncomeCents: 0,
        otherOrdinaryIncomeCents: 0,
        hsaCoverage: "self",
        primaryHsaEligible: true,
        spouseHsaEligible: false,
        primaryHsaCatchUpEligible: false,
        spouseHsaCatchUpEligible: false,
        primaryHsaFamilyAllocationPpm: 1_000_000,
        spouseHsaFamilyAllocationPpm: 0,
        benefits: [],
        expenses: [],
        updatedAt: "2026-07-12T00:00:00.000Z",
        fieldVersions: {},
        ...change,
      };
      const forwardForPersistence = vi.fn();

      expect(acceptCalculablePlanDraft(draft, forwardForPersistence)).toBe(
        "Combined plan amounts are too large to calculate safely.",
      );
      expect(forwardForPersistence).not.toHaveBeenCalled();
    },
  );

  it.each([
    { field: "benefit label", value: "" },
    { field: "expense name", value: "x".repeat(101) },
    { field: "expense group", value: "" },
  ])(
    "rejects an invalid $field before local persistence",
    ({ field, value }) => {
      const draft: StoredPlan = {
        id: "00000000-0000-4000-8000-000000000001",
        year: 2026,
        stateCode: "TX",
        filingStatus: "single",
        grossSalaryCents: 10_000_000,
        additionalWageIncomeCents: 0,
        spouseWageIncomeCents: 0,
        otherOrdinaryIncomeCents: 0,
        hsaCoverage: "self",
        primaryHsaEligible: true,
        spouseHsaEligible: false,
        primaryHsaCatchUpEligible: false,
        spouseHsaCatchUpEligible: false,
        primaryHsaFamilyAllocationPpm: 1_000_000,
        spouseHsaFamilyAllocationPpm: 0,
        benefits: [
          {
            id: "00000000-0000-4000-8000-000000000002",
            type: "traditional401k",
            label: field === "benefit label" ? value : "401(k)",
            amount: { kind: "fixedAnnual", cents: 1_000_000 },
          },
        ],
        expenses: [
          {
            id: "00000000-0000-4000-8000-000000000003",
            name: field === "expense name" ? value : "Rent",
            group: field === "expense group" ? value : "Home",
            cadence: "monthly",
            amountCents: 200_000,
            sortOrder: 0,
          },
        ],
        updatedAt: "2026-07-12T00:00:00.000Z",
        fieldVersions: {},
      };
      const forwardForPersistence = vi.fn();

      expect(acceptCalculablePlanDraft(draft, forwardForPersistence)).toMatch(
        /Names and groups must contain 1 to 100 characters/,
      );
      expect(forwardForPersistence).not.toHaveBeenCalled();
    },
  );

  it("distinguishes rejected fetches from IndexedDB reconciliation failures", () => {
    expect(reconciliationFailureState(new TypeError("Failed to fetch"))).toBe(
      "offline",
    );
    expect(
      reconciliationFailureState(
        new DOMException("The transaction failed", "AbortError"),
      ),
    ).toBe("local-error");
  });

  it("recognizes an expired server session without misclassifying other failures", () => {
    expect(isExpiredSessionError(new HttpError("expired", 401))).toBe(true);
    expect(isExpiredSessionError(new HttpError("failed", 500))).toBe(false);
    expect(isExpiredSessionError(new TypeError("offline"))).toBe(false);
  });

  it("recognizes creation outcomes that need an authoritative recovery read", () => {
    expect(isUncertainPlanCreationError(new TypeError("network changed"))).toBe(
      true,
    );
    expect(isUncertainPlanCreationError(new HttpError("timed out", 408))).toBe(
      true,
    );
    expect(
      isUncertainPlanCreationError(new HttpError("already exists", 409)),
    ).toBe(true);
    expect(isUncertainPlanCreationError(new HttpError("bad input", 400))).toBe(
      false,
    );
  });

  it("retries only transient recovery-read failures", () => {
    expect(
      isRetryablePlanCreationRecoveryError(new TypeError("network changed")),
    ).toBe(true);
    expect(
      isRetryablePlanCreationRecoveryError(new HttpError("timed out", 408)),
    ).toBe(true);
    expect(
      isRetryablePlanCreationRecoveryError(new HttpError("failed", 500)),
    ).toBe(true);
    expect(
      isRetryablePlanCreationRecoveryError(new HttpError("expired", 401)),
    ).toBe(false);
    expect(
      isRetryablePlanCreationRecoveryError(
        new HttpError("account changed", 409),
      ),
    ).toBe(false);
  });

  it("keeps manual recovery available for transport failures without a connectivity event", () => {
    expect(retryActionForSaveState("offline")).toBe("sync");
    expect(retryActionForSaveState("sync-error")).toBe("sync");
    expect(retryActionForSaveState("local-error")).toBe("device");
    expect(retryActionForSaveState("saved")).toBeNull();
    expect(retryActionForSaveState("rejected")).toBeNull();
  });

  it.each(["", "<html>Bad gateway</html>", "null"])(
    "classifies an invalid HTTP response body as a protocol failure: %j",
    async (responseBody) => {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(responseBody, {
          status: 502,
          headers: { "Content-Type": "text/html" },
        }),
      );

      await expect(
        jsonRequest("/api/sync", okResponseSchema),
      ).rejects.toMatchObject({
        status: 502,
      } satisfies Partial<HttpError>);
      fetchMock.mockRestore();
    },
  );

  it("rejects successful JSON that does not satisfy the response contract", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ ok: "yes" }));

    await expect(
      jsonRequest("/api/logout", okResponseSchema),
    ).rejects.toMatchObject({
      message: "The server returned an invalid response.",
      status: 200,
    } satisfies Partial<HttpError>);
    fetchMock.mockRestore();
  });

  it("binds a close request to both the rendered account and session", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ ok: true }));

    await jsonRequest(
      "/api/account",
      okResponseSchema,
      { method: "DELETE" },
      "user-a",
      "00000000-0000-4000-8000-000000000001",
    );

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get("X-Kyle-Account-Id")).toBe("user-a");
    expect(headers.get(EXPECTED_SESSION_HEADER)).toBe(
      "00000000-0000-4000-8000-000000000001",
    );
    fetchMock.mockRestore();
  });

  it("turns a stalled fetch into a retryable bounded request failure", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );

    const request = jsonRequest("/api/sync", okResponseSchema);
    const rejection = expect(request).rejects.toMatchObject({
      message: "The request timed out. Try again.",
      status: 408,
    } satisfies Partial<HttpError>);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);

    await rejection;
    fetchMock.mockRestore();
    vi.useRealTimers();
  });

  it("keeps the deadline active while a response body is stalled", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_url, init) =>
        ({
          ok: true,
          status: 200,
          text: () =>
            new Promise<string>((_resolve, reject) => {
              if (init?.signal?.aborted) {
                reject(new DOMException("Aborted", "AbortError"));
                return;
              }
              init?.signal?.addEventListener(
                "abort",
                () => reject(new DOMException("Aborted", "AbortError")),
                { once: true },
              );
            }),
        }) as Response,
    );

    const request = jsonRequest("/api/sync", okResponseSchema);
    const rejection = expect(request).rejects.toMatchObject({
      message: "The request timed out. Try again.",
      status: 408,
    } satisfies Partial<HttpError>);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);

    await rejection;
    fetchMock.mockRestore();
    vi.useRealTimers();
  });

  it("forwards caller cancellation while a response body is stalled", async () => {
    const caller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_url, init) =>
        ({
          ok: true,
          status: 200,
          text: () =>
            new Promise<string>((_resolve, reject) => {
              if (init?.signal?.aborted) {
                reject(new DOMException("Aborted", "AbortError"));
                return;
              }
              init?.signal?.addEventListener(
                "abort",
                () => reject(new DOMException("Aborted", "AbortError")),
                { once: true },
              );
            }),
        }) as Response,
    );

    const request = jsonRequest("/api/sync", okResponseSchema, {
      signal: caller.signal,
    });
    const rejection = expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
    caller.abort();

    await rejection;
    fetchMock.mockRestore();
  });

  it("forwards a safe expense-and-benefit draft for persistence exactly once", () => {
    const draft: StoredPlan = {
      id: "00000000-0000-4000-8000-000000000001",
      year: 2026,
      stateCode: "TX",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
      primaryHsaEligible: true,
      spouseHsaEligible: false,
      primaryHsaCatchUpEligible: false,
      spouseHsaCatchUpEligible: false,
      primaryHsaFamilyAllocationPpm: 1_000_000,
      spouseHsaFamilyAllocationPpm: 0,
      benefits: [
        {
          id: "00000000-0000-4000-8000-000000000002",
          type: "traditional401k",
          label: "401(k)",
          amount: { kind: "fixedAnnual", cents: 1_000_000 },
        },
      ],
      expenses: [
        {
          id: "00000000-0000-4000-8000-000000000003",
          name: "Rent",
          group: "Home",
          cadence: "monthly",
          amountCents: 200_000,
          sortOrder: 0,
        },
      ],
      updatedAt: "2026-07-12T00:00:00.000Z",
      fieldVersions: {},
    };
    const forwardForPersistence = vi.fn();

    expect(acceptCalculablePlanDraft(draft, forwardForPersistence)).toBeNull();
    expect(forwardForPersistence).toHaveBeenCalledOnce();
    expect(forwardForPersistence).toHaveBeenCalledWith(draft);

    const draftWithTypingSpace = {
      ...draft,
      expenses: draft.expenses.map((expense) => ({
        ...expense,
        name: `${expense.name} `,
      })),
    };
    forwardForPersistence.mockClear();
    expect(
      acceptCalculablePlanDraft(draftWithTypingSpace, forwardForPersistence),
    ).toBeNull();
    expect(forwardForPersistence).toHaveBeenCalledWith(draftWithTypingSpace);
  });
});

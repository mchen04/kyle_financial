import { z } from "zod";
import type { ConfiguredAmount } from "@/domain/benefits";
import { EXPECTED_SESSION_HEADER } from "@/domain/api-contracts";
import {
  PLAN_AGGREGATE_TOO_LARGE_MESSAGE,
  planAggregateError,
} from "@/domain/plan-admissibility";
import {
  maximumEsppDiscountPpm,
  maximumMonthlyCents,
  maximumRatePpm,
  storedPlanSchema,
} from "@/domain/plan-schema";
import type { StoredPlan } from "@/domain/stored-plan";
import { calculatePlan } from "@/domain/tax/engine";

export type { StoredPlan } from "@/domain/stored-plan";

export type Screen = "plan" | "benefits" | "compare" | "account";
export type SaveState =
  "saved" | "saving" | "offline" | "local-error" | "rejected" | "sync-error";

export const EXPIRED_SESSION_NOTICE =
  "Your session expired. Sign in again to sync changes saved on this device.";
export const REQUEST_TIMEOUT_MS = 15_000;

export function money(cents: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits,
  }).format(cents / 100);
}

export function rate(ratePpm: number): string {
  return `${(ratePpm / 10_000).toFixed(1)}%`;
}

export function centsFromInput(
  value: string,
  maximumCents = Number.MAX_SAFE_INTEGER,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  const cents = Math.round(parsed * 100);
  return Number.isSafeInteger(cents)
    ? Math.min(cents, maximumCents)
    : maximumCents;
}

export function benefitAmountFromInput(
  kind: "percent" | "fixedAnnual" | "fixedMonthly",
  value: string,
): ConfiguredAmount {
  if (kind === "percent") {
    const parsed = Number(value);
    const ratePpm = Number.isFinite(parsed) ? Math.round(parsed * 10_000) : 0;
    return {
      kind,
      ratePpm: Math.min(maximumRatePpm, Math.max(0, ratePpm)),
    } as const;
  }
  return {
    kind,
    cents: centsFromInput(
      value,
      kind === "fixedMonthly" ? maximumMonthlyCents : Number.MAX_SAFE_INTEGER,
    ),
  } as const;
}

export function esppDiscountFromInput(value: string): number {
  const parsed = Number(value);
  const ratePpm = Number.isFinite(parsed) ? Math.round(parsed * 10_000) : 0;
  return Math.min(maximumEsppDiscountPpm, Math.max(0, ratePpm));
}

export function planCalculationError(plan: StoredPlan): string | null {
  const aggregateError = planAggregateError(plan);
  if (aggregateError) return aggregateError;
  try {
    calculatePlan(plan);
    return null;
  } catch (error) {
    if (error instanceof RangeError) return error.message;
    throw error;
  }
}

export function acceptCalculablePlanDraft(
  plan: StoredPlan,
  accept: (plan: StoredPlan) => void,
): string | null {
  const parsed = storedPlanSchema.safeParse(plan);
  if (!parsed.success) {
    if (
      parsed.error.issues.some(
        ({ path }) =>
          path.includes("label") ||
          path.includes("name") ||
          path.includes("group"),
      )
    )
      return "Names and groups must contain 1 to 100 characters. The change was not saved.";
    if (
      parsed.error.issues.some(
        ({ message }) => message === PLAN_AGGREGATE_TOO_LARGE_MESSAGE,
      )
    )
      return PLAN_AGGREGATE_TOO_LARGE_MESSAGE;
    return "That plan change is not valid. The change was not saved.";
  }
  const error = planCalculationError(parsed.data);
  if (error) return error;
  accept(plan);
  return null;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function reconciliationFailureState(error: unknown): SaveState {
  if (error instanceof HttpError) return "sync-error";
  if (error instanceof TypeError) return "offline";
  return "local-error";
}

export function isExpiredSessionError(error: unknown): boolean {
  return error instanceof HttpError && error.status === 401;
}

export function isUncertainPlanCreationError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof HttpError &&
      (error.status === 408 || error.status === 409 || error.status >= 500))
  );
}

export function isRetryablePlanCreationRecoveryError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof HttpError &&
      (error.status === 408 || error.status >= 500))
  );
}

export function retryActionForSaveState(
  saveState: SaveState,
): "device" | "sync" | null {
  if (saveState === "local-error") return "device";
  if (saveState === "sync-error" || saveState === "offline") return "sync";
  return null;
}

const ACCOUNT_CHANGED_MESSAGE = "The active account changed in another tab.";

export async function jsonRequest<T>(
  url: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
  expectedAccountId?: string,
  expectedSessionId?: string,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (expectedAccountId) headers.set("X-Kyle-Account-Id", expectedAccountId);
  if (expectedSessionId)
    headers.set(EXPECTED_SESSION_HEADER, expectedSessionId);
  const controller = new AbortController();
  const callerSignal = init?.signal;
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  let timedOut = false;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });
    const responseText = await response.text();
    let body: Record<string, unknown>;
    try {
      if (!responseText) throw new SyntaxError("The response body was empty");
      const parsed: unknown = JSON.parse(responseText);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      )
        throw new SyntaxError("The response body was not a JSON object");
      body = parsed as Record<string, unknown>;
    } catch {
      throw new HttpError(
        response.ok
          ? "The server returned an invalid response."
          : `Request failed with status ${response.status}.`,
        response.status,
      );
    }
    if (
      response.status === 409 &&
      body.error === ACCOUNT_CHANGED_MESSAGE &&
      typeof window !== "undefined"
    )
      window.dispatchEvent(new Event("kyle-financial-account-change"));
    if (!response.ok)
      throw new HttpError(
        typeof body.error === "string" ? body.error : "Request failed",
        response.status,
      );
    const decoded = schema.safeParse(body);
    if (!decoded.success)
      throw new HttpError(
        "The server returned an invalid response.",
        response.status,
      );
    return decoded.data;
  } catch (error) {
    if (timedOut) throw new HttpError("The request timed out. Try again.", 408);
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}

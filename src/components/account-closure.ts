import { okResponseSchema, type User } from "@/domain/api-contracts";
import type {
  AccountClosureMode,
  RemoteAccountClosureOutcome,
} from "@/offline/database";
import { HttpError, jsonRequest } from "./plan-types";

export async function requestRemoteAccountClosure(
  user: User,
  mode: AccountClosureMode,
  signal: AbortSignal,
): Promise<RemoteAccountClosureOutcome> {
  if (!user.sessionId) return { status: "indeterminate" };
  try {
    await jsonRequest(
      mode === "delete" ? "/api/account" : "/api/auth/logout",
      okResponseSchema,
      {
        method: mode === "delete" ? "DELETE" : "POST",
        signal,
      },
      user.id,
      user.sessionId,
    );
    return { status: "confirmed" };
  } catch (error) {
    if (error instanceof HttpError && error.status === 409)
      return { status: "rejected", error };
    if (
      error instanceof HttpError &&
      ((mode === "logout" && error.status === 401) ||
        (mode === "delete" && error.status === 404))
    ) {
      return { status: "confirmed" };
    }
    return { status: "indeterminate" };
  }
}

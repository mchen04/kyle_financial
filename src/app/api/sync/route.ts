import { syncResponseSchema } from "@/domain/api-contracts";
import { currentUser, requestMatchesUser } from "@/server/auth/current-user";
import { database } from "@/server/database";
import {
  errorResponse,
  parseJsonRequest,
  validatedJsonResponse,
} from "@/server/http";
import { syncRequestSchema } from "@/server/request-contracts";
import {
  applySyncMutations,
  SyncPlanNotFoundError,
} from "@/server/sync/repository";

export async function POST(request: Request): Promise<Response> {
  const user = await currentUser();
  if (!user) return errorResponse(401, "Your session has expired.");
  if (!requestMatchesUser(request, user))
    return errorResponse(409, "The active account changed in another tab.");
  const parsed = await parseJsonRequest(request, syncRequestSchema);
  if (!parsed.success) return parsed.response;
  try {
    return validatedJsonResponse(
      syncResponseSchema,
      await applySyncMutations(database(), user.id, parsed.data.mutations),
    );
  } catch (error) {
    if (error instanceof SyncPlanNotFoundError) {
      return errorResponse(404, "Plan not found for sync");
    }
    return errorResponse(500, "Offline changes could not be reconciled.");
  }
}

import { okResponseSchema } from "@/domain/api-contracts";
import { currentUser, requestMatchesSession } from "@/server/auth/current-user";
import { deleteUser } from "@/server/auth/repository";
import { database } from "@/server/database";
import { errorResponse, validatedJsonResponse } from "@/server/http";

export async function DELETE(request: Request): Promise<Response> {
  const user = await currentUser();
  if (!user) return errorResponse(401, "Your session has expired.");
  if (!requestMatchesSession(request, user))
    return errorResponse(409, "The active account changed in another tab.");
  const deleted = await deleteUser(database(), user.id);
  if (!deleted) return errorResponse(404, "This account no longer exists.");
  return validatedJsonResponse(okResponseSchema, { ok: true });
}

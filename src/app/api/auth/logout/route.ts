import { cookies } from "next/headers";
import { okResponseSchema } from "@/domain/api-contracts";
import { currentUser, requestMatchesSession } from "@/server/auth/current-user";
import { revokeSession, SESSION_COOKIE } from "@/server/auth/repository";
import { database } from "@/server/database";
import { errorResponse, validatedJsonResponse } from "@/server/http";

export async function POST(request: Request): Promise<Response> {
  const user = await currentUser();
  if (!user) return errorResponse(401, "Your session has expired.");
  if (!requestMatchesSession(request, user))
    return errorResponse(409, "The active account changed in another tab.");
  const cookieStore = await cookies();
  await revokeSession(database(), cookieStore.get(SESSION_COOKIE)?.value);
  // The revoked token is inert. Expiring it in this response could overwrite a
  // newer login cookie if another tab authenticated while logout was in flight.
  return validatedJsonResponse(okResponseSchema, { ok: true });
}

import { userResponseSchema } from "@/domain/api-contracts";
import {
  currentUser,
  EXPECTED_ACCOUNT_HEADER,
} from "@/server/auth/current-user";
import { errorResponse, validatedJsonResponse } from "@/server/http";

export async function GET(request: Request): Promise<Response> {
  const user = await currentUser();
  if (!user) return errorResponse(401, "Your session has expired.");
  const expectedAccount = request.headers.get(EXPECTED_ACCOUNT_HEADER);
  if (expectedAccount && expectedAccount !== user.id)
    return errorResponse(409, "The active account changed in another tab.");
  return validatedJsonResponse(userResponseSchema, { user });
}

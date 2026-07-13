import { bootstrapResponseSchema } from "@/domain/api-contracts";
import { currentUser } from "@/server/auth/current-user";
import { database } from "@/server/database";
import { errorResponse, validatedJsonResponse } from "@/server/http";
import { listPlans } from "@/server/plans/repository";

export async function GET(): Promise<Response> {
  const user = await currentUser();
  if (!user) return errorResponse(401, "Your session has expired.");
  return validatedJsonResponse(bootstrapResponseSchema, {
    user,
    plans: await listPlans(database(), user.id),
  });
}

import { planResponseSchema } from "@/domain/api-contracts";
import { currentUser, requestMatchesUser } from "@/server/auth/current-user";
import { database } from "@/server/database";
import {
  errorResponse,
  parseJsonRequest,
  validatedJsonResponse,
} from "@/server/http";
import {
  copyPlanToYear,
  PlanYearConflictError,
  SourcePlanChangedError,
  SourcePlanNotFoundError,
} from "@/server/plans/repository";
import { copyPlanSchema } from "@/server/request-contracts";

export async function POST(request: Request): Promise<Response> {
  const user = await currentUser();
  if (!user) return errorResponse(401, "Your session has expired.");
  if (!requestMatchesUser(request, user))
    return errorResponse(409, "The active account changed in another tab.");
  const parsed = await parseJsonRequest(request, copyPlanSchema);
  if (!parsed.success) return parsed.response;
  const {
    sourceYear,
    targetYear,
    expectedSourceUpdatedAt,
    expectedSourceFieldVersions,
  } = parsed.data;
  try {
    const plan = await copyPlanToYear(
      database(),
      user.id,
      sourceYear,
      targetYear,
      expectedSourceUpdatedAt,
      expectedSourceFieldVersions,
    );
    return validatedJsonResponse(planResponseSchema, { plan }, { status: 201 });
  } catch (error) {
    if (error instanceof PlanYearConflictError)
      return errorResponse(409, "A plan already exists for that year.");
    if (error instanceof SourcePlanNotFoundError) {
      return errorResponse(404, "Source plan was not found");
    }
    if (error instanceof SourcePlanChangedError) {
      return errorResponse(
        409,
        "Source plan changed before it could be copied",
      );
    }
    return errorResponse(500, "The plan could not be copied.");
  }
}

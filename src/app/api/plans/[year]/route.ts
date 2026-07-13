import { planResponseSchema } from "@/domain/api-contracts";
import { planYearSchema } from "@/domain/plan-schema";
import { currentUser, requestMatchesUser } from "@/server/auth/current-user";
import { database } from "@/server/database";
import { errorResponse, validatedJsonResponse } from "@/server/http";
import { getPlanByYear } from "@/server/plans/repository";

function parseYear(value: string): number | null {
  const parsed = planYearSchema.safeParse(Number(value));
  return parsed.success ? parsed.data : null;
}

interface YearContext {
  params: Promise<{ year: string }>;
}

export async function GET(request: Request, context: YearContext) {
  const user = await currentUser();
  if (!user) return errorResponse(401, "Your session has expired.");
  if (!requestMatchesUser(request, user))
    return errorResponse(409, "The active account changed in another tab.");
  const { year: value } = await context.params;
  const year = parseYear(value);
  if (!year) return errorResponse(400, "Year is invalid.");
  const plan = await getPlanByYear(database(), user.id, year);
  return plan
    ? validatedJsonResponse(planResponseSchema, { plan })
    : errorResponse(404, "Plan not found.");
}

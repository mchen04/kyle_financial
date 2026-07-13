import type { ZodType } from "zod";

export function errorResponse(
  status: number,
  message: string,
  details?: unknown,
): Response {
  return Response.json(
    { error: message, ...(details ? { details } : {}) },
    { status },
  );
}

export async function parseJsonRequest<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<
  { success: true; data: T } | { success: false; response: Response }
> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return {
      success: false,
      response: errorResponse(400, "The request body is not valid JSON."),
    };
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return {
      success: false,
      response: errorResponse(
        400,
        "Check the highlighted information and try again.",
        parsed.error.flatten(),
      ),
    };
  }
  return { success: true, data: parsed.data };
}

export function validatedJsonResponse<T>(
  schema: ZodType<T>,
  value: unknown,
  init?: ResponseInit,
): Response {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    return errorResponse(500, "The server produced an invalid response.");
  return Response.json(parsed.data, init);
}

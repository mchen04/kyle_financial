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

/**
 * Rejects a write a browser made on another site's behalf.
 *
 * Authenticated routes are already safe: they require a custom header, which
 * forces a preflight no cross-origin form can satisfy. Sign-in and sign-up take
 * no such header, and `SameSite=Lax` governs whether a cookie is *sent*, not
 * whether one may be *set* — so a plain cross-site form post can silently sign
 * a visitor into an account the attacker controls, and everything they type
 * afterwards is written where the attacker can read it.
 */
export function crossSiteWriteResponse(request: Request): Response | undefined {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none")
    return errorResponse(403, "This request did not come from House by 30.");
  // The `Origin` header is deliberately not compared against this request's
  // own URL: behind a proxy that URL is the internal one, so the comparison
  // rejects legitimate sign-ins rather than attacks.
  //
  // A cross-origin form can only send these three content types, and anything
  // else from another site needs a preflight this app never answers. So
  // requiring JSON is what actually closes the hole for browsers too old to
  // send `Sec-Fetch-Site`.
  const contentType = request.headers.get("content-type")?.split(";")[0].trim();
  if (
    contentType === "text/plain" ||
    contentType === "application/x-www-form-urlencoded" ||
    contentType === "multipart/form-data"
  )
    return errorResponse(415, "Send this request as application/json.");
  return undefined;
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

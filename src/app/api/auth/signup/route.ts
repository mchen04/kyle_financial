import { signupAcceptedResponseSchema } from "@/domain/api-contracts";
import { registerInvitedUser } from "@/server/auth/repository";
import {
  authenticationRateLimitResponse,
  consumeAuthenticationIdentityAttempt,
  consumeAuthenticationIpAttempt,
} from "@/server/auth/rate-limit";
import { database } from "@/server/database";
import {
  errorResponse,
  parseJsonRequest,
  validatedJsonResponse,
} from "@/server/http";
import { signupCredentialsSchema } from "@/server/request-contracts";

export async function POST(request: Request): Promise<Response> {
  try {
    const ipRateLimit = await consumeAuthenticationIpAttempt(
      database(),
      request,
      "signup",
    );
    if (!ipRateLimit.allowed)
      return authenticationRateLimitResponse(ipRateLimit);
  } catch {
    return errorResponse(500, "The account could not be created.");
  }
  const parsed = await parseJsonRequest(request, signupCredentialsSchema);
  if (!parsed.success) return parsed.response;
  try {
    const identityRateLimit = await consumeAuthenticationIdentityAttempt(
      database(),
      "signup",
      parsed.data.email,
    );
    if (!identityRateLimit.allowed)
      return authenticationRateLimitResponse(identityRateLimit);
    await registerInvitedUser(
      database(),
      parsed.data.email,
      parsed.data.password,
      process.env.REGISTRATION_SECRET,
      parsed.data.invitationCode,
    );
  } catch {
    return errorResponse(500, "The account could not be created.");
  }
  return validatedJsonResponse(
    signupAcceptedResponseSchema,
    { accepted: true },
    { status: 202 },
  );
}

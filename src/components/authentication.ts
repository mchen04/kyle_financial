import {
  signupAcceptedResponseSchema,
  userResponseSchema,
  type User,
} from "@/domain/api-contracts";
import { jsonRequest } from "./plan-types";

export async function authenticateWithOwner(
  mode: "signup" | "login",
  credentials: {
    email: FormDataEntryValue | null;
    password: FormDataEntryValue | null;
    invitationCode?: FormDataEntryValue | null;
  },
  ownerSignal: AbortSignal,
): Promise<User> {
  const request = {
    method: "POST",
    signal: ownerSignal,
  };
  if (mode === "signup") {
    await jsonRequest("/api/auth/signup", signupAcceptedResponseSchema, {
      ...request,
      body: JSON.stringify(credentials),
    });
    if (ownerSignal.aborted)
      throw ownerSignal.reason ?? new DOMException("Aborted", "AbortError");
  }
  const response = await jsonRequest("/api/auth/login", userResponseSchema, {
    ...request,
    body: JSON.stringify({
      email: credentials.email,
      password: credentials.password,
    }),
  });
  if (ownerSignal.aborted)
    throw ownerSignal.reason ?? new DOMException("Aborted", "AbortError");
  return response.user;
}

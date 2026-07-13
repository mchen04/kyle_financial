import "server-only";

import { cookies } from "next/headers";
import {
  EXPECTED_SESSION_HEADER,
  type AuthenticatedUser,
  type User,
} from "@/domain/api-contracts";
import { database } from "../database";
import { findSessionUser, SESSION_COOKIE } from "./repository";

export const EXPECTED_ACCOUNT_HEADER = "X-Kyle-Account-Id";
export { EXPECTED_SESSION_HEADER };

export async function currentUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  return findSessionUser(database(), cookieStore.get(SESSION_COOKIE)?.value);
}

export function requestMatchesUser(request: Request, user: User): boolean {
  return request.headers.get(EXPECTED_ACCOUNT_HEADER) === user.id;
}

export function requestMatchesSession(
  request: Request,
  user: AuthenticatedUser,
): boolean {
  return (
    requestMatchesUser(request, user) &&
    request.headers.get(EXPECTED_SESSION_HEADER) === user.sessionId
  );
}

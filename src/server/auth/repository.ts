import "server-only";

import { randomUUID } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import {
  authenticatedUserSchema,
  userSchema,
  type AuthenticatedUser,
  type User,
} from "@/domain/api-contracts";
import { isUniqueConstraintViolation } from "@/server/postgres-errors";
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  verifyAuthenticationPassword,
} from "./crypto";
import { isRegistrationInviteValid } from "./registration-invite";

export const SESSION_COOKIE = "kyle_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

interface CreatedSession {
  id: string;
  token: string;
  expiresAt: Date;
}

export class EmailAlreadyRegisteredError extends Error {}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function insertUser(
  sql: Sql | TransactionSql,
  email: string,
  passwordHash: string,
): Promise<User> {
  try {
    const rows = await sql<User[]>`
      INSERT INTO users (email, password_hash)
      VALUES (${email}, ${passwordHash})
      RETURNING id, email
    `;
    return userSchema.parse(rows[0]);
  } catch (error) {
    if (isUniqueConstraintViolation(error))
      throw new EmailAlreadyRegisteredError();
    throw error;
  }
}

function prepareSession(): CreatedSession {
  return {
    id: randomUUID(),
    token: createSessionToken(),
    expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1_000),
  };
}

async function insertSession(
  sql: Sql | TransactionSql,
  userId: string,
  session: CreatedSession,
): Promise<void> {
  await sql`
    INSERT INTO sessions (id, user_id, token_hash, expires_at)
    VALUES (${session.id}, ${userId}, ${hashSessionToken(session.token)}, ${session.expiresAt})
  `;
}

export async function createUser(
  sql: Sql,
  email: string,
  password: string,
): Promise<User> {
  const normalized = normalizeEmail(email);
  const passwordHash = await hashPassword(password);
  return insertUser(sql, normalized, passwordHash);
}

export async function registerInvitedUser(
  sql: Sql,
  email: string,
  password: string,
  registrationSecret: string | undefined,
  invitationCode: string,
): Promise<void> {
  if (!isRegistrationInviteValid(registrationSecret, invitationCode)) return;
  try {
    await createUser(sql, email, password);
  } catch (error) {
    if (!(error instanceof EmailAlreadyRegisteredError)) throw error;
  }
}

export async function authenticateUser(
  sql: Sql,
  email: string,
  password: string,
): Promise<User | null> {
  const rows = await sql<(User & { password_hash: string })[]>`
    SELECT id, email, password_hash
    FROM users
    WHERE email = ${normalizeEmail(email)}
  `;
  const row = rows[0];
  const passwordMatches = await verifyAuthenticationPassword(
    password,
    row?.password_hash,
  );
  if (!row || !passwordMatches) return null;
  return { id: row.id, email: row.email };
}

export async function createSession(
  sql: Sql,
  user: User,
): Promise<CreatedSession> {
  const session = prepareSession();
  await sql.begin(async (transaction) => {
    await deleteExpiredSessions(transaction);
    await insertSession(transaction, user.id, session);
  });
  return session;
}

export async function findSessionUser(
  sql: Sql,
  token: string | undefined,
  now = new Date(),
): Promise<AuthenticatedUser | null> {
  if (!token) return null;
  const rows = await sql<Record<string, unknown>[]>`
    SELECT users.id, users.email, sessions.id AS "sessionId"
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ${hashSessionToken(token)}
      AND sessions.expires_at > ${now}
  `;
  return rows[0] ? authenticatedUserSchema.parse(rows[0]) : null;
}

export async function revokeSession(
  sql: Sql,
  token: string | undefined,
): Promise<void> {
  if (!token) return;
  await sql`DELETE FROM sessions WHERE token_hash = ${hashSessionToken(token)}`;
}

export async function deleteUser(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    DELETE FROM users WHERE id = ${userId} RETURNING id
  `;
  return rows.length === 1;
}

export async function deleteExpiredSessions(
  sql: Sql | TransactionSql,
  now = new Date(),
  limit = 500,
): Promise<number> {
  const rows = await sql<{ id: string }[]>`
    DELETE FROM sessions
    WHERE id IN (
      SELECT id FROM sessions
      WHERE expires_at <= ${now}
      ORDER BY expires_at
      LIMIT ${limit}
    )
    RETURNING id
  `;
  return rows.length;
}

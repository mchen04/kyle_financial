import "server-only";

import { createHash } from "node:crypto";
import type { Sql } from "postgres";

export type AuthenticationAction = "login" | "signup";

interface RateLimitPolicy {
  limit: number;
  windowSeconds: number;
}

interface AuthenticationPolicy {
  identity: RateLimitPolicy;
  ip: RateLimitPolicy;
}

const AUTHENTICATION_POLICIES: Record<
  AuthenticationAction,
  AuthenticationPolicy
> = {
  login: {
    ip: { limit: 30, windowSeconds: 15 * 60 },
    identity: { limit: 10, windowSeconds: 15 * 60 },
  },
  signup: {
    ip: { limit: 5, windowSeconds: 60 * 60 },
    identity: { limit: 3, windowSeconds: 60 * 60 },
  },
};

export const AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE = 100;
export const AUTH_RATE_LIMIT_RETENTION_SECONDS = 65 * 60;

interface ConsumedBucket {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface AuthenticationRateLimit {
  allowed: boolean;
  retryAfterSeconds: number;
}

async function cleanupExpiredBuckets(sql: Sql, now: Date): Promise<void> {
  const cutoff = new Date(
    now.getTime() - AUTH_RATE_LIMIT_RETENTION_SECONDS * 1_000,
  );
  await sql`
    WITH expired AS (
      SELECT scope, key_hash
      FROM auth_rate_limits
      WHERE window_started_at < ${cutoff}
      ORDER BY window_started_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE}
    )
    DELETE FROM auth_rate_limits AS bucket
    USING expired
    WHERE bucket.scope = expired.scope
      AND bucket.key_hash = expired.key_hash
  `;
}

function hashRateLimitKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function consumeBucket(
  sql: Sql,
  scope: string,
  value: string,
  policy: RateLimitPolicy,
  now: Date,
): Promise<ConsumedBucket> {
  const rows = await sql<{ attemptCount: number; windowStartedAt: Date }[]>`
    INSERT INTO auth_rate_limits (
      scope,
      key_hash,
      window_started_at,
      attempt_count
    )
    VALUES (${scope}, ${hashRateLimitKey(value)}, ${now}, 1)
    ON CONFLICT (scope, key_hash) DO UPDATE SET
      window_started_at = CASE
        WHEN auth_rate_limits.window_started_at
          + make_interval(secs => ${policy.windowSeconds}) <= ${now}
        THEN ${now}
        ELSE auth_rate_limits.window_started_at
      END,
      attempt_count = CASE
        WHEN auth_rate_limits.window_started_at
          + make_interval(secs => ${policy.windowSeconds}) <= ${now}
        THEN 1
        ELSE LEAST(auth_rate_limits.attempt_count + 1, ${policy.limit + 1})
      END
    RETURNING
      attempt_count AS "attemptCount",
      window_started_at AS "windowStartedAt"
  `;
  const bucket = rows[0];
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil(
      (bucket.windowStartedAt.getTime() +
        policy.windowSeconds * 1_000 -
        now.getTime()) /
        1_000,
    ),
  );
  return {
    allowed: bucket.attemptCount <= policy.limit,
    retryAfterSeconds,
  };
}

export async function consumeAuthenticationIpAttempt(
  sql: Sql,
  request: Request,
  action: AuthenticationAction,
  now = new Date(),
): Promise<AuthenticationRateLimit> {
  await cleanupExpiredBuckets(sql, now);
  const policy = AUTHENTICATION_POLICIES[action];
  const ip = request.headers.get("x-real-ip")?.trim() || "unknown";
  return consumeBucket(sql, `${action}:ip`, ip, policy.ip, now);
}

export function consumeAuthenticationIdentityAttempt(
  sql: Sql,
  action: AuthenticationAction,
  normalizedEmail: string,
  now = new Date(),
): Promise<AuthenticationRateLimit> {
  return consumeBucket(
    sql,
    `${action}:identity`,
    normalizedEmail,
    AUTHENTICATION_POLICIES[action].identity,
    now,
  );
}

export function authenticationRateLimitResponse(
  limit: AuthenticationRateLimit,
): Response {
  return Response.json(
    { error: "Too many attempts. Wait before trying again." },
    {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    },
  );
}

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { testSql } from "@/test/database";
import {
  AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE,
  authenticationRateLimitResponse,
  consumeAuthenticationIdentityAttempt,
  consumeAuthenticationIpAttempt,
  type AuthenticationAction,
  type AuthenticationRateLimit,
} from "./rate-limit";

const sql = testSql();
const reactivationSql = testSql();
const cleanupSql = testSql();

afterAll(async () => {
  await Promise.all([sql.end(), reactivationSql.end(), cleanupSql.end()]);
});

beforeEach(async () => {
  await sql`DELETE FROM auth_rate_limits`;
});

function request(ip: string): Request {
  return new Request("https://example.test/api/auth/login", {
    headers: { "x-real-ip": ip },
  });
}

async function consumeAttempt(
  authRequest: Request,
  action: AuthenticationAction,
  email: string,
  now: Date,
): Promise<AuthenticationRateLimit> {
  const ipBucket = await consumeAuthenticationIpAttempt(
    sql,
    authRequest,
    action,
    now,
  );
  if (!ipBucket.allowed) return ipBucket;
  return consumeAuthenticationIdentityAttempt(sql, action, email, now);
}

describe("distributed authentication throttling", () => {
  it("bounds account creation per IP before accepting another identity", async () => {
    const now = new Date("2026-07-13T18:00:00.000Z");
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expect(
        consumeAttempt(
          request("203.0.113.10"),
          "signup",
          `person-${attempt}@example.com`,
          now,
        ),
      ).resolves.toMatchObject({ allowed: true });
    }

    await expect(
      consumeAttempt(
        request("203.0.113.10"),
        "signup",
        "blocked@example.com",
        now,
      ),
    ).resolves.toEqual({ allowed: false, retryAfterSeconds: 3600 });
    const blockedIdentity = await sql<{ count: number }[]>`
      SELECT count(*)::integer AS count
      FROM auth_rate_limits
      WHERE scope = 'signup:identity'
    `;
    expect(blockedIdentity[0].count).toBe(5);
  });

  it("atomically limits one login identity across concurrent function calls", async () => {
    const now = new Date("2026-07-13T18:15:00.000Z");
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        consumeAuthenticationIdentityAttempt(
          sql,
          "login",
          "target@example.com",
          now,
        ),
      ),
    );

    expect(results.filter(({ allowed }) => allowed)).toHaveLength(10);
    expect(results.filter(({ allowed }) => !allowed)).toHaveLength(2);
  });

  it("resets an expired window and stores only hashed keys", async () => {
    const start = new Date("2026-07-13T19:00:00.000Z");
    for (let attempt = 0; attempt < 11; attempt += 1) {
      await consumeAuthenticationIdentityAttempt(
        sql,
        "login",
        "private@example.com",
        start,
      );
    }
    const reset = await consumeAuthenticationIdentityAttempt(
      sql,
      "login",
      "private@example.com",
      new Date("2026-07-13T19:15:00.000Z"),
    );
    expect(reset.allowed).toBe(true);
    await consumeAuthenticationIpAttempt(
      sql,
      request("192.0.2.99"),
      "login",
      new Date("2026-07-13T19:15:00.000Z"),
    );

    const rows = await sql<{ keyHash: string }[]>`
      SELECT key_hash AS "keyHash" FROM auth_rate_limits
    `;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(({ keyHash }) => /^[0-9a-f]{64}$/.test(keyHash))).toBe(
      true,
    );
    expect(JSON.stringify(rows)).not.toContain("private@example.com");
    expect(JSON.stringify(rows)).not.toContain("192.0.2");
  });

  it("returns a machine-actionable 429 response", async () => {
    const response = authenticationRateLimitResponse({
      allowed: false,
      retryAfterSeconds: 47,
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("47");
    await expect(response.json()).resolves.toEqual({
      error: "Too many attempts. Wait before trying again.",
    });
  });

  it("cleans expired high-cardinality buckets in bounded request-path batches", async () => {
    const now = new Date("2026-07-13T21:00:00.000Z");
    await sql`
      INSERT INTO auth_rate_limits (
        scope,
        key_hash,
        window_started_at,
        attempt_count
      )
      SELECT
        'login:ip',
        lpad(to_hex(value), 64, '0'),
        ${new Date("2026-07-13T19:00:00.000Z")},
        1
      FROM generate_series(1, 250) AS value
    `;

    await consumeAuthenticationIpAttempt(
      sql,
      request("203.0.113.101"),
      "login",
      now,
    );
    const expiredCount = async () => {
      const rows = await sql<{ count: number }[]>`
        SELECT count(*)::integer AS count
        FROM auth_rate_limits
        WHERE window_started_at < ${new Date("2026-07-13T19:55:00.000Z")}
      `;
      return rows[0].count;
    };
    expect(await expiredCount()).toBe(250 - AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE);

    await consumeAuthenticationIpAttempt(
      sql,
      request("203.0.113.102"),
      "login",
      now,
    );
    await consumeAuthenticationIpAttempt(
      sql,
      request("203.0.113.103"),
      "login",
      now,
    );
    expect(await expiredCount()).toBe(0);
  });

  it("does not delete a bucket while a concurrent upsert reactivates it", async () => {
    const now = new Date("2026-07-13T22:00:00.000Z");
    const keyHash = "a".repeat(64);
    await sql`
      INSERT INTO auth_rate_limits (
        scope,
        key_hash,
        window_started_at,
        attempt_count
      )
      VALUES (
        'login:ip',
        ${keyHash},
        ${new Date("2026-07-13T20:00:00.000Z")},
        9
      )
    `;

    let releaseReactivation!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseReactivation = resolve;
    });
    let markReactivated!: () => void;
    const reactivated = new Promise<void>((resolve) => {
      markReactivated = resolve;
    });
    const upsert = reactivationSql.begin(async (transaction) => {
      await transaction`
        INSERT INTO auth_rate_limits (
          scope,
          key_hash,
          window_started_at,
          attempt_count
        )
        VALUES ('login:ip', ${keyHash}, ${now}, 1)
        ON CONFLICT (scope, key_hash) DO UPDATE SET
          window_started_at = EXCLUDED.window_started_at,
          attempt_count = EXCLUDED.attempt_count
      `;
      markReactivated();
      await release;
    });
    await reactivated;

    const cleanup = consumeAuthenticationIpAttempt(
      cleanupSql,
      request("203.0.113.104"),
      "login",
      now,
    );
    let timeout: ReturnType<typeof setTimeout>;
    const completion = await Promise.race([
      cleanup.then(
        () => ({ status: "completed" as const }),
        (error: unknown) => ({ status: "failed" as const, error }),
      ),
      new Promise<{ status: "blocked" }>((resolve) => {
        timeout = setTimeout(() => resolve({ status: "blocked" }), 500);
      }),
    ]);
    clearTimeout(timeout!);
    releaseReactivation();
    await upsert;
    if (completion.status === "failed") throw completion.error;
    expect(completion.status).toBe("completed");
    await cleanup;

    const rows = await sql<{ attemptCount: number; windowStartedAt: Date }[]>`
      SELECT
        attempt_count AS "attemptCount",
        window_started_at AS "windowStartedAt"
      FROM auth_rate_limits
      WHERE scope = 'login:ip' AND key_hash = ${keyHash}
    `;
    expect(rows).toEqual([{ attemptCount: 1, windowStartedAt: now }]);
  });
});

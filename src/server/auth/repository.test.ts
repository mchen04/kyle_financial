import { afterAll, describe, expect, it } from "vitest";
import { testSql } from "../../test/database";
import {
  authenticateUser,
  createSession,
  createUser,
  deleteExpiredSessions,
  deleteUser,
  EmailAlreadyRegisteredError,
  findSessionUser,
  registerPublicUser,
  revokeSession,
} from "./repository";

const sql = testSql();

afterAll(async () => {
  await sql.end();
});

describe("account authentication", () => {
  it("hashes credentials, normalizes email, and authenticates", async () => {
    const user = await createUser(
      sql,
      "  OWNER@Example.com ",
      "correct horse battery staple",
    );
    expect(user.email).toBe("owner@example.com");
    expect(
      await authenticateUser(sql, "OWNER@example.com", "wrong"),
    ).toBeNull();
    expect(
      await authenticateUser(sql, "missing@example.com", "wrong"),
    ).toBeNull();
    expect(
      await authenticateUser(
        sql,
        "owner@example.com",
        "correct horse battery staple",
      ),
    ).toEqual(user);

    const stored = await sql<{ password_hash: string }[]>`
      SELECT password_hash FROM users WHERE id = ${user.id}
    `;
    expect(stored[0].password_hash).not.toContain("correct horse");
    expect(stored[0].password_hash).toMatch(/^pbkdf2_sha256\$600000\$/);
  });

  it("translates duplicate email constraints into a domain outcome", async () => {
    const email = "duplicate-account@example.com";
    await createUser(sql, email, "first sufficiently long password");

    await expect(
      createUser(sql, email, "second sufficiently long password"),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
  });

  it("registers a public identity without replacing an existing password", async () => {
    const submittedPassword = "attacker selected password";
    const existing = await createUser(
      sql,
      "public-existing@example.com",
      "existing account password",
    );

    const publicEmail = "public-new@example.com";
    await registerPublicUser(sql, publicEmail, submittedPassword);
    await expect(
      authenticateUser(sql, publicEmail, submittedPassword),
    ).resolves.toMatchObject({ email: publicEmail });

    await registerPublicUser(sql, existing.email, submittedPassword);
    await expect(
      authenticateUser(sql, existing.email, "existing account password"),
    ).resolves.toEqual(existing);
    await expect(
      authenticateUser(sql, existing.email, submittedPassword),
    ).resolves.toBeNull();
  });

  it("creates, expires, and revokes opaque sessions", async () => {
    const user = await createUser(
      sql,
      "session@example.com",
      "a strong local password",
    );
    const session = await createSession(sql, user);
    expect(session.token).toHaveLength(43);
    expect(await findSessionUser(sql, session.token)).toEqual({
      ...user,
      sessionId: session.id,
    });
    expect(
      await findSessionUser(sql, session.token, new Date("2100-01-01")),
    ).toBeNull();

    await sql`UPDATE sessions SET expires_at = now() - interval '1 day' WHERE user_id = ${user.id}`;
    expect(await deleteExpiredSessions(sql)).toBe(1);
    expect(await findSessionUser(sql, session.token)).toBeNull();

    const replacement = await createSession(sql, user);
    await revokeSession(sql, replacement.token);
    expect(await findSessionUser(sql, replacement.token)).toBeNull();
  });

  it("opportunistically removes expired sessions during session creation", async () => {
    const expiredUser = await createUser(
      sql,
      "expired-cleanup@example.com",
      "expired cleanup password",
    );
    await createSession(sql, expiredUser);
    await sql`UPDATE sessions SET expires_at = now() - interval '1 day' WHERE user_id = ${expiredUser.id}`;
    const activeUser = await createUser(
      sql,
      "active-cleanup@example.com",
      "active cleanup password",
    );

    await createSession(sql, activeUser);

    const expired = await sql<{ count: string }[]>`
      SELECT count(*) FROM sessions WHERE user_id = ${expiredUser.id}
    `;
    expect(Number(expired[0].count)).toBe(0);
  });

  it("deletes the account and cascades its sessions", async () => {
    const user = await createUser(
      sql,
      "delete-me@example.com",
      "another strong local password",
    );
    const session = await createSession(sql, user);

    expect(await deleteUser(sql, user.id)).toBe(true);
    expect(await findSessionUser(sql, session.token)).toBeNull();
    expect(await deleteUser(sql, user.id)).toBe(false);
  });
});

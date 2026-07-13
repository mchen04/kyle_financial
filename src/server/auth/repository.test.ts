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
  registerInvitedUser,
  revokeSession,
} from "./repository";
import { createRegistrationInvite } from "./registration-invite";

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

  it("makes uninvited new and existing identities indistinguishable to signup then login", async () => {
    const secret = "test-registration-secret-with-at-least-32-bytes";
    const submittedPassword = "attacker selected password";
    const existing = await createUser(
      sql,
      "invitation-existing@example.com",
      "existing account password",
    );
    const wrongInvitation = "x".repeat(43);

    await registerInvitedUser(
      sql,
      "invitation-new@example.com",
      submittedPassword,
      secret,
      wrongInvitation,
    );
    await registerInvitedUser(
      sql,
      existing.email,
      submittedPassword,
      secret,
      wrongInvitation,
    );

    await expect(
      authenticateUser(sql, "invitation-new@example.com", submittedPassword),
    ).resolves.toBeNull();
    await expect(
      authenticateUser(sql, existing.email, submittedPassword),
    ).resolves.toBeNull();

    const invitedEmail = "invitation-authorized@example.com";
    await registerInvitedUser(
      sql,
      invitedEmail,
      submittedPassword,
      secret,
      createRegistrationInvite(secret),
    );
    await expect(
      authenticateUser(sql, invitedEmail, submittedPassword),
    ).resolves.toMatchObject({ email: invitedEmail });

    const secondInvitedEmail = "second-invitation-authorized@example.com";
    await registerInvitedUser(
      sql,
      secondInvitedEmail,
      submittedPassword,
      secret,
      createRegistrationInvite(secret),
    );
    await expect(
      authenticateUser(sql, secondInvitedEmail, submittedPassword),
    ).resolves.toMatchObject({ email: secondInvitedEmail });

    await registerInvitedUser(
      sql,
      existing.email,
      submittedPassword,
      secret,
      createRegistrationInvite(secret),
    );
    await expect(
      authenticateUser(sql, existing.email, "existing account password"),
    ).resolves.toEqual(existing);
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

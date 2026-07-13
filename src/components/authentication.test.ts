import { describe, expect, it, vi } from "vitest";
import { authenticateWithOwner } from "./authentication";

describe("authentication request ownership", () => {
  it("registers opaquely and signs in a newly accepted identity", async () => {
    const owner = new AbortController();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ accepted: true }, { status: 202 }))
      .mockResolvedValueOnce(
        Response.json({
          user: {
            id: "00000000-0000-4000-8000-000000000030",
            email: "new@example.test",
            sessionId: "00000000-0000-4000-8000-000000000031",
          },
        }),
      );

    await expect(
      authenticateWithOwner(
        "signup",
        {
          email: "new@example.test",
          password: "password-a",
          invitationCode: "invitation-a",
        },
        owner.signal,
      ),
    ).resolves.toMatchObject({ email: "new@example.test" });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/auth/signup",
      "/api/auth/login",
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      email: "new@example.test",
      password: "password-a",
      invitationCode: "invitation-a",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      email: "new@example.test",
      password: "password-a",
    });
    fetchMock.mockRestore();
  });

  it("does not start login after its owner ends during signup", async () => {
    const owner = new AbortController();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () => {
        owner.abort();
        return Response.json({ accepted: true }, { status: 202 });
      });

    await expect(
      authenticateWithOwner(
        "signup",
        {
          email: "new@example.test",
          password: "password-a",
          invitationCode: "invitation-a",
        },
        owner.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledOnce();
    fetchMock.mockRestore();
  });

  it("cancels a deferred login when its app owner unmounts", async () => {
    const owner = new AbortController();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const authentication = authenticateWithOwner(
      "login",
      { email: "a@example.test", password: "password-a" },
      owner.signal,
    );

    owner.abort();

    await expect(authentication).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    fetchMock.mockRestore();
  });
});

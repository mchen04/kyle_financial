import { afterEach, describe, expect, it, vi } from "vitest";
import { requestRemoteAccountClosure } from "./account-closure";
import {
  authenticationBroadcastTransition,
  userWithLatestSession,
} from "./sync-state";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("account closure session causality", () => {
  it("publishes a same-account session received between startup ownership and user state", async () => {
    const transition = authenticationBroadcastTransition(
      "user-a",
      null,
      {
        userId: "user-a",
        sessionId: "00000000-0000-4000-8000-000000000002",
      },
      vi.fn(),
    );
    const startupUser = userWithLatestSession(
      {
        id: "user-a",
        email: "a@example.com",
        sessionId: "00000000-0000-4000-8000-000000000001",
      },
      transition.sessionIdentity ?? null,
    );
    let closedSession = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        closedSession =
          new Headers(init?.headers).get("X-Kyle-Session-Id") ?? "";
        return Response.json({ ok: true });
      }),
    );

    await expect(
      requestRemoteAccountClosure(
        startupUser,
        "logout",
        new AbortController().signal,
      ),
    ).resolves.toEqual({ status: "confirmed" });
    expect(closedSession).toBe("00000000-0000-4000-8000-000000000002");
  });

  it("refreshes a pre-rerender user snapshot from the broadcast session", async () => {
    const renderedUser = {
      id: "user-a",
      email: "a@example.com",
      sessionId: "00000000-0000-4000-8000-000000000001",
    };
    const transition = authenticationBroadcastTransition(
      "user-a",
      renderedUser,
      {
        userId: "user-a",
        sessionId: "00000000-0000-4000-8000-000000000002",
      },
      vi.fn(),
    );
    const closingUser = userWithLatestSession(
      renderedUser,
      transition.sessionIdentity ?? null,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(new Headers(init?.headers).get("X-Kyle-Session-Id")).toBe(
          "00000000-0000-4000-8000-000000000002",
        );
        return Response.json({ ok: true });
      }),
    );

    await expect(
      requestRemoteAccountClosure(
        closingUser,
        "logout",
        new AbortController().signal,
      ),
    ).resolves.toEqual({ status: "confirmed" });
  });
});

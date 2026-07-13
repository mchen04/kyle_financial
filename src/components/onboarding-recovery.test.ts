import { describe, expect, it, vi } from "vitest";
import { HttpError } from "./plan-types";
import { recoverPlanCreationWithBackoff } from "./onboarding-recovery";

const pauseImmediately = () =>
  vi.fn((delayMs: number, signal: AbortSignal) => {
    void delayMs;
    void signal;
    return Promise.resolve();
  });

describe("uncertain plan creation recovery", () => {
  it("polls through a delayed commit and stops at the first authoritative match", async () => {
    const recover = vi
      .fn<(year: number) => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const pause = pauseImmediately();

    await expect(
      recoverPlanCreationWithBackoff(recover, 2026, {
        delaysMs: [0, 250, 500, 1_000],
        pause,
      }),
    ).resolves.toBe(true);
    expect(recover).toHaveBeenCalledTimes(3);
    expect(recover.mock.calls.map(([year]) => year)).toEqual([
      2026, 2026, 2026,
    ]);
    expect(pause.mock.calls.map(([delay]) => delay)).toEqual([250, 500]);
  });

  it("ends after its bounded recovery window", async () => {
    const recover = vi.fn(async () => false);
    const pause = pauseImmediately();

    await expect(
      recoverPlanCreationWithBackoff(recover, 2026, {
        delaysMs: [0, 250, 500],
        pause,
      }),
    ).resolves.toBe(false);
    expect(recover).toHaveBeenCalledTimes(3);
    expect(pause.mock.calls.map(([delay]) => delay)).toEqual([250, 500]);
  });

  it("continues after a transient read failure", async () => {
    const recover = vi
      .fn<(year: number) => Promise<boolean>>()
      .mockRejectedValueOnce(new TypeError("network changed"))
      .mockResolvedValueOnce(true);
    const pause = pauseImmediately();

    await expect(
      recoverPlanCreationWithBackoff(recover, 2026, {
        delaysMs: [0, 250],
        pause,
      }),
    ).resolves.toBe(true);
    expect(recover).toHaveBeenCalledTimes(2);
  });

  it("propagates session expiry without another attempt", async () => {
    const expired = new HttpError("expired", 401);
    const recover = vi.fn(async () => {
      throw expired;
    });
    const pause = pauseImmediately();

    await expect(
      recoverPlanCreationWithBackoff(recover, 2026, {
        delaysMs: [0, 250],
        pause,
      }),
    ).rejects.toBe(expired);
    expect(recover).toHaveBeenCalledOnce();
    expect(pause).not.toHaveBeenCalled();
  });

  it("aborts a stalled recovery read at the overall deadline", async () => {
    vi.useFakeTimers();
    const recover = vi.fn(
      (_year: number, signal: AbortSignal) =>
        new Promise<boolean>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );

    const recovery = recoverPlanCreationWithBackoff(recover, 2026, {
      delaysMs: [0, 250],
      pause: async () => undefined,
      timeoutMs: 5_000,
    });
    const result = expect(recovery).resolves.toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);

    await result;
    expect(recover).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("rejects success that arrives after the overall deadline", async () => {
    vi.useFakeTimers();
    const recover = vi.fn(
      () =>
        new Promise<boolean>((resolve) =>
          globalThis.setTimeout(() => resolve(true), 30),
        ),
    );

    const recovery = recoverPlanCreationWithBackoff(recover, 2026, {
      delaysMs: [0],
      pause: pauseImmediately(),
      timeoutMs: 5,
    });
    const result = expect(recovery).resolves.toBe(false);
    await vi.advanceTimersByTimeAsync(5);

    await result;
    expect(recover).toHaveBeenCalledOnce();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("stops polling when the owning component unmounts", async () => {
    const owner = new AbortController();
    const recover = vi.fn(async () => false);
    const recovery = recoverPlanCreationWithBackoff(recover, 2026, {
      delaysMs: [0, 10_000],
      timeoutMs: 20_000,
      ownerSignal: owner.signal,
    });
    await vi.waitFor(() => expect(recover).toHaveBeenCalledOnce());

    owner.abort();

    await expect(recovery).resolves.toBe(false);
    expect(recover).toHaveBeenCalledOnce();
  });

  it("does not begin recovery for an owner that is already unmounted", async () => {
    const owner = new AbortController();
    owner.abort();
    const recover = vi.fn(async () => true);

    await expect(
      recoverPlanCreationWithBackoff(recover, 2026, {
        delaysMs: [0],
        ownerSignal: owner.signal,
      }),
    ).resolves.toBe(false);
    expect(recover).not.toHaveBeenCalled();
  });
});

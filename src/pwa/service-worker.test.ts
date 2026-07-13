import { describe, expect, it, vi } from "vitest";
import { renderServiceWorker } from "./service-worker";
import { startServiceWorker, type WorkerScope } from "./service-worker-runtime";

describe("versioned service worker", () => {
  it("changes script bytes and cache identity with the build ID", () => {
    const first = renderServiceWorker("build-a");
    const second = renderServiceWorker("build-b");

    expect(first).not.toBe(second);
    expect(first).toContain('self, "kyle-shell-build-a"');
    expect(second).toContain('self, "kyle-shell-build-b"');
    expect(first).toContain('from "/sw-runtime.js"');
  });

  it("deletes older shell caches while leaving unrelated caches alone", async () => {
    const listeners = new Map<string, (event: unknown) => void>();
    const deleteCache = vi.fn(async (key: string) => key.length > 0);
    const claim = vi.fn(async () => undefined);
    startServiceWorker(
      {
        caches: {
          keys: async () => [
            "kyle-shell-old-a",
            "kyle-shell-current",
            "kyle-shell-old-b",
            "unrelated-cache",
          ],
          delete: deleteCache,
          open: vi.fn(),
          match: vi.fn(),
        },
        location: { origin: "https://example.test" },
        clients: { claim },
        fetch: vi.fn(),
        skipWaiting: vi.fn(),
        addEventListener: (name: string, listener: (event: unknown) => void) =>
          listeners.set(name, listener),
      } as WorkerScope,
      "kyle-shell-current",
    );
    let activation: Promise<unknown> | undefined;
    listeners.get("activate")?.({
      waitUntil: (work: Promise<unknown>) => {
        activation = work;
      },
    });
    await activation;

    expect(deleteCache.mock.calls.map(([key]) => key)).toEqual([
      "kyle-shell-old-a",
      "kyle-shell-old-b",
    ]);
    expect(claim).toHaveBeenCalledOnce();
  });

  it("finishes navigation cache writes before resolving the fetch response", async () => {
    const listeners = new Map<string, (event: unknown) => void>();
    let finishCacheWrite: () => void = () => undefined;
    const cacheWrite = new Promise<void>((resolve) => {
      finishCacheWrite = resolve;
    });
    const response = { ok: true, clone: () => response };
    const put = vi.fn(() => cacheWrite);
    startServiceWorker(
      {
        location: { origin: "https://example.test" },
        clients: { claim: vi.fn() },
        caches: {
          keys: vi.fn(),
          delete: vi.fn(),
          match: vi.fn(),
          open: vi.fn(async () => ({ addAll: vi.fn(), put })),
        },
        fetch: vi.fn(async () => response),
        skipWaiting: vi.fn(),
        addEventListener: (name: string, listener: (event: unknown) => void) =>
          listeners.set(name, listener),
      } as WorkerScope,
      "kyle-shell-current",
    );
    let fetchWork: Promise<unknown> | undefined;
    listeners.get("fetch")?.({
      request: {
        method: "GET",
        mode: "navigate",
        url: "https://example.test/plan",
      },
      respondWith: (work: Promise<unknown>) => {
        fetchWork = work;
      },
    });
    let resolved = false;
    void fetchWork?.then(() => {
      resolved = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(put).toHaveBeenCalledOnce();
    expect(resolved).toBe(false);
    finishCacheWrite();
    await fetchWork;
    expect(resolved).toBe(true);
  });
});

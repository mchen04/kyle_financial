import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("production response headers", () => {
  it("removes framework disclosure and applies the baseline policy globally", async () => {
    expect(nextConfig.poweredByHeader).toBe(false);
    expect(nextConfig.headers).toBeTypeOf("function");

    const rules = await nextConfig.headers!();
    const globalRule = rules.find(({ source }) => source === "/:path*");
    expect(globalRule).toBeDefined();
    expect(
      Object.fromEntries(
        globalRule!.headers.map(({ key, value }) => [key.toLowerCase(), value]),
      ),
    ).toMatchObject({
      "x-frame-options": "DENY",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "permissions-policy":
        "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeDeploymentId } from "./src/pwa/deployment-id";

const originalDeploymentId = process.env.NEXT_DEPLOYMENT_ID;

afterEach(() => {
  if (originalDeploymentId === undefined) {
    delete process.env.NEXT_DEPLOYMENT_ID;
  } else {
    process.env.NEXT_DEPLOYMENT_ID = originalDeploymentId;
  }
  vi.resetModules();
});

describe("deployment identifiers", () => {
  it("fits full git SHAs within the hosting limit", () => {
    expect(
      normalizeDeploymentId("53f3cb476c100efdd893ab5ffd54385025f75e40"),
    ).toBe("53f3cb476c100efdd893ab5ffd543850");
  });

  it("preserves shorter local and development identifiers", () => {
    expect(normalizeDeploymentId("53f3cb476c100efd")).toBe("53f3cb476c100efd");
    expect(normalizeDeploymentId("development")).toBe("development");
  });

  it("keeps distinct overlong custom identifiers distinct", () => {
    const prefix = "shared-human-deployment-prefix-";
    const first = normalizeDeploymentId(`${prefix}one`);
    const second = normalizeDeploymentId(`${prefix}two`);

    expect(first).toHaveLength(32);
    expect(second).toHaveLength(32);
    expect(first).not.toBe(second);
  });

  it("normalizes NEXT_DEPLOYMENT_ID before Next can reapply it", async () => {
    process.env.NEXT_DEPLOYMENT_ID = "53f3cb476c100efdd893ab5ffd54385025f75e40";
    vi.resetModules();

    const { default: config } = await import("./next.config");

    expect(process.env.NEXT_DEPLOYMENT_ID).toBe(
      "53f3cb476c100efdd893ab5ffd543850",
    );
    expect(config.deploymentId).toBe(process.env.NEXT_DEPLOYMENT_ID);
    expect(config.experimental?.runtimeServerDeploymentId).toBe(false);
  });
});

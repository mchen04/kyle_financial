import { createHash } from "node:crypto";

const MAXIMUM_DEPLOYMENT_ID_LENGTH = 32;
const GIT_OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

export function normalizeDeploymentId(value: string): string {
  if (value.length <= MAXIMUM_DEPLOYMENT_ID_LENGTH) return value;
  if (GIT_OBJECT_ID.test(value)) {
    return value.slice(0, MAXIMUM_DEPLOYMENT_ID_LENGTH);
  }
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex")
    .slice(0, MAXIMUM_DEPLOYMENT_ID_LENGTH);
}

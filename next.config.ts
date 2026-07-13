import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";

function deploymentVersion(): string {
  const configured =
    process.env.NEXT_DEPLOYMENT_ID ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GIT_SHA;
  if (configured) return configured;
  try {
    return execFileSync("git", ["rev-parse", "--short=16", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "development";
  }
}

const deploymentId = deploymentVersion();

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  deploymentId,
};

export default nextConfig;

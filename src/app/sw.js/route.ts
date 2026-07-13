import type { NextRequest } from "next/server";
import { renderServiceWorker } from "@/pwa/service-worker";

export function GET(request: NextRequest): Response {
  const buildId =
    request.nextUrl.buildId ?? process.env.NEXT_DEPLOYMENT_ID ?? "development";
  return new Response(renderServiceWorker(buildId), {
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'",
      "Content-Type": "application/javascript; charset=utf-8",
      "Service-Worker-Allowed": "/",
    },
  });
}

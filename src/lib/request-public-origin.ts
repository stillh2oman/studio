import type { NextRequest } from "next/server";

/** Matches production QuickBooks redirect host; used when proxies hide the real public host. */
const PLANPORT_DEFAULT_PUBLIC_ORIGIN = "https://studio-5055895818-5ccef.web.app";

function trimOrigin(url: string): string {
  return url.replace(/\/$/, "");
}

/**
 * Origin (scheme + host, no path) for absolute redirects from Route Handlers.
 * On Firebase App Hosting / Cloud Run, `Host` is often `0.0.0.0:8080` — the browser
 * must be sent to the real public URL instead.
 */
export function getPublicSiteOrigin(request: NextRequest): string {
  const fromEnv =
    process.env.PLANPORT_PUBLIC_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_BASE_URL?.trim();
  if (fromEnv) {
    const normalized = fromEnv.startsWith("http") ? fromEnv : `https://${fromEnv}`;
    return trimOrigin(normalized);
  }

  const xfHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const xfProto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";

  if (xfHost && !/^0\.0\.0\.0(?::|$)/.test(xfHost)) {
    return trimOrigin(`${xfProto}://${xfHost}`);
  }

  const host = request.headers.get("host")?.split(",")[0]?.trim();
  if (host && !/^0\.0\.0\.0(?::|$)/.test(host)) {
    return trimOrigin(`${xfProto}://${host}`);
  }

  const nu = request.nextUrl;
  if (nu.hostname && nu.hostname !== "0.0.0.0") {
    return trimOrigin(nu.origin);
  }

  return PLANPORT_DEFAULT_PUBLIC_ORIGIN;
}

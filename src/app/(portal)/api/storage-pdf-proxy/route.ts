import { NextRequest } from "next/server";
import { firebaseConfig } from "@/firebase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET =
  process.env.PLANPORT_STORAGE_BUCKET?.trim() || firebaseConfig.storageBucket;

function corsHeaders(base: Headers): Headers {
  base.set("Access-Control-Allow-Origin", "*");
  base.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  base.set("Access-Control-Allow-Headers", "Range, Accept");
  base.set(
    "Access-Control-Expose-Headers",
    "Content-Length, Content-Range, Accept-Ranges, Content-Type"
  );
  return base;
}

function isAllowedPlanportStorageUrl(raw: string): boolean {
  if (!raw?.trim()) return false;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:") return false;
    if (u.hostname !== "firebasestorage.googleapis.com") return false;
    const prefix = `/v0/b/${BUCKET}/o/`;
    if (!u.pathname.startsWith(prefix)) return false;
    return u.searchParams.get("alt") === "media" && !!u.searchParams.get("token")?.trim();
  } catch {
    return false;
  }
}

function decodeParam(urlParam: string | null): string | null {
  if (!urlParam) return null;
  let s = urlParam;
  try {
    s = decodeURIComponent(s);
    if (/%[0-9A-Fa-f]{2}/.test(s)) {
      s = decodeURIComponent(s);
    }
  } catch {
    /* use raw */
  }
  return s;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders(new Headers()) });
}

export async function GET(request: NextRequest) {
  const sourceUrl = decodeParam(request.nextUrl.searchParams.get("url"));
  if (!sourceUrl || !isAllowedPlanportStorageUrl(sourceUrl)) {
    return new Response("Invalid storage URL", {
      status: 400,
      headers: corsHeaders(new Headers()),
    });
  }

  const range = request.headers.get("range");
  const upstreamHeaders: Record<string, string> = { Accept: "*/*" };
  if (range) upstreamHeaders.Range = range;

  let upstream: Response;
  try {
    upstream = await fetch(sourceUrl, {
      method: "GET",
      headers: upstreamHeaders,
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    return new Response("Failed to fetch storage file", {
      status: 502,
      headers: corsHeaders(new Headers()),
    });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`Storage returned HTTP ${upstream.status}`, {
      status: upstream.status,
      headers: corsHeaders(new Headers()),
    });
  }

  const responseHeaders = corsHeaders(new Headers());
  const passthroughHeaders = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "content-disposition",
    "etag",
    "last-modified",
  ];
  for (const key of passthroughHeaders) {
    const value = upstream.headers.get(key);
    if (value) responseHeaders.set(key, value);
  }
  responseHeaders.set("cache-control", "public, max-age=300");
  responseHeaders.set("x-proxied-by", "planport-storage-pdf-proxy");

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

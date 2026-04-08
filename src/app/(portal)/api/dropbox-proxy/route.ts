import { NextRequest } from "next/server";
import { getDropboxUpstreamUserAgent } from "@/lib/dropbox-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SNIFF_BUFFER_BYTES = 10 * 1024 * 1024;

function isAllowedDropboxUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    return (
      host === "dropbox.com" ||
      host === "www.dropbox.com" ||
      host.endsWith(".dropbox.com") ||
      host === "dropboxusercontent.com" ||
      host.endsWith(".dropboxusercontent.com")
    );
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

function sniffPdf(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  return (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

function sniffHtml(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 512);
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, n)).trimStart().toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<head") || head.startsWith("<!--");
}

function corsHeaders(base: Headers): Headers {
  base.set("Access-Control-Allow-Origin", "*");
  base.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  base.set("Access-Control-Allow-Headers", "Range, Accept");
  base.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Type");
  return base;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders(new Headers()) });
}

export async function GET(request: NextRequest) {
  const sourceUrl = decodeParam(request.nextUrl.searchParams.get("url"));
  if (!sourceUrl || !isAllowedDropboxUrl(sourceUrl)) {
    return new Response("Invalid Dropbox URL", { status: 400, headers: corsHeaders(new Headers()) });
  }

  const range = request.headers.get("range");
  const upstreamHeaders: Record<string, string> = {
    "User-Agent": getDropboxUpstreamUserAgent(),
    Accept: "*/*"
  };
  if (range) upstreamHeaders.Range = range;

  let upstream: Response;
  try {
    upstream = await fetch(sourceUrl, {
      method: "GET",
      headers: upstreamHeaders,
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(120_000)
    });
  } catch {
    return new Response("Failed to fetch Dropbox file", { status: 502, headers: corsHeaders(new Headers()) });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`Dropbox returned HTTP ${upstream.status}`, {
      status: upstream.status,
      headers: corsHeaders(new Headers())
    });
  }

  // Full GET without Range: small files are buffered to sniff HTML-vs-PDF; large files stream.
  // PDF.js normally uses Range requests (see PDFViewer) so this path is rarely a full huge download.
  if (!range) {
    const lenHeader = upstream.headers.get("content-length");
    const declaredLen = lenHeader ? Number(lenHeader) : NaN;

    // If the file is large, stream it instead of buffering (no size limit).
    if (Number.isFinite(declaredLen) && declaredLen > MAX_SNIFF_BUFFER_BYTES) {
      const responseHeaders = corsHeaders(new Headers());
      const passthroughHeaders = [
        "content-type",
        "content-length",
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
      responseHeaders.set("x-proxied-by", "planport-dropbox-proxy");
      return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    }

    let buf: ArrayBuffer;
    try {
      buf = await upstream.arrayBuffer();
    } catch {
      return new Response("Failed to read Dropbox response", { status: 502, headers: corsHeaders(new Headers()) });
    }

    const bytes = new Uint8Array(buf);
    const upstreamType = upstream.headers.get("content-type") || "";

    if (sniffHtml(bytes)) {
      return new Response(
        "Dropbox returned HTML instead of a file (link may be expired, private, or not shared as “anyone with link”).",
        { status: 502, headers: corsHeaders(new Headers({ "Content-Type": "text/plain; charset=utf-8" })) }
      );
    }

    const isPdf = sniffPdf(bytes);
    const headersOut = corsHeaders(new Headers());
    const ct =
      isPdf || /\.pdf(\?|$)/i.test(sourceUrl)
        ? "application/pdf"
        : upstreamType.split(";")[0].trim() || "application/octet-stream";
    headersOut.set("Content-Type", ct);
    headersOut.set("Content-Length", String(buf.byteLength));
    headersOut.set("Cache-Control", "public, max-age=300");
    headersOut.set("Accept-Ranges", "bytes");
    headersOut.set("X-Proxied-By", "planport-dropbox-proxy");

    return new Response(buf, { status: 200, headers: headersOut });
  }

  // Range requests: stream (e.g. if a client enables range later).
  const responseHeaders = corsHeaders(new Headers());
  const passthroughHeaders = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "content-disposition",
    "etag",
    "last-modified"
  ];
  for (const key of passthroughHeaders) {
    const value = upstream.headers.get(key);
    if (value) responseHeaders.set(key, value);
  }
  responseHeaders.set("cache-control", "public, max-age=300");
  responseHeaders.set("x-proxied-by", "planport-dropbox-proxy");

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders
  });
}

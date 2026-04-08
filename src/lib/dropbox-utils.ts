/**
 * Dropbox share links must be converted to dl.dropboxusercontent.com + raw=1,
 * rlkey must be preserved. All Dropbox fetches are routed through /api/dropbox-proxy
 * so the browser (and pdf.js worker) only sees same-origin URLs.
 */

import { firebaseConfig } from "@/firebase/config";

const DROPBOX_FETCH_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export function getDropboxUpstreamUserAgent(): string {
  return DROPBOX_FETCH_UA;
}

export function isDropboxUrl(url: string): boolean {
  if (!url?.trim()) return false;
  const u = url.trim().toLowerCase();
  return u.includes("dropbox.com") || u.includes("dropboxusercontent.com");
}

/**
 * Convert Dropbox URLs to direct raw CDN form (still on Dropbox — use normalizeDropboxUrl for proxy).
 */
export function toDirectDropboxFileUrl(url: string): string {
  if (!url) return "";
  let transformed = url.trim();

  if (
    transformed.startsWith("www.dropbox.com") ||
    transformed.startsWith("dropbox.com") ||
    transformed.startsWith("dl.dropboxusercontent.com")
  ) {
    transformed = "https://" + transformed.replace(/^\/+/, "");
  }

  if (!isDropboxUrl(transformed)) return transformed;

  const urlObj = new URL(transformed);
  const h = urlObj.hostname.toLowerCase();
  const p = urlObj.pathname;

  /**
   * Dropbox has multiple generations of share links:
   * - Older links often work when rewritten to `dl.dropboxusercontent.com`.
   * - Newer `/scl/fi/...` links sometimes 404 if we force the hostname.
   *
   * For `/scl/fi/...`, keep the Dropbox UI host and just request `raw=1`;
   * Dropbox will 302 to the correct content host (which our server fetch follows).
   */
  if (!(p.startsWith("/scl/fi/") || p.startsWith("/scl/fi"))) {
    // Apex + web UI hosts → content delivery host (path stays the same for many legacy share links).
    if (h === "dropbox.com" || h === "www.dropbox.com") {
      urlObj.hostname = "dl.dropboxusercontent.com";
    }
  }

  urlObj.searchParams.set("raw", "1");
  urlObj.searchParams.delete("dl");

  return urlObj.toString();
}

/**
 * Client-side: turn any media URL into a browser-loadable URL (Dropbox → same-origin proxy path).
 * Non-Dropbox URLs are returned unchanged.
 */
export function normalizeDropboxUrl(url: string): string {
  if (!url) return "";
  try {
    const transformed = url.trim();
    if (!isDropboxUrl(transformed)) return transformed;

    const directUrl = toDirectDropboxFileUrl(transformed);
    return `/api/dropbox-proxy?url=${encodeURIComponent(directUrl)}`;
  } catch (e) {
    console.error("Error normalizing Dropbox URL:", e);
    return url;
  }
}

/**
 * For `<img src>` only: load Dropbox files directly from their CDN in the browser.
 * The server proxy often breaks thumbnails (Dropbox returns HTML to server fetches, size limits, etc.).
 */
export function dropboxImgSrc(url: string | undefined | null): string {
  if (!url?.trim()) return "";
  const t = url.trim();
  if (!isDropboxUrl(t)) return t;
  return toDirectDropboxFileUrl(t);
}

/**
 * PlanPort draft/executed PDFs use Firebase download URLs. PDF.js loads its worker from a CDN,
 * so direct fetches to firebasestorage.googleapis.com run from a foreign origin and fail CORS.
 * Same pattern as Dropbox: route through our API.
 */
export function isPlanportFirebaseStorageDownloadUrl(url: string): boolean {
  if (!url?.trim()) return false;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:") return false;
    if (u.hostname !== "firebasestorage.googleapis.com") return false;
    const prefix = `/v0/b/${firebaseConfig.storageBucket}/o/`;
    if (!u.pathname.startsWith(prefix)) return false;
    return u.searchParams.get("alt") === "media" && !!u.searchParams.get("token")?.trim();
  } catch {
    return false;
  }
}

function wrapPlanportFirebaseStorageForPdfProxy(url: string): string {
  if (!url?.trim()) return url;
  const t = url.trim();
  if (!isPlanportFirebaseStorageDownloadUrl(t)) return url;
  return `/api/storage-pdf-proxy?url=${encodeURIComponent(t)}`;
}

/**
 * PDF.js runs inside a worker whose "base URL" is the worker script (CDN), so relative paths like
 * `/api/dropbox-proxy?...` resolve incorrectly. Always pass an absolute app URL to getDocument().
 */
export function resolvePdfJsUrl(url: string): string {
  if (typeof window === "undefined") {
    return wrapPlanportFirebaseStorageForPdfProxy(normalizeDropboxUrl(url));
  }

  const afterDropbox = normalizeDropboxUrl(url.trim());
  const pathOrAbsolute = wrapPlanportFirebaseStorageForPdfProxy(afterDropbox);
  if (pathOrAbsolute.startsWith("http://") || pathOrAbsolute.startsWith("https://")) {
    return pathOrAbsolute;
  }
  const path = pathOrAbsolute.startsWith("/") ? pathOrAbsolute : `/${pathOrAbsolute}`;
  return `${window.location.origin}${path}`;
}

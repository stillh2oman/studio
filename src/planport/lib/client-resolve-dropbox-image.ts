import { isDropboxUrl } from "@/lib/dropbox-utils";

/**
 * Calls the server to copy a Dropbox image into Firebase Storage and return its download URL.
 * Non-Dropbox URLs are returned unchanged. Requires a signed-in admin (Bearer token).
 */
export async function resolveDropboxImageForSave(
  rawUrl: string,
  getIdToken: () => Promise<string>
): Promise<string> {
  const t = rawUrl.trim();
  if (!t || !isDropboxUrl(t)) return t;

  const token = await getIdToken();
  const res = await fetch("/api/ingest-image", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sourceUrl: t }),
  });

  const text = await res.text();
  let parsed: { url?: string; error?: string };
  try {
    parsed = JSON.parse(text) as { url?: string; error?: string };
  } catch {
    throw new Error(text || `Image ingest failed (${res.status})`);
  }

  if (!res.ok) {
    throw new Error(parsed.error || `Image ingest failed (${res.status})`);
  }
  if (!parsed.url?.trim()) {
    throw new Error("Image ingest returned no URL");
  }
  return parsed.url.trim();
}

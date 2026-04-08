import { randomUUID } from "crypto";
import {
  getDropboxUpstreamUserAgent,
  isDropboxUrl,
  toDirectDropboxFileUrl,
} from "@/lib/dropbox-utils";
import {
  getPlanportAdminBucket,
  getPlanportStorageBucketName,
} from "@/lib/firebase-admin-app";

export const MIRRORED_IMAGES_PREFIX = "mirrored-images";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_CONTRACT_PDF_BYTES = 30 * 1024 * 1024;

function sniffPdf(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

function sniffHtml(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 512);
  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.slice(0, n))
    .trimStart()
    .toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<head");
}

function isLikelyRasterOrSvgImage(
  bytes: Uint8Array,
  contentType: string
): boolean {
  const ct = contentType.split(";")[0].trim().toLowerCase();
  if (ct.startsWith("image/")) return true;
  if (sniffPdf(bytes)) return false;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return true;
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return true;
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46)
    return true;
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return true;
  const dec = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, Math.min(256, bytes.length)));
  const t = dec.trimStart().toLowerCase();
  if (t.startsWith("<svg") || t.startsWith("<?xml")) return true;
  return false;
}

function extFromMime(contentType: string): string {
  const m = contentType.split(";")[0].trim().toLowerCase();
  if (m === "image/jpeg" || m === "image/jpg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "image/gif") return "gif";
  if (m === "image/webp") return "webp";
  if (m === "image/svg+xml") return "svg";
  return "img";
}

function firebaseDownloadUrl(bucket: string, objectPath: string, token: string): string {
  const enc = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${enc}?alt=media&token=${token}`;
}

/**
 * Upload a PDF to the public mirrored-images prefix (same rules as mirrored Dropbox images).
 * `relativePath` must not start with `/` (e.g. `contract-drafts/abc.pdf`).
 */
export async function uploadMirroredPublicPdf(relativePath: string, pdfBuffer: Buffer): Promise<string> {
  const trimmed = relativePath.replace(/^\/+/, "");
  if (!trimmed || !trimmed.endsWith(".pdf")) {
    throw new Error("Invalid PDF storage path");
  }
  if (pdfBuffer.byteLength > MAX_CONTRACT_PDF_BYTES) {
    throw new Error("PDF exceeds maximum size");
  }
  const objectPath = `${MIRRORED_IMAGES_PREFIX}/${trimmed}`;
  const downloadToken = randomUUID();
  const bucket = getPlanportAdminBucket();
  const file = bucket.file(objectPath);
  await file.save(pdfBuffer, {
    resumable: false,
    metadata: {
      contentType: "application/pdf",
      cacheControl: "public, max-age=31536000",
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
      },
    },
  });
  const bucketName = getPlanportStorageBucketName();
  return firebaseDownloadUrl(bucketName, objectPath, downloadToken);
}

export function isPlanportHostedImageUrl(url: string): boolean {
  if (!url?.trim()) return false;
  const u = url.trim();
  const bucket = getPlanportStorageBucketName();
  if (!u.includes("firebasestorage.googleapis.com")) return false;
  return u.includes(`/v0/b/${bucket}/`);
}

/**
 * Fetches a Dropbox image and uploads it to Firebase Storage. Returns a stable download URL.
 * Non-Dropbox URLs are returned unchanged. Already-mirrored URLs are returned unchanged.
 */
export async function mirrorDropboxUrlToFirebaseStorage(
  sourceUrl: string
): Promise<string> {
  const trimmed = sourceUrl.trim();
  if (!trimmed || !isDropboxUrl(trimmed)) return trimmed;
  if (isPlanportHostedImageUrl(trimmed)) return trimmed;

  const direct = toDirectDropboxFileUrl(trimmed);
  let upstream: Response;
  try {
    upstream = await fetch(direct, {
      method: "GET",
      headers: { "User-Agent": getDropboxUpstreamUserAgent(), Accept: "*/*" },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new Error("Failed to download from Dropbox");
  }

  if (!upstream.ok) {
    throw new Error(`Dropbox returned HTTP ${upstream.status}`);
  }

  const lenHeader = upstream.headers.get("content-length");
  if (lenHeader) {
    const n = Number(lenHeader);
    if (Number.isFinite(n) && n > MAX_IMAGE_BYTES) {
      throw new Error("Image is too large to mirror");
    }
  }

  const buf = Buffer.from(await upstream.arrayBuffer());
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Image is too large to mirror");
  }

  const bytes = new Uint8Array(buf);
  if (sniffHtml(bytes)) {
    throw new Error(
      "Dropbox returned HTML instead of a file — check the link is shared as “anyone with the link”."
    );
  }
  if (sniffPdf(bytes)) {
    throw new Error("Linked file is a PDF, not an image — use blueprint upload for PDFs.");
  }

  const upstreamType = upstream.headers.get("content-type") || "application/octet-stream";
  if (!isLikelyRasterOrSvgImage(bytes, upstreamType)) {
    throw new Error("Downloaded file does not look like an image");
  }

  const ext = extFromMime(upstreamType);
  const objectPath = `${MIRRORED_IMAGES_PREFIX}/${new Date().getUTCFullYear()}/${randomUUID()}.${ext}`;
  const downloadToken = randomUUID();
  const contentType = upstreamType.split(";")[0].trim() || "application/octet-stream";

  const bucket = getPlanportAdminBucket();
  const file = bucket.file(objectPath);

  await file.save(buf, {
    resumable: false,
    metadata: {
      contentType,
      cacheControl: "public, max-age=31536000",
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
      },
    },
  });

  const bucketName = getPlanportStorageBucketName();
  return firebaseDownloadUrl(bucketName, objectPath, downloadToken);
}

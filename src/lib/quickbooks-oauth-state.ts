import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

function stateSigningSecret(): string {
  const explicit = process.env.QUICKBOOKS_OAUTH_STATE_SECRET?.trim();
  if (explicit) return explicit;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET?.trim();
  if (clientSecret) return clientSecret;
  throw new Error(
    "Set QUICKBOOKS_CLIENT_SECRET or QUICKBOOKS_OAUTH_STATE_SECRET for QuickBooks OAuth."
  );
}

/**
 * Signed OAuth `state` so we do not rely on cookies (often dropped on redirect chains
 * through CDNs / App Hosting). Intuit echoes this value on the callback query string.
 *
 * Format: `${nonce}.${expEpochMs}.${hmacHex}` where HMAC is SHA-256 over `${nonce}.${exp}`.
 */
export function createSignedQuickBooksOAuthState(): string {
  const nonce = randomBytes(16).toString("hex");
  const exp = Date.now() + STATE_TTL_MS;
  const payload = `${nonce}.${exp}`;
  const sig = createHmac("sha256", stateSigningSecret())
    .update(payload)
    .digest("hex");
  return `${payload}.${sig}`;
}

export function verifySignedQuickBooksOAuthState(
  state: string | null | undefined
): boolean {
  if (!state || typeof state !== "string") return false;
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [nonce, expStr, sig] = parts;
  if (!/^[a-f0-9]{32}$/i.test(nonce)) return false;
  if (!/^[a-f0-9]{64}$/i.test(sig)) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const payload = `${nonce}.${exp}`;
  let expected: string;
  try {
    expected = createHmac("sha256", stateSigningSecret())
      .update(payload)
      .digest("hex");
  } catch {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

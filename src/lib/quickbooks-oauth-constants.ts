/**
 * QuickBooks Online (Intuit) OAuth — redirect URI must match the Intuit Developer Portal
 * entry byte-for-byte (scheme, host, path; no trailing slash).
 */
export const QUICKBOOKS_REDIRECT_URI_PRODUCTION =
  "https://studio-5055895818-5ccef.web.app/api/auth/callback/quickbooks";

/**
 * URI sent as `redirect_uri` on authorize + token exchange. Override with QUICKBOOKS_REDIRECT_URI
 * in .env.local for local testing if you register a localhost redirect in Intuit.
 */
export function getQuickBooksRedirectUri(): string {
  const fromEnv =
    typeof process.env.QUICKBOOKS_REDIRECT_URI === "string"
      ? process.env.QUICKBOOKS_REDIRECT_URI.trim()
      : "";
  return fromEnv || QUICKBOOKS_REDIRECT_URI_PRODUCTION;
}

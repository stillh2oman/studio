import type { IntegrationConfig } from '@/lib/types';

export type GoogleOAuthCreds = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

/** Trim, strip BOM, strip accidental wrapping quotes (common .env mistakes), normalize newlines. */
export function normalizeGoogleOAuthEnvValue(value: string): string {
  let s = String(value ?? '');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  s = s.replace(/\r/g, '').trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s.trim();
}

/**
 * Client id / secret / refresh_token should be single-line tokens. Strips zero-width chars,
 * NBSP, and all whitespace (fixes line-wrapped secrets and copy/paste from PDF/console).
 */
export function sanitizeGoogleOAuthTokenField(value: string): string {
  return normalizeGoogleOAuthEnvValue(value)
    .replace(/[\u200B-\u200D\uFEFF\u00A0\u202A-\u202E]/g, '')
    .replace(/\s/g, '');
}

function completeOAuthTrio(
  id: string | undefined,
  secret: string | undefined,
  refresh: string | undefined,
): GoogleOAuthCreds | null {
  const clientId = sanitizeGoogleOAuthTokenField(id || '');
  const clientSecret = sanitizeGoogleOAuthTokenField(secret || '');
  const refreshToken = sanitizeGoogleOAuthTokenField(refresh || '');
  if (clientId && clientSecret && refreshToken) {
    return { clientId, clientSecret, refreshToken };
  }
  return null;
}

export type GoogleOAuthEnvTrioSource = 'google' | 'oauth_alias';

/**
 * Reads OAuth creds from env using **one** complete trio only (never mixes prefixes).
 * 1) GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN
 * 2) Else GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET + GOOGLE_OAUTH_REFRESH_TOKEN
 */
export function readGoogleOAuthCredsFromEnvDetailed(): {
  creds: GoogleOAuthCreds | null;
  trioSource: GoogleOAuthEnvTrioSource | null;
} {
  const primary = completeOAuthTrio(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REFRESH_TOKEN,
  );
  if (primary) return { creds: primary, trioSource: 'google' };

  const alias = completeOAuthTrio(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
  );
  if (alias) return { creds: alias, trioSource: 'oauth_alias' };

  return { creds: null, trioSource: null };
}

/** Server environment variables (supports common aliases, one trio at a time). */
export function readGoogleOAuthCredsFromEnv(): GoogleOAuthCreds | null {
  return readGoogleOAuthCredsFromEnvDetailed().creds;
}

/** Firestore Connection Hub (`employees/{id}/config/integrations`). */
export function readGoogleOAuthCredsFromIntegration(
  c: IntegrationConfig | null | undefined,
): GoogleOAuthCreds | null {
  if (!c) return null;
  const clientId = sanitizeGoogleOAuthTokenField(String(c.googleClientId || ''));
  const clientSecret = sanitizeGoogleOAuthTokenField(String(c.googleClientSecret || ''));
  const refreshToken = sanitizeGoogleOAuthTokenField(String(c.googleRefreshToken || ''));
  if (clientId && clientSecret && refreshToken) {
    return { clientId, clientSecret, refreshToken };
  }
  return null;
}

/**
 * Merge server `.env` Google settings over Connection Hub so Calendar / Gmail / Drive always use
 * one coherent OAuth client + refresh_token + Drive folder (never a mixed hub/env pair).
 *
 * When `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN` are all set, they
 * replace hub values. `GOOGLE_DRIVE_FOLDER_ID` overrides `meetFolderId` when set.
 */
export function mergeServerEnvIntoGoogleIntegration(
  integration?: IntegrationConfig | null,
): IntegrationConfig {
  const base = { ...(integration || {}) } as IntegrationConfig;
  const envTrio = readGoogleOAuthCredsFromEnv();
  if (envTrio) {
    base.googleClientId = envTrio.clientId;
    base.googleClientSecret = envTrio.clientSecret;
    base.googleRefreshToken = envTrio.refreshToken;
  }
  const driveFolder = normalizeGoogleOAuthEnvValue(process.env.GOOGLE_DRIVE_FOLDER_ID || '');
  if (driveFolder) {
    base.meetFolderId = driveFolder;
  }
  return base;
}

/**
 * Effective OAuth trio: merged hub + env (env wins when complete), then read as one config.
 */
export function resolveGoogleOAuthCreds(
  integration?: IntegrationConfig | null,
): GoogleOAuthCreds | null {
  const merged = mergeServerEnvIntoGoogleIntegration(integration);
  return readGoogleOAuthCredsFromIntegration(merged);
}

/** Which store supplied credentials for the current request (for UI / debugging). */
export function getGoogleOAuthCredentialSource(
  integration?: IntegrationConfig | null,
): 'env' | 'hub' | null {
  if (readGoogleOAuthCredsFromEnv()) return 'env';
  if (readGoogleOAuthCredsFromIntegration(integration)) return 'hub';
  return null;
}

export function isGoogleOAuthEnvironmentConfigured(): boolean {
  return readGoogleOAuthCredsFromEnv() !== null;
}

async function refreshAccessToken(creds: GoogleOAuthCreds): Promise<string> {
  const tokenUrl = 'https://oauth2.googleapis.com/token';

  const postForm = async (headers: Record<string, string>, body: string) =>
    fetch(tokenUrl, { method: 'POST', headers, body });

  /** RFC 6749: client_id + client_secret in body (Google accepts this). */
  const attemptBody = () =>
    postForm(
      { 'Content-Type': 'application/x-www-form-urlencoded' },
      new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: creds.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    );

  /** client_secret_basic: some proxies/hosts handle this more reliably. */
  const attemptBasic = () => {
    const auth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`, 'utf8').toString('base64');
    return postForm(
      {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${auth}`,
      },
      new URLSearchParams({
        refresh_token: creds.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    );
  };

  let resp = await attemptBody();
  let data = (await resp.json().catch(() => ({}))) as {
    error_description?: string;
    error?: string;
    access_token?: string;
  };

  if (
    !resp.ok &&
    String(data.error || '').toLowerCase() === 'invalid_client'
  ) {
    resp = await attemptBasic();
    data = (await resp.json().catch(() => ({}))) as typeof data;
  }

  if (!resp.ok) {
    const d = data as { error_description?: string; error?: string };
    const errCode = String(d.error || '').trim();
    const errDesc = String(d.error_description || '').trim();
    const base =
      errCode && errDesc && errCode !== errDesc
        ? `${errCode}: ${errDesc}`
        : errDesc || errCode || `Google token refresh failed (HTTP ${resp.status})`;

    const rt = creds.refreshToken.trim();
    const looksLikeAuthCode = rt.startsWith('4/');
    const authCodeHint = looksLikeAuthCode
      ? ' Your refresh value looks like a one-time code (starts with 4/), not a refresh_token. In OAuth Playground use “Exchange authorization code for tokens” and copy refresh_token (often starts with 1//).'
      : '';

    const invalidClient = errCode.toLowerCase() === 'invalid_client';
    const unauthorizedClient = errCode.toLowerCase() === 'unauthorized_client';
    const invalidGrant = errCode.toLowerCase() === 'invalid_grant';

    const clientHint = invalidClient
      ? [
          ' Google rejected this client id + secret at the token URL.',
          'If you use both GOOGLE_* and GOOGLE_OAUTH_* variables, only one full trio is used (GOOGLE_* first)—never mix an old id with a new secret. Remove the unused prefix or make all three match the same OAuth client.',
          'Copy the full Client ID with the console’s copy icon; easy misreads are digit 1 vs letter l, and 0 vs letter O.',
          'Copy Client ID and Client secret from the same credential row (Credentials → your OAuth 2.0 Web client → use the copy icons).',
          'In .env: if the secret contains $ or %, wrap the whole value in single quotes, e.g. GOOGLE_CLIENT_SECRET=\'GOCSPX-…\'. Restart npm run dev after saving.',
          'Do not paste the short “Access token” (ya29…)—only client id, client secret, and refresh_token (usually 1//…).',
          'Update the secret in Firebase/host env too if you deploy there, then redeploy.',
          'Optional: GOOGLE_OAUTH_DEBUG=1 then GET /api/debug/google-oauth for lengths + Google JSON (no secrets returned).',
        ].join(' ')
      : '';

    /** Google: this client is not allowed to use the refresh_token grant (wrong client type or policy). */
    const unauthorizedClientHint = unauthorizedClient
      ? [
          ' This OAuth client is not permitted to exchange a refresh token this way.',
          'Fix: In Google Cloud → APIs & Services → Credentials, create (or use) an OAuth 2.0 Client ID of type “Web application” (not Desktop, Android, iOS, or TV).',
          'Add Authorized redirect URI: https://developers.google.com/oauthplayground/redirect',
          'In OAuth Playground, enable “Use your own OAuth credentials”, paste that Web client’s id + secret, authorize with Calendar (and other) scopes, exchange code, copy the new refresh_token.',
          'Do not use a refresh token that was issued to a different client (including Playground’s default client).',
          'If you use Google Workspace, an admin may block third-party OAuth—check Admin console.',
        ].join(' ')
      : '';

    const grantHint = invalidGrant
      ? ' Refresh token is wrong for this client, expired, or revoked. Create a new refresh token with OAuth Playground using this same client id/secret (with offline access).'
      : '';

    throw new Error(
      base + authCodeHint + clientHint + unauthorizedClientHint + grantHint,
    );
  }

  const token = String((data as { access_token?: string }).access_token || '').trim();
  if (!token) throw new Error('No access_token returned from Google');
  return token;
}

/**
 * Obtain an access token using Connection Hub credentials (if provided) or server env vars.
 */
export async function getGoogleAccessToken(
  integration?: IntegrationConfig | null,
): Promise<string> {
  const creds = resolveGoogleOAuthCreds(integration);
  if (!creds) {
    throw new Error(
      'Missing Google OAuth. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN on the server, or add Google credentials in Connection Hub (Inbox settings).',
    );
  }
  return refreshAccessToken(creds);
}

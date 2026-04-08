import { NextResponse } from 'next/server';
import { readGoogleOAuthCredsFromEnvDetailed } from '@/lib/google-oauth';

export const dynamic = 'force-dynamic';

/**
 * Safe diagnostics when GOOGLE_OAUTH_DEBUG=1 (or NODE_ENV !== production).
 * Does not return secrets; returns field lengths and Google’s JSON error if refresh fails.
 */
export async function GET() {
  const allowed =
    process.env.GOOGLE_OAUTH_DEBUG === '1' || process.env.NODE_ENV !== 'production';
  if (!allowed) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { creds, trioSource } = readGoogleOAuthCredsFromEnvDetailed();
  const envKeys = {
    GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_ID: !!process.env.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_OAUTH_CLIENT_SECRET: !!process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    GOOGLE_REFRESH_TOKEN: !!process.env.GOOGLE_REFRESH_TOKEN,
    GOOGLE_OAUTH_REFRESH_TOKEN: !!process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
  };

  const hasGooglePrefix =
    !!process.env.GOOGLE_CLIENT_ID ||
    !!process.env.GOOGLE_CLIENT_SECRET ||
    !!process.env.GOOGLE_REFRESH_TOKEN;
  const hasOauthAliasPrefix =
    !!process.env.GOOGLE_OAUTH_CLIENT_ID ||
    !!process.env.GOOGLE_OAUTH_CLIENT_SECRET ||
    !!process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  const mixedPrefixWarning =
    trioSource === 'google' && hasOauthAliasPrefix
      ? 'Using GOOGLE_* trio only; GOOGLE_OAUTH_* vars are ignored. Remove or clear GOOGLE_OAUTH_* to avoid confusion.'
      : trioSource === 'oauth_alias' && hasGooglePrefix
        ? 'Using GOOGLE_OAUTH_* trio only; GOOGLE_* vars are ignored. Remove or clear GOOGLE_* to avoid confusion.'
        : null;

  if (!creds) {
    return NextResponse.json({
      ok: false,
      step: 'env',
      message:
        'Need a complete trio: either GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN, or GOOGLE_OAUTH_* for all three. Partial mixes across prefixes are not used.',
      envKeys,
      trioSource: null,
      mixedPrefixWarning,
    });
  }

  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: creds.refreshToken,
    grant_type: 'refresh_token',
  }).toString();

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;

  if (!resp.ok) {
    return NextResponse.json({
      ok: false,
      step: 'token',
      envTrioUsed: trioSource === 'google' ? 'GOOGLE_*' : 'GOOGLE_OAUTH_*',
      httpStatus: resp.status,
      clientIdLength: creds.clientId.length,
      clientIdSuffix: creds.clientId.slice(-8),
      clientSecretLength: creds.clientSecret.length,
      refreshTokenLength: creds.refreshToken.length,
      refreshTokenPrefix: creds.refreshToken.slice(0, 4),
      google: data,
      envKeys,
      mixedPrefixWarning,
    });
  }

  return NextResponse.json({
    ok: true,
    step: 'token',
    envTrioUsed: trioSource === 'google' ? 'GOOGLE_*' : 'GOOGLE_OAUTH_*',
    httpStatus: resp.status,
    clientIdLength: creds.clientId.length,
    clientIdSuffix: creds.clientId.slice(-8),
    clientSecretLength: creds.clientSecret.length,
    refreshTokenLength: creds.refreshToken.length,
    hasAccessToken: typeof data.access_token === 'string' && String(data.access_token).length > 0,
    envKeys,
    mixedPrefixWarning,
  });
}

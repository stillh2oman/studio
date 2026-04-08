import { NextResponse } from "next/server";
import { getQuickBooksRedirectUri } from "@/lib/quickbooks-oauth-constants";
import { createSignedQuickBooksOAuthState } from "@/lib/quickbooks-oauth-state";

export const runtime = "nodejs";

const INTUIT_AUTHORIZE = "https://appcenter.intuit.com/connect/oauth2";

/**
 * Starts QuickBooks OAuth. Uses a signed `state` query param (no cookies) so App Hosting
 * / CDN redirect chains cannot strip CSRF protection.
 */
export async function GET() {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json(
      { error: "QuickBooks is not configured (missing QUICKBOOKS_CLIENT_ID)." },
      { status: 500 }
    );
  }

  let state: string;
  try {
    state = createSignedQuickBooksOAuthState();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OAuth state configuration error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const redirectUri = getQuickBooksRedirectUri();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting",
    state,
  });

  const authUrl = `${INTUIT_AUTHORIZE}?${params.toString()}`;
  return NextResponse.redirect(authUrl);
}

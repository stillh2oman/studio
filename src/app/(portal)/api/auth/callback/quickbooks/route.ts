import { NextRequest, NextResponse } from "next/server";
import { getQuickBooksRedirectUri } from "@/lib/quickbooks-oauth-constants";
import { getPublicSiteOrigin } from "@/lib/request-public-origin";
import { verifySignedQuickBooksOAuthState } from "@/lib/quickbooks-oauth-state";
import {
  saveQuickBooksIntegrationFromOAuth,
  type QuickBooksTokenBundle,
} from "@/lib/planport-quickbooks-firestore";

export const runtime = "nodejs";

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

function adminRedirect(request: NextRequest, query: Record<string, string>) {
  const url = new URL("/admin", getPublicSiteOrigin(request));
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    const msg = errorDescription || error;
    return adminRedirect(request, {
      quickbooks_error: msg.slice(0, 500),
    });
  }

  if (!code || !verifySignedQuickBooksOAuthState(state)) {
    return adminRedirect(request, { quickbooks_error: "invalid_or_missing_state" });
  }

  const clientId = process.env.QUICKBOOKS_CLIENT_ID?.trim();
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return adminRedirect(request, {
      quickbooks_error: "server_missing_QUICKBOOKS_CLIENT_ID_or_SECRET",
    });
  }

  const redirectUri = getQuickBooksRedirectUri();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    console.error("[quickbooks oauth] token exchange failed", tokenRes.status, text);
    return adminRedirect(request, { quickbooks_error: "token_exchange_failed" });
  }

  const tokens = (await tokenRes.json()) as QuickBooksTokenBundle & Record<string, unknown>;
  const realmId = searchParams.get("realmId")?.trim();
  if (!realmId) {
    console.error("[quickbooks oauth] missing realmId in callback query");
    return adminRedirect(request, { quickbooks_error: "missing_realmId_from_intuit" });
  }

  try {
    await saveQuickBooksIntegrationFromOAuth(realmId, tokens);
  } catch (e) {
    console.error("[quickbooks oauth] persist tokens", e);
    return adminRedirect(request, {
      quickbooks_error: "could_not_store_tokens",
    });
  }

  return adminRedirect(request, { quickbooks: "connected" });
}

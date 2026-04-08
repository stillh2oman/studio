import {
  getQuickBooksIntegration,
  updateQuickBooksAccessTokens,
  type QuickBooksTokenBundle,
} from "@/lib/planport-quickbooks-firestore";

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

async function postTokenForm(
  body: URLSearchParams,
  basicAuth: string
): Promise<QuickBooksTokenBundle & Record<string, unknown>> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: body.toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      typeof json.error_description === "string"
        ? json.error_description
        : typeof json.error === "string"
          ? json.error
          : `Token HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json as QuickBooksTokenBundle & Record<string, unknown>;
}

/**
 * Exchanges a QuickBooks refresh token for new tokens and persists them to Firestore.
 * Use {@link getValidQuickBooksAccessToken} before QBO API calls (handles expiry).
 */
export async function refreshQuickBooksTokensAndPersist(refreshToken: string): Promise<QuickBooksTokenBundle> {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID?.trim();
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET missing.");
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const bundle = (await postTokenForm(body, basic)) as QuickBooksTokenBundle;
  const newRefresh = bundle.refresh_token?.trim();
  await updateQuickBooksAccessTokens(
    bundle.access_token,
    newRefresh || undefined,
    bundle.expires_in,
    bundle.x_refresh_token_expires_in
  );
  return bundle;
}

export async function getValidQuickBooksAccessToken(): Promise<{
  accessToken: string;
  realmId: string;
}> {
  const integ = await getQuickBooksIntegration();
  if (!integ) {
    throw new Error("QuickBooks is not connected. Use Admin → Connect QuickBooks.");
  }
  const now = Date.now();
  if (now < integ.accessTokenExpiresAt) {
    return { accessToken: integ.accessToken, realmId: integ.realmId };
  }
  const refreshed = await refreshQuickBooksTokensAndPersist(integ.refreshToken);
  return { accessToken: refreshed.access_token, realmId: integ.realmId };
}

type DropboxApiResult = {
  ok: boolean;
  status: number;
  data: any;
};

function env(name: string) {
  return String(process.env[name] || "").trim();
}

function firstEnv(...names: string[]) {
  for (const name of names) {
    const value = env(name);
    if (value) return value;
  }
  return "";
}

type RefreshAttempt = {
  accessToken: string | null;
  diagnostics: {
    hasAppKey: boolean;
    hasAppSecret: boolean;
    hasRefreshToken: boolean;
    hasAuthCode: boolean;
    reason?: string;
  };
};

async function refreshDropboxAccessToken(): Promise<string | null> {
  const result = await refreshDropboxAccessTokenDetailed();
  return result.accessToken;
}

async function refreshDropboxAccessTokenDetailed(): Promise<RefreshAttempt> {
  const appKey = firstEnv("DROPBOX_APP_KEY");
  const appSecret = firstEnv("DROPBOX_APP_SECRET");
  const refreshToken = firstEnv("DROPBOX_REFRESH_TOKEN", "DROPBOX_OAUTH_REFRESH_TOKEN");
  const authCode = firstEnv("DROPBOX_REFRESH_CODE", "DROPBOX_AUTH_CODE");

  const diagnostics = {
    hasAppKey: !!appKey,
    hasAppSecret: !!appSecret,
    hasRefreshToken: !!refreshToken,
    hasAuthCode: !!authCode,
  };

  if (!appKey || !appSecret) {
    return { accessToken: null, diagnostics: { ...diagnostics, reason: "Missing app credentials" } };
  }

  // Preferred path: true refresh token
  if (refreshToken) {
    const resp = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: appKey,
        client_secret: appSecret,
      }).toString(),
    });

    const data = await resp.json().catch(() => ({}));
    if (resp.ok) {
      const token = String(data?.access_token || "").trim();
      if (token) return { accessToken: token, diagnostics };
    }
  }

  // Fallback path: authorization code (one-time exchange)
  if (authCode) {
    const resp = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: authCode,
        client_id: appKey,
        client_secret: appSecret,
      }).toString(),
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok) {
      const token = String(data?.access_token || "").trim();
      if (token) {
        return {
          accessToken: token,
          diagnostics: { ...diagnostics, reason: "Used one-time authorization code exchange" },
        };
      }
    }
    return {
      accessToken: null,
      diagnostics: { ...diagnostics, reason: "Authorization code exchange failed or already used" },
    };
  }

  return {
    accessToken: null,
    diagnostics: { ...diagnostics, reason: "No refresh token or auth code configured" },
  };
}

function isExpiredTokenError(data: any) {
  const summary = String(data?.error_summary || "");
  const tag = String(data?.error?.[".tag"] || "");
  return summary.includes("expired_access_token") || tag === "expired_access_token";
}

export async function callDropboxApi(
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<DropboxApiResult> {
  const configuredToken = String(process.env.DROPBOX_ACCESS_TOKEN || "").trim();

  const doRequest = async (token: string) => {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, data };
  };

  // If no access token was configured, try to mint one via refresh/auth-code first.
  if (!configuredToken) {
    const refreshAttempt = await refreshDropboxAccessTokenDetailed();
    const refreshed = refreshAttempt.accessToken;
    if (!refreshed) {
      return {
        ok: false,
        status: 401,
        data: {
          error: "Dropbox access token missing and refresh failed.",
          diagnostics: refreshAttempt.diagnostics,
          hint:
            "Set DROPBOX_REFRESH_TOKEN (preferred) or DROPBOX_AUTH_CODE (one-time), plus DROPBOX_APP_KEY and DROPBOX_APP_SECRET. Then restart the server.",
        },
      };
    }
    return doRequest(refreshed);
  }

  const first = await doRequest(configuredToken);
  if (first.ok || !isExpiredTokenError(first.data)) {
    return first;
  }

  const refreshAttempt = await refreshDropboxAccessTokenDetailed();
  const refreshed = refreshAttempt.accessToken;
  if (!refreshed) {
    return {
      ok: false,
      status: 401,
      data: {
        error: "Dropbox access token expired and refresh failed.",
        diagnostics: refreshAttempt.diagnostics,
        hint:
          "Set DROPBOX_REFRESH_TOKEN (preferred) or DROPBOX_AUTH_CODE (one-time), plus DROPBOX_APP_KEY and DROPBOX_APP_SECRET. Then restart the server.",
        raw: first.data,
      },
    };
  }

  const second = await doRequest(refreshed);
  if (!second.ok && isExpiredTokenError(second.data)) {
    return {
      ok: false,
      status: 401,
      data: {
        error:
          "Dropbox token refresh failed. Reconnect Dropbox and update DROPBOX_REFRESH_TOKEN.",
        raw: second.data,
      },
    };
  }

  return second;
}


export type ClientOnboardingInviteVariant = "jeff" | "kevin";

const KEY_ENV_JEFF = "PLANPORT_CLIENT_ONBOARDING_KEY";
const KEY_ENV_KEVIN = "PLANPORT_CLIENT_ONBOARDING_KEY_KEVIN";

/**
 * Builds the full client-onboarding URL (includes secret key). Server-only — reads env.
 * Shared by the admin “generate link” server action and the send-email API route.
 */
export function buildClientOnboardingInviteUrl(
  origin: string,
  inviteVariant: ClientOnboardingInviteVariant
): { ok: true; url: string } | { ok: false; error: string } {
  const keyEnv = inviteVariant === "kevin" ? KEY_ENV_KEVIN : KEY_ENV_JEFF;
  const key = process.env[keyEnv]?.trim();
  if (!key) {
    return {
      ok: false,
      error: `Missing ${keyEnv}. Add it to .env.local or hosting secrets, then restart the server.`,
    };
  }

  let base: URL;
  try {
    base = new URL(origin);
  } catch {
    return { ok: false, error: "Invalid page origin." };
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    return { ok: false, error: "Invalid page origin." };
  }

  const url = `${base.origin}/client-onboarding?key=${encodeURIComponent(key)}`;
  return { ok: true, url };
}

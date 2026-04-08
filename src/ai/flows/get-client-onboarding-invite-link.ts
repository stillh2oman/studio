"use server";

import { assertPlanportAdmin } from "@/lib/firebase-admin-app";
import {
  buildClientOnboardingInviteUrl,
  type ClientOnboardingInviteVariant,
} from "@/lib/client-onboarding-invite-url";

export type { ClientOnboardingInviteVariant };

/**
 * Returns the full invitation URL (including secret key) for staff only.
 * Jeff: PLANPORT_CLIENT_ONBOARDING_KEY. Kevin: PLANPORT_CLIENT_ONBOARDING_KEY_KEVIN.
 */
export async function getClientOnboardingInviteLink(
  idToken: string,
  origin: string,
  inviteVariant: ClientOnboardingInviteVariant = "jeff"
): Promise<{ link: string } | { error: string }> {
  try {
    await assertPlanportAdmin(idToken);
  } catch {
    return { error: "You must be signed in as a PlanPort administrator." };
  }

  const built = buildClientOnboardingInviteUrl(origin, inviteVariant);
  if (!built.ok) {
    return {
      error:
        built.error.includes("Missing") && built.error.includes("PLANPORT")
          ? `${built.error} For local dev, add it to .env.local (any long random string, e.g. openssl rand -hex 32), save, and restart npm run dev. For production, set the same variable in Firebase App Hosting / your host’s environment secrets.`
          : built.error,
    };
  }
  return { link: built.url };
}

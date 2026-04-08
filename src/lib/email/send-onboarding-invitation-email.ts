import { Resend } from "resend";
import type { OnboardingInvitationContentParams } from "@/lib/email/onboarding-invitation-html";
import {
  buildOnboardingInvitationHtml,
  buildOnboardingInvitationPlainText,
  buildOnboardingInvitationSubject,
} from "@/lib/email/onboarding-invitation-html";
import type { ClientOnboardingInviteVariant } from "@/lib/client-onboarding-invite-url";

function resolveReplyTo(inviteVariant: ClientOnboardingInviteVariant): string {
  const branch = inviteVariant === "kevin" ? "kevin" : "jeff";
  const envEmailKey =
    branch === "kevin" ? "KEVIN_DESIGNER_CONTACT_EMAIL" : "JEFF_DESIGNER_CONTACT_EMAIL";
  const envEmail = process.env[envEmailKey]?.trim();
  if (envEmail) return envEmail;
  return branch === "kevin"
    ? "kevin@designersink.us"
    : "jeff@designersink.us";
}

/**
 * Sends the onboarding packet invitation via Resend (server-only).
 *
 * From address priority:
 * 1. RESEND_ONBOARDING_FROM — e.g. "Jeff Dillon Architecture <onboarding@yourdomain.com>"
 * 2. RESEND_FROM — shared PlanPort sender
 * 3. Resend onboarding fallback (dev only)
 *
 * TODO: Set RESEND_ONBOARDING_FROM after verifying your domain in Resend; avoid Gmail as From.
 */
export async function sendOnboardingInvitationEmail(input: {
  to: string;
  params: OnboardingInvitationContentParams;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const to = input.to.trim();
  if (!to || !to.includes("@")) {
    return { ok: false, message: "Recipient email is missing or invalid." };
  }

  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (!resendKey) {
    return {
      ok: false,
      message:
        "Email is not configured (missing RESEND_API_KEY). Add it to server env / Firebase secrets.",
    };
  }

  const from =
    process.env.RESEND_ONBOARDING_FROM?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    "PlanPort <onboarding@resend.dev>";

  const subject = buildOnboardingInvitationSubject(input.params);
  const html = buildOnboardingInvitationHtml(input.params);
  const text = buildOnboardingInvitationPlainText(input.params);
  const replyTo = resolveReplyTo(input.params.inviteVariant);

  try {
    const resend = new Resend(resendKey);
    const { error } = await resend.emails.send({
      from,
      to,
      reply_to: replyTo,
      subject,
      html,
      text,
    });

    if (error) {
      console.error("[sendOnboardingInvitationEmail] Resend error:", error);
      return {
        ok: false,
        message:
          error.message ||
          "Resend rejected the send. Check domain verification and RESEND_ONBOARDING_FROM / RESEND_FROM.",
      };
    }

    return { ok: true };
  } catch (e: unknown) {
    console.error("[sendOnboardingInvitationEmail]", e);
    const msg = e instanceof Error ? e.message : "Send failed.";
    return { ok: false, message: msg };
  }
}

"use server";

/**
 * Notify GC team and/or homeowner about a new blueprint (Resend only — no Genkit).
 */

import { z } from "zod";
import { Resend } from "resend";
import { getPlanportPublicAppUrl } from "@/lib/planport-public-url";

const BlueprintNotificationInputSchema = z.object({
  /** GC company name, or client household name — used in copy only. */
  hubDisplayName: z.string().min(1),
  projectName: z.string().min(1),
  blueprintName: z.string().min(1),
  versionNumber: z.number(),
  recipientEmails: z.array(z.string().email()).min(1),
});

export type BlueprintNotificationInput = z.infer<
  typeof BlueprintNotificationInputSchema
>;

export async function sendBlueprintNotification(
  input: BlueprintNotificationInput
): Promise<{ success: boolean; message: string }> {
  const parsed = BlueprintNotificationInputSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(" ");
    return { success: false, message: msg || "Invalid notification payload." };
  }

  const d = parsed.data;
  const appUrl = getPlanportPublicAppUrl();
  const appUrlAttr = escapeHtml(appUrl);

  const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #eee; padding: 20px;">
        <h2 style="color: #2E4B66;">New blueprint: ${escapeHtml(d.projectName)}</h2>
        <p>Hello,</p>
        <p>A new blueprint revision is available for <strong>${escapeHtml(d.projectName)}</strong> on PlanPort.</p>
        <p style="font-size: 13px; color: #555;">You are receiving this as a contact for <strong>${escapeHtml(d.hubDisplayName)}</strong>.</p>
        <hr style="border: none; border-top: 1px solid #eee;" />
        <h3>File details</h3>
        <p><strong>Blueprint:</strong> ${escapeHtml(d.blueprintName)}</p>
        <p><strong>Version:</strong> v${d.versionNumber} (Latest)</p>
        <p style="margin-top: 20px;">
          <a href="${appUrlAttr}" style="background-color: #52DBDB; color: #1B3147; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            View in PlanPort
          </a>
        </p>
        <p style="font-size: 12px; color: #666; margin-top: 30px;">
          This is an automated notification from Designer's Ink PlanPort.
        </p>
      </div>
    `;

  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (!resendKey) {
    console.warn("[sendBlueprintNotification] RESEND_API_KEY is not set.");
    return {
      success: false,
      message:
        "Email is not configured on the server (missing RESEND_API_KEY).",
    };
  }

  try {
    const resend = new Resend(resendKey);
    const from =
      process.env.RESEND_FROM?.trim() || "PlanPort <onboarding@resend.dev>";

    const sendResult = await resend.emails.send({
      from,
      to: d.recipientEmails,
      subject: `NEW FILE: ${d.blueprintName} — ${d.projectName}`,
      html: emailHtml,
    });

    if (sendResult.error) {
      console.error("[sendBlueprintNotification] Resend:", sendResult.error);
      return {
        success: false,
        message:
          sendResult.error.message ||
          "Resend rejected the message. Check RESEND_FROM and domain verification.",
      };
    }

    return {
      success: true,
      message: `Notification sent to ${d.recipientEmails.length} recipient(s).`,
    };
  } catch (e: unknown) {
    console.error("[sendBlueprintNotification]", e);
    const msg = e instanceof Error ? e.message : "Email failed.";
    return { success: false, message: msg };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

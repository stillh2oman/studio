'use server';
/**
 * Contact form and file transmission via Resend (no Genkit / no Gemini key required).
 */

import { z } from "zod";
import { Resend } from "resend";

const ContactFormInputSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(10, "Phone number is required"),
  subject: z.string().min(3, "Subject is required"),
  message: z.string().min(5, "Message is too short"),
  recipientEmail: z.string().email().optional(),
  projectName: z.string().optional(),
  projectAddress: z.string().optional(),
  attachments: z
    .array(
      z.object({
        name: z.string(),
        dataUri: z.string(),
      })
    )
    .optional(),
});

export type ContactFormInput = z.infer<typeof ContactFormInputSchema>;

export async function sendContactForm(
  input: ContactFormInput
): Promise<{ success: boolean; message: string }> {
  const parsed = ContactFormInputSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((e) => e.message).join(" ");
    return { success: false, message: msg || "Invalid form data." };
  }

  const data = parsed.data;
  const isFileTransmission = data.subject.includes("File Transmission");
  const targetEmail = data.recipientEmail || "jeff@designersink.us";

  const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #eee; padding: 20px;">
        <h2 style="color: #2E4B66;">${isFileTransmission ? "New File Transmission" : "New Inquiry"} for Designer's Ink</h2>

        <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <p><strong>From:</strong> ${escapeHtml(data.name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(data.email)}</p>
          <p><strong>Phone:</strong> ${escapeHtml(data.phone)}</p>
        </div>

        ${
          data.projectName
            ? `
        <div style="border-left: 4px solid #52DBDB; padding-left: 15px; margin-bottom: 20px;">
          <p style="margin: 0; font-size: 12px; color: #666; font-weight: bold; text-transform: uppercase;">Project Context</p>
          <p style="margin: 5px 0 0 0; font-weight: bold; color: #1B3147;">${escapeHtml(data.projectName)}</p>
          <p style="margin: 2px 0 0 0; font-size: 13px; color: #666;">${escapeHtml(data.projectAddress || "Address not specified")}</p>
        </div>
        `
            : ""
        }

        <hr style="border: none; border-top: 1px solid #eee;" />
        <h3>Subject: ${escapeHtml(data.subject)}</h3>
        <p style="white-space: pre-wrap;">${escapeHtml(data.message)}</p>

        ${
          data.attachments && data.attachments.length > 0
            ? `
          <div style="margin-top: 20px;">
            <p style="font-weight: bold; color: #2E4B66;">Attachments Included (${data.attachments.length}):</p>
            <ul style="font-size: 13px; color: #666;">
              ${data.attachments.map((a) => `<li>${escapeHtml(a.name)}</li>`).join("")}
            </ul>
          </div>
        `
            : ""
        }
      </div>
    `;

  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (!resendKey) {
    console.warn("[sendContactForm] RESEND_API_KEY is not set.");
    return {
      success: false,
      message:
        "Email is not configured on the server (missing RESEND_API_KEY). Please contact support.",
    };
  }

  try {
    const resend = new Resend(resendKey);
    const from =
      process.env.RESEND_FROM?.trim() || "PlanPort <onboarding@resend.dev>";

    const resendAttachments =
      data.attachments?.map((a) => {
        const parts = a.dataUri.split(",");
        const base64Data = parts.length > 1 ? parts[1] : parts[0];
        return {
          filename: a.name,
          content: base64Data,
        };
      }) || [];

    const { error } = await resend.emails.send({
      from,
      to: targetEmail,
      subject: `[PlanPort] ${data.subject}: ${data.name}`,
      html: emailHtml,
      attachments: resendAttachments.length > 0 ? resendAttachments : undefined,
    });

    if (error) {
      console.error("[sendContactForm] Resend error:", error);
      return {
        success: false,
        message:
          error.message ||
          "Could not send email. Check Resend domain and API key configuration.",
      };
    }

    return {
      success: true,
      message: isFileTransmission
        ? `Your files have been transmitted to Designer's Ink (${targetEmail}). We will review them shortly.`
        : `Your message has been sent to ${targetEmail}. We will get back to you shortly.`,
    };
  } catch (e: unknown) {
    console.error("[sendContactForm]", e);
    const msg = e instanceof Error ? e.message : "Transmission failed.";
    return {
      success: false,
      message:
        msg.includes("25MB") || msg.includes("limit")
          ? msg
          : `${msg} If this persists, verify RESEND_API_KEY and RESEND_FROM (verified domain).`,
    };
  }
}

export type FirmChatAttachment = { filename: string; contentBase64: string };

/**
 * Internal designer alert (Firm Chat inbox). Uses the same Resend configuration as the contact form.
 */
export async function sendFirmChatNotification(input: {
  to: string;
  subject: string;
  html: string;
  attachments?: FirmChatAttachment[];
}): Promise<{ success: boolean; message: string }> {
  const to = input.to.trim();
  if (!to) {
    return { success: false, message: "Recipient email is missing." };
  }

  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (!resendKey) {
    console.warn("[sendFirmChatNotification] RESEND_API_KEY is not set.");
    return {
      success: false,
      message:
        "Email is not configured on the server (missing RESEND_API_KEY). Please contact support.",
    };
  }

  try {
    const resend = new Resend(resendKey);
    const from =
      process.env.RESEND_FROM?.trim() || "PlanPort <onboarding@resend.dev>";

    const resendAttachments =
      input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.contentBase64,
      })) || [];

    const { error } = await resend.emails.send({
      from,
      to,
      subject: input.subject.startsWith("[PlanPort") ? input.subject : `[PlanPort Firm Chat] ${input.subject}`,
      html: input.html,
      attachments: resendAttachments.length > 0 ? resendAttachments : undefined,
    });

    if (error) {
      console.error("[sendFirmChatNotification] Resend error:", error);
      return {
        success: false,
        message:
          error.message ||
          "Could not send Firm Chat notification. Check Resend domain and API key configuration.",
      };
    }

    return { success: true, message: "Notification sent." };
  } catch (e: unknown) {
    console.error("[sendFirmChatNotification]", e);
    const msg = e instanceof Error ? e.message : "Transmission failed.";
    return {
      success: false,
      message:
        msg.includes("25MB") || msg.includes("limit")
          ? msg
          : `${msg} If this persists, verify RESEND_API_KEY and RESEND_FROM (verified domain).`,
    };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

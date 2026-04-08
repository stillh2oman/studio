"use server";

import { z } from "zod";
import { Resend } from "resend";
import { FieldValue } from "firebase-admin/firestore";
import { clientOnboardingQuestionnaireFormSchema } from "@/lib/client-onboarding-questionnaire-schema";
import { getPlanportAdminFirestore } from "@/lib/firebase-admin-app";
import { ONBOARDING_QUESTIONNAIRE_SUBMISSIONS_COLLECTION } from "@/lib/onboarding-submission-constants";
import { projectLocationListSummary } from "@/lib/onboarding-project-address";

const attachmentSchema = z.object({
  name: z.string(),
  dataUri: z.string(),
});

const questionnaireSchema = clientOnboardingQuestionnaireFormSchema.and(
  z.object({
    attachments: z.array(attachmentSchema).max(10).optional(),
  })
);

export type ClientOnboardingQuestionnaireInput = z.infer<typeof questionnaireSchema>;

const PROJECT_TYPE_LABELS: Record<string, string> = {
  new_construction: "New Construction - Residential",
  remodel: "Remodel - Residential",
  addition: "Addition - Residential",
  other: "Other",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function opt(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t ? t : undefined;
}

export async function submitClientOnboardingQuestionnaire(
  input: ClientOnboardingQuestionnaireInput
): Promise<{ success: boolean; message: string }> {
  const parsed = questionnaireSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((e) => e.message).join(" ");
    return { success: false, message: msg || "Invalid form data." };
  }

  const data = parsed.data;
  const typeLines = data.projectTypes
    .map((t) => PROJECT_TYPE_LABELS[t] || t)
    .map((label) => `<li>${escapeHtml(label)}</li>`)
    .join("");

  const sub = opt(data.subdivisionName);
  const permit = opt(data.permittingAgency);

  const locationHtml = `
      <p><strong>Physical address:</strong><br/>
        ${escapeHtml(data.projectStreetAddress.trim())}<br/>
        ${escapeHtml([data.projectCity.trim(), data.projectState.trim()].filter(Boolean).join(", "))}
      </p>
      ${sub ? `<p><strong>Subdivision:</strong> ${escapeHtml(sub)}</p>` : ""}
      ${permit ? `<p><strong>Permitting agency:</strong> ${escapeHtml(permit)}</p>` : ""}
      <p><strong>Site description:</strong><br/><span style="white-space: pre-wrap;">${escapeHtml(data.siteDescription.trim())}</span></p>
      <p><strong>General contractor:</strong> ${escapeHtml(data.generalContractor.trim())}</p>
  `;

  const emailHtml = `
    <div style="font-family: sans-serif; max-width: 640px; border: 1px solid #eee; padding: 24px;">
      <h2 style="color: #2E4B66; margin-top: 0;">Client onboarding questionnaire</h2>
      <p style="color: #666; font-size: 13px;">Submitted via PlanPort onboarding packet.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p><strong>Name(s):</strong> ${escapeHtml(data.clientNames)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(data.phone)}</p>
      <p><strong>E-mail(s):</strong> ${escapeHtml(data.emails)}</p>
      <p><strong>Type of project:</strong></p>
      <ul style="margin: 8px 0;">${typeLines}</ul>
      ${
        data.otherElaboration?.trim()
          ? `<p><strong>If Other — elaborate:</strong><br/><span style="white-space: pre-wrap;">${escapeHtml(data.otherElaboration.trim())}</span></p>`
          : ""
      }
      ${locationHtml}
      <p><strong>Project description:</strong><br/><span style="white-space: pre-wrap;">${escapeHtml(data.projectDescription)}</span></p>
      ${
        data.attachments && data.attachments.length > 0
          ? `<p style="font-weight: bold; color: #2E4B66;">Attachments (${data.attachments.length})</p><ul style="font-size: 13px; color: #666;">${data.attachments.map((a) => `<li>${escapeHtml(a.name)}</li>`).join("")}</ul>`
          : "<p><em>No files attached.</em></p>"
      }
    </div>
  `;

  const street = data.projectStreetAddress.trim();
  const city = data.projectCity.trim();
  const state = data.projectState.trim();
  const listSummary = projectLocationListSummary({
    projectStreetAddress: street,
    projectCity: city,
    projectState: state,
  });

  try {
    const db = getPlanportAdminFirestore();
    await db.collection(ONBOARDING_QUESTIONNAIRE_SUBMISSIONS_COLLECTION).add({
      clientNames: data.clientNames.trim(),
      phone: data.phone.trim(),
      emails: data.emails.trim(),
      projectTypes: data.projectTypes,
      otherElaboration: data.otherElaboration?.trim() || null,
      projectStreetAddress: street,
      projectCity: city,
      projectState: state,
      subdivisionName: sub || null,
      permittingAgency: permit || null,
      siteDescription: data.siteDescription.trim(),
      generalContractor: data.generalContractor.trim(),
      projectLocation: listSummary,
      projectDescription: data.projectDescription.trim(),
      attachmentNames: (data.attachments ?? []).map((a) => a.name),
      submittedAt: FieldValue.serverTimestamp(),
      status: "pending",
    });
  } catch (storeErr) {
    console.error("[submitClientOnboardingQuestionnaire] Firestore save failed:", storeErr);
    return {
      success: false,
      message:
        "We could not save your questionnaire. Please check your connection and try again, or contact Designer's Ink directly.",
    };
  }

  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (!resendKey) {
    console.warn("[submitClientOnboardingQuestionnaire] RESEND_API_KEY is not set.");
    return {
      success: true,
      message:
        "Your questionnaire was saved. Email notification is not configured on the server—we will still see your submission in PlanPort and be in touch.",
    };
  }

  try {
    const resend = new Resend(resendKey);
    const from =
      process.env.RESEND_FROM?.trim() || "PlanPort <onboarding@resend.dev>";
    const to = process.env.DESIGNER_QUESTIONNAIRE_EMAIL?.trim() || "jeff@designersink.us";

    const resendAttachments =
      data.attachments?.map((a) => {
        const parts = a.dataUri.split(",");
        const base64Data = parts.length > 1 ? parts[1] : parts[0];
        return { filename: a.name, content: base64Data };
      }) || [];

    const firstEmail =
      data.emails.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.trim() || undefined;

    const { error } = await resend.emails.send({
      from,
      to,
      reply_to: firstEmail,
      subject: `[PlanPort] Client questionnaire: ${data.clientNames.slice(0, 80)}`,
      html: emailHtml,
      attachments: resendAttachments.length > 0 ? resendAttachments : undefined,
    });

    if (error) {
      console.error("[submitClientOnboardingQuestionnaire] Resend error:", error);
      return {
        success: true,
        message:
          "Your questionnaire was saved. We could not send the confirmation email—our team will still see your submission in PlanPort.",
      };
    }

    return {
      success: true,
      message: "Thank you. Your questionnaire has been sent. We will be in touch soon.",
    };
  } catch (e: unknown) {
    console.error("[submitClientOnboardingQuestionnaire] Email send error after save:", e);
    const msg = e instanceof Error ? e.message : "Submission failed.";
    return {
      success: true,
      message:
        msg.includes("25MB") || msg.includes("limit")
          ? `Your answers were saved, but the email step failed: ${msg}`
          : "Your questionnaire was saved. We could not complete the email notification—our team will still see your submission in PlanPort.",
    };
  }
}

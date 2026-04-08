import { convert } from "html-to-text";
import type { ClientOnboardingInviteVariant } from "@/lib/client-onboarding-invite-url";
import {
  ONBOARDING_INVITATION_BRANDING,
  ONBOARDING_INVITATION_EMAIL_COPY,
  fillTemplate,
} from "@/lib/email/onboarding-invitation-copy";
import { escapeHtml } from "@/lib/email/html-escape";

const ACCENT = "#1c2e3d";
const MUTED = "#5c6670";
const PAGE_BG = "#f3f2ef";
const CARD_BG = "#ffffff";

export type OnboardingInvitationContentParams = {
  onboardingUrl: string;
  inviteVariant: ClientOnboardingInviteVariant;
  clientName?: string | null;
  projectName?: string | null;
};

function resolveBrandingRaw(inviteVariant: ClientOnboardingInviteVariant) {
  const firmName =
    process.env.PLANPORT_FIRM_DISPLAY_NAME?.trim() ||
    ONBOARDING_INVITATION_BRANDING.firmName;
  const branch = inviteVariant === "kevin" ? "kevin" : "jeff";
  const envEmailKey =
    branch === "kevin" ? "KEVIN_DESIGNER_CONTACT_EMAIL" : "JEFF_DESIGNER_CONTACT_EMAIL";
  const envEmail = process.env[envEmailKey]?.trim();
  const senderName = ONBOARDING_INVITATION_BRANDING[branch].senderName;
  const senderEmail =
    envEmail || ONBOARDING_INVITATION_BRANDING[branch].senderEmail;

  return { firmName, senderName, senderEmail };
}

/** Plain-text template vars (subject, preview, headers) — not HTML-escaped */
function buildPlainTemplateVars(
  params: OnboardingInvitationContentParams
): Record<string, string> {
  const { firmName, senderName, senderEmail } = resolveBrandingRaw(
    params.inviteVariant
  );
  const client = params.clientName?.trim();
  const project = params.projectName?.trim();

  return {
    firmName,
    clientName: client ?? "",
    projectName: project ?? "",
    senderName,
    senderEmail,
    onboardingUrl: params.onboardingUrl,
  };
}

/**
 * HTML body substitution map — escaped where user-controlled or derived from profile.
 */
export function buildOnboardingInvitationHtmlVars(
  params: OnboardingInvitationContentParams
): Record<string, string> {
  const plain = buildPlainTemplateVars(params);
  return {
    firmName: escapeHtml(plain.firmName),
    clientName: escapeHtml(plain.clientName),
    projectName: escapeHtml(plain.projectName),
    senderName: escapeHtml(plain.senderName),
    senderEmail: escapeHtml(plain.senderEmail),
    onboardingUrl: params.onboardingUrl,
  };
}

export function buildOnboardingInvitationSubject(
  params: OnboardingInvitationContentParams
): string {
  const vars = buildPlainTemplateVars(params);
  return fillTemplate(
    ONBOARDING_INVITATION_EMAIL_COPY.subjectTemplate,
    vars
  ).trim();
}

export function buildOnboardingInvitationPreviewText(
  params: OnboardingInvitationContentParams
): string {
  const vars = buildPlainTemplateVars(params);
  return fillTemplate(
    ONBOARDING_INVITATION_EMAIL_COPY.previewTextTemplate,
    vars
  ).trim();
}

function bulletproofButton(url: string, label: string): string {
  const hrefSafe = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  return `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 28px 0;">
  <tr>
    <td align="left">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td align="center" bgcolor="${ACCENT}" style="border-radius: 3px;">
            <a href="${hrefSafe}" target="_blank" rel="noopener noreferrer"
              style="display: inline-block; padding: 16px 32px; font-family: 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 15px; line-height: 20px; color: #ffffff; text-decoration: none; font-weight: 600; letter-spacing: 0.02em;">
              ${safeLabel}
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

export function buildOnboardingInvitationHtml(
  params: OnboardingInvitationContentParams
): string {
  const vars = buildOnboardingInvitationHtmlVars(params);
  const copy = ONBOARDING_INVITATION_EMAIL_COPY;
  const preview = buildOnboardingInvitationPreviewText(params);

  const greeting =
    vars.clientName.trim().length > 0
      ? fillTemplate(copy.greetingWithNameHtml, vars)
      : copy.greetingNeutralHtml;

  const bodyBlocks = copy.bodyParagraphsHtml.map(
    (p) =>
      `<p style="margin: 0 0 18px 0; font-family: 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 1.65; color: #2a2f36;">${p}</p>`
  );

  const projectBlock =
    vars.projectName.trim().length > 0
      ? `<p style="margin: 0 0 22px 0; font-family: 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: ${MUTED};">${fillTemplate(copy.projectLineHtml, vars)}</p>`
      : "";

  const closing = copy.closingParagraphsHtml
    .map((line) => {
      const filled = fillTemplate(line, vars);
      if (!filled.trim()) {
        return `<p style="margin: 0; font-size: 12px; line-height: 1.4;">&nbsp;</p>`;
      }
      return `<p style="margin: 0 0 6px 0; font-family: Georgia, 'Times New Roman', serif; font-size: 15px; line-height: 1.6; color: #2a2f36;">${filled}</p>`;
    })
    .join("");

  const urlForDisplay = escapeHtml(params.onboardingUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(buildOnboardingInvitationSubject(params))}</title>
</head>
<body style="margin:0;padding:0;background-color:${PAGE_BG};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">
    ${escapeHtml(preview)}
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${PAGE_BG};padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 560px;" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td style="padding: 40px 36px 36px 36px; background-color:${CARD_BG}; border: 1px solid #e8e6e1;">
              <p style="margin: 0 0 8px 0; font-family: Georgia, 'Times New Roman', serif; font-size: 12px; line-height: 1.45; letter-spacing: 0.04em; color: ${MUTED};">
                ${escapeHtml(copy.headerTagline)}
              </p>
              <h1 style="margin: 0 0 28px 0; font-family: Georgia, 'Times New Roman', serif; font-size: 26px; line-height: 1.25; font-weight: 400; color: ${ACCENT}; letter-spacing: -0.02em;">
                ${vars.firmName}
              </h1>
              <p style="margin: 0 0 22px 0; font-family: Georgia, 'Times New Roman', serif; font-size: 18px; line-height: 1.5; color: #2a2f36;">
                ${greeting}
              </p>
              ${bodyBlocks.join("")}
              ${projectBlock}
              ${bulletproofButton(params.onboardingUrl, copy.buttonLabel)}
              <p style="margin: 0 0 10px 0; font-family: 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.5; color: ${MUTED};">
                ${escapeHtml(copy.fallbackLinkIntro)}
              </p>
              <p style="margin: 0 0 32px 0; font-family: 'Courier New', Courier, monospace; font-size: 12px; line-height: 1.5; word-break: break-all; color: #2a2f36;">
                ${urlForDisplay}
              </p>
              ${closing}
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 8px 0 8px; text-align: center;">
              <p style="margin: 0; font-family: 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.5; color: #8b939c;">
                This message was sent because someone at ${vars.firmName} shared your onboarding packet with you.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildOnboardingInvitationPlainText(
  params: OnboardingInvitationContentParams
): string {
  const html = buildOnboardingInvitationHtml(params);
  return convert(html, {
    wordwrap: 100,
    preserveNewlines: true,
  });
}

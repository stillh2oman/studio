/**
 * Editable onboarding invitation email copy — adjust subject, preview, body, button, and signature here.
 * Use {{variableName}} placeholders; supported: firmName, clientName, projectName, senderName, senderEmail, onboardingUrl
 * (onboardingUrl is only substituted where noted — keep the button href separate for safety).
 */
export const ONBOARDING_INVITATION_EMAIL_COPY = {
  /** Small line above the firm name in the email header */
  headerTagline: "Residential and Light Commercial Building Design",

  /** Email subject (supports {{firmName}}) */
  subjectTemplate: "Your onboarding packet from {{firmName}}",

  /** Shown as hidden preheader in inboxes that support it */
  previewTextTemplate:
    "Review your project onboarding packet and next steps — all in one secure place.",

  /** Line under firm name when client name is provided (supports {{clientName}}) */
  greetingWithNameHtml: "Dear {{clientName}},",

  /** When client name is empty */
  greetingNeutralHtml: "Hello,",

  /** Main body — array of paragraphs (HTML allowed sparingly: <strong>, <em>). No user vars unless you add them. */
  bodyParagraphsHtml: [
    "Thank you for taking this step with us. Your onboarding packet is a short, guided introduction to how we work together — from process and timelines to what we will need from you as your project takes shape.",
    "Please review the packet when you have a quiet moment. You can move through it at your own pace and return anytime. If anything is unclear, simply reply to this email.",
  ],

  /** Inserted only when projectName is provided (supports {{projectName}}) */
  projectLineHtml: "<strong>Project:</strong> {{projectName}}",

  /** Primary CTA — keep short for mobile */
  buttonLabel: "Open Your Onboarding Packet",

  /** Line above the raw URL in the HTML body */
  fallbackLinkIntro: "If the button does not work, copy and paste this link into your browser:",

  /** Closing block (HTML). Supports {{senderName}}, {{firmName}}, {{senderEmail}} */
  closingParagraphsHtml: [
    "We look forward to learning more about your project.",
    "",
    "Best,",
    "{{senderName}}",
    "{{firmName}}",
    "{{senderEmail}}",
  ],
} as const;

/** Firm + sender defaults when env overrides are not set */
export const ONBOARDING_INVITATION_BRANDING = {
  /** Display name of the practice (also used in subject line) */
  firmName: "Designer's Ink Graphic & Building Designs, LLC",
  jeff: {
    senderName: "Jeff Dillon",
    /** TODO: use a transactional address on your verified domain, e.g. onboarding@yourdomain.com */
    senderEmail: "jeff@designersink.us",
  },
  kevin: {
    senderName: "Kevin Walthall",
    senderEmail: "kevin@designersink.us",
  },
} as const;

export function fillTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

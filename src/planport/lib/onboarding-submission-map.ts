import type { ProjectOnboardingIntake } from "@/lib/onboarding-submission-types";
import {
  composeProjectAddressForDirectory,
  projectLocationListSummary,
} from "@/lib/onboarding-project-address";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export type AdditionalClientShape = { name: string; email: string };

export type CreateClientPrefillFromSubmission = {
  husbandName: string;
  wifeName: string;
  email: string;
  phone: string;
  additionalContacts: AdditionalClientShape[];
  projectName: string;
  projectAddress: string;
  accessCodeSuggestion: string;
  onboardingIntake: ProjectOnboardingIntake;
};

function slugSegment(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

/** Split "A & B" or "A and B" into two names when unambiguous. */
export function splitClientNamesForDirectory(raw: string): { husbandName: string; wifeName: string } {
  const t = raw.trim();
  if (!t) return { husbandName: "", wifeName: "" };

  const amp = t.split(/\s+&\s+/);
  if (amp.length === 2 && amp[0] && amp[1]) {
    return { husbandName: amp[0]!.trim(), wifeName: amp[1]!.trim() };
  }

  const and = t.split(/\s+and\s+/i);
  if (and.length === 2 && and[0] && and[1]) {
    return { husbandName: and[0]!.trim(), wifeName: and[1]!.trim() };
  }

  return { husbandName: t, wifeName: "" };
}

export function extractEmailsFromField(text: string): string[] {
  const matches = text.match(EMAIL_RE);
  if (!matches?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const e = m.toLowerCase();
    if (!seen.has(e)) {
      seen.add(e);
      out.push(m.trim());
    }
  }
  return out;
}

function deriveProjectName(description: string, fallbackPrefix: string): string {
  const oneLine = description.replace(/\s+/g, " ").trim();
  if (!oneLine) return `${fallbackPrefix} — Project`;
  const sentence = oneLine.split(/(?<=[.!?])\s+/)[0] ?? oneLine;
  const trimmed = sentence.trim().slice(0, 88);
  return trimmed.length < oneLine.length && !/[.!?]$/.test(trimmed) ? `${trimmed}…` : trimmed;
}

function randomAccessSuffix(): string {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

export type MapSubmissionToCreateClientOptions = {
  /**
   * Add Private Client from questionnaire: project address is street + city + state only;
   * project name and hub access code are left blank for the designer.
   */
  privateClientQuestionnairePrefill?: boolean;
};

/**
 * Map a stored questionnaire submission into Create Client dialog fields + project onboarding snapshot.
 */
export function mapSubmissionToCreateClientPrefill(
  submission: Pick<
    import("@/lib/onboarding-submission-types").OnboardingQuestionnaireSubmissionDoc,
    | "clientNames"
    | "phone"
    | "emails"
    | "projectTypes"
    | "otherElaboration"
    | "projectStreetAddress"
    | "projectCity"
    | "projectState"
    | "subdivisionName"
    | "permittingAgency"
    | "siteDescription"
    | "generalContractor"
    | "projectLocation"
    | "projectDescription"
    | "attachmentNames"
    | "submittedAt"
  >,
  options?: MapSubmissionToCreateClientOptions
): CreateClientPrefillFromSubmission {
  const privateClientQ = options?.privateClientQuestionnairePrefill === true;

  const { husbandName, wifeName } = splitClientNamesForDirectory(submission.clientNames);
  const emails = extractEmailsFromField(submission.emails);
  const primaryEmail = emails[0] ?? "";
  const extraEmails = emails.slice(1).map((email) => ({ name: "", email }));

  const slug = slugSegment(husbandName || submission.clientNames || "client");
  const accessCodeSuggestion = privateClientQ
    ? ""
    : `${slug || "CLIENT"}-${randomAccessSuffix()}`.toUpperCase();

  const projectName = privateClientQ
    ? ""
    : deriveProjectName(
        submission.projectDescription,
        husbandName || submission.clientNames || "Client"
      );

  const street = submission.projectStreetAddress?.trim() ?? "";
  const city = submission.projectCity?.trim() ?? "";
  const state = submission.projectState?.trim() ?? "";
  const subdivision = submission.subdivisionName?.trim();
  const permitting = submission.permittingAgency?.trim();
  const site = submission.siteDescription?.trim() ?? "";
  const generalContractor = submission.generalContractor?.trim() ?? "";

  const hasStructured = street || city || state || site || subdivision || permitting;
  const projectAddress = privateClientQ
    ? projectLocationListSummary({
        projectStreetAddress: street,
        projectCity: city,
        projectState: state,
      })
    : hasStructured
      ? composeProjectAddressForDirectory({
          projectStreetAddress: street,
          projectCity: city,
          projectState: state,
          subdivisionName: subdivision,
          permittingAgency: permitting,
          siteDescription: site,
        })
      : (submission.projectLocation?.trim() ?? "");

  const onboardingIntake: ProjectOnboardingIntake = {
    questionnaireSubmittedAt: submission.submittedAt,
    projectTypes: [...submission.projectTypes],
    projectDescription: submission.projectDescription,
    ...(submission.otherElaboration?.trim()
      ? { otherElaboration: submission.otherElaboration.trim() }
      : {}),
    ...(street ? { projectStreetAddress: street } : {}),
    ...(city ? { projectCity: city } : {}),
    ...(state ? { projectState: state } : {}),
    ...(subdivision ? { subdivisionName: subdivision } : {}),
    ...(permitting ? { permittingAgency: permitting } : {}),
    ...(site ? { siteDescription: site } : {}),
    ...(generalContractor ? { generalContractor } : {}),
    attachmentNames: [...submission.attachmentNames],
  };

  return {
    husbandName,
    wifeName,
    email: primaryEmail,
    phone: submission.phone.trim(),
    additionalContacts: extraEmails,
    projectName,
    projectAddress,
    accessCodeSuggestion,
    onboardingIntake,
  };
}

/** Pre-fill a new project under an existing individual client (questionnaire → project fields + intake snapshot). */
export function mapSubmissionToNewProjectPrefill(
  submission: Parameters<typeof mapSubmissionToCreateClientPrefill>[0],
  mapOptions?: MapSubmissionToCreateClientOptions
): {
  projectName: string;
  projectAddress: string;
  ownerName: string;
  onboardingIntake: ProjectOnboardingIntake;
} {
  const pre = mapSubmissionToCreateClientPrefill(submission, mapOptions);
  const ownerName = pre.wifeName ? `${pre.husbandName} & ${pre.wifeName}` : pre.husbandName;
  return {
    projectName: pre.projectName,
    projectAddress: pre.projectAddress,
    ownerName,
    onboardingIntake: pre.onboardingIntake,
  };
}

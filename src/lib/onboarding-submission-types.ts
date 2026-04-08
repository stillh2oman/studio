import type { ClientOnboardingQuestionnaireFormValues } from "@/lib/client-onboarding-questionnaire-schema";

/** Stored on each submission document (no file binaries). */
export type OnboardingQuestionnaireSubmissionDoc = {
  clientNames: string;
  phone: string;
  emails: string;
  projectTypes: ClientOnboardingQuestionnaireFormValues["projectTypes"];
  otherElaboration?: string;
  projectStreetAddress: string;
  projectCity: string;
  projectState: string;
  subdivisionName?: string;
  permittingAgency?: string;
  siteDescription: string;
  /** Who the client expects as GC: company name, Self-Contractor, or Pending. */
  generalContractor?: string;
  /** Denormalized one-line summary for admin list (legacy + new submissions). */
  projectLocation: string;
  projectDescription: string;
  attachmentNames: string[];
  submittedAt: string;
  status: "pending" | "imported";
  importedClientId?: string;
  importedProjectId?: string;
  importedAt?: string;
};

/** Shown in admin pickers (list action). */
export type OnboardingSubmissionListItem = {
  id: string;
  submittedAtIso: string | null;
  clientNames: string;
  emails: string;
  phone: string;
  projectLocation: string;
  status: "pending" | "imported";
};

/** Snapshot copied onto the initial project when creating a client from a submission. */
export type ProjectOnboardingIntake = {
  questionnaireSubmittedAt: string;
  projectTypes: string[];
  projectDescription: string;
  otherElaboration?: string;
  attachmentNames: string[];
  projectStreetAddress?: string;
  projectCity?: string;
  projectState?: string;
  subdivisionName?: string;
  permittingAgency?: string;
  siteDescription?: string;
  generalContractor?: string;
};

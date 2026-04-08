"use server";

import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { assertPlanportAdmin, getPlanportAdminFirestore } from "@/lib/firebase-admin-app";
import { ONBOARDING_QUESTIONNAIRE_SUBMISSIONS_COLLECTION } from "@/lib/onboarding-submission-constants";
import type {
  OnboardingQuestionnaireSubmissionDoc,
  OnboardingSubmissionListItem,
} from "@/lib/onboarding-submission-types";
import { projectLocationListSummary } from "@/lib/onboarding-project-address";

function tsToIso(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v;
  if (v && typeof v === "object" && "toDate" in v && typeof (v as Timestamp).toDate === "function") {
    try {
      return (v as Timestamp).toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

function listLocationSummary(data: Record<string, unknown>): string {
  const legacy = String(data.projectLocation ?? "").trim();
  const street = String(data.projectStreetAddress ?? "").trim();
  const city = String(data.projectCity ?? "").trim();
  const state = String(data.projectState ?? "").trim();
  if (street || city || state) {
    return projectLocationListSummary({ projectStreetAddress: street, projectCity: city, projectState: state });
  }
  return legacy;
}

function docToListItem(
  id: string,
  data: Record<string, unknown>
): OnboardingSubmissionListItem {
  return {
    id,
    submittedAtIso: tsToIso(data.submittedAt),
    clientNames: String(data.clientNames ?? ""),
    emails: String(data.emails ?? ""),
    phone: String(data.phone ?? ""),
    projectLocation: listLocationSummary(data),
    status: data.status === "imported" ? "imported" : "pending",
  };
}

/**
 * Pending + recently imported submissions for admin UI (newest first).
 */
export async function listOnboardingQuestionnaireSubmissions(
  idToken: string
): Promise<{ items: OnboardingSubmissionListItem[] } | { error: string }> {
  try {
    await assertPlanportAdmin(idToken);
  } catch {
    return { error: "You must be signed in as a PlanPort administrator." };
  }

  try {
    const db = getPlanportAdminFirestore();
    const snap = await db
      .collection(ONBOARDING_QUESTIONNAIRE_SUBMISSIONS_COLLECTION)
      .orderBy("submittedAt", "desc")
      .limit(40)
      .get();

    const items: OnboardingSubmissionListItem[] = snap.docs.map((d) =>
      docToListItem(d.id, d.data())
    );
    return { items };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load submissions.";
    console.error("[listOnboardingQuestionnaireSubmissions]", e);
    return { error: msg };
  }
}

/**
 * Full submission row for applying pre-fill (admin only).
 */
export async function getOnboardingQuestionnaireSubmission(
  idToken: string,
  submissionId: string
): Promise<
  { submission: OnboardingQuestionnaireSubmissionDoc & { id: string } } | { error: string }
> {
  try {
    await assertPlanportAdmin(idToken);
  } catch {
    return { error: "You must be signed in as a PlanPort administrator." };
  }

  if (!submissionId.trim()) {
    return { error: "Missing submission id." };
  }

  try {
    const db = getPlanportAdminFirestore();
    const ref = db.collection(ONBOARDING_QUESTIONNAIRE_SUBMISSIONS_COLLECTION).doc(submissionId);
    const snap = await ref.get();
    if (!snap.exists) {
      return { error: "Submission not found." };
    }
    const data = snap.data()!;
    const submittedAt = tsToIso(data.submittedAt) ?? new Date().toISOString();
    const importedAt = data.importedAt ? tsToIso(data.importedAt) ?? undefined : undefined;

    let street = String(data.projectStreetAddress ?? "").trim();
    let city = String(data.projectCity ?? "").trim();
    let state = String(data.projectState ?? "").trim();
    let site = String(data.siteDescription ?? "").trim();
    const legacyLoc = String(data.projectLocation ?? "").trim();
    const sub = data.subdivisionName ? String(data.subdivisionName).trim() : undefined;
    const permit = data.permittingAgency ? String(data.permittingAgency).trim() : undefined;
    const generalContractor = data.generalContractor
      ? String(data.generalContractor).trim()
      : undefined;

    if (!street && !city && !state && !site && legacyLoc) {
      street = legacyLoc;
    }

    const listSummary =
      street || city || state
        ? projectLocationListSummary({ projectStreetAddress: street, projectCity: city, projectState: state })
        : legacyLoc;

    const submission: OnboardingQuestionnaireSubmissionDoc & { id: string } = {
      id: snap.id,
      clientNames: String(data.clientNames ?? ""),
      phone: String(data.phone ?? ""),
      emails: String(data.emails ?? ""),
      projectTypes: Array.isArray(data.projectTypes) ? data.projectTypes : [],
      otherElaboration: data.otherElaboration ? String(data.otherElaboration) : undefined,
      projectStreetAddress: street,
      projectCity: city,
      projectState: state,
      ...(sub ? { subdivisionName: sub } : {}),
      ...(permit ? { permittingAgency: permit } : {}),
      siteDescription: site,
      ...(generalContractor ? { generalContractor } : {}),
      projectLocation: listSummary,
      projectDescription: String(data.projectDescription ?? ""),
      attachmentNames: Array.isArray(data.attachmentNames)
        ? data.attachmentNames.map((x) => String(x))
        : [],
      submittedAt,
      status: data.status === "imported" ? "imported" : "pending",
      importedClientId: data.importedClientId ? String(data.importedClientId) : undefined,
      importedProjectId: data.importedProjectId ? String(data.importedProjectId) : undefined,
      importedAt,
    };

    return { submission };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load submission.";
    console.error("[getOnboardingQuestionnaireSubmission]", e);
    return { error: msg };
  }
}

export async function markOnboardingSubmissionImported(
  idToken: string,
  submissionId: string,
  clientId: string,
  projectId: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await assertPlanportAdmin(idToken);
  } catch {
    return { error: "You must be signed in as a PlanPort administrator." };
  }

  if (!submissionId.trim() || !clientId.trim() || !projectId.trim()) {
    return { error: "Missing submission, client, or project id." };
  }

  try {
    const db = getPlanportAdminFirestore();
    await db
      .collection(ONBOARDING_QUESTIONNAIRE_SUBMISSIONS_COLLECTION)
      .doc(submissionId)
      .update({
        status: "imported",
        importedClientId: clientId,
        importedProjectId: projectId,
        importedAt: FieldValue.serverTimestamp(),
      });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not update submission.";
    console.error("[markOnboardingSubmissionImported]", e);
    return { error: msg };
  }
}

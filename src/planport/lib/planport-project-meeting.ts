import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import {
  PLANPORT_CLIENT_ROOT,
  PLANPORT_GC_ROOT,
} from "@/lib/planport-project-paths";
import {
  SCHEDULED_MEETING_CLIENT_EMAIL_FIELD,
  SCHEDULED_MEETING_EVENT_ID_FIELD,
  SCHEDULED_MEETING_START_FIELD,
  SCHEDULED_MEETING_STATUS_FIELD,
  SCHEDULED_MEETING_UPDATED_AT_FIELD,
} from "@/lib/planport-calendar/constants";
import { projectPayloadForClientMirror, projectPayloadForGcMirror } from "@/lib/contractor-project-sync";

export type PlanportHubKind = "client" | "gc";

function projectRef(
  db: Firestore,
  kind: PlanportHubKind,
  hubId: string,
  projectId: string
) {
  const root = kind === "client" ? PLANPORT_CLIENT_ROOT : PLANPORT_GC_ROOT;
  return db.collection(root).doc(hubId).collection("projects").doc(projectId);
}

/** After client-hub project doc changes on the server, mirror to contractor when sync is enabled. */
async function mirrorClientProjectDocToGcFromServer(
  db: Firestore,
  clientId: string,
  projectId: string
): Promise<void> {
  const snap = await projectRef(db, "client", clientId, projectId).get();
  if (!snap.exists) return;
  const data = snap.data() as Record<string, unknown>;
  if (data.contractorSyncEnabled !== true) return;
  const gcId =
    typeof data.syncedContractorId === "string" && data.syncedContractorId.trim()
      ? data.syncedContractorId
      : null;
  if (!gcId) return;
  const payload = projectPayloadForGcMirror(data, clientId, gcId);
  await db.collection(PLANPORT_GC_ROOT).doc(gcId).collection("projects").doc(projectId).set(payload);
}

/** After GC-hub project doc changes on the server, mirror to linked private client when sync is on. */
async function mirrorGcProjectDocToClientFromServer(
  db: Firestore,
  gcId: string,
  projectId: string
): Promise<void> {
  const snap = await projectRef(db, "gc", gcId, projectId).get();
  if (!snap.exists) return;
  const d = snap.data() as Record<string, unknown>;
  const clientId =
    typeof d.individualClientId === "string" && d.individualClientId.trim() ? d.individualClientId : null;
  if (!clientId) return;
  if (d.contractorSyncEnabled !== true) {
    const cSnap = await projectRef(db, "client", clientId, projectId).get();
    if (!cSnap.exists) return;
    const c = cSnap.data() as Record<string, unknown>;
    if (c.contractorSyncEnabled !== true || c.syncedContractorId !== gcId) return;
  }
  const payload = projectPayloadForClientMirror(d, clientId, gcId);
  await projectRef(db, "client", clientId, projectId).set(payload);
}

export async function syncProjectMeetingPending(params: {
  db: Firestore;
  hubKind: PlanportHubKind;
  hubId: string;
  projectId: string;
  calendarEventId: string;
  startIso: string;
  /** Stored for confirmation emails if calendar extended props are missing. */
  clientEmailFromBooking?: string | null;
}): Promise<void> {
  const {
    db,
    hubKind,
    hubId,
    projectId,
    calendarEventId,
    startIso,
    clientEmailFromBooking,
  } = params;
  const payload: Record<string, unknown> = {
    [SCHEDULED_MEETING_STATUS_FIELD]: "pending",
    [SCHEDULED_MEETING_EVENT_ID_FIELD]: calendarEventId,
    [SCHEDULED_MEETING_START_FIELD]: startIso,
    [SCHEDULED_MEETING_UPDATED_AT_FIELD]: FieldValue.serverTimestamp(),
  };
  const trimmed = clientEmailFromBooking?.trim();
  if (trimmed) payload[SCHEDULED_MEETING_CLIENT_EMAIL_FIELD] = trimmed;

  await projectRef(db, hubKind, hubId, projectId).set(payload, { merge: true });
  if (hubKind === "client") {
    await mirrorClientProjectDocToGcFromServer(db, hubId, projectId);
  } else if (hubKind === "gc") {
    await mirrorGcProjectDocToClientFromServer(db, hubId, projectId);
  }
}

export async function getScheduledMeetingClientEmailFromProject(
  db: Firestore,
  hubKind: PlanportHubKind,
  hubId: string,
  projectId: string
): Promise<string | null> {
  const snap = await projectRef(db, hubKind, hubId, projectId).get();
  const raw = snap.data()?.[SCHEDULED_MEETING_CLIENT_EMAIL_FIELD];
  const s = typeof raw === "string" ? raw.trim() : "";
  return s.includes("@") ? s : null;
}

export async function syncProjectMeetingConfirmed(params: {
  db: Firestore;
  hubKind: PlanportHubKind;
  hubId: string;
  projectId: string;
}): Promise<void> {
  const { db, hubKind, hubId, projectId } = params;
  await projectRef(db, hubKind, hubId, projectId).set(
    {
      [SCHEDULED_MEETING_STATUS_FIELD]: "confirmed",
      [SCHEDULED_MEETING_UPDATED_AT_FIELD]: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  if (hubKind === "client") {
    await mirrorClientProjectDocToGcFromServer(db, hubId, projectId);
  } else if (hubKind === "gc") {
    await mirrorGcProjectDocToClientFromServer(db, hubId, projectId);
  }
}

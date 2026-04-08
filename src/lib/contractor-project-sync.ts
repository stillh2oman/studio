import type { Firestore } from "firebase/firestore";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { PLANPORT_CLIENT_ROOT, PLANPORT_GC_ROOT } from "@/lib/planport-project-paths";

/** Subcollections kept in sync between private client and contractor hubs (two-way). */
export const CLIENT_PROJECT_MIRROR_SUBCOLLECTIONS = [
  "blueprints",
  "renderings",
  "chiefFiles",
  "inspiration",
] as const;
export type ClientProjectMirrorSubcollection = (typeof CLIENT_PROJECT_MIRROR_SUBCOLLECTIONS)[number];

/** Every project subcollection removed when deleting a project (includes client-only data). */
export const PROJECT_DELETE_SUBCOLLECTIONS = [
  ...CLIENT_PROJECT_MIRROR_SUBCOLLECTIONS,
  "documents",
  "signingRequests",
] as const;

/** Same placeholders as create-project flows — not real contractor document IDs. */
const NON_GC_PLACEHOLDER_IDS = new Set(["none", "unknown", "pending"]);

export function isRealGeneralContractorId(id: string | null | undefined): id is string {
  const v = (id || "").trim().toLowerCase();
  if (!v) return false;
  return !NON_GC_PLACEHOLDER_IDS.has(v);
}

/** Deletes nested subcollections, then the project document (PlanPort tree only). */
export async function deleteProjectTreeAtPath(
  db: Firestore,
  root: typeof PLANPORT_GC_ROOT | typeof PLANPORT_CLIENT_ROOT,
  hubId: string,
  projectId: string
): Promise<void> {
  for (const sub of PROJECT_DELETE_SUBCOLLECTIONS) {
    const col = collection(db, root, hubId, "projects", projectId, sub);
    const snap = await getDocs(col);
    for (const d of snap.docs) {
      await deleteDoc(d.ref);
    }
  }
  const projectRef = doc(db, root, hubId, "projects", projectId);
  const projectSnap = await getDoc(projectRef);
  if (projectSnap.exists()) {
    await deleteDoc(projectRef);
  }
}

/**
 * Removes a project from the hub you are on, and from the linked hub when the project doc
 * references the other side (same pattern as dual create in CreateProjectDialog).
 */
export async function deletePlanportProjectEverywhere(
  db: Firestore,
  params: {
    hubType: "gc" | "client";
    hubId: string;
    projectId: string;
    individualClientId?: string | null;
    generalContractorId?: string | null;
  }
): Promise<void> {
  const { hubType, hubId, projectId } = params;
  const linkedClientId =
    typeof params.individualClientId === "string" && params.individualClientId.trim()
      ? params.individualClientId.trim()
      : null;
  const gcFromField =
    typeof params.generalContractorId === "string" && params.generalContractorId.trim()
      ? params.generalContractorId.trim()
      : null;
  const linkedGcId = isRealGeneralContractorId(gcFromField) ? gcFromField : null;

  if (hubType === "gc") {
    await deleteProjectTreeAtPath(db, PLANPORT_GC_ROOT, hubId, projectId);
    if (linkedClientId) {
      const snap = await getDoc(doc(db, PLANPORT_CLIENT_ROOT, linkedClientId, "projects", projectId));
      if (snap.exists()) {
        await deleteProjectTreeAtPath(db, PLANPORT_CLIENT_ROOT, linkedClientId, projectId);
      }
    }
  } else {
    await deleteProjectTreeAtPath(db, PLANPORT_CLIENT_ROOT, hubId, projectId);
    if (linkedGcId) {
      const snap = await getDoc(doc(db, PLANPORT_GC_ROOT, linkedGcId, "projects", projectId));
      if (snap.exists()) {
        await deleteProjectTreeAtPath(db, PLANPORT_GC_ROOT, linkedGcId, projectId);
      }
    }
  }
}

/**
 * Removes all projects under a private client (including mirrored GC copies when linked),
 * then deletes the client profile document under {@link PLANPORT_CLIENT_ROOT}.
 */
export async function deletePrivateClientPlanportData(db: Firestore, clientId: string): Promise<void> {
  const cid = clientId.trim();
  if (!cid) throw new Error("Missing client id");

  const projectsRef = collection(db, PLANPORT_CLIENT_ROOT, cid, "projects");
  const projectsSnap = await getDocs(projectsRef);
  for (const p of projectsSnap.docs) {
    const data = p.data() as Record<string, unknown>;
    const gcId =
      typeof data.generalContractorId === "string" && data.generalContractorId.trim()
        ? data.generalContractorId.trim()
        : null;
    await deletePlanportProjectEverywhere(db, {
      hubType: "client",
      hubId: cid,
      projectId: p.id,
      individualClientId: cid,
      generalContractorId: gcId,
    });
  }

  const clientRef = doc(db, PLANPORT_CLIENT_ROOT, cid);
  const clientSnap = await getDoc(clientRef);
  if (clientSnap.exists()) {
    await deleteDoc(clientRef);
  }
}

export function projectPayloadForGcMirror(
  clientProjectData: Record<string, unknown>,
  clientId: string,
  gcId: string
): Record<string, unknown> {
  return {
    ...clientProjectData,
    generalContractorId: gcId,
    individualClientId: clientId,
  };
}

export function projectPayloadForClientMirror(
  gcProjectData: Record<string, unknown>,
  clientId: string,
  gcId: string
): Record<string, unknown> {
  return {
    ...gcProjectData,
    generalContractorId: gcId,
    individualClientId: clientId,
  };
}

export async function getContractorSyncTarget(
  db: Firestore,
  clientId: string,
  projectId: string
): Promise<{ gcId: string } | null> {
  const snap = await getDoc(doc(db, PLANPORT_CLIENT_ROOT, clientId, "projects", projectId));
  if (!snap.exists()) return null;
  const d = snap.data();
  if (d.contractorSyncEnabled !== true) return null;
  const gcId = typeof d.syncedContractorId === "string" && d.syncedContractorId.trim() ? d.syncedContractorId : null;
  if (!gcId) return null;
  return { gcId };
}

/**
 * When editing on the contractor hub, mirror back to the client if this project is linked.
 * Uses GC `contractorSyncEnabled` when set; otherwise falls back to client doc (legacy one-way setups).
 */
export async function getGcToClientSyncTarget(
  db: Firestore,
  gcId: string,
  projectId: string
): Promise<{ clientId: string } | null> {
  const gcSnap = await getDoc(doc(db, PLANPORT_GC_ROOT, gcId, "projects", projectId));
  if (!gcSnap.exists()) return null;
  const d = gcSnap.data();
  const clientId =
    typeof d.individualClientId === "string" && d.individualClientId.trim() ? d.individualClientId : null;
  if (!clientId) return null;

  if (d.contractorSyncEnabled === true) {
    return { clientId };
  }

  const clientSnap = await getDoc(doc(db, PLANPORT_CLIENT_ROOT, clientId, "projects", projectId));
  if (!clientSnap.exists()) return null;
  const c = clientSnap.data();
  if (c.contractorSyncEnabled === true && c.syncedContractorId === gcId) {
    return { clientId };
  }
  return null;
}

/**
 * Contractor copy matches the client's subcollection (client is source).
 */
export async function mirrorSubcollectionClientToContractor(
  db: Firestore,
  clientId: string,
  projectId: string,
  gcId: string,
  sub: ClientProjectMirrorSubcollection
): Promise<void> {
  const clientCol = collection(db, PLANPORT_CLIENT_ROOT, clientId, "projects", projectId, sub);
  const clientSnap = await getDocs(clientCol);
  const clientIds = new Set(clientSnap.docs.map((d) => d.id));

  const gcCol = collection(db, PLANPORT_GC_ROOT, gcId, "projects", projectId, sub);
  const gcSnap = await getDocs(gcCol);
  for (const d of gcSnap.docs) {
    if (!clientIds.has(d.id)) {
      await deleteDoc(d.ref);
    }
  }
  for (const d of clientSnap.docs) {
    await setDoc(doc(db, PLANPORT_GC_ROOT, gcId, "projects", projectId, sub, d.id), d.data());
  }
}

/**
 * Client copy matches the contractor's subcollection (contractor is source).
 */
export async function mirrorSubcollectionContractorToClient(
  db: Firestore,
  gcId: string,
  projectId: string,
  clientId: string,
  sub: ClientProjectMirrorSubcollection
): Promise<void> {
  const gcCol = collection(db, PLANPORT_GC_ROOT, gcId, "projects", projectId, sub);
  const gcSnap = await getDocs(gcCol);
  const gcIds = new Set(gcSnap.docs.map((d) => d.id));

  const clientCol = collection(db, PLANPORT_CLIENT_ROOT, clientId, "projects", projectId, sub);
  const clientSnap = await getDocs(clientCol);
  for (const d of clientSnap.docs) {
    if (!gcIds.has(d.id)) {
      await deleteDoc(d.ref);
    }
  }
  for (const d of gcSnap.docs) {
    await setDoc(doc(db, PLANPORT_CLIENT_ROOT, clientId, "projects", projectId, sub, d.id), d.data());
  }
}

export async function mirrorClientProjectDocumentToGc(
  db: Firestore,
  clientId: string,
  projectId: string,
  gcId: string
): Promise<void> {
  const snap = await getDoc(doc(db, PLANPORT_CLIENT_ROOT, clientId, "projects", projectId));
  if (!snap.exists()) return;
  const payload = projectPayloadForGcMirror(snap.data() as Record<string, unknown>, clientId, gcId);
  await setDoc(doc(db, PLANPORT_GC_ROOT, gcId, "projects", projectId), payload);
}

export async function mirrorGcProjectDocumentToClient(
  db: Firestore,
  gcId: string,
  projectId: string,
  clientId: string
): Promise<void> {
  const snap = await getDoc(doc(db, PLANPORT_GC_ROOT, gcId, "projects", projectId));
  if (!snap.exists()) return;
  const payload = projectPayloadForClientMirror(snap.data() as Record<string, unknown>, clientId, gcId);
  await setDoc(doc(db, PLANPORT_CLIENT_ROOT, clientId, "projects", projectId), payload);
}

/** Full push client → contractor (project doc + subcollections). */
export async function pushFullClientProjectToContractor(
  db: Firestore,
  params: { clientId: string; projectId: string; gcId: string }
): Promise<void> {
  const { clientId, projectId, gcId } = params;
  await mirrorClientProjectDocumentToGc(db, clientId, projectId, gcId);
  for (const sub of CLIENT_PROJECT_MIRROR_SUBCOLLECTIONS) {
    await mirrorSubcollectionClientToContractor(db, clientId, projectId, gcId, sub);
  }
}

/** Full push contractor → client (project doc + subcollections). */
export async function pushFullContractorProjectToClient(
  db: Firestore,
  params: { clientId: string; projectId: string; gcId: string }
): Promise<void> {
  const { clientId, projectId, gcId } = params;
  await mirrorGcProjectDocumentToClient(db, gcId, projectId, clientId);
  for (const sub of CLIENT_PROJECT_MIRROR_SUBCOLLECTIONS) {
    await mirrorSubcollectionContractorToClient(db, gcId, projectId, clientId, sub);
  }
}

export async function enableContractorProjectSync(
  db: Firestore,
  params: { clientId: string; projectId: string; gcId: string }
): Promise<void> {
  const { clientId, projectId, gcId } = params;
  const clientProjectRef = doc(db, PLANPORT_CLIENT_ROOT, clientId, "projects", projectId);
  const clientSnap = await getDoc(clientProjectRef);
  if (!clientSnap.exists()) {
    throw new Error("Project not found on the private client hub.");
  }

  const startedAt = new Date().toISOString();

  await pushFullClientProjectToContractor(db, { clientId, projectId, gcId });

  await setDoc(
    clientProjectRef,
    {
      contractorSyncEnabled: true,
      syncedContractorId: gcId,
      contractorSyncStartedAt: startedAt,
      generalContractorId: gcId,
      individualClientId: clientId,
    },
    { merge: true }
  );

  await setDoc(
    doc(db, PLANPORT_GC_ROOT, gcId, "projects", projectId),
    {
      contractorSyncEnabled: true,
      syncedContractorId: gcId,
      contractorSyncStartedAt: startedAt,
      individualClientId: clientId,
      generalContractorId: gcId,
    },
    { merge: true }
  );
}

export async function disableContractorProjectSync(
  db: Firestore,
  clientId: string,
  projectId: string
): Promise<void> {
  const clientRef = doc(db, PLANPORT_CLIENT_ROOT, clientId, "projects", projectId);
  const snap = await getDoc(clientRef);
  const data = snap.data();
  const gcId =
    typeof data?.syncedContractorId === "string" && data.syncedContractorId.trim()
      ? data.syncedContractorId
      : null;

  await setDoc(clientRef, { contractorSyncEnabled: false }, { merge: true });

  if (gcId) {
    await setDoc(
      doc(db, PLANPORT_GC_ROOT, gcId, "projects", projectId),
      { contractorSyncEnabled: false },
      { merge: true }
    );
  }
}

export type ContractorMirrorScope = "project" | ClientProjectMirrorSubcollection;

/** After a write on the private client hub → contractor. */
export async function syncClientProjectToContractorIfEnabled(
  db: Firestore,
  clientId: string,
  projectId: string,
  scope: ContractorMirrorScope
): Promise<void> {
  const target = await getContractorSyncTarget(db, clientId, projectId);
  if (!target) return;
  if (scope === "project") {
    await mirrorClientProjectDocumentToGc(db, clientId, projectId, target.gcId);
    return;
  }
  await mirrorSubcollectionClientToContractor(db, clientId, projectId, target.gcId, scope);
}

/** After a write on the contractor hub → private client (two-way). */
export async function syncGcProjectToClientIfEnabled(
  db: Firestore,
  gcId: string,
  projectId: string,
  scope: ContractorMirrorScope
): Promise<void> {
  const target = await getGcToClientSyncTarget(db, gcId, projectId);
  if (!target) return;
  if (scope === "project") {
    await mirrorGcProjectDocumentToClient(db, gcId, projectId, target.clientId);
    return;
  }
  await mirrorSubcollectionContractorToClient(db, gcId, projectId, target.clientId, scope);
}

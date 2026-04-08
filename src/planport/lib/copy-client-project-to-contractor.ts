import type { Firestore } from "firebase/firestore";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { PLANPORT_CLIENT_ROOT, PLANPORT_GC_ROOT } from "@/lib/planport-project-paths";
import {
  CLIENT_PROJECT_MIRROR_SUBCOLLECTIONS,
  mirrorSubcollectionClientToContractor,
  projectPayloadForGcMirror,
} from "@/lib/contractor-project-sync";

/** @deprecated Use CLIENT_PROJECT_MIRROR_SUBCOLLECTIONS from contractor-project-sync */
export const CLIENT_PROJECT_COPY_SUBCOLLECTIONS = CLIENT_PROJECT_MIRROR_SUBCOLLECTIONS;

export interface CopyClientProjectToContractorParams {
  clientId: string;
  projectId: string;
  gcId: string;
  /** When true, merge-updates the client project with `generalContractorId` after a successful copy. */
  linkClientProjectToGc?: boolean;
}

export interface CopyClientProjectToContractorResult {
  subdocumentsCopied: number;
}

/**
 * Copies one project document from a private client hub to a general contractor hub,
 * including blueprints, renderings, and Chief Architect files. Uses the same project
 * document ID so both hubs stay aligned.
 */
export async function copyClientProjectToContractor(
  db: Firestore,
  params: CopyClientProjectToContractorParams
): Promise<CopyClientProjectToContractorResult> {
  const { clientId, projectId, gcId, linkClientProjectToGc = true } = params;

  const clientProjectRef = doc(db, PLANPORT_CLIENT_ROOT, clientId, "projects", projectId);
  const gcProjectRef = doc(db, PLANPORT_GC_ROOT, gcId, "projects", projectId);

  const gcExisting = await getDoc(gcProjectRef);
  if (gcExisting.exists()) {
    throw new Error(
      `This project already exists on the contractor hub (same project ID). Remove or rename it there first, then try again.`
    );
  }

  const clientSnap = await getDoc(clientProjectRef);
  if (!clientSnap.exists()) {
    throw new Error("Project was not found on the private client hub.");
  }

  const raw = clientSnap.data() as Record<string, unknown>;
  const projectPayload = projectPayloadForGcMirror(raw, clientId, gcId);

  await setDoc(gcProjectRef, projectPayload);

  let subdocumentsCopied = 0;
  for (const sub of CLIENT_PROJECT_MIRROR_SUBCOLLECTIONS) {
    const subSnap = await getDocs(
      collection(db, PLANPORT_CLIENT_ROOT, clientId, "projects", projectId, sub)
    );
    subdocumentsCopied += subSnap.size;
    await mirrorSubcollectionClientToContractor(db, clientId, projectId, gcId, sub);
  }

  if (linkClientProjectToGc) {
    await setDoc(
      clientProjectRef,
      {
        generalContractorId: gcId,
        individualClientId: clientId,
      },
      { merge: true }
    );
  }

  return { subdocumentsCopied };
}

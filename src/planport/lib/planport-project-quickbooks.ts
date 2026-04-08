import type { DocumentSnapshot, Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { getPlanportAdminFirestore } from "@/lib/firebase-admin-app";
import {
  PLANPORT_CLIENT_ROOT,
  PLANPORT_GC_ROOT,
} from "@/lib/planport-project-paths";
import { getValidQuickBooksAccessToken } from "@/lib/quickbooks/refreshToken";
import {
  extractInvoicePaymentLink,
  qboGetInvoice,
} from "@/lib/quickbooks/qbo-queries";

export { resolveClientBillingEmail } from "@/lib/planport-client-billing-email";

/** Hub that owns this project's `projects/{projectId}` doc (client or GC dashboard). */
export type ProjectHubScope = {
  hubType: "client" | "gc";
  hubId: string;
};

function collectionForHubType(hubType: ProjectHubScope["hubType"]) {
  return hubType === "client" ? PLANPORT_CLIENT_ROOT : PLANPORT_GC_ROOT;
}

const NON_GC_PLACEHOLDER_IDS = new Set(["none", "unknown", "pending"]);

function linkedGeneralContractorId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v) return null;
  if (NON_GC_PLACEHOLDER_IDS.has(v.toLowerCase())) return null;
  return v;
}

/** Collection-group equality queries need a deployed index; otherwise Firestore returns code 9. */
function isFirestoreFailedPrecondition(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const o = e as { code?: number | string; message?: string; status?: string };
  if (o.code === 9 || o.code === "FAILED_PRECONDITION" || o.code === "failed-precondition") return true;
  if (o.status === "FAILED_PRECONDITION") return true;
  const m = String(o.message ?? e);
  return (
    m.includes("FAILED_PRECONDITION") ||
    m.includes("Failed_Precondition") ||
    m.includes("failed precondition") ||
    m.includes("requires an index")
  );
}

/**
 * Client and GC hubs each hold a `projects/{projectId}` copy; they reference each other via
 * `individualClientId` / `generalContractorId`. Collection-group `where("id"==...)` misses copies
 * that omit the `id` field, so we walk those links to find every mirror.
 */
/**
 * Last resort: find every `projects/{projectId}` under all private clients and contractors.
 * Used when the link row's hub path misses (wrong hub in row) or copies lack `id` / link fields so
 * collection-group and mirror expansion find nothing.
 */
async function listAllPlanportProjectDocsWithStableId(
  db: Firestore,
  projectId: string
): Promise<DocumentSnapshot[]> {
  const out: DocumentSnapshot[] = [];
  const seen = new Set<string>();

  const [clientsSnap, gcsSnap] = await Promise.all([
    db.collection(PLANPORT_CLIENT_ROOT).get(),
    db.collection(PLANPORT_GC_ROOT).get(),
  ]);

  const tryParents = async (parents: QueryDocumentSnapshot[]) => {
    await Promise.all(
      parents.map(async (p) => {
        const s = await p.ref.collection("projects").doc(projectId).get();
        if (s.exists && !seen.has(s.ref.path)) {
          seen.add(s.ref.path);
          out.push(s);
        }
      })
    );
  };

  await Promise.all([tryParents(clientsSnap.docs), tryParents(gcsSnap.docs)]);
  return out;
}

async function expandPlanportProjectMirrorCopies(
  db: Firestore,
  byPath: Map<string, DocumentSnapshot>,
  projectId: string
): Promise<void> {
  let grew = true;
  let guard = 0;
  while (grew && guard < 10) {
    grew = false;
    guard++;
    const snapshots = [...byPath.values()];
    for (const d of snapshots) {
      const data = d.data() as Record<string, unknown> | undefined;
      const clientId =
        typeof data?.individualClientId === "string" && data.individualClientId.trim()
          ? data.individualClientId.trim()
          : null;
      const gcId = linkedGeneralContractorId(data?.generalContractorId);

      const tryAdd = async (root: typeof PLANPORT_CLIENT_ROOT | typeof PLANPORT_GC_ROOT, hubId: string) => {
        const ref = db.collection(root).doc(hubId).collection("projects").doc(projectId);
        if (byPath.has(ref.path)) return;
        const s = await ref.get();
        if (s.exists) {
          byPath.set(s.ref.path, s);
          grew = true;
        }
      };

      if (clientId) await tryAdd(PLANPORT_CLIENT_ROOT, clientId);
      if (gcId) await tryAdd(PLANPORT_GC_ROOT, gcId);
    }
  }
}

/**
 * All `projects/{projectId}` docs for this stable id: optional direct hub path (for docs that omit the `id` field)
 * plus every subcollection copy that stores `id === projectId`.
 *
 * Note: Firestore collection-group `documentId()` equality requires a full path (e.g. `individualClients/x/projects/y`),
 * not the bare project id — so we must not query `documentId() == projectId`.
 */
export async function findProjectDocRefsByStableId(
  projectId: string,
  scope?: ProjectHubScope | null
) {
  const db = getPlanportAdminFirestore();
  const byPath = new Map<string, DocumentSnapshot>();

  const hubId = scope?.hubId?.trim();
  if (scope && hubId) {
    const root = collectionForHubType(scope.hubType);
    const ref = db.collection(root).doc(hubId).collection("projects").doc(projectId);
    const one = await ref.get();
    if (one.exists) {
      byPath.set(one.ref.path, one);
    }
  }

  let collectionGroupOk = false;
  try {
    const cg = await db.collectionGroup("projects").where("id", "==", projectId).get();
    collectionGroupOk = true;
    for (const d of cg.docs) {
      if (!byPath.has(d.ref.path)) {
        byPath.set(d.ref.path, d);
      }
    }
  } catch (e) {
    if (!isFirestoreFailedPrecondition(e)) throw e;
    /* No index (or similar): fall through to path scan below. */
  }

  await expandPlanportProjectMirrorCopies(db, byPath, projectId);

  if (!collectionGroupOk || byPath.size === 0) {
    const brute = await listAllPlanportProjectDocsWithStableId(db, projectId);
    for (const s of brute) {
      if (!byPath.has(s.ref.path)) {
        byPath.set(s.ref.path, s);
      }
    }
    await expandPlanportProjectMirrorCopies(db, byPath, projectId);
  }

  return [...byPath.values()];
}

export async function getProjectSnapshotAnyHub(
  projectId: string,
  scope?: ProjectHubScope | null
) {
  const docs = await findProjectDocRefsByStableId(projectId, scope);
  if (docs.length === 0) return null;
  return docs[0]!;
}

export function getIndividualClientIdForBilling(projectData: Record<string, unknown>): string | null {
  const raw = projectData.individualClientId;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

export async function fetchPrivateClientDocForBilling(clientId: string) {
  const db = getPlanportAdminFirestore();
  const snap = await db.collection(PLANPORT_CLIENT_ROOT).doc(clientId).get();
  if (!snap.exists) return null;
  return { id: snap.id, data: snap.data() as Record<string, unknown> };
}

/** Fields written to every mirrored `projects/{id}` doc for QuickBooks billing. */
export type QuickBooksProjectLinkFields = {
  quickbooksInvoiceId: string | null;
  quickbooksCustomerId: string | null;
  /** Customer payer URL (InvoiceLink); never use app.qbo signed-in links for clients. */
  quickbooksInvoicePaymentUrl: string | null;
};

/** Read-only: customer-facing pay link from QBO (`include=invoiceLink`). */
export async function resolveQuickBooksInvoicePaymentUrl(invoiceId: string): Promise<string | null> {
  const id = String(invoiceId ?? "").trim();
  if (!id) return null;
  try {
    const { accessToken, realmId } = await getValidQuickBooksAccessToken();
    const json = await qboGetInvoice(realmId, accessToken, id, { includeInvoiceLink: true });
    const inv = json.Invoice as Record<string, unknown> | undefined;
    if (!inv) return null;
    return extractInvoicePaymentLink(inv);
  } catch {
    return null;
  }
}

/**
 * Sets invoice + customer + persisted customer payment URL on all project copies.
 * Fetches InvoiceLink from QuickBooks when possible so clients never need QBO sign-in to pay.
 */
export async function applyQuickBooksInvoiceLinkToAllProjectCopies(
  projectId: string,
  qbInvoiceId: string,
  qbCustomerId: string | null,
  scope?: ProjectHubScope | null
): Promise<number> {
  const invId = String(qbInvoiceId).trim();
  if (!invId) return 0;
  const paymentUrl = await resolveQuickBooksInvoicePaymentUrl(invId);
  return updateQuickBooksLinkOnAllProjectCopies(
    projectId,
    {
      quickbooksInvoiceId: invId,
      quickbooksCustomerId: qbCustomerId,
      quickbooksInvoicePaymentUrl: paymentUrl,
    },
    scope
  );
}

export async function updateQuickBooksLinkOnAllProjectCopies(
  projectId: string,
  fields: QuickBooksProjectLinkFields,
  scope?: ProjectHubScope | null
): Promise<number> {
  const db = getPlanportAdminFirestore();
  const docs = await findProjectDocRefsByStableId(projectId, scope);
  if (docs.length === 0) return 0;
  const batch = db.batch();
  const now = new Date().toISOString();
  for (const d of docs) {
    batch.update(d.ref, {
      quickbooksInvoiceId: fields.quickbooksInvoiceId,
      quickbooksCustomerId: fields.quickbooksCustomerId,
      quickbooksInvoicePaymentUrl: fields.quickbooksInvoicePaymentUrl,
      /** Keeps collection-group `where("id", "==", projectId)` in sync across mirrored hubs. */
      id: projectId,
      updatedAt: now,
    });
  }
  await batch.commit();

  /** Stub doc for FCM `notifyInvoiceIssued` (Cloud Function onCreate `invoices/{invoiceId}`). */
  const invIdRaw =
    fields.quickbooksInvoiceId != null ? String(fields.quickbooksInvoiceId).trim() : "";
  if (invIdRaw) {
    for (const d of docs) {
      const pathParts = d.ref.path.split("/");
      const rootIdx = pathParts.indexOf(PLANPORT_CLIENT_ROOT);
      if (rootIdx >= 0 && pathParts[rootIdx + 1]) {
        const hubClientId = pathParts[rootIdx + 1]!;
        const pdata = d.data() as Record<string, unknown>;
        const projectName = typeof pdata.name === "string" ? pdata.name : "Your project";
        await db.collection("invoices").doc(invIdRaw).set(
          {
            clientId: hubClientId,
            projectStableId: projectId,
            projectName,
            invoiceNumber: invIdRaw,
            amount: "",
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        break;
      }
    }
  }

  return docs.length;
}

export async function projectAnyCopyHasInvoiceId(
  projectId: string,
  invoiceId: string,
  scope?: ProjectHubScope | null
): Promise<boolean> {
  const docs = await findProjectDocRefsByStableId(projectId, scope);
  for (const d of docs) {
    const qid = d.get("quickbooksInvoiceId");
    const sid = qid != null ? String(qid).trim() : "";
    if (sid && sid === String(invoiceId).trim()) return true;
  }
  return false;
}

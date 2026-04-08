import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getPlanportAdminFirestore } from "@/lib/firebase-admin-app";
import {
  QB_INTEGRATIONS_COLLECTION,
  QB_INTEGRATION_DOC_ID,
  QB_INVOICE_PROJECT_LINKS_COLLECTION,
  type QbInvoiceProjectLinkDoc,
} from "@/lib/planport-quickbooks-constants";

export type QuickBooksTokenBundle = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  x_refresh_token_expires_in?: number;
};

export type QuickBooksIntegrationStored = {
  realmId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt?: number;
  updatedAt: string;
};

function integrationRef(db: Firestore) {
  return db.collection(QB_INTEGRATIONS_COLLECTION).doc(QB_INTEGRATION_DOC_ID);
}

export async function saveQuickBooksIntegrationFromOAuth(
  realmId: string,
  tokens: QuickBooksTokenBundle
): Promise<void> {
  const db = getPlanportAdminFirestore();
  const now = Date.now();
  const refreshToken = tokens.refresh_token?.trim();
  if (!refreshToken) {
    throw new Error("QuickBooks token response missing refresh_token.");
  }
  await integrationRef(db).set(
    {
      realmId: realmId.trim(),
      accessToken: tokens.access_token,
      refreshToken,
      accessTokenExpiresAt: now + Math.max(0, tokens.expires_in - 120) * 1000,
      refreshTokenExpiresAt: tokens.x_refresh_token_expires_in
        ? now + tokens.x_refresh_token_expires_in * 1000
        : null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getQuickBooksIntegration(): Promise<QuickBooksIntegrationStored | null> {
  const db = getPlanportAdminFirestore();
  const snap = await integrationRef(db).get();
  if (!snap.exists) return null;
  const d = snap.data() as Record<string, unknown>;
  const realmId = typeof d.realmId === "string" ? d.realmId.trim() : "";
  const accessToken = typeof d.accessToken === "string" ? d.accessToken : "";
  const refreshToken = typeof d.refreshToken === "string" ? d.refreshToken : "";
  const accessTokenExpiresAt =
    typeof d.accessTokenExpiresAt === "number" ? d.accessTokenExpiresAt : 0;
  if (!realmId || !accessToken || !refreshToken) return null;
  const updatedAt =
    d.updatedAt && typeof (d.updatedAt as { toDate?: () => Date }).toDate === "function"
      ? (d.updatedAt as { toDate: () => Date }).toDate().toISOString()
      : new Date().toISOString();
  return {
    realmId,
    accessToken,
    refreshToken,
    accessTokenExpiresAt,
    refreshTokenExpiresAt:
      typeof d.refreshTokenExpiresAt === "number" ? d.refreshTokenExpiresAt : undefined,
    updatedAt,
  };
}

export async function updateQuickBooksAccessTokens(
  accessToken: string,
  refreshToken: string | undefined,
  expiresInSec: number,
  xRefreshExpiresInSec?: number
): Promise<void> {
  const db = getPlanportAdminFirestore();
  const now = Date.now();
  const patch: Record<string, unknown> = {
    accessToken,
    accessTokenExpiresAt: now + Math.max(0, expiresInSec - 120) * 1000,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (refreshToken) patch.refreshToken = refreshToken;
  if (xRefreshExpiresInSec != null) {
    patch.refreshTokenExpiresAt = now + xRefreshExpiresInSec * 1000;
  }
  await integrationRef(db).set(patch, { merge: true });
}

export function qbInvoiceLinkDocId(realmId: string, qbInvoiceId: string): string {
  const safeRealm = realmId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeInv = String(qbInvoiceId).replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${safeRealm}__${safeInv}`;
}

export function linksCollection(db: Firestore) {
  return db.collection(QB_INVOICE_PROJECT_LINKS_COLLECTION);
}

/** Sync merge: does not overwrite approved/rejected rows except QBO metadata on approved. */
export async function mergeInvoiceLinkFromSync(
  docId: string,
  fullRow: QbInvoiceProjectLinkDoc
): Promise<void> {
  const db = getPlanportAdminFirestore();
  const ref = linksCollection(db).doc(docId);
  const snap = await ref.get();
  const now = new Date().toISOString();
  const existing = snap.data() as { status?: string; createdAt?: string } | undefined;

  if (existing?.status === "rejected") {
    return;
  }

  if (existing?.status === "approved") {
    await ref.set(
      {
        qbDocNumber: fullRow.qbDocNumber ?? null,
        qbTxnDate: fullRow.qbTxnDate ?? null,
        qbTotalAmt: fullRow.qbTotalAmt ?? null,
        qbBalance: fullRow.qbBalance ?? null,
        qbDesignerLineMatch: fullRow.qbDesignerLineMatch ?? null,
        customerDisplayName: fullRow.customerDisplayName ?? null,
        billEmailNorm: fullRow.billEmailNorm ?? null,
        updatedAt: now,
      },
      { merge: true }
    );
    return;
  }

  const createdAt =
    typeof existing?.createdAt === "string" ? existing.createdAt : fullRow.createdAt;
  await ref.set(
    {
      ...fullRow,
      createdAt,
      updatedAt: now,
    },
    { merge: true }
  );
}

export async function setInvoiceLinkStatus(
  docId: string,
  patch: {
    status: QbInvoiceProjectLinkDoc["status"];
    approvedAt?: string | null;
    approvedByUid?: string | null;
    rejectedAt?: string | null;
    rejectedByUid?: string | null;
    /** Allow manual override of project binding when approving */
    hubType?: "client" | "gc";
    hubId?: string;
    projectId?: string;
    projectName?: string;
    hubLabel?: string;
    matchSource?: QbInvoiceProjectLinkDoc["matchSource"];
  }
): Promise<void> {
  const db = getPlanportAdminFirestore();
  const now = new Date().toISOString();
  await linksCollection(db).doc(docId).set(
    {
      ...patch,
      updatedAt: now,
    },
    { merge: true }
  );
}

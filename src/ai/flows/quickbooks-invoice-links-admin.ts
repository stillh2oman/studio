"use server";

import { assertPlanportAdmin, getPlanportAdminFirestore } from "@/lib/firebase-admin-app";
import { PLANPORT_CLIENT_ROOT, PLANPORT_GC_ROOT } from "@/lib/planport-project-paths";
import {
  qbInvoiceLinkDocId,
  mergeInvoiceLinkFromSync,
  setInvoiceLinkStatus,
  linksCollection,
} from "@/lib/planport-quickbooks-firestore";
import type { QbInvoiceProjectLinkDoc } from "@/lib/planport-quickbooks-constants";
import {
  getValidQuickBooksAccessToken,
  queryRecentInvoices,
  getCustomerPrimaryEmail,
  normalizeBillingEmail,
  readInvoiceById,
} from "@/lib/quickbooks-qbo-client";
import {
  designerMatchFromInvoiceLines,
  parseInvoiceBalance,
} from "@/lib/quickbooks/invoice-line-match";
import { emailsFromClientDirectoryRecord, emailsFromGcContacts } from "@/lib/notify-recipient-emails";
import {
  applyQuickBooksInvoiceLinkToAllProjectCopies,
  type ProjectHubScope,
} from "@/lib/planport-project-quickbooks";

type IndexedProject = {
  hubType: "client" | "gc";
  hubId: string;
  projectId: string;
  projectName: string;
  hubLabel: string;
  emailsNorm: string[];
};

async function buildProjectEmailIndex(): Promise<IndexedProject[]> {
  const db = getPlanportAdminFirestore();
  const out: IndexedProject[] = [];

  const clientsSnap = await db.collection(PLANPORT_CLIENT_ROOT).get();
  for (const cdoc of clientsSnap.docs) {
    const c = cdoc.data() as Record<string, unknown>;
    const emailsNorm = emailsFromClientDirectoryRecord({
      email: c.email as string | null | undefined,
      additionalContacts: c.additionalContacts as { email?: string | null }[] | null | undefined,
    }).map((e) => e.trim().toLowerCase());
    const hubLabel =
      c.wifeName && c.husbandName
        ? `${String(c.husbandName)} & ${String(c.wifeName)}`
        : String(c.husbandName || "Client");
    const projects = await cdoc.ref.collection("projects").get();
    for (const pdoc of projects.docs) {
      const p = pdoc.data() as { name?: string };
      out.push({
        hubType: "client",
        hubId: cdoc.id,
        projectId: pdoc.id,
        projectName: typeof p.name === "string" ? p.name : "Project",
        hubLabel,
        emailsNorm: [...new Set(emailsNorm.filter(Boolean))],
      });
    }
  }

  const gcsSnap = await db.collection(PLANPORT_GC_ROOT).get();
  for (const gdoc of gcsSnap.docs) {
    const g = gdoc.data() as Record<string, unknown>;
    const baseEmails = emailsFromGcContacts(
      g.contacts as { email?: string | null }[] | null | undefined
    ).map((e) => e.trim().toLowerCase());
    const hubLabel = typeof g.name === "string" ? g.name : "Contractor";
    const projects = await gdoc.ref.collection("projects").get();
    for (const pdoc of projects.docs) {
      const p = pdoc.data() as { name?: string; individualClientId?: string | null };
      let emailsNorm = [...new Set(baseEmails.filter(Boolean))];
      const linked =
        typeof p.individualClientId === "string" ? p.individualClientId.trim() : "";
      if (linked) {
        const cd = await db.collection(PLANPORT_CLIENT_ROOT).doc(linked).get();
        if (cd.exists) {
          const cx = cd.data() as Record<string, unknown>;
          const extra = emailsFromClientDirectoryRecord({
            email: cx.email as string | null | undefined,
            additionalContacts: cx.additionalContacts as
              | { email?: string | null }[]
              | null
              | undefined,
          }).map((e) => e.trim().toLowerCase());
          emailsNorm = [...new Set([...emailsNorm, ...extra])];
        }
      }
      out.push({
        hubType: "gc",
        hubId: gdoc.id,
        projectId: pdoc.id,
        projectName: typeof p.name === "string" ? p.name : "Project",
        hubLabel,
        emailsNorm,
      });
    }
  }

  return out;
}

function findProjectsByEmail(
  index: IndexedProject[],
  emailNorm: string | null
): IndexedProject[] {
  if (!emailNorm) return [];
  return index.filter((row) => row.emailsNorm.includes(emailNorm));
}

export type QbInvoiceLinkRow = QbInvoiceProjectLinkDoc & { firestoreId: string };

export async function listQbInvoiceLinksAction(
  idToken: string
): Promise<{ ok: true; items: QbInvoiceLinkRow[] } | { ok: false; error: string }> {
  try {
    await assertPlanportAdmin(idToken);
    const db = getPlanportAdminFirestore();
    const snap = await linksCollection(db).orderBy("updatedAt", "desc").limit(250).get();
    const items: QbInvoiceLinkRow[] = snap.docs.map((d) => ({
      ...(d.data() as QbInvoiceProjectLinkDoc),
      firestoreId: d.id,
    }));
    return { ok: true, items };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type SyncQbInvoiceLinksOptions = {
  /** Only merge invoices with an open balance (QuickBooks Balance greater than zero). */
  onlyOutstandingBalance?: boolean;
  /** Only merge invoices whose Product/Service lines mention this designer (case-insensitive). */
  designerLineFilter?: "all" | "dillon" | "walthall";
};

export async function syncQuickBooksInvoiceLinksAction(
  idToken: string,
  options?: SyncQbInvoiceLinksOptions
): Promise<
  | { ok: true; fetched: number; written: number; skippedByFilter: number }
  | { ok: false; error: string }
> {
  try {
    await assertPlanportAdmin(idToken);
    const { accessToken, realmId } = await getValidQuickBooksAccessToken();
    const invoices = await queryRecentInvoices(realmId, accessToken, 150);
    const index = await buildProjectEmailIndex();
    let written = 0;
    let skippedByFilter = 0;
    const now = new Date().toISOString();
    const onlyOpen = options?.onlyOutstandingBalance === true;
    const designerFilter = options?.designerLineFilter ?? "all";

    for (const inv of invoices) {
      const id = inv.Id;
      if (!id) continue;
      const docId = qbInvoiceLinkDocId(realmId, id);

      let balance = parseInvoiceBalance(inv);
      let designerMatch = designerMatchFromInvoiceLines(inv.Line);
      const lineProbablyMissing = !inv.Line || (Array.isArray(inv.Line) && inv.Line.length === 0);
      const shouldReadFull =
        (onlyOpen && balance == null) ||
        (designerFilter !== "all" && designerMatch === "none" && lineProbablyMissing);
      if (shouldReadFull) {
        const full = await readInvoiceById(realmId, accessToken, id);
        if (full) {
          balance = parseInvoiceBalance(full) ?? balance;
          designerMatch = designerMatchFromInvoiceLines(full.Line);
        }
      }

      if (onlyOpen && (balance == null || balance <= 0)) {
        skippedByFilter++;
        continue;
      }
      if (designerFilter === "dillon" && designerMatch !== "dillon" && designerMatch !== "both") {
        skippedByFilter++;
        continue;
      }
      if (designerFilter === "walthall" && designerMatch !== "walthall" && designerMatch !== "both") {
        skippedByFilter++;
        continue;
      }

      let emailNorm = normalizeBillingEmail(inv.BillEmail?.Address);
      const custId = inv.CustomerRef?.value;
      if (!emailNorm && custId) {
        const em = await getCustomerPrimaryEmail(realmId, accessToken, custId);
        emailNorm = normalizeBillingEmail(em);
      }
      const matches = findProjectsByEmail(index, emailNorm);
      const ambiguous = matches.length > 1;
      const pick = matches[0];

      const baseFields = {
        realmId,
        qbInvoiceId: id,
        qbDocNumber: inv.DocNumber ?? null,
        qbTxnDate: inv.TxnDate ?? null,
        qbTotalAmt: typeof inv.TotalAmt === "number" ? inv.TotalAmt : null,
        qbBalance: balance,
        qbDesignerLineMatch: designerMatch,
        qbCustomerId: custId ?? null,
        customerDisplayName: inv.CustomerRef?.name ?? null,
        billEmailNorm: emailNorm,
        matchSource: "email_auto" as const,
        emailMatchAmbiguous: ambiguous && !!pick,
        createdAt: now,
        updatedAt: now,
      };

      if (!pick) {
        const row: QbInvoiceProjectLinkDoc = {
          ...baseFields,
          hubType: "client",
          hubId: "__unmatched__",
          projectId: "__unmatched__",
          projectName: "—",
          hubLabel: "—",
          status: "unmatched",
        };
        await mergeInvoiceLinkFromSync(docId, row);
        written++;
        continue;
      }

      const row: QbInvoiceProjectLinkDoc = {
        ...baseFields,
        hubType: pick.hubType,
        hubId: pick.hubId,
        projectId: pick.projectId,
        projectName: pick.projectName,
        hubLabel: pick.hubLabel,
        status: "suggested",
      };
      await mergeInvoiceLinkFromSync(docId, row);
      written++;
    }

    return {
      ok: true,
      fetched: invoices.length,
      written,
      skippedByFilter,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function approveQbInvoiceLinkAction(
  idToken: string,
  docId: string
): Promise<{ ok: true; projectCopiesUpdated: number } | { ok: false; error: string }> {
  try {
    const { uid } = await assertPlanportAdmin(idToken);
    const db = getPlanportAdminFirestore();
    const snap = await linksCollection(db).doc(docId).get();
    if (!snap.exists) {
      return { ok: false, error: "Link row not found." };
    }
    const row = snap.data() as QbInvoiceProjectLinkDoc;
    if (row.hubId === "__unmatched__" || row.projectId === "__unmatched__") {
      return {
        ok: false,
        error: "Cannot approve an unmatched row. Use manual link to pick a hub and project first.",
      };
    }
    const qbInvoiceId = String(row.qbInvoiceId ?? "").trim();
    if (!qbInvoiceId) {
      return { ok: false, error: "This row has no QuickBooks invoice id." };
    }
    const qbCustomerId =
      typeof row.qbCustomerId === "string" && row.qbCustomerId.trim()
        ? row.qbCustomerId.trim()
        : null;

    const scope: ProjectHubScope = { hubType: row.hubType, hubId: row.hubId };
    const copiesUpdated = await applyQuickBooksInvoiceLinkToAllProjectCopies(
      row.projectId,
      qbInvoiceId,
      qbCustomerId,
      scope
    );
    if (copiesUpdated === 0) {
      return {
        ok: false,
        error:
          "No project documents matched this link in Firestore (wrong hub/project id, or project was moved). " +
          "Use Manual link to pick the correct hub and project, then try again.",
      };
    }

    const now = new Date().toISOString();
    await setInvoiceLinkStatus(docId, {
      status: "approved",
      approvedAt: now,
      approvedByUid: uid,
      rejectedAt: null,
      rejectedByUid: null,
    });

    return { ok: true, projectCopiesUpdated: copiesUpdated };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function rejectQbInvoiceLinkAction(
  idToken: string,
  docId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { uid } = await assertPlanportAdmin(idToken);
    const now = new Date().toISOString();
    await setInvoiceLinkStatus(docId, {
      status: "rejected",
      rejectedAt: now,
      rejectedByUid: uid,
      approvedAt: null,
      approvedByUid: null,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function manualLinkQbInvoiceAction(
  idToken: string,
  input: {
    qbInvoiceId: string;
    hubType: "client" | "gc";
    hubId: string;
    projectId: string;
  }
): Promise<{ ok: true; docId: string } | { ok: false; error: string }> {
  try {
    const { uid } = await assertPlanportAdmin(idToken);
    const qbInvoiceId = input.qbInvoiceId.trim();
    const hubId = input.hubId.trim();
    const projectId = input.projectId.trim();
    if (!qbInvoiceId || !hubId || !projectId) {
      return { ok: false, error: "Invoice ID, hub, and project are required." };
    }

    const { accessToken, realmId } = await getValidQuickBooksAccessToken();
    const db = getPlanportAdminFirestore();
    const root = input.hubType === "client" ? PLANPORT_CLIENT_ROOT : PLANPORT_GC_ROOT;
    const pSnap = await db.collection(root).doc(hubId).collection("projects").doc(projectId).get();
    if (!pSnap.exists) {
      return { ok: false, error: "Project not found for that hub." };
    }
    const p = pSnap.data() as { name?: string };
    const projectName = typeof p.name === "string" ? p.name : "Project";

    let hubLabel = hubId;
    if (input.hubType === "client") {
      const c = (await db.collection(PLANPORT_CLIENT_ROOT).doc(hubId).get()).data() as
        | Record<string, unknown>
        | undefined;
      hubLabel =
        c?.wifeName && c?.husbandName
          ? `${String(c.husbandName)} & ${String(c.wifeName)}`
          : String(c?.husbandName || "Client");
    } else {
      const g = (await db.collection(PLANPORT_GC_ROOT).doc(hubId).get()).data() as
        | Record<string, unknown>
        | undefined;
      hubLabel = typeof g?.name === "string" ? g.name : hubId;
    }

    const inv = await readInvoiceById(realmId, accessToken, qbInvoiceId);
    const now = new Date().toISOString();
    const docId = qbInvoiceLinkDocId(realmId, qbInvoiceId);

    let emailNorm: string | null = null;
    if (inv) {
      emailNorm = normalizeBillingEmail(inv.BillEmail?.Address);
      const custId = inv.CustomerRef?.value;
      if (!emailNorm && custId) {
        const em = await getCustomerPrimaryEmail(realmId, accessToken, custId);
        emailNorm = normalizeBillingEmail(em);
      }
    }

    const qbBalance = inv ? parseInvoiceBalance(inv) : null;
    const qbDesignerLineMatch = inv ? designerMatchFromInvoiceLines(inv.Line) : null;

    const row: QbInvoiceProjectLinkDoc = {
      realmId,
      qbInvoiceId,
      qbDocNumber: inv?.DocNumber ?? null,
      qbTxnDate: inv?.TxnDate ?? null,
      qbTotalAmt: typeof inv?.TotalAmt === "number" ? inv.TotalAmt : null,
      qbBalance,
      qbDesignerLineMatch,
      qbCustomerId: inv?.CustomerRef?.value ?? null,
      customerDisplayName: inv?.CustomerRef?.name ?? null,
      billEmailNorm: emailNorm,
      hubType: input.hubType,
      hubId,
      projectId,
      projectName,
      hubLabel,
      status: "approved",
      matchSource: "manual",
      emailMatchAmbiguous: false,
      createdAt: now,
      updatedAt: now,
      approvedAt: now,
      approvedByUid: uid,
    };

    await mergeInvoiceLinkFromSync(docId, row);

    const qbCustomerIdForProject =
      typeof row.qbCustomerId === "string" && row.qbCustomerId.trim()
        ? row.qbCustomerId.trim()
        : null;
    const scope: ProjectHubScope = { hubType: input.hubType, hubId: hubId };
    await applyQuickBooksInvoiceLinkToAllProjectCopies(projectId, qbInvoiceId, qbCustomerIdForProject, scope);

    return { ok: true, docId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Writes quickbooksInvoiceId / quickbooksCustomerId onto project doc(s) for every approved admin link (fixes rows approved before project sync existed). */
export async function pushApprovedQbLinksToProjectsAction(
  idToken: string
): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  try {
    await assertPlanportAdmin(idToken);
    const db = getPlanportAdminFirestore();
    const snap = await linksCollection(db).where("status", "==", "approved").get();
    let updated = 0;
    for (const d of snap.docs) {
      const row = d.data() as QbInvoiceProjectLinkDoc;
      if (row.hubId === "__unmatched__" || row.projectId === "__unmatched__") continue;
      const invId = String(row.qbInvoiceId ?? "").trim();
      if (!invId) continue;
      const cid =
        typeof row.qbCustomerId === "string" && row.qbCustomerId.trim()
          ? row.qbCustomerId.trim()
          : null;
      const scope: ProjectHubScope = { hubType: row.hubType, hubId: row.hubId };
      await applyQuickBooksInvoiceLinkToAllProjectCopies(row.projectId, invId, cid, scope);
      updated++;
    }
    return { ok: true, updated };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

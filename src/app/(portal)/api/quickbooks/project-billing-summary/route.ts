import { NextRequest, NextResponse } from "next/server";
import { getPlanportAdminFirestore } from "@/lib/firebase-admin-app";
import { PLANPORT_CLIENT_ROOT, PLANPORT_GC_ROOT } from "@/lib/planport-project-paths";
import { getValidQuickBooksAccessToken } from "@/lib/quickbooks/refreshToken";
import {
  extractInvoicePaymentLink,
  mapInvoiceEntity,
  qboGetInvoice,
  QuickBooksApiError,
  QuickBooksRateLimitError,
} from "@/lib/quickbooks/qbo-queries";
import { qbProjectBillingSummaryQuerySchema } from "@/lib/quickbooks/project-hub-scope-zod";
import { requireFirebaseAuthBearer } from "@/lib/quickbooks/route-auth";
import { updateQuickBooksLinkOnAllProjectCopies } from "@/lib/planport-project-quickbooks";
import { sendFirmChatNotification } from "@/ai/flows/send-contact-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAYMENT_NOTIFICATION_COLLECTION = "quickbooksPaymentNotifications";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatClientDisplayName(clientData: Record<string, unknown> | null): string {
  if (!clientData) return "Client";
  const name = typeof clientData.name === "string" ? clientData.name.trim() : "";
  if (name) return name;
  const husband = typeof clientData.husbandName === "string" ? clientData.husbandName.trim() : "";
  const wife = typeof clientData.wifeName === "string" ? clientData.wifeName.trim() : "";
  const combined = [husband, wife].filter(Boolean).join(" & ");
  return combined || "Client";
}

export async function GET(req: NextRequest) {
  const bearer = await requireFirebaseAuthBearer(req);
  if (!bearer.ok) return bearer.res;

  const sp = req.nextUrl.searchParams;
  const parsed = qbProjectBillingSummaryQuerySchema.safeParse({
    projectId: sp.get("projectId") ?? "",
    hubType: sp.get("hubType") ?? "",
    hubId: sp.get("hubId") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query.", details: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId, hubType, hubId } = parsed.data;
  const root = hubType === "client" ? PLANPORT_CLIENT_ROOT : PLANPORT_GC_ROOT;
  const db = getPlanportAdminFirestore();
  const projSnap = await db.collection(root).doc(hubId).collection("projects").doc(projectId).get();
  if (!projSnap.exists) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  const linkedRaw = projSnap.get("quickbooksInvoiceId");
  const invoiceId = linkedRaw != null ? String(linkedRaw).trim() : "";
  if (!invoiceId) {
    return NextResponse.json({ error: "No invoice linked to this project.", code: "no_invoice_linked" }, { status: 404 });
  }

  const projData = projSnap.data() as Record<string, unknown>;
  const storedPayRaw = projData.quickbooksInvoicePaymentUrl;
  const storedPaymentUrl =
    typeof storedPayRaw === "string" && storedPayRaw.trim().startsWith("https://")
      ? storedPayRaw.trim()
      : null;

  try {
    const { accessToken, realmId } = await getValidQuickBooksAccessToken();
    const json = await qboGetInvoice(realmId, accessToken, invoiceId, { includeInvoiceLink: true });
    const inv = json.Invoice as Record<string, unknown> | undefined;
    if (!inv) {
      return NextResponse.json({ error: "Malformed QuickBooks response." }, { status: 502 });
    }
    const detail = mapInvoiceEntity(inv);
    if (!detail) {
      return NextResponse.json({ error: "Could not parse invoice." }, { status: 502 });
    }
    const freshPayment = extractInvoicePaymentLink(inv);
    const custRaw = projData.quickbooksCustomerId;
    const custId = typeof custRaw === "string" && custRaw.trim() ? custRaw.trim() : null;

    if (freshPayment && freshPayment !== storedPaymentUrl) {
      await updateQuickBooksLinkOnAllProjectCopies(
        projectId,
        {
          quickbooksInvoiceId: invoiceId,
          quickbooksCustomerId: custId,
          quickbooksInvoicePaymentUrl: freshPayment,
        },
        { hubType, hubId }
      );
    }

    const paymentUrlForClient = freshPayment ?? storedPaymentUrl ?? null;

    // If fully paid, notify Firm Chat and hide billing again by clearing the invoice link.
    // We de-dupe notifications via an admin-only Firestore marker doc keyed by invoiceId.
    if (typeof detail.Balance === "number" && detail.Balance <= 0) {
      let shouldNotify = false;
      try {
        await db.runTransaction(async (tx) => {
          const notifRef = db.collection(PAYMENT_NOTIFICATION_COLLECTION).doc(invoiceId);
          const snap = await tx.get(notifRef);
          if (snap.exists) return;
          tx.create(notifRef, {
            invoiceId,
            projectId,
            hubType,
            hubId,
            createdAt: new Date().toISOString(),
          });
          shouldNotify = true;
        });
      } catch (e) {
        // If transaction fails, skip notify + clear to avoid duplicates.
        console.warn("[project-billing-summary] notification transaction failed", e);
      }

      if (shouldNotify) {
        const projectName =
          (typeof projData.name === "string" && projData.name.trim()) ? projData.name.trim() : projectId;
        let clientLabel = hubType === "client" ? "Client" : "Contractor";
        if (hubType === "client") {
          try {
            const clientSnap = await db.collection(PLANPORT_CLIENT_ROOT).doc(hubId).get();
            clientLabel = formatClientDisplayName(
              clientSnap.exists ? (clientSnap.data() as Record<string, unknown>) : null
            );
          } catch {
            /* ignore */
          }
        }

        const html = `
          <div style="font-family: sans-serif; max-width: 640px; border: 1px solid #eee; padding: 20px;">
            <h2 style="color: #2E4B66;">Firm Chat — Payment received</h2>
            <p>A client payment was recorded in QuickBooks.</p>
            <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 16px;">
              <p><strong>Client:</strong> ${esc(clientLabel)}</p>
              <p><strong>Project:</strong> ${esc(projectName)}</p>
              <p><strong>Invoice:</strong> ${esc(detail.DocNumber || invoiceId)}</p>
            </div>
          </div>
        `;

        // Notify Jeff + Tammi.
        await sendFirmChatNotification({
          to: "jeff@designersink.us",
          subject: `Payment received · ${projectName}`,
          html,
        });
        await sendFirmChatNotification({
          to: "tammidillon73@gmail.com",
          subject: `Payment received · ${projectName}`,
          html,
        });

        // Hide billing card again by clearing the stored invoice link on all mirrored project docs.
        await updateQuickBooksLinkOnAllProjectCopies(
          projectId,
          {
            quickbooksInvoiceId: null,
            quickbooksCustomerId: null,
            quickbooksInvoicePaymentUrl: null,
          },
          { hubType, hubId }
        );
      }
    }

    return NextResponse.json({
      invoiceId: detail.Id,
      balance: detail.Balance,
      dueDate: detail.DueDate,
      docNumber: detail.DocNumber,
      /** Persisted on project when QBO returns InvoiceLink; never a signed-in QBO app URL. */
      paymentUrl: paymentUrlForClient,
    });
  } catch (e) {
    if (e instanceof QuickBooksRateLimitError) {
      return NextResponse.json({ error: e.message }, { status: 429 });
    }
    if (e instanceof QuickBooksApiError && e.status === 404) {
      return NextResponse.json(
        { error: "Invoice not found in QuickBooks.", code: "invoice_gone" },
        { status: 404 }
      );
    }
    if (e instanceof QuickBooksApiError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    const msg = e instanceof Error ? e.message : "Could not load invoice.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

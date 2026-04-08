import { NextRequest, NextResponse } from "next/server";
import { requirePlanportAdminBearer } from "@/lib/quickbooks/route-auth";
import {
  parseOptionalProjectHubScope,
  qbMatchInvoiceBodySchema,
} from "@/lib/quickbooks/project-hub-scope-zod";
import { getValidQuickBooksAccessToken } from "@/lib/quickbooks/refreshToken";
import {
  parseQboMoney,
  queryCustomersByPrimaryEmail,
  queryOpenInvoicesForCustomer,
  QuickBooksRateLimitError,
} from "@/lib/quickbooks/qbo-queries";
import {
  applyQuickBooksInvoiceLinkToAllProjectCopies,
  fetchPrivateClientDocForBilling,
  getIndividualClientIdForBilling,
  getProjectSnapshotAnyHub,
  resolveClientBillingEmail,
} from "@/lib/planport-project-quickbooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const gate = await requirePlanportAdminBearer(req);
  if (!gate.ok) return gate.res;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = qbMatchInvoiceBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body.", details: parsed.error.flatten() }, { status: 400 });
  }
  const { projectId, hubType, hubId } = parsed.data;
  const hubScope = parseOptionalProjectHubScope({ hubType, hubId });

  try {
    const projSnap = await getProjectSnapshotAnyHub(projectId, hubScope);
    if (!projSnap) {
      return NextResponse.json({ error: "Project not found.", matched: false, reason: "project_not_found" }, { status: 404 });
    }
    const projectData = projSnap.data() as Record<string, unknown>;
    const billingClientId = getIndividualClientIdForBilling(projectData);
    if (!billingClientId) {
      return NextResponse.json({
        matched: false,
        reason: "no_client_linked",
        message: "This project has no linked private client (individualClientId).",
      });
    }

    const clientRow = await fetchPrivateClientDocForBilling(billingClientId);
    const billingEmail = resolveClientBillingEmail(clientRow?.data);
    if (!billingEmail) {
      return NextResponse.json({
        matched: false,
        reason: "no_billing_email",
        message: "No billing email on file. Please update the client profile to enable invoice matching.",
      });
    }

    const { accessToken, realmId } = await getValidQuickBooksAccessToken();
    const customers = await queryCustomersByPrimaryEmail(realmId, accessToken, billingEmail);
    if (customers.length === 0) {
      return NextResponse.json({ matched: false, reason: "no_customer_match" });
    }

    type OpenRow = {
      id: string;
      customerId: string;
      docNumber: string;
      balance: number;
      dueDate: string;
      txnDate: string;
      customerName: string;
    };

    const open: OpenRow[] = [];
    for (const c of customers) {
      const cid = c.Id != null ? String(c.Id) : "";
      if (!cid) continue;
      const invs = await queryOpenInvoicesForCustomer(realmId, accessToken, cid);
      for (const inv of invs) {
        const id = inv.Id != null ? String(inv.Id) : "";
        if (!id) continue;
        open.push({
          id,
          customerId: cid,
          docNumber: inv.DocNumber != null ? String(inv.DocNumber) : "",
          balance: parseQboMoney(inv.Balance),
          dueDate: inv.DueDate != null ? String(inv.DueDate) : "",
          txnDate: inv.TxnDate != null ? String(inv.TxnDate) : "",
          customerName: inv.CustomerRef?.name?.trim() || c.DisplayName || "Customer",
        });
      }
    }

    if (open.length === 0) {
      return NextResponse.json({ matched: false, reason: "no_open_invoices" });
    }

    if (open.length > 1) {
      return NextResponse.json({
        matched: false,
        reason: "multiple_invoices",
        invoices: open.map((r) => ({
          id: r.id,
          docNumber: r.docNumber,
          customerName: r.customerName,
          balance: r.balance,
          dueDate: r.dueDate,
          txnDate: r.txnDate,
          customerId: r.customerId,
        })),
      });
    }

    const only = open[0]!;
    await applyQuickBooksInvoiceLinkToAllProjectCopies(projectId, only.id, only.customerId, hubScope);

    return NextResponse.json({
      matched: true,
      invoiceId: only.id,
      customerId: only.customerId,
      balance: only.balance,
      dueDate: only.dueDate,
    });
  } catch (e) {
    if (e instanceof QuickBooksRateLimitError) {
      return NextResponse.json({ error: e.message, matched: false }, { status: 429 });
    }
    const msg = e instanceof Error ? e.message : "QuickBooks match failed.";
    return NextResponse.json({ error: msg, matched: false }, { status: 500 });
  }
}

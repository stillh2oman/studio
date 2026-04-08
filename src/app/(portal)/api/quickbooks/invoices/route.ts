import { NextRequest, NextResponse } from "next/server";
import { requirePlanportAdminBearer } from "@/lib/quickbooks/route-auth";
import {
  parseOptionalProjectHubScope,
  qbInvoicesQuerySchema,
} from "@/lib/quickbooks/project-hub-scope-zod";
import { getValidQuickBooksAccessToken } from "@/lib/quickbooks/refreshToken";
import {
  parseQboMoney,
  queryAllOpenInvoices,
  queryOpenInvoicesForCustomer,
  queryCustomersByPrimaryEmail,
  QuickBooksApiError,
  QuickBooksRateLimitError,
} from "@/lib/quickbooks/qbo-queries";
import {
  fetchPrivateClientDocForBilling,
  getIndividualClientIdForBilling,
  getProjectSnapshotAnyHub,
  resolveClientBillingEmail,
} from "@/lib/planport-project-quickbooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function truthyAllOpen(v: string | undefined): boolean {
  return v === "1" || v === "true";
}

export async function GET(req: NextRequest) {
  const gate = await requirePlanportAdminBearer(req);
  if (!gate.ok) return gate.res;

  const sp = req.nextUrl.searchParams;
  const parsed = qbInvoicesQuerySchema.safeParse({
    projectId: sp.get("projectId") ?? "",
    allOpen: sp.get("allOpen") ?? undefined,
    hubType: sp.get("hubType") || undefined,
    hubId: sp.get("hubId") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query.", details: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId, allOpen: allOpenRaw, hubType, hubId } = parsed.data;
  const hubScope = parseOptionalProjectHubScope({ hubType, hubId });
  const listAllOpen = truthyAllOpen(allOpenRaw);

  try {
    const { accessToken, realmId } = await getValidQuickBooksAccessToken();

    if (listAllOpen) {
      const invs = await queryAllOpenInvoices(realmId, accessToken, 250);
      return NextResponse.json({
        invoices: invs.map((inv) => ({
          id: String(inv.Id ?? ""),
          docNumber: inv.DocNumber != null ? String(inv.DocNumber) : "",
          customerName: inv.CustomerRef?.name?.trim() || "Customer",
          balance: parseQboMoney(inv.Balance),
          dueDate: inv.DueDate != null ? String(inv.DueDate) : "",
          txnDate: inv.TxnDate != null ? String(inv.TxnDate) : "",
          customerId: inv.CustomerRef?.value != null ? String(inv.CustomerRef.value) : "",
        })).filter((r) => r.id),
      });
    }

    const projSnap = await getProjectSnapshotAnyHub(projectId, hubScope);
    if (!projSnap) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    const projectData = projSnap.data() as Record<string, unknown>;
    const billingClientId = getIndividualClientIdForBilling(projectData);
    if (!billingClientId) {
      return NextResponse.json({
        error: "no_client_linked",
        message: "This project has no linked private client.",
        invoices: [],
      });
    }
    const clientRow = await fetchPrivateClientDocForBilling(billingClientId);
    const billingEmail = resolveClientBillingEmail(clientRow?.data);
    if (!billingEmail) {
      return NextResponse.json({
        error: "no_billing_email",
        message: "No billing email on file. Please update the client profile to enable invoice matching.",
        invoices: [],
      });
    }

    const customers = await queryCustomersByPrimaryEmail(realmId, accessToken, billingEmail);
    if (customers.length === 0) {
      return NextResponse.json({ invoices: [] });
    }

    type Row = {
      id: string;
      docNumber: string;
      customerName: string;
      balance: number;
      dueDate: string;
      txnDate: string;
      customerId: string;
    };

    const out: Row[] = [];
    const seen = new Set<string>();
    for (const c of customers) {
      const cid = c.Id != null ? String(c.Id) : "";
      if (!cid) continue;
      const invs = await queryOpenInvoicesForCustomer(realmId, accessToken, cid);
      for (const inv of invs) {
        const id = inv.Id != null ? String(inv.Id) : "";
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push({
          id,
          docNumber: inv.DocNumber != null ? String(inv.DocNumber) : "",
          customerName: inv.CustomerRef?.name?.trim() || c.DisplayName || "Customer",
          balance: parseQboMoney(inv.Balance),
          dueDate: inv.DueDate != null ? String(inv.DueDate) : "",
          txnDate: inv.TxnDate != null ? String(inv.TxnDate) : "",
          customerId: cid,
        });
      }
    }

    return NextResponse.json({ invoices: out });
  } catch (e) {
    if (e instanceof QuickBooksRateLimitError) {
      return NextResponse.json({ error: e.message }, { status: 429 });
    }
    if (e instanceof QuickBooksApiError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    const msg = e instanceof Error ? e.message : "Could not load invoices.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

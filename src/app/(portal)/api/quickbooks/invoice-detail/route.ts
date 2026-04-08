import { NextRequest, NextResponse } from "next/server";
import { requirePlanportAdminBearer } from "@/lib/quickbooks/route-auth";
import {
  parseOptionalProjectHubScope,
  qbInvoiceDetailQuerySchema,
} from "@/lib/quickbooks/project-hub-scope-zod";
import { getValidQuickBooksAccessToken } from "@/lib/quickbooks/refreshToken";
import {
  mapInvoiceEntity,
  qboGetInvoice,
  QuickBooksApiError,
  QuickBooksRateLimitError,
} from "@/lib/quickbooks/qbo-queries";
import { computeQbBillingStatus } from "@/lib/quickbooks/invoice-status";
import {
  projectAnyCopyHasInvoiceId,
  updateQuickBooksLinkOnAllProjectCopies,
} from "@/lib/planport-project-quickbooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requirePlanportAdminBearer(req);
  if (!gate.ok) return gate.res;

  const sp = req.nextUrl.searchParams;
  const parsed = qbInvoiceDetailQuerySchema.safeParse({
    invoiceId: sp.get("invoiceId") ?? "",
    projectId: sp.get("projectId") ?? "",
    hubType: sp.get("hubType") || undefined,
    hubId: sp.get("hubId") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query.", details: parsed.error.flatten() }, { status: 400 });
  }

  const { invoiceId, projectId, hubType, hubId } = parsed.data;
  const hubScope = parseOptionalProjectHubScope({ hubType, hubId });

  const linked = await projectAnyCopyHasInvoiceId(projectId, invoiceId, hubScope);
  if (!linked) {
    return NextResponse.json(
      { error: "This invoice is not linked to the project.", code: "invoice_not_linked" },
      { status: 403 }
    );
  }

  try {
    const { accessToken, realmId } = await getValidQuickBooksAccessToken();
    const json = await qboGetInvoice(realmId, accessToken, invoiceId);
    const inv = json.Invoice as Record<string, unknown> | undefined;
    if (!inv) {
      return NextResponse.json({ error: "Malformed QuickBooks response." }, { status: 502 });
    }
    const detail = mapInvoiceEntity(inv);
    if (!detail) {
      return NextResponse.json({ error: "Could not parse invoice." }, { status: 502 });
    }
    const { label: status } = computeQbBillingStatus(detail.Balance, detail.DueDate);
    return NextResponse.json({
      balance: detail.Balance,
      dueDate: detail.DueDate,
      txnDate: detail.TxnDate,
      docNumber: detail.DocNumber,
      customerName: detail.CustomerName,
      status,
    });
  } catch (e) {
    if (e instanceof QuickBooksRateLimitError) {
      return NextResponse.json({ error: e.message }, { status: 429 });
    }
    if (e instanceof QuickBooksApiError && e.status === 404) {
      await updateQuickBooksLinkOnAllProjectCopies(
        projectId,
        {
          quickbooksInvoiceId: null,
          quickbooksCustomerId: null,
          quickbooksInvoicePaymentUrl: null,
        },
        hubScope
      );
      return NextResponse.json(
        {
          error: "Invoice no longer exists in QuickBooks. The link was cleared — choose another invoice.",
          code: "invoice_gone",
          cleared: true,
        },
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

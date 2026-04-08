import { NextRequest, NextResponse } from "next/server";
import { requirePlanportAdminBearer } from "@/lib/quickbooks/route-auth";
import {
  parseOptionalProjectHubScope,
  qbLinkInvoiceBodySchema,
} from "@/lib/quickbooks/project-hub-scope-zod";
import {
  applyQuickBooksInvoiceLinkToAllProjectCopies,
  getProjectSnapshotAnyHub,
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

  const parsed = qbLinkInvoiceBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body.", details: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId, invoiceId, customerId, hubType, hubId } = parsed.data;
  const hubScope = parseOptionalProjectHubScope({ hubType, hubId });

  const proj = await getProjectSnapshotAnyHub(projectId, hubScope);
  if (!proj) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  await applyQuickBooksInvoiceLinkToAllProjectCopies(
    projectId,
    invoiceId.trim(),
    customerId.trim(),
    hubScope
  );

  return NextResponse.json({ success: true });
}

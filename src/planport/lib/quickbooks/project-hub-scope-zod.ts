import { z } from "zod";
import type { ProjectHubScope } from "@/lib/planport-project-quickbooks";

const hubScopeRefine = <T extends { hubType?: "client" | "gc"; hubId?: string }>(d: T) =>
  (d.hubType === undefined && d.hubId === undefined) ||
  (d.hubType !== undefined && d.hubId !== undefined);

const hubScopeRefineMsg = { message: "hubType and hubId must both be provided together." as const };

/** Optional hub context so server can resolve `projects/{id}` when the doc omits the `id` field. */
export function parseOptionalProjectHubScope(data: {
  hubType?: "client" | "gc";
  hubId?: string;
}): ProjectHubScope | undefined {
  if (data.hubType && data.hubId?.trim()) {
    return { hubType: data.hubType, hubId: data.hubId.trim() };
  }
  return undefined;
}

export const qbMatchInvoiceBodySchema = z
  .object({
    projectId: z.string().min(1),
    hubType: z.enum(["client", "gc"]).optional(),
    hubId: z.string().min(1).optional(),
  })
  .refine(hubScopeRefine, hubScopeRefineMsg);

export const qbLinkInvoiceBodySchema = z
  .object({
    projectId: z.string().min(1),
    invoiceId: z.string().min(1),
    customerId: z.string().min(1),
    hubType: z.enum(["client", "gc"]).optional(),
    hubId: z.string().min(1).optional(),
  })
  .refine(hubScopeRefine, hubScopeRefineMsg);

export const qbInvoiceDetailQuerySchema = z
  .object({
    invoiceId: z.string().min(1),
    projectId: z.string().min(1),
    hubType: z.enum(["client", "gc"]).optional(),
    hubId: z.string().min(1).optional(),
  })
  .refine(hubScopeRefine, hubScopeRefineMsg);

export const qbInvoicesQuerySchema = z
  .object({
    projectId: z.string().min(1),
    allOpen: z.enum(["0", "1", "true", "false"]).optional(),
    hubType: z.enum(["client", "gc"]).optional(),
    hubId: z.string().min(1).optional(),
  })
  .refine(hubScopeRefine, hubScopeRefineMsg);

/** Hub-scoped project (required for billing summary — no collection-group lookup). */
export const qbProjectBillingSummaryQuerySchema = z.object({
  projectId: z.string().min(1),
  hubType: z.enum(["client", "gc"]),
  hubId: z.string().min(1),
});

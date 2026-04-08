import { z } from "zod";
import type { Client, ContractorContact, Project } from "@/lib/types";

export const PLANPORT_LEDGER_HANDOFF_VERSION = 1 as const;

/**
 * Versioned, human-readable JSON payload exported from PlanPort and imported into Ledger.
 * This does NOT require shared Firebase projects; it's a controlled handoff file.
 */
export const PlanportLedgerImportPackageSchemaV1 = z.object({
  exportVersion: z.literal(PLANPORT_LEDGER_HANDOFF_VERSION),
  exportedAt: z.string().min(1),
  sourceApp: z.literal("PlanPort"),
  sourceRecordIds: z.object({
    planportClientId: z.string().min(1),
    planportProjectId: z.string().min(1),
    planportHubPath: z.string().min(1),
  }),
  client: z.object({
    // Ledger Client shape (id omitted; Ledger assigns)
    name: z.string().min(1),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    secondaryClientName: z.string().optional(),
    email: z.string().optional(),
    phoneNumber: z.string().optional(),
    accessCode: z.string().optional(),
    permitPdfDownloads: z.boolean().optional(),
    initialProjectName: z.string().optional(),
    projectAddress: z.string().optional(),
    projectRenderingUrl: z.string().optional(),
    assignedContractorId: z.string().optional(),
    billingEmail: z.string().optional(),
    additionalStakeholders: z
      .array(
        z.object({
          name: z.string(),
          title: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
        })
      )
      .optional(),
  }),
  project: z.object({
    // Ledger Project shape (id omitted; Ledger assigns)
    name: z.string().min(1),
    address: z.string().optional(),
    contractorId: z.string().optional(),
    status: z.string().optional(),
    designer: z.string().optional(),
    renderingUrl: z.string().optional(),
    createdAt: z.string().optional(),
    // any PlanPort-only data we want to retain for traceability
    planport: z
      .object({
        phase: z.string().optional(),
      })
      .optional(),
  }),
  notes: z.array(z.string()).optional(),
});

export type PlanportLedgerImportPackageV1 = z.infer<
  typeof PlanportLedgerImportPackageSchemaV1
>;

export type LedgerClientCreatePayload = Omit<Client, "id"> & {
  importMetadata?: {
    importedFrom: "PlanPort";
    importVersion: number;
    importedAt: string;
    sourceRecordIds: PlanportLedgerImportPackageV1["sourceRecordIds"];
  };
};

export type LedgerProjectCreatePayload = Omit<Project, "id"> & {
  importMetadata?: {
    importedFrom: "PlanPort";
    importVersion: number;
    importedAt: string;
    sourceRecordIds: PlanportLedgerImportPackageV1["sourceRecordIds"];
  };
};

function normalizeAccessCode(code?: string | null): string {
  return String(code ?? "").trim().toUpperCase();
}

function splitNameParts(full: string): { firstName?: string; lastName?: string } {
  const parts = String(full ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return {};
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

function mapAdditionalContactToStakeholder(
  c: { name?: string | null; email?: string | null } | null | undefined
): ContractorContact | null {
  const name = String(c?.name ?? "").trim();
  if (!name) return null;
  return {
    name,
    title: "",
    email: String(c?.email ?? "").trim(),
    phone: "",
  };
}

/**
 * Mapping helpers used by the Ledger importer (or by PlanPort when exporting directly in Ledger-shape).
 * These are intentionally explicit and conservative.
 */
export function mapPlanportExportToLedgerClientAndProject(
  pkg: PlanportLedgerImportPackageV1,
  options: { fallbackDesigner?: Project["designer"] } = {}
): { client: LedgerClientCreatePayload; project: LedgerProjectCreatePayload } {
  const now = new Date().toISOString();

  const c = pkg.client;
  const p = pkg.project;

  const name = String(c.name ?? "").trim();
  const nameParts = splitNameParts(name);

  const client: LedgerClientCreatePayload = {
    name,
    firstName: c.firstName ?? nameParts.firstName ?? "",
    lastName: c.lastName ?? nameParts.lastName ?? "",
    secondaryClientName: c.secondaryClientName ?? "",
    email: String(c.email ?? "").trim(),
    phoneNumber: String(c.phoneNumber ?? "").trim(),
    accessCode: normalizeAccessCode(c.accessCode),
    permitPdfDownloads: !!c.permitPdfDownloads,
    initialProjectName: String(c.initialProjectName ?? "").trim(),
    associatedProjectIds: [],
    projectAddress: String(c.projectAddress ?? "").trim(),
    projectRenderingUrl: String(c.projectRenderingUrl ?? "").trim(),
    assignedContractorId: String(c.assignedContractorId ?? "").trim(),
    billingEmail: String(c.billingEmail ?? "").trim(),
    additionalStakeholders: Array.isArray(c.additionalStakeholders)
      ? (c.additionalStakeholders as any[])
          .map((x) => mapAdditionalContactToStakeholder(x))
          .filter(Boolean) as ContractorContact[]
      : [],
    importMetadata: {
      importedFrom: "PlanPort",
      importVersion: pkg.exportVersion,
      importedAt: now,
      sourceRecordIds: pkg.sourceRecordIds,
    },
  };

  const project: LedgerProjectCreatePayload = {
    name: String(p.name ?? "").trim(),
    clientId: "", // caller sets after deciding create/update client
    contractorId: String(p.contractorId ?? "").trim(),
    status: (p.status as any) ?? "Initial Meeting",
    address: String(p.address ?? "").trim(),
    createdAt: p.createdAt ?? now,
    designer: (p.designer as any) ?? options.fallbackDesigner ?? "Jeff Dillon",
    renderingUrl: String(p.renderingUrl ?? "").trim(),
    nature: [],
    importMetadata: {
      importedFrom: "PlanPort",
      importVersion: pkg.exportVersion,
      importedAt: now,
      sourceRecordIds: pkg.sourceRecordIds,
    },
  };

  return { client, project };
}


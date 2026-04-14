import { z } from 'zod';
import type { Client, Project } from '@/lib/types';
import { PROJECT_STATUS_STEPS, type Designer, type ProjectStatus } from '@/lib/types';

export const PLANPORT_LEDGER_SYNC_TRANSFER_VERSION = 2 as const;

export type SyncTransferDirection = 'planport_to_ledger' | 'ledger_to_planport' | 'reconcile';

/**
 * Versioned JSON envelope for PlanPort ↔ Ledger (separate databases).
 * `client.canonical` / `project.canonical` use Ledger-led field names (`SharedClientDoc` / `SharedProjectDoc` subsets).
 * `project.clientExternalId` links to `client.externalId` (not Ledger Firestore document ids).
 *
 * Conflict policy (implemented in `buildLedgerUpsertPatchesFromEnvelopeV2`):
 * - Initial create in Ledger from PlanPort (no existing client/project row): PlanPort wins on overlapping fields.
 * - Update when Ledger already has a value: Ledger wins for that field (see `clientConflicts` / `projectConflicts` logs).
 */
export const PlanportLedgerSyncEnvelopeSchemaV2 = z.object({
  schemaVersion: z.literal(PLANPORT_LEDGER_SYNC_TRANSFER_VERSION),
  exportedAt: z.string().min(1),
  sourceApp: z.enum(['planport', 'ledger3']),
  /** Ledger `employees/{firmId}` root when known; optional on PlanPort-only exports. */
  firmId: z.string().optional(),
  client: z.object({
    externalId: z.string().min(1),
    canonical: z.record(z.unknown()),
  }),
  project: z.object({
    externalId: z.string().min(1),
    /** Must match `client.externalId` in this envelope. */
    clientExternalId: z.string().min(1),
    canonical: z.record(z.unknown()),
  }),
  mappingMeta: z.object({
    direction: z.enum(['planport_to_ledger', 'ledger_to_planport', 'reconcile']),
    planportHubCollection: z.enum(['individualClients', 'generalContractors']).optional(),
    planportHubId: z.string().optional(),
    planportClientDocId: z.string().optional(),
    planportProjectDocId: z.string().optional(),
    planportProjectPath: z.string().optional(),
    warnings: z.array(z.string()).optional(),
  }),
});

export type PlanportLedgerSyncEnvelopeV2 = z.infer<typeof PlanportLedgerSyncEnvelopeSchemaV2>;

const DESIGNERS = new Set<string>(['Jeff Dillon', 'Kevin Walthall']);

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

function strOrUndef(v: unknown): string | undefined {
  const s = str(v);
  return s === '' ? undefined : s;
}

function bool(v: unknown): boolean | undefined {
  if (v === true) return true;
  if (v === false) return false;
  return undefined;
}

function coerceDesigner(name: unknown): Designer {
  const t = str(name);
  if (DESIGNERS.has(t)) return t as Designer;
  return 'Jeff Dillon';
}

function coerceProjectStatus(s: unknown): ProjectStatus {
  const t = str(s);
  if ((PROJECT_STATUS_STEPS as readonly string[]).includes(t)) return t as ProjectStatus;
  const low = t.toLowerCase();
  if (low.includes('draft')) return 'Initial Meeting';
  return 'Initial Meeting';
}

export type LedgerClientUpsertPatch = Partial<Omit<Client, 'id'>> & { externalId?: string };
export type LedgerProjectUpsertPatch = Partial<Omit<Project, 'id' | 'clientId'>> & {
  externalId?: string;
};

export type SyncDryRunReportV2 = {
  wouldCreateClient: boolean;
  wouldCreateProject: boolean;
  clientConflicts: string[];
  projectConflicts: string[];
  warnings: string[];
  clientPatch: LedgerClientUpsertPatch;
  projectPatch: LedgerProjectUpsertPatch;
  resolvedClientId?: string;
  resolvedProjectId?: string;
};

function canonicalWireToClientPatch(canonical: Record<string, unknown>): LedgerClientUpsertPatch {
  const contacts = canonical.contacts;
  const additionalStakeholders =
    Array.isArray(contacts) && contacts.length
      ? (contacts as { name?: string; title?: string; email?: string; phone?: string }[]).map((c) => ({
          name: str(c.name),
          title: str(c.title) || '',
          email: str(c.email),
          phone: str(c.phone),
        }))
      : undefined;

  const patch: LedgerClientUpsertPatch = {
    externalId: strOrUndef(canonical.externalId),
    name: strOrUndef(canonical.displayName) || strOrUndef(canonical.legalName),
    email: strOrUndef(canonical.primaryEmail),
    phoneNumber: strOrUndef(canonical.primaryPhone),
    billingEmail: strOrUndef(canonical.billingEmail),
    accessCode: strOrUndef(canonical.accessCode),
    projectAddress: strOrUndef(canonical.address),
    permitPdfDownloads: bool(canonical.permitPdfDownloads),
  };
  if (additionalStakeholders?.length) {
    patch.additionalStakeholders = additionalStakeholders;
  }
  const extPlan = canonical.extensionPlanport;
  if (extPlan && typeof extPlan === 'object') {
    patch.planportExtension = extPlan as Record<string, unknown>;
  }
  return patch;
}

function canonicalWireToProjectPatch(canonical: Record<string, unknown>): LedgerProjectUpsertPatch {
  const extPlan = canonical.extensionPlanport;
  const patch: LedgerProjectUpsertPatch = {
    externalId: strOrUndef(canonical.externalId),
    name: strOrUndef(canonical.projectName),
    address: strOrUndef(canonical.address),
    status: coerceProjectStatus(canonical.status),
    designer: coerceDesigner(canonical.designerName),
    renderingUrl: strOrUndef(canonical.renderingUrl),
    lat: typeof canonical.lat === 'number' ? canonical.lat : undefined,
    lng: typeof canonical.lng === 'number' ? canonical.lng : undefined,
  };
  if (extPlan && typeof extPlan === 'object') {
    patch.planportExtension = extPlan as Record<string, unknown>;
  }
  return patch;
}

function mergeField<T>(
  preferIncoming: boolean,
  field: string,
  existing: T | undefined,
  incoming: T | undefined,
  conflicts: string[],
  isEmpty: (v: T | undefined) => boolean,
  equal: (a: T | undefined, b: T | undefined) => boolean,
): T | undefined {
  if (incoming === undefined) return existing;
  if (isEmpty(incoming)) return existing;
  if (existing === undefined || isEmpty(existing)) return incoming;
  if (equal(existing, incoming)) return existing;
  if (preferIncoming) return incoming;
  conflicts.push(field);
  return existing;
}

export function buildLedgerUpsertPatchesFromEnvelopeV2(
  envelope: PlanportLedgerSyncEnvelopeV2,
  existingClient: Client | null,
  existingProject: Project | null,
): SyncDryRunReportV2 {
  const warnings: string[] = [...(envelope.mappingMeta.warnings ?? [])];
  if (envelope.project.clientExternalId !== envelope.client.externalId) {
    warnings.push('project.clientExternalId does not match client.externalId; linkage may be wrong.');
  }

  const incomingClient = canonicalWireToClientPatch(envelope.client.canonical);
  const incomingProject = canonicalWireToProjectPatch(envelope.project.canonical);
  incomingClient.externalId = envelope.client.externalId;
  incomingProject.externalId = envelope.project.externalId;

  const preferIncomingClient =
    envelope.mappingMeta.direction === 'planport_to_ledger' && !existingClient;
  const preferIncomingProject =
    envelope.mappingMeta.direction === 'planport_to_ledger' && !existingProject;

  const clientConflicts: string[] = [];
  const exC = existingClient;
  const clientPatch: LedgerClientUpsertPatch = {
    externalId: incomingClient.externalId,
    name: mergeField(
      preferIncomingClient,
      'client.name',
      exC?.name,
      incomingClient.name,
      clientConflicts,
      (v) => !str(v),
      (a, b) => str(a) === str(b),
    ),
    email: mergeField(
      preferIncomingClient,
      'client.email',
      exC?.email,
      incomingClient.email,
      clientConflicts,
      (v) => !str(v),
      (a, b) => str(a) === str(b),
    ),
    phoneNumber: mergeField(
      preferIncomingClient,
      'client.phoneNumber',
      exC?.phoneNumber,
      incomingClient.phoneNumber,
      clientConflicts,
      (v) => !str(v),
      (a, b) => str(a) === str(b),
    ),
    billingEmail: mergeField(
      preferIncomingClient,
      'client.billingEmail',
      exC?.billingEmail,
      incomingClient.billingEmail,
      clientConflicts,
      (v) => !str(v),
      (a, b) => str(a) === str(b),
    ),
    accessCode: mergeField(
      preferIncomingClient,
      'client.accessCode',
      exC?.accessCode,
      incomingClient.accessCode,
      clientConflicts,
      (v) => !str(v),
      (a, b) => str(a) === str(b),
    ),
    projectAddress: mergeField(
      preferIncomingClient,
      'client.projectAddress',
      exC?.projectAddress,
      incomingClient.projectAddress,
      clientConflicts,
      (v) => !str(v),
      (a, b) => str(a) === str(b),
    ),
    permitPdfDownloads: mergeField(
      preferIncomingClient,
      'client.permitPdfDownloads',
      exC?.permitPdfDownloads,
      incomingClient.permitPdfDownloads,
      clientConflicts,
      (v) => v === undefined,
      (a, b) => a === b,
    ),
    additionalStakeholders: mergeField(
      preferIncomingClient,
      'client.additionalStakeholders',
      exC?.additionalStakeholders,
      incomingClient.additionalStakeholders,
      clientConflicts,
      (v) => !v || !Array.isArray(v) || v.length === 0,
      (a, b) => JSON.stringify(a) === JSON.stringify(b),
    ),
    planportExtension: mergeField(
      preferIncomingClient,
      'client.planportExtension',
      exC?.planportExtension,
      incomingClient.planportExtension,
      clientConflicts,
      (v) => !v || typeof v !== 'object' || Object.keys(v as object).length === 0,
      (a, b) => JSON.stringify(a) === JSON.stringify(b),
    ),
  };

  const projectConflicts: string[] = [];
  const exP = existingProject;
  const projectPatch: LedgerProjectUpsertPatch = {
    externalId: incomingProject.externalId,
    name: mergeField(
      preferIncomingProject,
      'project.name',
      exP?.name,
      incomingProject.name,
      projectConflicts,
      (v) => !str(v),
      (a, b) => str(a) === str(b),
    ),
    address: mergeField(
      preferIncomingProject,
      'project.address',
      exP?.address,
      incomingProject.address,
      projectConflicts,
      (v) => !str(v),
      (a, b) => str(a) === str(b),
    ),
    status: mergeField(
      preferIncomingProject,
      'project.status',
      exP?.status,
      incomingProject.status,
      projectConflicts,
      (v) => !str(v),
      (a, b) => str(a) === str(b),
    ),
    designer: mergeField(
      preferIncomingProject,
      'project.designer',
      exP?.designer,
      incomingProject.designer,
      projectConflicts,
      (v) => !str(v),
      (a, b) => str(a) === str(b),
    ),
    renderingUrl: mergeField(
      preferIncomingProject,
      'project.renderingUrl',
      exP?.renderingUrl,
      incomingProject.renderingUrl,
      projectConflicts,
      (v) => !str(v),
      (a, b) => str(a) === str(b),
    ),
    lat: mergeField(
      preferIncomingProject,
      'project.lat',
      exP?.lat,
      incomingProject.lat,
      projectConflicts,
      (v) => v === undefined,
      (a, b) => a === b,
    ),
    lng: mergeField(
      preferIncomingProject,
      'project.lng',
      exP?.lng,
      incomingProject.lng,
      projectConflicts,
      (v) => v === undefined,
      (a, b) => a === b,
    ),
    planportExtension: mergeField(
      preferIncomingProject,
      'project.planportExtension',
      exP?.planportExtension,
      incomingProject.planportExtension,
      projectConflicts,
      (v) => !v || typeof v !== 'object' || Object.keys(v as object).length === 0,
      (a, b) => JSON.stringify(a) === JSON.stringify(b),
    ),
  };

  return {
    wouldCreateClient: !existingClient,
    wouldCreateProject: !existingProject,
    clientConflicts,
    projectConflicts,
    warnings,
    clientPatch,
    projectPatch,
    resolvedClientId: existingClient?.id,
    resolvedProjectId: existingProject?.id,
  };
}

export function tryParsePlanportSyncEnvelopeV2(
  input: unknown,
): { ok: true; data: PlanportLedgerSyncEnvelopeV2 } | { ok: false; error: string } {
  const r = PlanportLedgerSyncEnvelopeSchemaV2.safeParse(input);
  if (!r.success) {
    return { ok: false, error: r.error.issues.map((i) => i.message).join('; ') };
  }
  return { ok: true, data: r.data };
}

export function isPlanportSyncEnvelopeV2(input: unknown): input is PlanportLedgerSyncEnvelopeV2 {
  const rec = input && typeof input === 'object' ? (input as Record<string, unknown>) : null;
  return rec?.schemaVersion === PLANPORT_LEDGER_SYNC_TRANSFER_VERSION;
}

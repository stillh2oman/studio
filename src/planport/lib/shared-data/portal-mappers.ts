/**
 * Keep in sync with Ledger: `Ledger 3 Files/src/lib/shared-data/portal-mappers.ts`
 */

import type { SharedClientDoc, SharedProjectDoc } from './canonical-types';
import { SHARED_SCHEMA_VERSION } from './canonical-types';
export interface PlanportResidentialHubInput {
  id: string;
  husbandName?: string | null;
  wifeName?: string | null;
  accessCode?: string | null;
  address?: string | null;
  email?: string | null;
  billingEmail?: string | null;
  phone?: string | null;
  allowDownloads?: boolean;
  additionalContacts?: Array<{ name?: string; email?: string }>;
  createdAt?: string;
  updatedAt?: string;
  sourceApp?: string;
  [key: string]: unknown;
}

export interface PlanportGcHubInput {
  id: string;
  name?: string;
  accessCode?: string | null;
  logoUrl?: string | null;
  billingEmail?: string | null;
  contacts?: Array<{ name?: string; title?: string; email?: string; phone?: string }>;
  allowDownloads?: boolean;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface PlanportProjectInput {
  id: string;
  name?: string;
  ownerName?: string | null;
  address?: string | null;
  status?: string | null;
  individualClientId?: string | null;
  generalContractorId?: string | null;
  designerName?: string | null;
  renderingUrl?: string | null;
  createdAt?: string;
  onboardingIntake?: unknown;
  [key: string]: unknown;
}

function isoNow() {
  return new Date().toISOString();
}

export function mapPlanportResidentialHubToCanonical(
  firmId: string,
  hub: PlanportResidentialHubInput,
  actor?: string,
): SharedClientDoc {
  const now = isoNow();
  const display =
    hub.wifeName && hub.husbandName
      ? `${hub.husbandName} & ${hub.wifeName}`
      : hub.husbandName || hub.wifeName || 'Unnamed';
  return {
    schemaVersion: SHARED_SCHEMA_VERSION,
    firmId,
    accountKind: 'residential',
    displayName: display,
    primaryEmail: hub.email || undefined,
    billingEmail: hub.billingEmail || undefined,
    primaryPhone: hub.phone || undefined,
    accessCode: hub.accessCode ? String(hub.accessCode).toUpperCase() : undefined,
    portalEnabled: true,
    address: hub.address || undefined,
    planportHubId: hub.id,
    planportHubCollection: 'individualClients',
    contacts: (hub.additionalContacts || []).map((c) => ({
      name: c.name || '',
      email: c.email || '',
      title: '',
      phone: '',
    })),
    extensionPlanport: {
      husbandName: hub.husbandName,
      wifeName: hub.wifeName,
      allowDownloads: hub.allowDownloads,
      sourceApp: hub.sourceApp,
    },
    createdAt: hub.createdAt || now,
    updatedAt: hub.updatedAt || now,
    updatedBy: actor,
    sourceRefs: [
      { app: 'planport', path: `individualClients/${hub.id}`, docId: hub.id },
    ],
  };
}

export function mapPlanportGcHubToCanonical(firmId: string, hub: PlanportGcHubInput, actor?: string): SharedClientDoc {
  const now = isoNow();
  return {
    schemaVersion: SHARED_SCHEMA_VERSION,
    firmId,
    accountKind: 'contractor',
    displayName: hub.name || 'Unnamed GC',
    billingEmail: hub.billingEmail || undefined,
    primaryEmail: hub.billingEmail || undefined,
    logoUrl: hub.logoUrl || undefined,
    accessCode: hub.accessCode ? String(hub.accessCode).toUpperCase() : undefined,
    portalEnabled: true,
    contacts: Array.isArray(hub.contacts)
      ? hub.contacts.map((x: { name?: string; title?: string; email?: string; phone?: string }) => ({
          name: x?.name || '',
          title: x?.title,
          email: x?.email,
          phone: x?.phone,
        }))
      : undefined,
    planportHubId: hub.id,
    planportHubCollection: 'generalContractors',
    extensionPlanport: { allowDownloads: hub.allowDownloads },
    createdAt: hub.createdAt || now,
    updatedAt: hub.updatedAt || now,
    updatedBy: actor,
    sourceRefs: [{ app: 'planport', path: `generalContractors/${hub.id}`, docId: hub.id }],
  };
}

export function mapPlanportProjectToCanonical(
  firmId: string,
  hubCollection: 'individualClients' | 'generalContractors',
  hubId: string,
  proj: PlanportProjectInput,
  links: { sharedResidentialId?: string; sharedContractorId?: string },
  actor?: string,
): SharedProjectDoc {
  const now = isoNow();
  const path = `${hubCollection}/${hubId}/projects/${proj.id}`;
  return {
    schemaVersion: SHARED_SCHEMA_VERSION,
    firmId,
    projectName: proj.name || 'Untitled',
    status: proj.status || undefined,
    address: proj.address || undefined,
    residentialClientId: links.sharedResidentialId,
    contractorClientId:
      links.sharedContractorId &&
      (!!proj.generalContractorId || hubCollection === 'generalContractors')
        ? links.sharedContractorId
        : undefined,
    planportProjectPath: path,
    portalVisible: true,
    designerName: proj.designerName || undefined,
    renderingUrl: proj.renderingUrl || undefined,
    createdAt: proj.createdAt || now,
    updatedAt: now,
    extensionPlanport: {
      ownerName: proj.ownerName,
      individualClientId: proj.individualClientId,
      generalContractorId: proj.generalContractorId,
      onboardingIntake: proj.onboardingIntake,
    },
    updatedBy: actor,
    sourceRefs: [{ app: 'planport', path, docId: proj.id }],
  };
}

export function mapCanonicalToPlanportProjectPatch(p: SharedProjectDoc): Record<string, unknown> {
  const ext = p.extensionPlanport || {};
  const patch: Record<string, unknown> = {
    name: p.projectName,
    address: p.address ?? null,
    status: p.status ?? null,
    designerName: p.designerName ?? null,
    renderingUrl: p.renderingUrl ?? null,
  };
  if (ext.ownerName != null) patch.ownerName = ext.ownerName;
  return patch;
}

export function mapCanonicalToPlanportResidentialHubPatch(c: SharedClientDoc): Record<string, unknown> {
  const ext = c.extensionPlanport || {};
  return {
    husbandName: ext.husbandName ?? null,
    wifeName: ext.wifeName ?? null,
    email: c.primaryEmail ?? null,
    billingEmail: c.billingEmail ?? null,
    phone: c.primaryPhone ?? null,
    address: c.address ?? null,
    accessCode: c.accessCode ?? null,
    allowDownloads: ext.allowDownloads ?? null,
    additionalContacts: c.contacts ?? null,
  };
}

export function mapCanonicalToPlanportGcHubPatch(c: SharedClientDoc): Record<string, unknown> {
  return {
    name: c.displayName,
    billingEmail: c.billingEmail ?? null,
    logoUrl: c.logoUrl ?? null,
    accessCode: c.accessCode ?? null,
    contacts: c.contacts ?? null,
    allowDownloads:
      (c.extensionPlanport && (c.extensionPlanport as Record<string, unknown>).allowDownloads) ?? null,
  };
}

import type { Client, Contractor, Project } from '@/lib/types';
import type { SharedClientDoc, SharedProjectDoc } from './canonical-types';
import { SHARED_SCHEMA_VERSION } from './canonical-types';
import { sharedClientDocIdForLedger, sharedProjectDocIdForLedger } from './ids';

function isoNow(): string {
  return new Date().toISOString();
}

function pickExtensionLedgerClient(c: Client): Record<string, unknown> {
  const ext: Record<string, unknown> = {};
  const known = new Set([
    'id',
    'externalId',
    'name',
    'firstName',
    'lastName',
    'secondaryClientName',
    'email',
    'phoneNumber',
    'accessCode',
    'isContractor',
    'logoUrl',
    'billingEmail',
    'contacts',
    'additionalStakeholders',
    'permitPdfDownloads',
    'initialProjectName',
    'associatedProjectIds',
    'projectAddress',
    'projectRenderingUrl',
    'assignedContractorId',
    'discountEligibility',
    'hiddenFromDatabase',
    'planportExtension',
  ]);
  for (const [k, v] of Object.entries(c)) {
    if (!known.has(k)) ext[k] = v;
  }
  if (c.firstName || c.lastName || c.secondaryClientName) {
    ext.firstName = c.firstName;
    ext.lastName = c.lastName;
    ext.secondaryClientName = c.secondaryClientName;
  }
  if (c.associatedProjectIds?.length) ext.associatedProjectIds = c.associatedProjectIds;
  if (c.initialProjectName) ext.initialProjectName = c.initialProjectName;
  if (c.assignedContractorId) ext.assignedContractorId = c.assignedContractorId;
  if (c.discountEligibility) ext.discountEligibility = c.discountEligibility;
  if (c.hiddenFromDatabase != null) ext.hiddenFromDatabase = c.hiddenFromDatabase;
  return ext;
}

function pickExtensionLedgerContractor(c: Contractor): Record<string, unknown> {
  const ext: Record<string, unknown> = {};
  const known = new Set([
    'id',
    'externalId',
    'companyName',
    'logoUrl',
    'billingEmail',
    'contacts',
    'accessCode',
    'permitPdfDownloads',
    'qualifiesForDiscount',
  ]);
  for (const [k, v] of Object.entries(c)) {
    if (!known.has(k)) ext[k] = v;
  }
  if (c.qualifiesForDiscount != null) ext.qualifiesForDiscount = c.qualifiesForDiscount;
  return ext;
}

function pickExtensionLedgerProject(p: Project): Record<string, unknown> {
  const ext: Record<string, unknown> = {};
  const known = new Set([
    'id',
    'externalId',
    'name',
    'clientId',
    'hiddenFromCards',
    'contractorId',
    'status',
    'lastStatusUpdate',
    'isArchived',
    'constructionCompany',
    'address',
    'lat',
    'lng',
    'type',
    'nature',
    'checklist',
    'hourlyRate',
    'hasHourlyDiscount',
    'currentHeatedSqFt',
    'createdAt',
    'designer',
    'renderingUrl',
    'planportExtension',
  ]);
  for (const [k, v] of Object.entries(p)) {
    if (!known.has(k)) ext[k] = v;
  }
  if (p.nature?.length) ext.nature = p.nature;
  if (p.checklist) ext.checklist = p.checklist;
  if (p.lastStatusUpdate) ext.lastStatusUpdate = p.lastStatusUpdate;
  if (p.isArchived != null) ext.isArchived = p.isArchived;
  if (p.type) ext.type = p.type;
  if (p.constructionCompany) ext.constructionCompany = p.constructionCompany;
  if (p.hiddenFromCards != null) ext.hiddenFromCards = p.hiddenFromCards;
  if (p.hourlyRate != null) ext.hourlyRate = p.hourlyRate;
  if (p.hasHourlyDiscount != null) ext.hasHourlyDiscount = p.hasHourlyDiscount;
  if (p.currentHeatedSqFt != null) ext.currentHeatedSqFt = p.currentHeatedSqFt;
  ext.ledgerClientId = p.clientId;
  ext.ledgerContractorId = p.contractorId || '';
  return ext;
}

export function mapInternalClientToCanonical(firmId: string, c: Client, actor?: string): SharedClientDoc {
  const id = sharedClientDocIdForLedger(firmId, 'clients', c.id);
  const now = isoNow();
  return {
    schemaVersion: SHARED_SCHEMA_VERSION,
    firmId,
    externalId: c.externalId || undefined,
    accountKind: 'residential',
    displayName: c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unnamed',
    legalName: c.name,
    primaryEmail: c.email || undefined,
    primaryPhone: c.phoneNumber || undefined,
    billingEmail: c.billingEmail || undefined,
    accessCode: c.accessCode || undefined,
    portalEnabled: !!String(c.accessCode || '').trim(),
    address: c.projectAddress || undefined,
    contacts: c.contacts,
    additionalStakeholders: c.additionalStakeholders,
    permitPdfDownloads: c.permitPdfDownloads,
    ledgerClientId: c.id,
    extensionLedger: pickExtensionLedgerClient(c),
    createdAt: now,
    updatedAt: now,
    updatedBy: actor,
    sourceRefs: [
      {
        app: 'ledger',
        path: `employees/${firmId}/clients/${c.id}`,
        docId: c.id,
      },
    ],
  };
}

export function mapInternalContractorToCanonical(firmId: string, c: Contractor, actor?: string): SharedClientDoc {
  const now = isoNow();
  return {
    schemaVersion: SHARED_SCHEMA_VERSION,
    firmId,
    externalId: c.externalId || undefined,
    accountKind: 'contractor',
    displayName: c.companyName || 'Unnamed Contractor',
    legalName: c.companyName,
    primaryEmail: c.billingEmail || undefined,
    billingEmail: c.billingEmail || undefined,
    logoUrl: c.logoUrl,
    accessCode: c.accessCode || undefined,
    portalEnabled: !!String(c.accessCode || '').trim(),
    contacts: c.contacts,
    permitPdfDownloads: c.permitPdfDownloads,
    ledgerContractorId: c.id,
    extensionLedger: pickExtensionLedgerContractor(c),
    createdAt: now,
    updatedAt: now,
    updatedBy: actor,
    sourceRefs: [
      {
        app: 'ledger',
        path: `employees/${firmId}/contractors/${c.id}`,
        docId: c.id,
      },
    ],
  };
}

/**
 * sharedResidentialId / sharedContractorId must be deterministic ids used in shared_clients
 * (same helpers as migration). Caller supplies them so project rows link correctly.
 */
export function mapInternalProjectToCanonical(
  firmId: string,
  p: Project,
  links: { sharedResidentialId?: string; sharedContractorId?: string },
  actor?: string,
): SharedProjectDoc {
  const now = isoNow();
  return {
    schemaVersion: SHARED_SCHEMA_VERSION,
    firmId,
    externalId: p.externalId || undefined,
    projectName: p.name || 'Untitled',
    status: p.status,
    address: p.address || undefined,
    lat: p.lat,
    lng: p.lng,
    residentialClientId: links.sharedResidentialId,
    contractorClientId: p.contractorId && links.sharedContractorId ? links.sharedContractorId : undefined,
    ledgerProjectId: p.id,
    portalVisible: true,
    designerName: p.designer,
    renderingUrl: p.renderingUrl || undefined,
    createdAt: p.createdAt || now,
    updatedAt: now,
    extensionLedger: pickExtensionLedgerProject(p),
    updatedBy: actor,
    sourceRefs: [
      {
        app: 'ledger',
        path: `employees/${firmId}/projects/${p.id}`,
        docId: p.id,
      },
    ],
  };
}

/** Minimal Client view for Ledger UI when hydrating from canonical (extensions merged back). */
export function mapCanonicalToInternalClientView(c: SharedClientDoc, legacyId: string): Client {
  const ext = c.extensionLedger || {};
  return {
    id: legacyId,
    externalId: typeof c.externalId === 'string' ? c.externalId : undefined,
    name: c.displayName,
    firstName: typeof ext.firstName === 'string' ? ext.firstName : undefined,
    lastName: typeof ext.lastName === 'string' ? ext.lastName : undefined,
    secondaryClientName: typeof ext.secondaryClientName === 'string' ? ext.secondaryClientName : '',
    email: c.primaryEmail || c.billingEmail || '',
    phoneNumber: c.primaryPhone || '',
    accessCode: c.accessCode || '',
    isContractor: false,
    billingEmail: c.billingEmail,
    contacts: c.contacts as Client['contacts'],
    additionalStakeholders: (c.additionalStakeholders || []) as Client['additionalStakeholders'],
    permitPdfDownloads: !!c.permitPdfDownloads,
    initialProjectName: typeof ext.initialProjectName === 'string' ? ext.initialProjectName : '',
    associatedProjectIds: Array.isArray(ext.associatedProjectIds) ? (ext.associatedProjectIds as string[]) : [],
    projectAddress: c.address || '',
    projectRenderingUrl: typeof ext.projectRenderingUrl === 'string' ? ext.projectRenderingUrl : '',
    assignedContractorId: typeof ext.assignedContractorId === 'string' ? ext.assignedContractorId : '',
    discountEligibility: ext.discountEligibility as Client['discountEligibility'],
    hiddenFromDatabase: !!ext.hiddenFromDatabase,
  };
}

export function mapCanonicalToInternalContractorView(c: SharedClientDoc, legacyId: string): Contractor {
  const ext = c.extensionLedger || {};
  return {
    id: legacyId,
    externalId: typeof c.externalId === 'string' ? c.externalId : undefined,
    companyName: c.displayName,
    logoUrl: c.logoUrl,
    billingEmail: c.billingEmail || '',
    contacts: (c.contacts || []) as Contractor['contacts'],
    accessCode: c.accessCode || '',
    permitPdfDownloads: !!c.permitPdfDownloads,
    qualifiesForDiscount: !!ext.qualifiesForDiscount,
  };
}

export function mapCanonicalToInternalProjectView(p: SharedProjectDoc, legacyId: string, fallbackLedgerClientId?: string): Project {
  const ext = p.extensionLedger || {};
  const ledgerClientId =
    typeof ext.ledgerClientId === 'string' ? ext.ledgerClientId : fallbackLedgerClientId || '';
  const ledgerContractorId = typeof ext.ledgerContractorId === 'string' ? ext.ledgerContractorId : '';
  return {
    id: legacyId,
    externalId: typeof p.externalId === 'string' ? p.externalId : undefined,
    name: p.projectName,
    clientId: ledgerClientId,
    hiddenFromCards: !!ext.hiddenFromCards,
    contractorId: ledgerContractorId,
    status: p.status as Project['status'],
    lastStatusUpdate: typeof ext.lastStatusUpdate === 'string' ? ext.lastStatusUpdate : undefined,
    isArchived: !!ext.isArchived,
    constructionCompany: typeof ext.constructionCompany === 'string' ? ext.constructionCompany : '',
    address: p.address || '',
    lat: p.lat,
    lng: p.lng,
    type: ext.type as Project['type'],
    nature: Array.isArray(ext.nature) ? (ext.nature as Project['nature']) : [],
    checklist: ext.checklist as Project['checklist'],
    hourlyRate: typeof ext.hourlyRate === 'number' ? ext.hourlyRate : 0,
    hasHourlyDiscount: !!ext.hasHourlyDiscount,
    currentHeatedSqFt: typeof ext.currentHeatedSqFt === 'number' ? ext.currentHeatedSqFt : 0,
    createdAt: p.createdAt || new Date().toISOString(),
    designer: (p.designerName as Project['designer']) || 'Jeff Dillon',
    renderingUrl: p.renderingUrl || '',
  };
}

export { sharedClientDocIdForLedger, sharedProjectDocIdForLedger };

/**
 * Canonical Firestore documents for root `clients` / `projects`.
 * Keep in sync with Ledger: `Ledger 3 Files/src/lib/shared-data/canonical-types.ts`
 */

export const SHARED_SCHEMA_VERSION = 1 as const;

export type SharedAccountKind = 'residential' | 'contractor';

export type PlanportHubCollection = 'individualClients' | 'generalContractors';

export interface SourceRef {
  app: 'ledger' | 'planport';
  path: string;
  docId: string;
}

export interface SharedClientDoc {
  schemaVersion: typeof SHARED_SCHEMA_VERSION;
  firmId: string;
  accountKind: SharedAccountKind;
  displayName: string;
  legalName?: string;
  primaryEmail?: string;
  primaryPhone?: string;
  billingEmail?: string;
  accessCode?: string;
  portalEnabled: boolean;
  status?: string;
  tags?: string[];
  address?: string;
  logoUrl?: string;
  contacts?: Array<{ name: string; title?: string; email?: string; phone?: string }>;
  additionalStakeholders?: Array<{ name: string; title?: string; email?: string; phone?: string }>;
  permitPdfDownloads?: boolean;
  ledgerClientId?: string;
  ledgerContractorId?: string;
  planportHubId?: string;
  planportHubCollection?: PlanportHubCollection;
  extensionLedger?: Record<string, unknown>;
  extensionPlanport?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  sourceRefs: SourceRef[];
}

export interface SharedProjectDoc {
  schemaVersion: typeof SHARED_SCHEMA_VERSION;
  firmId: string;
  projectName: string;
  projectCode?: string;
  status?: string;
  phase?: string;
  address?: string;
  lat?: number;
  lng?: number;
  residentialClientId?: string;
  contractorClientId?: string;
  ledgerProjectId?: string;
  planportProjectPath?: string;
  portalVisible?: boolean;
  designerName?: string;
  renderingUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  extensionLedger?: Record<string, unknown>;
  extensionPlanport?: Record<string, unknown>;
  sourceRefs: SourceRef[];
  createdBy?: string;
  updatedBy?: string;
}

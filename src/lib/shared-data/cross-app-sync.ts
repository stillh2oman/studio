/**
 * Cross-app PlanPort ↔ Ledger sync: canonical mapping entry points and naming aliases.
 *
 * Conflict policy (canonical shared fields only):
 * - Initial create in Ledger from PlanPort (`planport_to_ledger` when no existing row): PlanPort values win.
 * - Update when Ledger already has a value: Ledger wins unless the field is empty on Ledger (then fill from import).
 * - App-specific / extension fields are never overwritten except via explicit extension merges in the importer.
 */

import type { Client, Contractor, Project } from '@/lib/types';
import type { SharedClientDoc, SharedProjectDoc } from './canonical-types';
import {
  mapPlanportGcHubToCanonical,
  mapPlanportResidentialHubToCanonical,
  mapPlanportProjectToCanonical,
  mapCanonicalToPlanportGcHubPatch,
  mapCanonicalToPlanportResidentialHubPatch,
  mapCanonicalToPlanportProjectPatch,
  type PlanportGcHubInput,
  type PlanportResidentialHubInput,
  type PlanportProjectInput,
} from './portal-mappers';
import {
  mapInternalClientToCanonical,
  mapInternalContractorToCanonical,
  mapInternalProjectToCanonical,
  mapCanonicalToInternalClientView,
  mapCanonicalToInternalContractorView,
  mapCanonicalToInternalProjectView,
} from './internal-mappers';

export type PlanPortClientSource =
  | { accountKind: 'residential'; hub: PlanportResidentialHubInput }
  | { accountKind: 'contractor'; hub: PlanportGcHubInput };

export function mapPlanPortClientToCanonical(
  firmId: string,
  source: PlanPortClientSource,
  actor?: string,
): SharedClientDoc {
  if (source.accountKind === 'contractor') {
    return mapPlanportGcHubToCanonical(firmId, source.hub, actor);
  }
  return mapPlanportResidentialHubToCanonical(firmId, source.hub, actor);
}

export function mapPlanPortProjectToCanonical(
  firmId: string,
  hubCollection: 'individualClients' | 'generalContractors',
  hubId: string,
  proj: PlanportProjectInput,
  links: { sharedResidentialId?: string; sharedContractorId?: string },
  actor?: string,
): SharedProjectDoc {
  return mapPlanportProjectToCanonical(firmId, hubCollection, hubId, proj, links, actor);
}

export const mapLedgerClientToCanonical = mapInternalClientToCanonical;
export const mapLedgerContractorToCanonical = mapInternalContractorToCanonical;
export const mapLedgerProjectToCanonical = mapInternalProjectToCanonical;

export function mapCanonicalToPlanPortClient(
  c: SharedClientDoc,
): Record<string, unknown> {
  if (c.accountKind === 'contractor') {
    return mapCanonicalToPlanportGcHubPatch(c);
  }
  return mapCanonicalToPlanportResidentialHubPatch(c);
}

export const mapCanonicalToPlanPortProject = mapCanonicalToPlanportProjectPatch;

export function mapCanonicalToLedgerClient(c: SharedClientDoc, ledgerClientDocId: string): Client {
  return mapCanonicalToInternalClientView(c, ledgerClientDocId);
}

export function mapCanonicalToLedgerContractor(
  c: SharedClientDoc,
  ledgerContractorDocId: string,
): Contractor {
  return mapCanonicalToInternalContractorView(c, ledgerContractorDocId);
}

export function mapCanonicalToLedgerProject(
  p: SharedProjectDoc,
  ledgerProjectDocId: string,
  fallbackLedgerClientId?: string,
): Project {
  return mapCanonicalToInternalProjectView(p, ledgerProjectDocId, fallbackLedgerClientId);
}

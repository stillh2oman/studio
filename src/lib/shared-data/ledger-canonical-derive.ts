/**
 * Build Ledger UI models from root `clients` / `projects` canonical documents.
 */

import type { Client, Contractor, Project } from '@/lib/types';
import type { SharedClientDoc, SharedProjectDoc } from './canonical-types';
import {
  mapCanonicalToInternalClientView,
  mapCanonicalToInternalContractorView,
  mapCanonicalToInternalProjectView,
} from './internal-mappers';

export type CanonicalRowClient = SharedClientDoc & { id: string };
export type CanonicalRowProject = SharedProjectDoc & { id: string };

export function deriveLedgerFromCanonical(
  clientRows: CanonicalRowClient[] | null | undefined,
  projectRows: CanonicalRowProject[] | null | undefined,
  mapClient: (c: any) => Client,
  mapProject: (p: any) => Project,
): {
  mappedAccounts: Client[];
  clients: Client[];
  contractors: Contractor[];
  activeProjects: Project[];
} {
  const rows = clientRows || [];
  const byCanon = new Map<string, SharedClientDoc>();
  for (const r of rows) byCanon.set(r.id, r);

  const residentialClients: Client[] = [];
  const contractorClientsForAccounts: Client[] = [];

  for (const row of rows) {
    if (row.accountKind === 'contractor') {
      const legId = row.ledgerContractorId || row.id;
      const co = mapCanonicalToInternalContractorView(row, legId);
      contractorClientsForAccounts.push(
        mapClient({
          id: co.id,
          name: co.companyName,
          isContractor: true,
          companyName: co.companyName,
          logoUrl: co.logoUrl,
          billingEmail: co.billingEmail,
          contacts: co.contacts,
          accessCode: co.accessCode,
          permitPdfDownloads: co.permitPdfDownloads,
          qualifiesForDiscount: co.qualifiesForDiscount,
          email: co.billingEmail,
          phoneNumber: '',
          secondaryClientName: '',
          additionalStakeholders: [],
          initialProjectName: '',
          associatedProjectIds: [],
          projectAddress: '',
          projectRenderingUrl: '',
          assignedContractorId: '',
          discountEligibility: '',
          hiddenFromDatabase: false,
        }),
      );
    } else {
      const legId = row.ledgerClientId || row.id;
      residentialClients.push(mapClient(mapCanonicalToInternalClientView(row, legId)));
    }
  }

  const contractors: Contractor[] = rows
    .filter((r) => r.accountKind === 'contractor')
    .map((row) => mapCanonicalToInternalContractorView(row, row.ledgerContractorId || row.id));

  const clients = residentialClients.filter((c) => !c.isContractor);
  const mappedAccounts = [...residentialClients.filter((c) => !c.isContractor), ...contractorClientsForAccounts];

  const prows = projectRows || [];
  const activeProjects = prows.map((row) => {
    const resDoc = row.residentialClientId ? byCanon.get(row.residentialClientId) : undefined;
    const conDoc = row.contractorClientId ? byCanon.get(row.contractorClientId) : undefined;
    const ext = {
      ...((row.extensionLedger || {}) as Record<string, unknown>),
      ledgerClientId:
        (resDoc?.ledgerClientId as string | undefined) ??
        (row.extensionLedger as Record<string, unknown> | undefined)?.ledgerClientId,
      ledgerContractorId:
        (conDoc?.ledgerContractorId as string | undefined) ??
        (row.extensionLedger as Record<string, unknown> | undefined)?.ledgerContractorId,
    };
    const legacyProjectId = row.ledgerProjectId || row.id;
    const view = mapCanonicalToInternalProjectView(
      { ...row, extensionLedger: ext },
      legacyProjectId,
      typeof ext.ledgerClientId === 'string' ? ext.ledgerClientId : undefined,
    );
    return mapProject(view);
  });

  return { mappedAccounts, clients, contractors, activeProjects };
}

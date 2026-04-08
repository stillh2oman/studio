/**
 * Map root `clients` canonical docs → shapes expected by PlanPort admin UI.
 * Hub navigation still uses `individualClients/{planportHubId}/...` paths.
 */

import type { SharedClientDoc } from './canonical-types';

export type PrivateDirectoryClient = {
  id: string;
  husbandName: string;
  wifeName?: string | null;
  address?: string | null;
  accessCode?: string;
  email?: string;
  phone?: string;
  allowDownloads?: boolean;
};

export function mapCanonicalToPrivateDirectoryClient(row: SharedClientDoc & { id: string }): PrivateDirectoryClient | null {
  if (!row.planportHubId || row.planportHubCollection !== 'individualClients') return null;
  const ext = row.extensionPlanport || {};
  const husband = String(ext.husbandName ?? '').trim() || String(row.displayName || 'Client').split('&')[0]?.trim() || 'Client';
  const wife = ext.wifeName != null ? String(ext.wifeName) : null;
  return {
    id: row.planportHubId,
    husbandName: husband,
    wifeName: wife,
    address: row.address ?? null,
    accessCode: row.accessCode,
    email: row.primaryEmail ?? row.billingEmail,
    phone: row.primaryPhone ?? undefined,
    allowDownloads: ext.allowDownloads === true,
  };
}

export type GcDirectoryRow = {
  id: string;
  name?: string;
  billingEmail?: string;
  logoUrl?: string | null;
  accessCode?: string;
};

export function mapCanonicalToGcDirectoryRow(row: SharedClientDoc & { id: string }): GcDirectoryRow | null {
  if (!row.planportHubId || row.planportHubCollection !== 'generalContractors') return null;
  return {
    id: row.planportHubId,
    name: row.displayName,
    billingEmail: row.billingEmail,
    logoUrl: row.logoUrl ?? null,
    accessCode: row.accessCode,
  };
}

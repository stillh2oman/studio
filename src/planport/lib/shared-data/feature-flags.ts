export type DataAccessMode = 'legacy' | 'canonical_read' | 'dual_verify' | 'canonical_read_write';

/** Keep in sync with Ledger: `Ledger 3 Files/src/lib/shared-data/feature-flags.ts` */
export function getDataAccessMode(): DataAccessMode {
  const raw = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DATA_ACCESS_MODE) || '';
  const v = String(raw).trim().toLowerCase();
  if (v === 'canonical_read' || v === 'canonical-read') return 'canonical_read';
  if (v === 'dual_verify' || v === 'dual-verify') return 'dual_verify';
  if (v === 'canonical_read_write' || v === 'canonical-read-write') return 'canonical_read_write';
  return 'legacy';
}

export function isCanonicalReadEnabled(): boolean {
  const m = getDataAccessMode();
  return m === 'canonical_read' || m === 'canonical_read_write';
}

export const CANONICAL_CLIENTS_COLLECTION =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CANONICAL_CLIENTS_COLLECTION?.trim()) || 'clients';

export const CANONICAL_PROJECTS_COLLECTION =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CANONICAL_PROJECTS_COLLECTION?.trim()) || 'projects';

export const SHARED_CLIENTS_COLLECTION = 'shared_clients';
export const SHARED_PROJECTS_COLLECTION = 'shared_projects';

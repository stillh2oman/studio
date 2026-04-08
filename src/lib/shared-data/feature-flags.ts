export type DataAccessMode = 'legacy' | 'canonical_read' | 'dual_verify' | 'canonical_read_write';

/**
 * Controls phased rollout. Default `legacy` — only legacy Firestore paths.
 * `canonical_read` — UI lists clients/projects from root `clients` + `projects`.
 * `dual_verify` — same UI as legacy; dev-only logging compares legacy vs canonical counts.
 * `canonical_read_write` — dual-write to legacy + canonical on client/project mutations.
 */
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

export function isDualWriteEnabled(): boolean {
  return getDataAccessMode() === 'canonical_read_write';
}

/** Root canonical collections (single source of truth after migration). */
export const CANONICAL_CLIENTS_COLLECTION =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CANONICAL_CLIENTS_COLLECTION?.trim()) || 'clients';

export const CANONICAL_PROJECTS_COLLECTION =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CANONICAL_PROJECTS_COLLECTION?.trim()) || 'projects';

/** @deprecated Use CANONICAL_CLIENTS_COLLECTION — kept for one-off scripts reading old data */
export const SHARED_CLIENTS_COLLECTION = 'shared_clients';
/** @deprecated Use CANONICAL_PROJECTS_COLLECTION */
export const SHARED_PROJECTS_COLLECTION = 'shared_projects';

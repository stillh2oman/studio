/**
 * Normalization + merge keys for Ledger ↔ PlanPort canonical migration.
 * Conservative: ambiguous matches are reported, not auto-merged.
 */

import type { SharedClientDoc } from './canonical-types';

export function normalizeEmail(raw: string | undefined | null): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim().toLowerCase().replace(/\s+/g, '');
}

export function normalizeAccessCode(raw: string | undefined | null): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export function normalizeNameKey(raw: string | undefined | null): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Residential: primary + billing emails. Contractor: billing + primary. */
export function emailsForMatch(doc: Partial<SharedClientDoc>): string[] {
  const out: string[] = [];
  const add = (e?: string | null) => {
    const n = normalizeEmail(e);
    if (n) out.push(n);
  };
  add(doc.primaryEmail);
  add(doc.billingEmail);
  return [...new Set(out)];
}

export function ledgerResidentialMatchKeys(
  firmId: string,
  c: { email?: string; billingEmail?: string; accessCode?: string; name?: string },
): string[] {
  const keys = new Set<string>();
  const e1 = normalizeEmail(c.email);
  const e2 = normalizeEmail(c.billingEmail);
  if (e1) keys.add(`email:${firmId}:res:${e1}`);
  if (e2 && e2 !== e1) keys.add(`email:${firmId}:res:${e2}`);
  const code = normalizeAccessCode(c.accessCode);
  if (code) keys.add(`code:${firmId}:res:${code}`);
  const nk = normalizeNameKey(c.name);
  if (nk.length > 2) keys.add(`name:${firmId}:res:${nk}`);
  return [...keys];
}

export function planportHubMatchKeys(
  firmId: string,
  hub: {
    email?: string | null;
    billingEmail?: string | null;
    accessCode?: string | null;
    husbandName?: string | null;
    wifeName?: string | null;
  },
): string[] {
  const keys = new Set<string>();
  const e1 = normalizeEmail(hub.email ?? undefined);
  const e2 = normalizeEmail(hub.billingEmail ?? undefined);
  if (e1) keys.add(`email:${firmId}:res:${e1}`);
  if (e2 && e2 !== e1) keys.add(`email:${firmId}:res:${e2}`);
  const code = normalizeAccessCode(hub.accessCode ?? undefined);
  if (code) keys.add(`code:${firmId}:res:${code}`);
  const display =
    hub.wifeName && hub.husbandName
      ? `${hub.husbandName} ${hub.wifeName}`
      : hub.husbandName || hub.wifeName || '';
  const nk = normalizeNameKey(display);
  if (nk.length > 2) keys.add(`name:${firmId}:res:${nk}`);
  return [...keys];
}

export function gcMatchKeys(
  firmId: string,
  name: string | undefined,
  billingEmail: string | undefined,
): string[] {
  const keys = new Set<string>();
  const nk = normalizeNameKey(name);
  if (nk.length > 2) keys.add(`name:${firmId}:gc:${nk}`);
  const e = normalizeEmail(billingEmail);
  if (e) keys.add(`email:${firmId}:gc:${e}`);
  return [...keys];
}

export function deepMergePreferNonEmpty<T extends Record<string, unknown>>(base: T, incoming: T): T {
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(incoming)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (Array.isArray(v) && v.length === 0 && out[k] != null) continue;
    out[k] = v;
  }
  return out as T;
}

export function mergeSourceRefs(a: SharedClientDoc['sourceRefs'], b: SharedClientDoc['sourceRefs']) {
  const by = new Map<string, (typeof a)[0]>();
  for (const r of [...a, ...b]) {
    by.set(`${r.app}:${r.path}`, r);
  }
  return [...by.values()];
}

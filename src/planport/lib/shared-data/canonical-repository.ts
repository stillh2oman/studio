/**
 * Keep in sync with Ledger: `Ledger 3 Files/src/lib/shared-data/canonical-repository.ts`
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import type { SharedClientDoc, SharedProjectDoc } from './canonical-types';
import { CANONICAL_CLIENTS_COLLECTION, CANONICAL_PROJECTS_COLLECTION } from './feature-flags';

function omitUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map(omitUndefinedDeep).filter((v) => v !== undefined);
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const x = omitUndefinedDeep(v);
    if (x !== undefined) out[k] = x;
  }
  return out;
}

export function sharedClientDocRef(db: Firestore, id: string) {
  return doc(db, CANONICAL_CLIENTS_COLLECTION, id);
}

export function sharedProjectDocRef(db: Firestore, id: string) {
  return doc(db, CANONICAL_PROJECTS_COLLECTION, id);
}

export async function getCanonicalClientById(
  db: Firestore,
  id: string,
): Promise<SharedClientDoc | null> {
  const snap = await getDoc(sharedClientDocRef(db, id));
  if (!snap.exists()) return null;
  return snap.data() as SharedClientDoc;
}

export async function getCanonicalProjectById(
  db: Firestore,
  id: string,
): Promise<SharedProjectDoc | null> {
  const snap = await getDoc(sharedProjectDocRef(db, id));
  if (!snap.exists()) return null;
  return snap.data() as SharedProjectDoc;
}

export async function listCanonicalClientsForFirm(
  db: Firestore,
  firmId: string,
): Promise<Array<{ id: string; doc: SharedClientDoc }>> {
  const q = query(collection(db, CANONICAL_CLIENTS_COLLECTION), where('firmId', '==', firmId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, doc: d.data() as SharedClientDoc }));
}

export async function listCanonicalProjectsForFirm(
  db: Firestore,
  firmId: string,
): Promise<Array<{ id: string; doc: SharedProjectDoc }>> {
  const q = query(collection(db, CANONICAL_PROJECTS_COLLECTION), where('firmId', '==', firmId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, doc: d.data() as SharedProjectDoc }));
}

export async function listCanonicalProjectsForClient(
  db: Firestore,
  firmId: string,
  sharedClientId: string,
): Promise<Array<{ id: string; doc: SharedProjectDoc }>> {
  const res = query(
    collection(db, CANONICAL_PROJECTS_COLLECTION),
    where('firmId', '==', firmId),
    where('residentialClientId', '==', sharedClientId),
  );
  const con = query(
    collection(db, CANONICAL_PROJECTS_COLLECTION),
    where('firmId', '==', firmId),
    where('contractorClientId', '==', sharedClientId),
  );
  const [a, b] = await Promise.all([getDocs(res), getDocs(con)]);
  const byId = new Map<string, SharedProjectDoc>();
  for (const d of a.docs) byId.set(d.id, d.data() as SharedProjectDoc);
  for (const d of b.docs) byId.set(d.id, d.data() as SharedProjectDoc);
  return Array.from(byId.entries()).map(([id, doc]) => ({ id, doc }));
}

export async function listPortalVisibleProjectsForFirm(
  db: Firestore,
  firmId: string,
): Promise<Array<{ id: string; doc: SharedProjectDoc }>> {
  const q = query(
    collection(db, CANONICAL_PROJECTS_COLLECTION),
    where('firmId', '==', firmId),
    where('portalVisible', '==', true),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, doc: d.data() as SharedProjectDoc }));
}

export async function upsertCanonicalClient(
  db: Firestore,
  id: string,
  data: SharedClientDoc,
  merge = true,
): Promise<void> {
  const payload = omitUndefinedDeep(data) as Record<string, unknown>;
  await setDoc(sharedClientDocRef(db, id), payload, { merge });
}

export async function upsertCanonicalProject(
  db: Firestore,
  id: string,
  data: SharedProjectDoc,
  merge = true,
): Promise<void> {
  const payload = omitUndefinedDeep(data) as Record<string, unknown>;
  await setDoc(sharedProjectDocRef(db, id), payload, { merge });
}

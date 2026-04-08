/**
 * Merge Ledger + PlanPort legacy trees into root `clients` and `projects` (canonical).
 *
 * **Prerequisite:** Both datasets exist in the SAME Firestore database (import PlanPort into Ledger project or vice versa).
 *
 * Env:
 *   GOOGLE_APPLICATION_CREDENTIALS
 *   DATA_ROOT_ID — firmId and employees/{id} root
 *
 * Usage:
 *   npx tsx scripts/migrate-shared-db.ts --dry-run
 *   npx tsx scripts/migrate-shared-db.ts
 *   npx tsx scripts/migrate-shared-db.ts --promote-from-shared --dry-run
 *
 * Flags:
 *   --dry-run          No writes
 *   --promote-from-shared  Copy shared_clients → clients, shared_projects → projects (same doc ids)
 *   --batch-size=400 Firestore batch chunk size
 */

import fs from 'node:fs';
import { cert, initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, type Firestore, type DocumentReference } from 'firebase-admin/firestore';
import type { Client, Contractor } from '@/lib/types';
import { mapInternalClientToCanonical, mapInternalContractorToCanonical, mapInternalProjectToCanonical } from '@/lib/shared-data/internal-mappers';
import {
  mapPlanportGcHubToCanonical,
  mapPlanportResidentialHubToCanonical,
  mapPlanportProjectToCanonical,
  type PlanportGcHubInput,
  type PlanportProjectInput,
  type PlanportResidentialHubInput,
} from '@/lib/shared-data/portal-mappers';
import {
  deepMergePreferNonEmpty,
  gcMatchKeys,
  ledgerResidentialMatchKeys,
  mergeSourceRefs,
  planportHubMatchKeys,
} from '@/lib/shared-data/merge-utils';
import type { SharedClientDoc } from '@/lib/shared-data/canonical-types';
import { sharedClientDocIdForLedger, sharedClientDocIdForPlanportHub, sharedProjectDocIdForLedger, sharedProjectDocIdForPlanport } from '@/lib/shared-data/ids';
import {
  CANONICAL_CLIENTS_COLLECTION,
  CANONICAL_PROJECTS_COLLECTION,
  SHARED_CLIENTS_COLLECTION,
  SHARED_PROJECTS_COLLECTION,
} from '@/lib/shared-data/feature-flags';

const dryRun = process.argv.includes('--dry-run');
const promoteFromShared = process.argv.includes('--promote-from-shared');
const batchSizeArg = process.argv.find((a) => a.startsWith('--batch-size='));
const BATCH = Math.min(499, Math.max(1, parseInt(batchSizeArg?.split('=')[1] || '400', 10) || 400));

const actor = process.env.MIGRATION_ACTOR?.trim() || 'migrate-shared-db';

async function flushBatch(db: Firestore, ops: Array<{ ref: DocumentReference; data: Record<string, unknown> }>) {
  if (dryRun || !ops.length) return;
  const batch = db.batch();
  for (const { ref, data } of ops) batch.set(ref, data, { merge: true });
  await batch.commit();
}

async function promoteShared(db: Firestore, report: Record<string, unknown>) {
  const sc = await db.collection(SHARED_CLIENTS_COLLECTION).get();
  const sp = await db.collection(SHARED_PROJECTS_COLLECTION).get();
  report.promoteClients = sc.size;
  report.promoteProjects = sp.size;
  let buf: Array<{ ref: DocumentReference; data: Record<string, unknown> }> = [];
  for (const d of sc.docs) {
    buf.push({ ref: db.collection(CANONICAL_CLIENTS_COLLECTION).doc(d.id), data: d.data() as Record<string, unknown> });
    if (buf.length >= BATCH) {
      await flushBatch(db, buf);
      buf = [];
    }
  }
  await flushBatch(db, buf);
  buf = [];
  for (const d of sp.docs) {
    buf.push({ ref: db.collection(CANONICAL_PROJECTS_COLLECTION).doc(d.id), data: d.data() as Record<string, unknown> });
    if (buf.length >= BATCH) {
      await flushBatch(db, buf);
      buf = [];
    }
  }
  await flushBatch(db, buf);
}

async function fullMerge(db: Firestore, firmId: string, report: Record<string, unknown>) {
  const base = db.collection('employees').doc(firmId);
  const clientSnaps = await base.collection('clients').get();
  const contractorSnaps = await base.collection('contractors').get();
  const projectSnaps = await base.collection('projects').get();

  const indSnap = await db.collection('individualClients').get();
  const gcSnap = await db.collection('generalContractors').get();

  const keyToLedgerClients = new Map<string, string[]>();
  const addKey = (key: string, id: string) => {
    const cur = keyToLedgerClients.get(key) || [];
    if (!cur.includes(id)) cur.push(id);
    keyToLedgerClients.set(key, cur);
  };
  for (const d of clientSnaps.docs) {
    const data = d.data() as { email?: string; billingEmail?: string; accessCode?: string; name?: string };
    for (const k of ledgerResidentialMatchKeys(firmId, data)) addKey(k, d.id);
  }

  const hubToLedgerClient = new Map<string, string>();
  const ambiguousHubs: unknown[] = [];
  for (const hub of indSnap.docs) {
    const data = hub.data() as PlanportResidentialHubInput;
    const candidates = new Set<string>();
    for (const k of planportHubMatchKeys(firmId, data)) {
      for (const lid of keyToLedgerClients.get(k) || []) candidates.add(lid);
    }
    const arr = [...candidates];
    if (arr.length > 1) ambiguousHubs.push({ hubId: hub.id, candidates: arr });
    else if (arr.length === 1) hubToLedgerClient.set(hub.id, arr[0]);
  }

  const ledgerToHubs = new Map<string, string[]>();
  for (const [hubId, ledgerId] of hubToLedgerClient) {
    const arr = ledgerToHubs.get(ledgerId) || [];
    arr.push(hubId);
    ledgerToHubs.set(ledgerId, arr);
  }
  for (const [ledgerId, hubIds] of ledgerToHubs) {
    if (hubIds.length > 1) {
      ambiguousHubs.push({ type: 'multiple_planport_hubs_same_ledger', ledgerId, hubIds });
      for (const h of hubIds) hubToLedgerClient.delete(h);
    }
  }

  const keyToLedgerContractors = new Map<string, string[]>();
  const addKeyToMap = (m: Map<string, string[]>, key: string, id: string) => {
    const cur = m.get(key) || [];
    if (!cur.includes(id)) cur.push(id);
    m.set(key, cur);
  };
  for (const d of contractorSnaps.docs) {
    const data = d.data() as { companyName?: string; billingEmail?: string };
    for (const k of gcMatchKeys(firmId, data.companyName, data.billingEmail)) addKeyToMap(keyToLedgerContractors, k, d.id);
  }

  const gcHubToLedgerContractor = new Map<string, string>();
  const ambiguousGcs: unknown[] = [];
  for (const hub of gcSnap.docs) {
    const data = hub.data() as { name?: string; billingEmail?: string };
    const candidates = new Set<string>();
    for (const k of gcMatchKeys(firmId, data.name, data.billingEmail)) {
      for (const lid of keyToLedgerContractors.get(k) || []) candidates.add(lid);
    }
    const arr = [...candidates];
    if (arr.length > 1) ambiguousGcs.push({ gcHubId: hub.id, candidates: arr });
    else if (arr.length === 1) gcHubToLedgerContractor.set(hub.id, arr[0]);
  }

  const ledgerGcToHubs = new Map<string, string[]>();
  for (const [hubId, ledgerId] of gcHubToLedgerContractor) {
    const arr = ledgerGcToHubs.get(ledgerId) || [];
    arr.push(hubId);
    ledgerGcToHubs.set(ledgerId, arr);
  }
  for (const [ledgerId, hubIds] of ledgerGcToHubs) {
    if (hubIds.length > 1) {
      ambiguousGcs.push({ type: 'multiple_gc_hubs_same_ledger_contractor', ledgerId, hubIds });
      for (const h of hubIds) gcHubToLedgerContractor.delete(h);
    }
  }

  const mergedResidentialDocs = new Map<string, SharedClientDoc>();
  const writtenClientIds = new Set<string>();

  for (const d of clientSnaps.docs) {
    const c = { id: d.id, ...(d.data() as object) } as Client;
    let canon = mapInternalClientToCanonical(firmId, c, actor);
    const hubId = [...hubToLedgerClient.entries()].find(([, lid]) => lid === d.id)?.[0];
    if (hubId) {
      const hubDoc = indSnap.docs.find((x) => x.id === hubId);
      if (hubDoc) {
        const pp = mapPlanportResidentialHubToCanonical(firmId, { id: hubId, ...(hubDoc.data() as object) } as PlanportResidentialHubInput, actor);
        canon = deepMergePreferNonEmpty(canon as unknown as Record<string, unknown>, pp as unknown as Record<string, unknown>) as unknown as SharedClientDoc;
        canon.sourceRefs = mergeSourceRefs(canon.sourceRefs, pp.sourceRefs);
        canon.planportHubId = pp.planportHubId;
        canon.planportHubCollection = pp.planportHubCollection;
      }
    }
    const cid = sharedClientDocIdForLedger(firmId, 'clients', d.id);
    mergedResidentialDocs.set(cid, canon);
    writtenClientIds.add(cid);
  }

  for (const hub of indSnap.docs) {
    if (hubToLedgerClient.has(hub.id)) continue;
    const pp = mapPlanportResidentialHubToCanonical(firmId, { id: hub.id, ...(hub.data() as object) } as PlanportResidentialHubInput, actor);
    const cid = sharedClientDocIdForPlanportHub('individualClients', hub.id);
    if (!writtenClientIds.has(cid)) {
      mergedResidentialDocs.set(cid, pp);
      writtenClientIds.add(cid);
    }
  }

  const mergedContractorDocs = new Map<string, SharedClientDoc>();
  for (const d of contractorSnaps.docs) {
    const c = { id: d.id, ...(d.data() as object) } as Contractor;
    let canon = mapInternalContractorToCanonical(firmId, c, actor);
    const gcHubId = [...gcHubToLedgerContractor.entries()].find(([, lid]) => lid === d.id)?.[0];
    if (gcHubId) {
      const hubDoc = gcSnap.docs.find((x) => x.id === gcHubId);
      if (hubDoc) {
        const pp = mapPlanportGcHubToCanonical(firmId, { id: gcHubId, ...(hubDoc.data() as object) } as PlanportGcHubInput, actor);
        canon = deepMergePreferNonEmpty(canon as unknown as Record<string, unknown>, pp as unknown as Record<string, unknown>) as unknown as SharedClientDoc;
        canon.sourceRefs = mergeSourceRefs(canon.sourceRefs, pp.sourceRefs);
        canon.planportHubId = pp.planportHubId;
        canon.planportHubCollection = pp.planportHubCollection;
      }
    }
    const cid = sharedClientDocIdForLedger(firmId, 'contractors', d.id);
    mergedContractorDocs.set(cid, canon);
    writtenClientIds.add(cid);
  }

  for (const hub of gcSnap.docs) {
    if (gcHubToLedgerContractor.has(hub.id)) continue;
    const pp = mapPlanportGcHubToCanonical(firmId, { id: hub.id, ...(hub.data() as object) } as PlanportGcHubInput, actor);
    const cid = sharedClientDocIdForPlanportHub('generalContractors', hub.id);
    if (!writtenClientIds.has(cid)) {
      mergedContractorDocs.set(cid, pp);
      writtenClientIds.add(cid);
    }
  }

  const legacyClientToCanon = (ledgerClientId: string) => sharedClientDocIdForLedger(firmId, 'clients', ledgerClientId);
  const legacyContractorToCanon = (ledgerContractorId: string) => sharedClientDocIdForLedger(firmId, 'contractors', ledgerContractorId);

  const mergedProjectDocs = new Map<string, Record<string, unknown>>();

  for (const d of projectSnaps.docs) {
    const p = { id: d.id, ...(d.data() as object) } as import('@/lib/types').Project;
    const links = {
      sharedResidentialId: p.clientId ? legacyClientToCanon(p.clientId) : undefined,
      sharedContractorId: p.contractorId ? legacyContractorToCanon(p.contractorId) : undefined,
    };
    const canon = mapInternalProjectToCanonical(firmId, p, links, actor);
    mergedProjectDocs.set(sharedProjectDocIdForLedger(firmId, d.id), canon as unknown as Record<string, unknown>);
  }

  function canonResidentialIdForIndHub(hubId: string): string {
    const ledgerId = hubToLedgerClient.get(hubId);
    if (ledgerId) return legacyClientToCanon(ledgerId);
    return sharedClientDocIdForPlanportHub('individualClients', hubId);
  }

  function canonContractorIdForGcHub(hubId: string): string {
    const ledgerId = gcHubToLedgerContractor.get(hubId);
    if (ledgerId) return legacyContractorToCanon(ledgerId);
    return sharedClientDocIdForPlanportHub('generalContractors', hubId);
  }

  for (const hub of indSnap.docs) {
    const ps = await hub.ref.collection('projects').get();
    for (const pd of ps.docs) {
      const proj = { id: pd.id, ...(pd.data() as object) } as PlanportProjectInput;
      const links: { sharedResidentialId?: string; sharedContractorId?: string } = {
        sharedResidentialId: canonResidentialIdForIndHub(hub.id),
      };
      if (proj.generalContractorId) {
        links.sharedContractorId = canonContractorIdForGcHub(String(proj.generalContractorId));
      }
      const canon = mapPlanportProjectToCanonical(firmId, 'individualClients', hub.id, proj, links, actor);
      mergedProjectDocs.set(sharedProjectDocIdForPlanport('individualClients', hub.id, pd.id), canon as unknown as Record<string, unknown>);
    }
  }

  for (const hub of gcSnap.docs) {
    const ps = await hub.ref.collection('projects').get();
    for (const pd of ps.docs) {
      const proj = { id: pd.id, ...(pd.data() as object) } as PlanportProjectInput;
      const links: { sharedResidentialId?: string; sharedContractorId?: string } = {
        sharedContractorId: canonContractorIdForGcHub(hub.id),
      };
      if (proj.individualClientId) {
        links.sharedResidentialId = canonResidentialIdForIndHub(String(proj.individualClientId));
      }
      const canon = mapPlanportProjectToCanonical(firmId, 'generalContractors', hub.id, proj, links, actor);
      mergedProjectDocs.set(sharedProjectDocIdForPlanport('generalContractors', hub.id, pd.id), canon as unknown as Record<string, unknown>);
    }
  }

  let buf: Array<{ ref: DocumentReference; data: Record<string, unknown> }> = [];
  for (const [id, data] of mergedResidentialDocs) {
    buf.push({ ref: db.collection(CANONICAL_CLIENTS_COLLECTION).doc(id), data: data as unknown as Record<string, unknown> });
    if (buf.length >= BATCH) {
      await flushBatch(db, buf);
      buf = [];
    }
  }
  await flushBatch(db, buf);
  buf = [];
  for (const [id, data] of mergedContractorDocs) {
    buf.push({ ref: db.collection(CANONICAL_CLIENTS_COLLECTION).doc(id), data: data as unknown as Record<string, unknown> });
    if (buf.length >= BATCH) {
      await flushBatch(db, buf);
      buf = [];
    }
  }
  await flushBatch(db, buf);
  buf = [];
  for (const [id, data] of mergedProjectDocs) {
    buf.push({ ref: db.collection(CANONICAL_PROJECTS_COLLECTION).doc(id), data });
    if (buf.length >= BATCH) {
      await flushBatch(db, buf);
      buf = [];
    }
  }
  await flushBatch(db, buf);

  report.ledgerClients = clientSnaps.size;
  report.ledgerContractors = contractorSnaps.size;
  report.ledgerProjects = projectSnaps.size;
  report.planportIndividualHubs = indSnap.size;
  report.planportGcHubs = gcSnap.size;
  report.canonicalClientWrites = mergedResidentialDocs.size + mergedContractorDocs.size;
  report.canonicalProjectWrites = mergedProjectDocs.size;
  report.ambiguousIndividualHubs = ambiguousHubs;
  report.ambiguousGcHubs = ambiguousGcs;
}

async function main() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const dataRootId = process.env.DATA_ROOT_ID?.trim();
  if (!credPath || !fs.existsSync(credPath)) {
    console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path.');
    process.exit(1);
  }
  if (!dataRootId) {
    console.error('Set DATA_ROOT_ID (Ledger firm / employees root id).');
    process.exit(1);
  }
  const json = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  const app = initializeApp({ credential: cert(json) }, 'migrate-shared-db');
  const db = getFirestore(app);
  const report: Record<string, unknown> = { dryRun, firmId: dataRootId };
  console.log(`Mode: ${dryRun ? 'dry-run' : 'write'}, batch=${BATCH}`);
  if (promoteFromShared) {
    await promoteShared(db, report);
  } else {
    await fullMerge(db, dataRootId, report);
  }
  console.log(JSON.stringify(report, null, 2));
  await deleteApp(app);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
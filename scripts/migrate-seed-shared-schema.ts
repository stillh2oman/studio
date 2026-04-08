/**
 * Non-destructive seed of `shared_clients` / `shared_projects` from Ledger legacy paths.
 *
 * Prerequisites:
 * - Service account JSON with Firestore read/write on the target project.
 * - `DATA_ROOT_ID` = employees/{id} data root (boss id) to migrate.
 *
 * Usage:
 *   npx tsx scripts/migrate-seed-shared-schema.ts --dry-run
 *   npx tsx scripts/migrate-seed-shared-schema.ts --merge
 *
 * Env:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json
 *   DATA_ROOT_ID=yourBossEmployeeId
 *   MIGRATION_ACTOR=optional label stored in updatedBy
 */

import fs from 'node:fs';
import { cert, initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { Client, Contractor, Project } from '@/lib/types';
import {
  mapInternalClientToCanonical,
  mapInternalContractorToCanonical,
  mapInternalProjectToCanonical,
} from '@/lib/shared-data/internal-mappers';
import {
  sharedClientDocIdForLedger,
  sharedProjectDocIdForLedger,
} from '@/lib/shared-data/ids';
import {
  CANONICAL_CLIENTS_COLLECTION,
  CANONICAL_PROJECTS_COLLECTION,
} from '@/lib/shared-data/feature-flags';

const dryRun = process.argv.includes('--dry-run');
const merge = process.argv.includes('--merge') || !process.argv.includes('--no-merge');

const actor = process.env.MIGRATION_ACTOR?.trim() || 'migrate-seed-shared-schema';

function asClient(id: string, data: Record<string, unknown>): Client {
  return { id, ...data } as Client;
}

function asContractor(id: string, data: Record<string, unknown>): Contractor {
  return { id, ...data } as Contractor;
}

function asProject(id: string, data: Record<string, unknown>): Project {
  return { id, ...data } as Project;
}

async function main() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const dataRootId = process.env.DATA_ROOT_ID?.trim();
  if (!credPath || !fs.existsSync(credPath)) {
    console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a readable service account JSON path.');
    process.exit(1);
  }
  if (!dataRootId) {
    console.error('Set DATA_ROOT_ID to the Ledger employees/{id} root (boss / data root).');
    process.exit(1);
  }

  const json = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  const app = initializeApp({ credential: cert(json) }, 'migrate-shared');
  const db = getFirestore(app);

  const firmId = dataRootId;
  const base = db.collection('employees').doc(dataRootId);

  const clientSnaps = await base.collection('clients').get();
  const contractorSnaps = await base.collection('contractors').get();
  const projectSnaps = await base.collection('projects').get();

  const report = {
    clientsWritten: 0,
    contractorsWritten: 0,
    projectsWritten: 0,
    projectMissingClientLink: 0,
    projectMissingContractorLink: 0,
    errors: [] as string[],
  };

  const legacyClientToShared = new Map<string, string>();
  const legacyContractorToShared = new Map<string, string>();

  console.log(
    `Found ${clientSnaps.size} clients, ${contractorSnaps.size} contractors, ${projectSnaps.size} projects under employees/${dataRootId}.`,
  );
  console.log(`Mode: ${dryRun ? 'dry-run' : 'write'}, merge=${merge}`);

  for (const d of clientSnaps.docs) {
    const sid = sharedClientDocIdForLedger(firmId, 'clients', d.id);
    legacyClientToShared.set(d.id, sid);
    const canonical = mapInternalClientToCanonical(firmId, asClient(d.id, d.data() as Record<string, unknown>), actor);
    try {
      if (dryRun) {
        console.log(`[dry-run] ${CANONICAL_CLIENTS_COLLECTION}/${sid}`);
      } else {
        await db.collection(CANONICAL_CLIENTS_COLLECTION).doc(sid).set(canonical, { merge });
      }
      report.clientsWritten += 1;
    } catch (e) {
      report.errors.push(`client ${d.id}: ${(e as Error).message}`);
    }
  }

  for (const d of contractorSnaps.docs) {
    const sid = sharedClientDocIdForLedger(firmId, 'contractors', d.id);
    legacyContractorToShared.set(d.id, sid);
    const canonical = mapInternalContractorToCanonical(
      firmId,
      asContractor(d.id, d.data() as Record<string, unknown>),
      actor,
    );
    try {
      if (dryRun) {
        console.log(`[dry-run] ${CANONICAL_CLIENTS_COLLECTION}/${sid}`);
      } else {
        await db.collection(CANONICAL_CLIENTS_COLLECTION).doc(sid).set(canonical, { merge });
      }
      report.contractorsWritten += 1;
    } catch (e) {
      report.errors.push(`contractor ${d.id}: ${(e as Error).message}`);
    }
  }

  for (const d of projectSnaps.docs) {
    const p = asProject(d.id, d.data() as Record<string, unknown>);
    const sharedResidentialId = p.clientId ? legacyClientToShared.get(p.clientId) : undefined;
    const sharedContractorId = p.contractorId ? legacyContractorToShared.get(p.contractorId) : undefined;
    if (p.clientId && !sharedResidentialId) {
      report.projectMissingClientLink += 1;
      report.errors.push(`project ${d.id}: clientId ${p.clientId} has no shared_clients row (missing legacy client?)`);
    }
    if (p.contractorId && !sharedContractorId) {
      report.projectMissingContractorLink += 1;
      report.errors.push(
        `project ${d.id}: contractorId ${p.contractorId} has no shared_clients row (missing legacy contractor?)`,
      );
    }
    const canonical = mapInternalProjectToCanonical(
      firmId,
      p,
      { sharedResidentialId, sharedContractorId },
      actor,
    );
    const pid = sharedProjectDocIdForLedger(firmId, d.id);
    try {
      if (dryRun) {
        console.log(`[dry-run] ${CANONICAL_PROJECTS_COLLECTION}/${pid}`);
      } else {
        await db.collection(CANONICAL_PROJECTS_COLLECTION).doc(pid).set(canonical, { merge });
      }
      report.projectsWritten += 1;
    } catch (e) {
      report.errors.push(`project ${d.id}: ${(e as Error).message}`);
    }
  }

  console.log(JSON.stringify(report, null, 2));
  await deleteApp(app);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Non-destructive backfill of `externalId` on Ledger legacy clients + projects.
 *
 * Deterministic (idempotent):
 * - clients: `ld-cli-{dataRootId}-{clientDocId}`
 * - projects: `ld-prj-{dataRootId}-{projectDocId}`
 *
 * Usage:
 *   npx tsx scripts/ledger-backfill-external-ids.ts --dry-run
 *   npx tsx scripts/ledger-backfill-external-ids.ts --merge
 *
 * Writes only with `--merge` and without `--dry-run` on the same command.
 *
 * Env:
 *   GOOGLE_APPLICATION_CREDENTIALS
 *   DATA_ROOT_ID — employees/{id} data root
 */

import fs from 'node:fs';
import { cert, initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const hasMerge = process.argv.includes('--merge');
const hasDry = process.argv.includes('--dry-run');
const apply = hasMerge && !hasDry;
const preview = !apply;

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const dataRootId = process.env.DATA_ROOT_ID?.trim();

if (!credPath || !fs.existsSync(credPath)) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a readable service account JSON path.');
  process.exit(1);
}
if (!dataRootId) {
  console.error('Set DATA_ROOT_ID to the Ledger employees/{id} data root.');
  process.exit(1);
}

function seg(s: string) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function main() {
  const json = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  const app = initializeApp({ credential: cert(json) }, 'ld-extid-backfill');
  const db = getFirestore(app);

  const base = db.collection('employees').doc(dataRootId);
  const clients = await base.collection('clients').get();
  const projects = await base.collection('projects').get();

  let clientsUpdated = 0;
  let clientsSkipped = 0;
  let projectsUpdated = 0;
  let projectsSkipped = 0;

  console.log(JSON.stringify({ apply, preview }, null, 2));

  for (const d of clients.docs) {
    const data = d.data() as Record<string, unknown>;
    const ext = `ld-cli-${seg(dataRootId)}-${seg(d.id)}`;
    if (data.externalId) {
      clientsSkipped += 1;
      continue;
    }
    if (preview) console.log(`[preview] clients/${d.id} ← ${ext}`);
    if (apply) await d.ref.set({ externalId: ext }, { merge: true });
    clientsUpdated += 1;
  }

  for (const d of projects.docs) {
    const data = d.data() as Record<string, unknown>;
    const ext = `ld-prj-${seg(dataRootId)}-${seg(d.id)}`;
    if (data.externalId) {
      projectsSkipped += 1;
      continue;
    }
    if (preview) console.log(`[preview] projects/${d.id} ← ${ext}`);
    if (apply) await d.ref.set({ externalId: ext }, { merge: true });
    projectsUpdated += 1;
  }

  console.log(
    JSON.stringify({ clientsUpdated, clientsSkipped, projectsUpdated, projectsSkipped }, null, 2),
  );
  await deleteApp(app);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});

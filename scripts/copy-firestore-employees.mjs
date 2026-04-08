/**
 * Copy Firestore `employees` documents from a SOURCE project to a DESTINATION project
 * (this app's Firebase project).
 *
 * Prerequisites:
 * 1. Google Cloud Console → IAM → create or use a service account on EACH project.
 * 2. Source SA: role "Cloud Datastore User" or at least read access to Firestore.
 * 3. Dest SA: "Cloud Datastore User" (read/write) on the destination project.
 * 4. Download JSON keys; keep them secret and never commit them.
 *
 * Usage:
 *   node scripts/copy-firestore-employees.mjs --dry-run
 *   node scripts/copy-firestore-employees.mjs --profiles-only
 *   node scripts/copy-firestore-employees.mjs --full
 *   node scripts/copy-firestore-employees.mjs --full --merge
 *
 * Env:
 *   SOURCE_SERVICE_ACCOUNT_PATH=path/to/source-key.json
 *   DEST_SERVICE_ACCOUNT_PATH=path/to/dest-key.json
 *
 * Modes:
 *   --profiles-only  Only top-level fields on documents in `employees/{id}` (no subcollections).
 *                    Use this if you will restore clients/projects/tasks from a backup JSON into
 *                    the destination, and only need login profiles + bossId links.
 *   --full           Copies each employee doc and ALL subcollections recursively (can duplicate
 *                    a full ledger if the source root employee had clients/projects/...).
 *   --merge          Use set(..., { merge: true }) so existing fields on dest are preserved
 *                    when the source doc omits them.
 *   --dry-run        Log paths only; no writes.
 */

import fs from 'fs';
import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const SOURCE_SA = process.env.SOURCE_SERVICE_ACCOUNT_PATH;
const DEST_SA = process.env.DEST_SERVICE_ACCOUNT_PATH;

const dryRun = process.argv.includes('--dry-run');
const merge = process.argv.includes('--merge');
const profilesOnly = process.argv.includes('--profiles-only');
const full = process.argv.includes('--full');

if (!profilesOnly && !full) {
  console.error('Choose one: --profiles-only (recommended with JSON backup) or --full');
  process.exit(1);
}

if (!SOURCE_SA || !DEST_SA) {
  console.error('Set environment variables:');
  console.error('  SOURCE_SERVICE_ACCOUNT_PATH');
  console.error('  DEST_SERVICE_ACCOUNT_PATH');
  process.exit(1);
}

async function copySubcollectionsRecursive(sourceDocRef, destDocRef) {
  const cols = await sourceDocRef.listCollections();
  for (const col of cols) {
    const subSnap = await col.get();
    for (const d of subSnap.docs) {
      const destChild = destDocRef.collection(col.id).doc(d.id);
      if (dryRun) {
        console.log('[dry-run] would write', destChild.path);
      } else {
        if (merge) await destChild.set(d.data(), { merge: true });
        else await destChild.set(d.data());
      }
      await copySubcollectionsRecursive(d.ref, destChild);
    }
  }
}

async function main() {
  const srcJson = JSON.parse(fs.readFileSync(SOURCE_SA, 'utf8'));
  const dstJson = JSON.parse(fs.readFileSync(DEST_SA, 'utf8'));

  const sourceApp = initializeApp({ credential: cert(srcJson) }, 'emp-copy-src');
  const destApp = initializeApp({ credential: cert(dstJson) }, 'emp-copy-dst');

  const sourceDb = getFirestore(sourceApp);
  const destDb = getFirestore(destApp);

  const snap = await sourceDb.collection('employees').get();
  console.log(`Found ${snap.size} employee document(s) at source.`);

  for (const doc of snap.docs) {
    const destDoc = destDb.collection('employees').doc(doc.id);
    if (dryRun) {
      console.log('[dry-run] would write', destDoc.path, profilesOnly ? '(profile only)' : '(+ subcollections)');
    } else {
      if (merge) await destDoc.set(doc.data(), { merge: true });
      else await destDoc.set(doc.data());
      console.log('Wrote', destDoc.path);
    }

    if (!profilesOnly) {
      await copySubcollectionsRecursive(doc.ref, destDoc);
    }
  }

  await deleteApp(sourceApp);
  await deleteApp(destApp);
  console.log(dryRun ? 'Dry run finished.' : 'Copy finished.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

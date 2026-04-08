/**
 * Compare legacy vs canonical counts and spot-check required fields.
 *
 * Env: GOOGLE_APPLICATION_CREDENTIALS, DATA_ROOT_ID
 * Usage: npx tsx scripts/validate-shared-db.ts
 */

import fs from 'node:fs';
import { cert, initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  CANONICAL_CLIENTS_COLLECTION,
  CANONICAL_PROJECTS_COLLECTION,
} from '@/lib/shared-data/feature-flags';

async function main() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const dataRootId = process.env.DATA_ROOT_ID?.trim();
  if (!credPath || !fs.existsSync(credPath) || !dataRootId) {
    console.error('Set GOOGLE_APPLICATION_CREDENTIALS and DATA_ROOT_ID');
    process.exit(1);
  }
  const json = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  const app = initializeApp({ credential: cert(json) }, 'validate-shared-db');
  const db = getFirestore(app);
  const base = db.collection('employees').doc(dataRootId);

  const [legC, legCo, legP, canonC, canonP] = await Promise.all([
    base.collection('clients').get(),
    base.collection('contractors').get(),
    base.collection('projects').get(),
    db.collection(CANONICAL_CLIENTS_COLLECTION).where('firmId', '==', dataRootId).get(),
    db.collection(CANONICAL_PROJECTS_COLLECTION).where('firmId', '==', dataRootId).get(),
  ]);

  let canonicalRowsMissingLedgerLink = 0;
  let projectsMissingLedgerProject = 0;
  for (const d of canonC.docs) {
    const x = d.data() as { accountKind?: string; ledgerClientId?: string; ledgerContractorId?: string };
    if (x.accountKind === 'residential' && !x.ledgerClientId) canonicalRowsMissingLedgerLink += 1;
    if (x.accountKind === 'contractor' && !x.ledgerContractorId) canonicalRowsMissingLedgerLink += 1;
  }
  for (const d of canonP.docs) {
    const x = d.data() as { ledgerProjectId?: string };
    if (!x.ledgerProjectId) projectsMissingLedgerProject += 1;
  }

  const report = {
    legacy: {
      clients: legC.size,
      contractors: legCo.size,
      projects: legP.size,
    },
    canonical: {
      clientsAndContractors: canonC.size,
      projects: canonP.size,
    },
    hints: {
      canonicalRowsWithoutLedgerClientOrContractorId: canonicalRowsMissingLedgerLink,
      canonicalProjectsWithoutLedgerProjectId: projectsMissingLedgerProject,
      note:
        'PlanPort-only rows may lack ledger* ids until linked. Ledger-only projects lack ledgerProjectId only if migration omitted them.',
    },
  };
  console.log(JSON.stringify(report, null, 2));
  await deleteApp(app);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

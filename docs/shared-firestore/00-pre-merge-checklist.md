# Pre-merge checklist — Firestore export & staging

Complete **before** running `npm run migrate:shared-db` against production.

## 1. Managed export to Cloud Storage

From [Google Cloud Shell](https://shell.cloud.google.com) or any machine with `gcloud` authenticated to the **target** project:

```bash
# Set your project (Ledger or the merged project you will use as system of record)
gcloud config set project YOUR_PROJECT_ID

export BUCKET=your-backup-bucket
export PREFIX=firestore-backups/2026-04-06-pre-merge/$(date -u +%Y%m%dT%H%M%SZ)

gcloud firestore export "gs://${BUCKET}/${PREFIX}"
```

Use a **dedicated bucket** in the same region as Firestore when possible. The Console path will look like:

`gs://your-bucket/firestore-backups/2026-04-06-pre-merge/20260406T153022Z/`

## 2. Verify export finished

- **Console:** Firestore → Import/Export → confirm the operation succeeded.
- Or: `gcloud firestore operations list` and check the latest `EXPORT_DOCUMENTS` operation is `DONE` without error.

## 3. Optional: import into a separate test database

If you use a **named** non-default Firestore database for staging:

```bash
gcloud firestore import "gs://${BUCKET}/${PREFIX}/..." --database=staging-db-id
```

Spot-check in Console: open `employees/{dataRoot}/clients`, `individualClients`, and after migration `clients` / `projects`.

## 4. App checklist

- [ ] Both codebases point at the **same** Firebase project (or you have imported PlanPort data into Ledger’s project).
- [ ] `firebase deploy --only firestore:indexes` (Ledger) so composite queries on `clients` / `projects` succeed.
- [ ] `firebase deploy --only firestore:rules` after reviewing `firestore.rules` (staff-only v1 for `clients` / `projects`).
- [ ] Set `NEXT_PUBLIC_CANONICAL_FIRM_ID` in PlanPort to the Ledger **data root** employee id (same as `DATA_ROOT_ID` in migration).
- [ ] Run `npm run migrate:shared-db -- --dry-run`, then `npm run validate:shared-db`, then live migrate without `--dry-run`.
- [ ] Enable `NEXT_PUBLIC_DATA_ACCESS_MODE=canonical_read` in a **preview** build before `canonical_read_write`.

## 5. Rollback

- Revert env to `NEXT_PUBLIC_DATA_ACCESS_MODE=legacy` (or unset).
- Restore from the GCS export via Firestore **Import** (plan downtime; test on staging first).
- Legacy paths under `employees/...` are **not** deleted by migration scripts.

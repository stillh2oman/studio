# Phases 6–7 — Migration, rollback, staged cutover

## Non-destructive principles

1. **Never delete** `employees/{firmId}/clients`, `projects`, `individualClients`, etc. during initial migration.
2. **Only add** documents under `shared_clients` and `shared_projects`.
3. **Backup** Firestore (Google export or `gcloud firestore export`) before first write.
4. Migration script supports **`--dry-run`** (log only).

## Feature flags (env)

| Variable | Values | Meaning |
|----------|--------|---------|
| `NEXT_PUBLIC_DATA_ACCESS_MODE` | `legacy` (default) | App behavior unchanged; only legacy paths. |
| | `canonical_read` | (future) UI reads `shared_*` via repository + maps to legacy view. |
| | `canonical_read_write` | (future) Writes go to `shared_*` and optionally dual-write to legacy. |

PlanPort: same variable name for consistency.

## Staged rollout

1. **Seed** `shared_*` from Ledger (script: `employees/{firmId}/...`).
2. **Validate** counts and sample docs in Console.
3. **Seed** from PlanPort (second script run or cross-project export — **only after** both apps target same project OR you run two scripts and merge IDs manually).
4. **Link** rows using `sourceRefs` and optional manual spreadsheet for `ledgerClientId` ↔ `planportHubId`.
5. Enable **`canonical_read`** in a staging build; smoke-test both apps.
6. Enable **`canonical_read_write`** only after dual-write logic is implemented and tested.
7. **Retire** duplicate writes when comfortable; archive legacy collections later (explicit approval).

## Rollback

- Turn `NEXT_PUBLIC_DATA_ACCESS_MODE` back to `legacy`.
- `shared_*` data can remain (ignored) or be deleted in bulk after export — **not** required for rollback.

## Scripts

### Ledger (`Ledger 3 Files`)

Uses `DATA_ROOT_ID` = `employees/{id}` data root (boss id).

```bash
cd "Ledger 3 Files"
npm install
set DATA_ROOT_ID=YOUR_BOSS_EMPLOYEE_ID
set GOOGLE_APPLICATION_CREDENTIALS=path\to\key.json
npm run migrate:shared-seed -- --dry-run
npm run migrate:shared-seed
```

### PlanPort (`PlanPort Files`)

Uses `CANONICAL_FIRM_ID` — after both apps use one Firebase project, set this to the same value as Ledger’s `DATA_ROOT_ID`. Until then you may use a placeholder (for example `planport:studio-5055895818-5ccef`) and reconcile `firmId` when merging projects.

```bash
cd "PlanPort Files"
set CANONICAL_FIRM_ID=YOUR_FIRM_KEY
set GOOGLE_APPLICATION_CREDENTIALS=path\to\planport-key.json
npm run migrate:planport-shared-seed -- --dry-run
npm run migrate:planport-shared-seed
```

**Idempotency:** both scripts use `set(..., { merge: true })` with deterministic `shared_*` document ids so re-runs update without duplicating rows.

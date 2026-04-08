# Merge runbook — canonical `clients` / `projects`

## Canonical schema (summary)

- **`clients/{canonicalClientId}`** — `SharedClientDoc`: `firmId`, `accountKind` (`residential` | `contractor`), `displayName`, emails/phone, `ledgerClientId` / `ledgerContractorId`, `planportHubId` + `planportHubCollection`, `extensionLedger`, `extensionPlanport`, `sourceRefs`, `schemaVersion`, timestamps.
- **`projects/{canonicalProjectId}`** — `SharedProjectDoc`: `firmId`, `projectName`, links `residentialClientId` / `contractorClientId` (canonical client doc ids), `ledgerProjectId`, `planportProjectPath`, extensions, `sourceRefs`, `schemaVersion`.

Legacy paths **stay**: `employees/{dataRootId}/clients|contractors|projects`, `individualClients/...`, `generalContractors/...`.

## Conflict / merge rules (`scripts/migrate-shared-db.ts`)

| Situation | Behavior |
|-----------|----------|
| PlanPort hub ↔ Ledger client | Match on normalized email, access code, or display name keys. **Multiple Ledger candidates** → hub listed in `ambiguousIndividualHubs`, **no** auto-merge. |
| Multiple hubs → same Ledger | **Unlinked**; listed in `ambiguousIndividualHubs` as `multiple_planport_hubs_same_ledger`. |
| Same for GC / contractors | Parallel logic; `ambiguousGcHubs`. |
| Ledger + matched hub | Merge: Ledger canonical base + PlanPort fields via `deepMergePreferNonEmpty`; `sourceRefs` union. |
| Unmatched hub | PlanPort-only row under deterministic `sc_pp_*` id. |
| Projects | All Ledger projects written; all PlanPort subcollection projects written (may overlap conceptually with Ledger — review duplicates manually). |

## Commands

**Export first** — see `00-pre-merge-checklist.md`.

```powershell
cd "e:\Ledger 3 Files"
$env:GOOGLE_APPLICATION_CREDENTIALS="path\to\sa.json"
$env:DATA_ROOT_ID="YOUR_BOSS_DATA_ROOT_ID"
npm run migrate:shared-db -- --dry-run
npm run migrate:shared-db
npm run validate:shared-db
```

**Promote old `shared_*` collections** (if you already seeded them):

```powershell
npm run migrate:shared-db -- --promote-from-shared --dry-run
npm run migrate:shared-db -- --promote-from-shared
```

## App rollout

1. Deploy Firestore **indexes** and **rules** (`firestore.indexes.json`, `firestore.rules`).
2. **Ledger:** `NEXT_PUBLIC_DATA_ACCESS_MODE=canonical_read` → verify UI; then `canonical_read_write` for dual-write.
3. **PlanPort:** `NEXT_PUBLIC_CANONICAL_FIRM_ID=<same as DATA_ROOT_ID>` and `NEXT_PUBLIC_DATA_ACCESS_MODE=canonical_read` for admin directory.
4. PlanPort **writes** (`CreateClientDialog`, etc.) still target legacy hub paths unless you add dual-write there (manual follow-up).

## Rollback

- Set `NEXT_PUBLIC_DATA_ACCESS_MODE=legacy` (or unset) in both apps.
- Restore Firestore from GCS export if needed.
- Do not delete legacy collections.

## Manual review

- Rows in `ambiguousIndividualHubs` / `ambiguousGcHubs`.
- PlanPort-only clients without `ledgerClientId` (Ledger won’t bill-link until linked).
- Possible duplicate **projects** (Ledger `sp_leg_*` vs PlanPort `sp_pp_*`) for the same job.

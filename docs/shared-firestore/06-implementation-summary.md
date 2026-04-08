# Implementation summary — shared Firestore (Ledger + PlanPort)

## What was added

### Ledger (`Ledger 3 Files`)

| Area | Path |
|------|------|
| Canonical types | `src/lib/shared-data/canonical-types.ts` |
| Feature flags / collection names | `src/lib/shared-data/feature-flags.ts` |
| Deterministic ids | `src/lib/shared-data/ids.ts` |
| Ledger ↔ canonical mappers | `src/lib/shared-data/internal-mappers.ts` |
| PlanPort hub/project ↔ canonical mappers | `src/lib/shared-data/portal-mappers.ts` |
| Repository (client Firestore SDK) | `src/lib/shared-data/canonical-repository.ts` |
| Barrel export | `src/lib/shared-data/index.ts` |
| Mapper tests (Node test runner + tsx) | `src/lib/shared-data/mappers.node-test.ts` |
| Ledger legacy → shared seed (Admin SDK) | `scripts/migrate-seed-shared-schema.ts` |
| Composite indexes (queries on `shared_projects`) | `firestore.indexes.json` |
| Dev-only canonical count log | `src/hooks/use-ledger-data.ts` when `NEXT_PUBLIC_DATA_ACCESS_MODE=canonical_read` (non-production only) |

**npm scripts:** `migrate:shared-seed`, `test:shared-mappers` (requires `tsx` devDependency).

### PlanPort (`PlanPort Files`)

Mirrored module (keep field-for-field in sync with Ledger under `src/lib/shared-data/`, except Ledger-only `internal-mappers.ts`):

- `canonical-types.ts`, `feature-flags.ts`, `ids.ts`, `portal-mappers.ts`, `canonical-repository.ts`, `index.ts`
- `scripts/migrate-planport-seed-shared.ts`
- **npm script:** `migrate:planport-shared-seed`

## Not done (intentional / next steps)

- **Single Firebase project:** production still uses two `projectId` values until you consolidate; shared collections only help after one backend (or a sync job) is chosen.
- **UI cutover:** Ledger still reads/writes only legacy `employees/{dataRootId}/…` paths. `canonical_read` only triggers a dev console count of `shared_clients`; it does not replace list views yet.
- **Dual-write:** no automatic write to `shared_*` on client save; use migration scripts or add hooks later.
- **Firestore rules:** draft remains in `docs/shared-firestore/05-firestore-rules-draft.rules` — not wired into deploy until you confirm auth/claims strategy.
- **Linking Ledger ↔ PlanPort rows:** after merge, align `firmId` and use `sourceRefs` (and optional manual map) to connect the same real-world client across apps.

## Open decisions

1. Which Firebase project becomes system of record, and when to repoint each app’s `firebase` config.
2. Final `CANONICAL_FIRM_ID` / `DATA_ROOT_ID` alignment after merge.
3. Whether contractors duplicated only under `clients` (not `contractors`) need an extended migration pass for `shared_clients` + project `contractorClientId` links.

## Rollback

- Set `NEXT_PUBLIC_DATA_ACCESS_MODE` to `legacy` (default).
- Leave `shared_*` in place; legacy paths remain authoritative until you cut reads over.

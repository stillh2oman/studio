# PlanPort ↔ Ledger 3 — shared client/project sync schema

This document is the **contract** for syncing **clients** and **projects** between **PlanPort** and **Ledger 3** while **keeping separate Firebase databases**. It complements existing internal docs under `docs/shared-firestore/` (which assumed a possible single-project merge).

---

## 1. Current schema comparison (summary)

### PlanPort — `individualClients/{hubId}`

| Firestore field | Type | Required (UI) | Notes |
|-----------------|------|-----------------|--------|
| `id` | string | yes (generated) | Local doc id — **not** the cross-app sync key. |
| `externalId` | string | optional (backfilled / new creates) | **Cross-app sync key** after this work. |
| `husbandName`, `wifeName` | string / null | primary name required | Display name composed in mappers. |
| `accessCode`, `email`, `billingEmail`, `phone` | string / null | access + project name for first project | |
| `address`, `allowDownloads`, `additionalContacts[]`, `sourceApp`, timestamps | | | PlanPort-specific as needed. |

### PlanPort — `individualClients/{hubId}/projects/{projectId}`

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Local id — **not** sync key. |
| `externalId` | string | **Cross-app sync key** (new + migration). |
| `name`, `ownerName`, `address`, `status`, `designerName`, `renderingUrl` | strings | `status` often `"Draft Phase"`. |
| `individualClientId`, `generalContractorId` | string / null | Relationship inside PlanPort. |
| `onboardingIntake` | object | PlanPort-only; preserved in `planportExtension` / `extensionPlanport` on Ledger when imported. |

### PlanPort — `generalContractors/{gcId}` (+ `projects` subcollection)

Same pattern: GC hubs use `name`, `contacts`, `logoUrl`, etc. Map through `accountKind: 'contractor'` (see `portal-mappers.ts`).

### Ledger — `employees/{firmId}/clients/{clientId}` (`Client`)

| Field | Type | Sync |
|-------|------|------|
| `id` | string | Local only. |
| `externalId` | string? | **Cross-app sync key.** |
| `name`, `firstName`, `lastName`, `email`, `phoneNumber`, `billingEmail`, `accessCode`, `projectAddress`, `permitPdfDownloads`, `additionalStakeholders`, … | | Shared fields mapped from canonical / v2 wire. |
| `planportExtension` | object? | Optional bag for unmapped PlanPort JSON. |

### Ledger — `employees/{firmId}/projects/{projectId}` (`Project`)

| Field | Type | Sync |
|-------|------|------|
| `id` | string | Local only. |
| `externalId` | string? | **Cross-app sync key.** |
| `name`, `clientId`, `address`, `status`, `designer`, `renderingUrl`, `lat`, `lng`, … | | `designer` is a strict union in Ledger; importer coerces unknown strings to a default. |
| `planportExtension` | object? | Stores PlanPort-only intake where needed. |

### Canonical docs (`SharedClientDoc` / `SharedProjectDoc`)

Used for **Ledger-led field names** on the wire and for optional root `clients` / `projects` collections (see `feature-flags.ts`). Now include optional `externalId`.

---

## 2. Canonical schema (Ledger-led)

- **Type aliases:** `CanonicalClient` = `SharedClientDoc`, `CanonicalProject` = `SharedProjectDoc` (`src/lib/shared-data/canonical-types.ts`).
- **Stored doc version:** `schemaVersion: 1` (`SHARED_SCHEMA_VERSION`) on canonical Firestore rows.
- **Transfer package version:** `schemaVersion: 2` (`SYNC_TRANSFER_SCHEMA_VERSION`) on JSON envelopes (distinct from stored doc version).

---

## 3. Field mapping table (high level)

| Canonical (wire) | PlanPort source | Ledger `Client` / `Project` |
|------------------|-----------------|-------------------------------|
| `displayName` | husband+wife or husband | `name` |
| `primaryEmail` | `email` | `email` |
| `primaryPhone` | `phone` | `phoneNumber` |
| `billingEmail` | `billingEmail` | `billingEmail` |
| `accessCode` | `accessCode` | `accessCode` |
| `address` (client) | hub `address` / project address context | `projectAddress` |
| `contacts` | `additionalContacts` | `additionalStakeholders` (shape normalized) |
| `extensionPlanport.*` | `husbandName`, `wifeName`, `allowDownloads`, `onboardingIntake`, … | also copied into `planportExtension` on Ledger when present |
| `projectName` | `name` | `name` |
| `address` (project) | `address` | `address` |
| `status` | string | `ProjectStatus` (coerced; `"Draft*"` → `Initial Meeting`) |
| `designerName` | `designerName` | `designer` (coerced to union) |
| `renderingUrl` | `renderingUrl` | `renderingUrl` |

Full detail remains in `docs/shared-firestore/03-field-mapping.md` and in `portal-mappers.ts` / `internal-mappers.ts`.

---

## 4. Transfer JSON (v2 envelope)

**Match key:** `client.externalId` and `project.externalId` — never local Firestore ids.

```json
{
  "schemaVersion": 2,
  "exportedAt": "2026-04-13T12:00:00.000Z",
  "sourceApp": "planport",
  "firmId": "optional-ledger-data-root",
  "client": {
    "externalId": "550e8400-e29b-41d4-a716-446655440000",
    "canonical": {
      "schemaVersion": 1,
      "firmId": "unknown-firm",
      "accountKind": "residential",
      "displayName": "Pat & Chris Smith",
      "primaryEmail": "pat@example.com",
      "extensionPlanport": { "husbandName": "Pat", "wifeName": "Chris" }
    }
  },
  "project": {
    "externalId": "660e8400-e29b-41d4-a716-446655440001",
    "clientExternalId": "550e8400-e29b-41d4-a716-446655440000",
    "canonical": {
      "schemaVersion": 1,
      "firmId": "unknown-firm",
      "projectName": "Lakeside Remodel",
      "status": "Draft Phase",
      "designerName": "Jeff Dillon"
    }
  },
  "mappingMeta": {
    "direction": "planport_to_ledger",
    "planportHubCollection": "individualClients",
    "planportHubId": "pat-smith-abc123",
    "planportProjectPath": "individualClients/pat-smith-abc123/projects/lakeside-xyz"
  }
}
```

---

## 5. Conflict rules (normative)

Implemented in `buildLedgerUpsertPatchesFromEnvelopeV2` (`src/lib/handoff/planport-ledger/v2.ts`) and mirrored in comments under `src/lib/shared-data/cross-app-sync.ts`.

1. **Initial create** in Ledger (no existing client/project with the same `externalId`): `mappingMeta.direction === "planport_to_ledger"` → **PlanPort wins** on overlapping scalar fields.
2. **Update** (row already exists with same `externalId`): **Ledger wins** on scalar conflicts; conflicts are listed in `clientConflicts` / `projectConflicts` during dry run.
3. **Extensions:** `extensionPlanport` / `planportExtension` merges follow the same preference flags as scalars for overlap detection.

---

## 6. Migration plan (non-destructive)

### PlanPort

- Script: `scripts/planport-backfill-external-ids.ts`
- NPM: `npm run migrate:external-ids -- --dry-run` then `--merge`
- Writes `externalId` with **deterministic** values so re-runs are safe.

### Ledger

- Script: `scripts/ledger-backfill-external-ids.ts`
- NPM: `npm run migrate:external-ids -- --dry-run` then `--merge`
- Requires `DATA_ROOT_ID` env.

---

## 7. Import / export surfaces

### PlanPort

- **Export v2:** Admin “New Client Onboarding” dialog — “Export sync envelope v2”.
- **Send to Ledger:** Server action `sendPlanportSyncEnvelopeToLedger` — requires server env:
  - `LEDGER_SYNC_RECEIVE_URL` — Ledger endpoint `POST /api/sync/receive-planport-envelope`
  - `PLANPORT_TO_LEDGER_SYNC_SECRET` — must match Ledger `LEDGER_SYNC_RECEIVE_SECRET`

### Ledger

- **Import UI:** `/import/planport` — parses **v2 first** (`schemaVersion === 2`), else legacy v1 handoff.
- **Dry run / apply (v2):** buttons on the same page.
- **Receive API:** `src/app/api/sync/receive-planport-envelope/route.ts` — validates envelope; optional **server-side apply** when `LEDGER_SYNC_APPLY_ON_RECEIVE=1` and `LEDGER_SYNC_DATA_ROOT_ID` are set (uses Firebase Admin).

---

## 8. Code map (primary files)

| Area | Ledger | PlanPort |
|------|--------|----------|
| Canonical types | `src/lib/shared-data/canonical-types.ts` | `src/lib/shared-data/canonical-types.ts` |
| PlanPort ↔ canonical mappers | `src/lib/shared-data/portal-mappers.ts` | mirrored |
| Named sync API | `src/lib/shared-data/cross-app-sync.ts` | mirrored |
| v2 envelope + merge | `src/lib/handoff/planport-ledger/v2.ts` | `src/lib/planport-sync-envelope-v2.ts` (builder) |
| UI import | `src/app/import/planport/page.tsx` | — |
| UI export | — | `src/components/admin/CreateClientDialog.tsx` |
| Push action | — | `src/app/actions/send-planport-sync-envelope.ts` |

---

## 9. Verification checklist

1. **Create** a new client + first project in PlanPort (admin dialog).
2. **Export** sync envelope v2 JSON; confirm `client.externalId` / `project.externalId` present.
3. **Import** JSON in Ledger `/import/planport` → **Dry run (v2)** → review conflicts (expect none on first import).
4. **Apply import (v2)** — client + project appear under the firm root.
5. **Edit** shared fields in Ledger (e.g. project name).
6. **Re-export** from PlanPort (same externalIds) or re-send envelope; **dry run** in Ledger should show **Ledger wins** on changed fields.
7. **Re-apply** — no duplicate client/project (match by `externalId`).
8. Confirm **PlanPort-only** fields still present in PlanPort Firestore (`onboardingIntake`, etc.) and **Ledger-only** fields untouched except mapped keys.

---

## 10. Deploy note

Pushing this repo does not update Firebase Hosting. After merge, deploy with your usual command (e.g. `npm run deploy:firebase` on each app where applicable).

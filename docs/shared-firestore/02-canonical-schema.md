# Phase 2 — Canonical shared schema (v1)

New **root** collections (namespaced to avoid clashing with existing `portals`, `employees`, …):

| Collection | Purpose |
|------------|---------|
| `shared_clients` | One document per residential client **or** general-contractor **firm** (portal hub identity). |
| `shared_projects` | One document per project; links to `shared_clients` and optional second party (GC). |

Each document includes:

- `schemaVersion: 1`
- `firmId` — Ledger `dataRootId` (boss employee id) when known; optional for PlanPort-only rows until linked.
- `createdAt`, `updatedAt` (ISO strings)
- `createdBy`, `updatedBy` (optional strings — UIDs or `migration:script`)
- `sourceRefs[]` — `{ app: 'ledger' \| 'planport', path: string, docId: string }` for traceability
- `extensionLedger` / `extensionPlanport` — `Record<string, unknown>` for fields not in the canonical model (do not drop data).

## `shared_clients/{id}`

| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | number | Always `1` for this spec. |
| `firmId` | string | Ledger firm root id. |
| `accountKind` | `'residential' \| 'contractor'` | Maps Ledger `Client` vs `Contractor` / PlanPort individual vs GC hub. |
| `displayName` | string | Primary UI name. |
| `legalName` | string? | Optional formal name. |
| `primaryEmail` | string? | |
| `primaryPhone` | string? | |
| `billingEmail` | string? | |
| `accessCode` | string? | Uppercase portal code when used. |
| `portalEnabled` | boolean | Hub can log in with code. |
| `status` | string? | e.g. `active`, `archived`. |
| `tags` | string[]? | |
| `address` | string? | Default / primary address when no project context. |
| `logoUrl` | string? | GC branding. |
| `contacts` | array? | Normalized `{ name, title, email, phone }[]`. |
| `additionalStakeholders` | array? | Ledger residential extras. |
| `permitPdfDownloads` | boolean? | |
| `ledgerClientId` | string? | Original id under `employees/{firmId}/clients`. |
| `ledgerContractorId` | string? | Original id under `employees/{firmId}/contractors`. |
| `planportHubId` | string? | `individualClients` or `generalContractors` doc id. |
| `planportHubCollection` | `'individualClients' \| 'generalContractors'?` | |

## `shared_projects/{id}`

| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | number | `1` |
| `firmId` | string | Ledger firm root. |
| `projectName` | string | |
| `projectCode` | string? | Optional short code. |
| `status` | string? | Align Ledger `ProjectStatus` / PlanPort `status`. |
| `phase` | string? | Optional finer stage. |
| `address` | string? | |
| `lat`, `lng` | number? | |
| `residentialClientId` | string? | **Reference** to `shared_clients.id` (`accountKind === 'residential'`). |
| `contractorClientId` | string? | **Reference** to `shared_clients.id` (`accountKind === 'contractor'`) when GC assigned. |
| `ledgerProjectId` | string? | Original `employees/{firmId}/projects` id. |
| `planportProjectPath` | string? | e.g. `individualClients/{hubId}/projects/{projectId}` |
| `portalVisible` | boolean | Shown in client/GC portal. |
| `designerName` | string? | |
| `renderingUrl` | string? | |
| `createdAt` | string? | |
| `extensionLedger` | object? | Extra Ledger-only fields (`nature`, `checklist`, rates, …). |
| `extensionPlanport` | object? | e.g. `onboardingIntake`, sync flags. |

**Do not** move portal file subcollections (`blueprints`, …) into `shared_*`; they remain under PlanPort hub paths until a later phase.

## Future collections (optional)

- `shared_meeting_requests` — if you unify scheduling across apps.
- `shared_invoice_refs` — pointers to QuickBooks / Ledger billing rows.

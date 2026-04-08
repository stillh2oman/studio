# Phase 3 — Field mapping tables

## Ledger `Client` → `shared_clients` (`accountKind: 'residential'`)

| Canonical | Ledger `Client` | Notes |
|-----------|-----------------|-------|
| `displayName` | `name` | From `mapClient` normalized name. |
| `legalName` | — | Optional; copy `name` if needed. |
| `primaryEmail` | `email` | |
| `primaryPhone` | `phoneNumber` | |
| `billingEmail` | `billingEmail` | |
| `accessCode` | `accessCode` | |
| `portalEnabled` | `!!accessCode` | Heuristic; adjust if you use codes differently. |
| `address` | `projectAddress` | Partial; project address may live on `Project`. |
| `contacts` | `contacts` | Contractor-style contacts on client. |
| `additionalStakeholders` | `additionalStakeholders` | Store also in `extensionLedger` if shape differs. |
| `permitPdfDownloads` | `permitPdfDownloads` | |
| `ledgerClientId` | `id` | |
| `extensionLedger` | remainder | `firstName`, `lastName`, `secondaryClientName`, `associatedProjectIds`, `discountEligibility`, `hiddenFromDatabase`, … |

## Ledger `Contractor` → `shared_clients` (`accountKind: 'contractor'`)

| Canonical | Ledger `Contractor` | Notes |
|-----------|---------------------|-------|
| `displayName` | `companyName` | |
| `billingEmail` | `billingEmail` | |
| `primaryEmail` | `billingEmail` | Fallback. |
| `logoUrl` | `logoUrl` | |
| `accessCode` | `accessCode` | |
| `contacts` | `contacts` | |
| `permitPdfDownloads` | `permitPdfDownloads` | |
| `ledgerContractorId` | `id` | |

## PlanPort `individualClients` hub → `shared_clients` (`accountKind: 'residential'`)

| Canonical | PlanPort field | Notes |
|-----------|----------------|-------|
| `displayName` | `wifeName ? husbandName + ' & ' + wifeName : husbandName` | Match `ownerName` pattern on project. |
| `primaryEmail` | `email` | |
| `billingEmail` | `billingEmail` | |
| `primaryPhone` | `phone` | |
| `accessCode` | `accessCode` | Already uppercased in UI. |
| `portalEnabled` | `true` | If hub exists. |
| `address` | `address` | |
| `contacts` | map `additionalContacts` | Normalize to `{ name, title, email, phone }`. |
| `planportHubId` | doc id | |
| `planportHubCollection` | `'individualClients'` | |
| `extensionPlanport` | `husbandName`, `wifeName`, `allowDownloads`, `sourceApp`, … | |

## PlanPort `generalContractors` hub → `shared_clients` (`accountKind: 'contractor'`)

| Canonical | PlanPort | Notes |
|-----------|----------|-------|
| `displayName` | `name` | From GC dialog / hub doc. |
| `logoUrl` | `logoUrl` | |
| `accessCode` | `accessCode` | |
| `contacts` | `contacts` | |
| `planportHubId` | doc id | |
| `planportHubCollection` | `'generalContractors'` | |

## Ledger `Project` → `shared_projects`

| Canonical | Ledger `Project` | Notes |
|-----------|------------------|-------|
| `projectName` | `name` | |
| `status` | `status` | |
| `address` | `address` | |
| `lat`, `lng` | `lat`, `lng` | |
| `residentialClientId` | resolve from `clientId` | Map Ledger client doc → `shared_clients` id (migration must build link table or deterministic id). |
| `contractorClientId` | resolve from `contractorId` | Same for GC. |
| `designerName` | `designer` | |
| `renderingUrl` | `renderingUrl` | |
| `portalVisible` | heuristic | e.g. `true` if `portals` entry exists — optional. |
| `ledgerProjectId` | `id` | |
| `extensionLedger` | `nature`, `checklist`, `hourlyRate`, `hiddenFromCards`, … | |

## PlanPort project doc → `shared_projects`

| Canonical | PlanPort | Notes |
|-----------|----------|-------|
| `projectName` | `name` | |
| `status` | `status` | |
| `address` | `address` | |
| `designerName` | `designerName` | |
| `renderingUrl` | `renderingUrl` | |
| `planportProjectPath` | constructed | From hub id + project id. |
| `residentialClientId` | resolve `individualClientId` | After hub mapped to `shared_clients`. |
| `contractorClientId` | resolve `generalContractorId` | If set. |
| `extensionPlanport` | `onboardingIntake`, sync fields, … | |

## Reverse maps

Implemented in code:

- `mapInternalClientToCanonical` / `mapCanonicalToInternalClientView`
- `mapInternalProjectToCanonical` / `mapCanonicalToInternalProjectView`
- `mapPlanportResidentialHubToCanonical` / `mapPlanportProjectToCanonical` / `mapCanonicalToPlanportProjectPatch`

`View` types are plain objects close enough for UI/forms; strict equality with legacy docs is not guaranteed when round-tripping through extensions.

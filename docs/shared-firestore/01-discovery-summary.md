# Phase 1 — Discovery summary (Ledger + PlanPort)

## Critical prerequisite: one Firebase project

| App      | `projectId` in repo `src/firebase/config.ts` | Notes |
|----------|-----------------------------------------------|--------|
| **Ledger** | `gen-lang-client-0442778807` | `.firebaserc` default is `designers-ledger-3-00660-9e684` — production may use App Hosting auto-config; **verify in Console** which project the live app uses. |
| **PlanPort** | `studio-5055895818-5ccef` | Confirmed in PlanPort `config.ts`. |

**Shared Firestore data requires both apps to use the same Firebase project** (or a sync layer — higher risk). PlanPort’s `planport-project-paths.ts` even notes hub data lives in the PlanPort project. **Before cutover:** pick a single project, add the other app’s web app to it (or migrate), update configs, and re-deploy.

---

## Ledger (internal) — Firestore layout

- **Firm root:** `employees/{dataRootId}` where `dataRootId` is the boss’s employee id (`isBoss` heuristic / `Administrator` role).
- **Clients:** `employees/{dataRootId}/clients/{clientId}` — shape `Client` in `src/lib/types.ts`.
- **Contractors (GCs):** `employees/{dataRootId}/contractors/{contractorId}` — shape `Contractor`.
- **Projects:** `employees/{dataRootId}/projects/{projectId}` — shape `Project` (`clientId`, `contractorId`, etc.).
- **PlanPort bridge:** `portals/{ACCESS_CODE}` — `accountId`, `firmId`, `accountType`, `code`.
- **Normalization:** `mapClient` / `mapProject` in `use-ledger-data.ts` handle legacy field aliases (`clientName`, `renderingSource`, …).

**Auth:** Employee login → `employees/{id}`; `bossId` links staff to firm root.

---

## PlanPort (portal) — Firestore layout

- **Residential hubs:** `individualClients/{clientId}` — hub doc (e.g. `husbandName`, `wifeName`, `accessCode`, `email`, `billingEmail`, `phone`, `allowDownloads`, `additionalContacts`, timestamps, `sourceApp`).
- **GC hubs:** `generalContractors/{gcId}` — company-style hub (`name`, `accessCode`, `contacts`, `logoUrl`, …).
- **Projects:** `individualClients/{clientId}/projects/{projectId}` and optionally mirrored under `generalContractors/{gcId}/projects/{projectId}`.
- **Subcollections per project:** `blueprints`, `renderings`, `chiefFiles`, `inspiration`, `documents`, `signingRequests`, … (portal-specific files — **stay nested** under hub project path).
- **Access:** `LoginCard` queries `accessCode` on both hub collections; anonymous auth for rules.

**Auth:** Hub users anonymous + code; staff/admin email + `adminRoles/{uid}` (see PlanPort `planport-admin-client.ts`).

---

## Overlapping concepts (not same paths)

| Concept | Ledger | PlanPort |
|--------|--------|----------|
| Residential “client” | `clients` doc | `individualClients` hub doc |
| GC / builder | `contractors` doc | `generalContractors` hub doc |
| Project | `projects` (top-level under firm) | `.../projects/{id}` under hub |
| Access code | `Client.accessCode` / `Contractor.accessCode` | `accessCode` on hub doc |
| Portal lookup | `portals/{code}` registry | Direct query on hub collections |

---

## App-specific (keep separate)

- **Ledger-only:** payroll, timesheets, internal messages, billable/print ledgers, password vault, memory bank, most `calendar_events`, etc.
- **Portal-only:** contract templates, outbound contracts, QB invoice links, FCM tokens, hub `notificationRecipients`, project file subcollections, onboarding submissions store.

---

## Open questions (need your decision)

1. **Which Firebase project becomes the system of record** after merge?
2. **Is production Ledger actually on `gen-lang-client-0442778807` or `designers-ledger-3-00660-9e684`?** Align `config.ts` with reality.
3. **ID strategy:** Keep Ledger and PlanPort legacy IDs in `sourceRefs` only, or **force new UUIDs** for `shared_*` docs?
4. **Contractors:** In canonical model, treat as `accountKind: 'contractor'` on `shared_clients` vs separate `shared_contractors` collection? (Current code uses one `shared_clients` with `accountKind`.)

# Designer's Ink Command Center - AI Chatbot Help File

Use this file as the chatbot's product guide and answer source for users working in Designer's Ink Command Center.

## Assistant behavior rules

- Always answer in plain language first, then provide click-by-click steps.
- Prefer exact tab names and button labels used in the app UI.
- If a user is unsure where they are, ask what tab they can currently see.
- For anything that writes data, warn users to verify project/client selection before saving.
- If a feature is role-restricted (Firm Command/admin functions), state that clearly.

## App navigation map

Main tabs:

- Home
- Databases
- Notes
- Inbox
- PlanPort
- Billing
- Tasks
- Time Sheets
- Pipeline
- Toolset
- Archives
- Team (Firm Command button for authorized users)

---

## Home tab

Purpose: Daily command dashboard.

Key functions:

- View dashboard KPI cards (active projects, billing state summaries, past due counts).
- View map of projects and quick project context.
- Review priority tasks due/overdue.
- Use internal message center (inbox/outbox).
- View and manage schedule events.

Typical user actions:

- "How do I add a schedule event?" -> Home > Schedule card > Add.
- "How do I open a task quickly?" -> Home > Priority Pipeline > click task card.

---

## Databases tab

### Projects view

Purpose: Central project registry and project card/list management.

Functions:

- Switch view mode:
  - Cards (with renderings)
  - No Renderings
  - List (sortable columns)
- Sort in list view by clicking column headers.
- Open project detail page.
- Edit/delete project records.

Important field note:

- "Rendering Source" in Project Intelligence stores rendering image link used in project cards/pipeline.

### Accounts (Clients & Contractors) view

Functions:

- Add client/contractor account.
- Edit or delete account.
- Use contractor/client type for proper project linking and portal behavior.

---

## Notes tab

Purpose: Global project note management.

Functions:

- View project notes by project.
- Add/edit/delete notes.
- Store AI summaries, inbox archives, and project communication logs.

---

## Inbox tab

Purpose: Communication triage hub with Gmail + Drive meeting summaries.

Functions:

- Sync Gmail messages.
- Sync Google Drive "Meeting Summaries" folder files.
- Filter and search inbox items.
- Convert email/file to Task.
- Archive email/file to Project Notes.
- Configure/verify Google integration credentials.

Google Drive folder behavior:

- If no custom folder is entered, app uses default summaries folder ID configured in services.

---

## PlanPort tab

There are two PlanPort contexts:

1. Embedded PlanPort iframe in main app PlanPort tab.
2. Portal link flow (`/planport` -> `/planport/[code]`) for clients/contractors.

For client portal (`/planport/[code]`) functions:

- Browse assigned projects and files.
- Download latest/archived blueprint files.
- Request a Meeting.
- Message Designer.

### Request a Meeting (portal)

Rules:

- Timezone: America/Chicago
- Available window: 1:30 PM to 9:30 PM
- Meeting length: 90 minutes
- Buffer: 30 minutes before/after existing meetings
- Unavailable days: Monday, Wednesday, Friday

Meeting options:

- In-person: 2324 W 7th Place, Suite #1, Stillwater, Oklahoma
- Online: Google Meet link generated automatically

Results:

- Meeting is added to lead designer Google Calendar.
- Meeting is written into app calendar events for Home schedule visibility.

### Message Designer (portal)

Functions:

- Opens message dialog on landing/project contexts.
- Sends structured email to the lead designer assigned to project/client context.
- Includes portal code, sender info, and optional reply email.

---

## Billing tab

Contains:

- Billable Hours
- Printing

Billable Hours functions:

- Add/edit/delete billing entries.
- Track invoice status (Not Sent, Invoice Sent, Past Due, Paid).
- Link entries to projects/clients.

Printing functions:

- Add/edit/delete print job entries.
- Track status and totals.

---

## Tasks tab

Purpose: Work queue and execution tracker.

Functions:

- Create, assign, prioritize, and update tasks.
- Manage task status and deadlines.
- Maintain subtasks/checklists and comments.
- Connect calendar events to task workflow.

---

## Time Sheets tab

Purpose: Employee time tracking by pay period.

Functions:

- Log billable, non-billable, PTO, and holiday time.
- Switch employees (for authorized users).
- Submit pay period records.
- View leave bank balances (Sarah/Chris workflows).

Leave bank logic:

- Leave banks are tracked per employee and reflected in timesheet summary.
- Firm Command leave updates should appear in Timesheets for corresponding employee.

---

## Pipeline tab

Purpose: Project status progression and visual stage management.

Functions:

- View active project cards with renderings.
- Track current stage and completed stages.
- Update project progression status.

---

## Toolset tab

Purpose: Utility tools and reusable templates.

Common functions:

- Calculator workflows.
- Text template management.
- Productivity helpers depending on role.

---

## Archives tab

Purpose: Historical record review.

Functions:

- Access archived billable, printing, and task data.
- Restore context for old project/accounting records.

---

## Team / Firm Command

Purpose: Admin-level company operations.

Functions:

- Staff database and access control.
- Profitability analytics.
- Leave bank administration.
- Payroll/cost/income records.
- Data maintenance and restore operations.

---

## Project detail page (`/projects/[projectId]`)

Purpose: Project-specific operations center.

Functions:

- View/edit project intelligence.
- View notes, tasks, billing, print entries tied to project.
- Open map/address context.
- Request a meeting from project context.

---

## Voice Notes + Meeting Notes

Voice Note:

- Quick recording/transcription workflow.

Meeting Notes mode:

- Record transcript, summarize with Gemini, save into selected project notes.

---

## AI + external integrations

Configured integrations include:

- Gemini (summaries, embeddings, AI processing)
- Google Calendar/Meet (meeting scheduling)
- Gmail (Inbox sync)
- Google Drive (meeting summary files)
- Dropbox (renderings, plans, memory workflows)

When answering users:

- If an integration fails, ask for the exact error text and environment key status.
- For token expiry errors, guide users to refresh token setup before app-level troubleshooting.

---

## Troubleshooting quick replies (for chatbot)

### "My rendering is missing"

Checklist:

1. Confirm project has Rendering Source link saved.
2. Confirm Dropbox link format is direct/raw compatible.
3. Check cards mode (Cards vs No Renderings).
4. Verify project record field mapping includes rendering URL.

### "I cannot see meeting request button"

Checklist:

1. Confirm user is in portal route `/planport/[code]` (not unrelated page).
2. Confirm page loaded with valid identity and assigned project context.
3. Confirm latest deployment is live.

### "Leave bank not updating in Timesheets"

Checklist:

1. Confirm leave updated in Firm Command for correct employee.
2. Confirm employee selected correctly in Timesheets.
3. Confirm leave bank record maps to employee ID and latest update.

---

## Safe-answer constraints for chatbot

- Never expose API keys, tokens, or secrets.
- Never claim data was changed unless user confirms save action.
- If unsure which app context user is in, ask:
  - "Are you in the main dashboard tab, the embedded PlanPort, or the `/planport/[code]` client portal?"


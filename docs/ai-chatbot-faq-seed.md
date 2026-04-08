# Designer's Ink Chatbot FAQ Seed (50 Q&A)

Use these as starter intents/examples for chatbot tuning.

## 1) Navigation and basics

**Q1:** Where do I add a new client?  
**A:** Go to `Databases` -> `Accounts (Clients & Contractors)` -> click `Add Account`.

**Q2:** Where do I add a new project?  
**A:** Go to `Databases` -> `Projects`, then open the project dialog from `Add Project` (or use project add actions in billing/task flows).

**Q3:** How do I open a project detail page?  
**A:** In `Databases` -> `Projects`, click the project name/card `Open` action.

**Q4:** Where do I find global notes?  
**A:** Use the `Notes` tab for project-linked notes and global note workflows.

**Q5:** Where can I search everything?  
**A:** Click the global search icon in the header or use `Ctrl+K`.

## 2) Project Database and views

**Q6:** How do I switch between card and list project views?  
**A:** In `Databases` -> `Projects`, use the view controls: `Cards`, `No Renderings`, or `List`.

**Q7:** How do I sort projects in list view?  
**A:** Click a column header in `List` view (Project, Client, Status, Designer, Created).

**Q8:** Why are rendering images missing in project cards?  
**A:** Check that `Rendering Source` is populated in Project Intelligence and the Dropbox link resolves as a raw image (`raw=1` behavior).

**Q9:** What is "No Renderings" view for?  
**A:** It shows the same project cards without image headers for faster scanning.

**Q10:** How do I edit project status pipeline stage?  
**A:** Use the `Pipeline` tab and update the project’s current stage there.

## 3) Renderings and Dropbox links

**Q11:** What link should I paste in Rendering Source?  
**A:** Paste the shared Dropbox file link; the app converts standard links to raw-display format automatically.

**Q12:** My Dropbox link uses `/scl/fi/...&dl=0`. Is that valid?  
**A:** Yes. That format is supported; the app transforms `dl=0` to `raw=1` for rendering display.

**Q13:** Can I upload an image instead of a link?  
**A:** Yes. Use `Upload File` in Project Intelligence; the app stores a compressed image for display.

**Q14:** Why does a rendering show in one tab but not another?  
**A:** Usually due to stale project data or differing field names in older records. Re-open/edit/save project Rendering Source to normalize.

**Q15:** Where else are renderings shown?  
**A:** In project cards (`Databases`), `Pipeline`, and PlanPort project cards where applicable.

## 4) Home dashboard metrics

**Q16:** What does Active Projects mean on Home?  
**A:** Count of non-archived projects currently in active workflow.

**Q17:** What does Past Due Projects mean on Home?  
**A:** Projects with at least one billable entry in `Past Due` status.

**Q18:** What do Billing Not Sent/Sent/Past Due cards count?  
**A:** Counts of billable entries by invoice status.

**Q19:** Why are my Home counts not what I expect?  
**A:** Verify billable entry statuses are correct and not archived/paid in a different collection.

**Q20:** Where do I update invoice status to affect Home KPIs?  
**A:** `Billing` -> `Hours`, edit/update status of billable entries.

## 5) Inbox, Gmail, and Drive

**Q21:** How do I connect Gmail/Drive in Inbox?  
**A:** Open `Inbox` -> settings icon -> enter Google credentials (Client ID/Secret/Refresh Token) and verify link.

**Q22:** Can I turn an email into a task?  
**A:** Yes. In `Inbox`, click `Convert to Task`, select project, review fields, then create.

**Q23:** Can I archive an email to Notes?  
**A:** Yes. In `Inbox`, click `Archive to Note`, choose destination project, and save.

**Q24:** Where does Meeting Summaries come from in Inbox?  
**A:** From your configured Google Drive folder (`meetFolderId`), defaulting to your standard summaries folder when empty.

**Q25:** Why is Inbox sync failing?  
**A:** Usually missing/expired Google refresh token or missing scopes (`gmail.readonly`, `drive.readonly`).

## 6) PlanPort portal and messaging

**Q26:** What is the difference between PlanPort tab and `/planport/[code]`?  
**A:** PlanPort tab is an embedded app/iframe; `/planport/[code]` is this app’s client portal route.

**Q27:** Where should clients request meetings?  
**A:** In the `/planport/[code]` portal where `Request a Meeting` is available.

**Q28:** What does Request a Meeting enforce?  
**A:** 90-minute meetings, 30-minute conflict buffers, no Monday/Wednesday/Friday slots, America/Chicago window.

**Q29:** Can clients pick online vs in-person meetings?  
**A:** Yes. Online generates Google Meet; in-person uses office address.

**Q30:** Who receives Message Designer emails from portal?  
**A:** The lead designer assigned to the project/client context, with fallback routing if needed.

## 7) Scheduling specifics

**Q31:** What are available meeting hours?  
**A:** 1:30 PM to 9:30 PM (America/Chicago).

**Q32:** Why is a time slot missing even though calendar looks open?  
**A:** A 30-minute pre/post buffer is applied around existing events.

**Q33:** Why are there no slots on Monday?  
**A:** Mondays are intentionally blocked by policy (also Wednesdays and Fridays).

**Q34:** Does booking update the app calendar too?  
**A:** Yes. Bookings are written to Google Calendar and mirrored into app calendar events.

**Q35:** Can clients book far in the future?  
**A:** Yes, the current setup allows future scheduling; UI may limit date picker range for usability.

## 8) Tasks and project workflow

**Q36:** How do I create a task quickly from a project?  
**A:** Open project detail page and use quick task creation from the task section/dialog.

**Q37:** Where do overdue priorities show up?  
**A:** In `Home` under Priority Pipeline and in `Tasks` workflow views.

**Q38:** Can tasks include attachments/comments?  
**A:** Yes, task workflows support details including subtasks and context notes.

**Q39:** How do I move from note/action request to tracked work?  
**A:** Convert communications from `Inbox` to task or create task directly inside project page.

**Q40:** How do I link a task to the right project/client?  
**A:** Always select destination project first; client linkage derives from project mapping.

## 9) Timesheets and leave bank

**Q41:** Who can switch employee timesheets?  
**A:** Privileged users (admin/boss roles and designated internal users) can switch from employee selector.

**Q42:** Why don’t PTO/Holiday options show for some staff?  
**A:** Leave bank billing types are only enabled for eligible users (e.g., Sarah/Chris policy).

**Q43:** Where are leave bank totals edited?  
**A:** `Team` -> `Profit Tab` -> Annual Leave Bank Administration.

**Q44:** Why didn’t Sarah/Chris leave totals update in Timesheets?  
**A:** Usually due to leave bank record mapping issues; ensure updates are tied to correct employee ID and current data refresh.

**Q45:** When are timesheets locked?  
**A:** Pay periods lock after submission grace window based on submission timestamp rules.

## 10) Team/Firm Command and maintenance

**Q46:** Where do I manage staff accounts and permissions?  
**A:** `Team` (Firm Command) -> Staff Database / Access Control.

**Q47:** Where do I adjust profitability records?  
**A:** `Team` -> `Profit Tab` (payroll, costs, income, leave administration).

**Q48:** How do I back up or restore data?  
**A:** Use `Team` maintenance controls (backup export and restore flows).

**Q49:** Why can’t a non-admin see Firm Command actions?  
**A:** Those operations are role-restricted; only owners/admin users can perform them.

**Q50:** What should I do before reporting a bug?  
**A:** Provide: tab/page route, expected behavior, exact error text, and one screenshot/context note (e.g., selected project/employee).


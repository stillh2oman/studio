/** Normalize unique valid-looking emails for Resend `to` lists. */

export function uniqueEmails(emails: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const e = raw?.trim().toLowerCase();
    if (!e || !e.includes("@")) continue;
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(raw!.trim());
  }
  return out;
}

/** Ledger / directory client doc: primary + additionalContacts. */
export function emailsFromClientDirectoryRecord(client: {
  email?: string | null;
  additionalContacts?: { email?: string | null }[] | null;
} | null | undefined): string[] {
  const list: string[] = [];
  if (client?.email) list.push(client.email);
  const extra = client?.additionalContacts;
  const contacts = Array.isArray(extra) ? extra : [];
  for (const c of contacts) {
    if (c?.email) list.push(c.email);
  }
  return uniqueEmails(list);
}

/** GC `contacts` array from contractor doc. */
export function emailsFromGcContacts(
  contacts: { email?: string | null }[] | null | undefined
): string[] {
  const list = Array.isArray(contacts) ? contacts : [];
  return uniqueEmails(list.map((c) => c.email));
}

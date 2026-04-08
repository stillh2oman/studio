/** Pure helpers for client profiles — safe to import from client components (no Firebase Admin). */

/** Resolves billing email: explicit `billingEmail`, else `email` on the private client profile. */
export function resolveClientBillingEmail(clientData: Record<string, unknown> | undefined): string | null {
  if (!clientData) return null;
  const billing =
    typeof clientData.billingEmail === "string" && clientData.billingEmail.trim()
      ? clientData.billingEmail.trim()
      : "";
  const email =
    typeof clientData.email === "string" && clientData.email.trim() ? clientData.email.trim() : "";
  const chosen = billing || email;
  return chosen || null;
}

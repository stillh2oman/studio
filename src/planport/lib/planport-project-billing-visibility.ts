/**
 * Client-safe helpers for where to show QuickBooks billing (no Firebase Admin).
 * Billing appears in one place: private client hub when a project is tied to an individual
 * client; otherwise on the contractor hub only.
 */

export function projectHasLinkedPrivateClientId(project: Record<string, unknown> | null | undefined): boolean {
  const raw = project?.individualClientId;
  return typeof raw === "string" && raw.trim().length > 0;
}

/** Contractor dashboard: show billing only for GC-only projects (no private client link). */
export function showBillingOnContractorHub(project: Record<string, unknown> | null | undefined): boolean {
  return !projectHasLinkedPrivateClientId(project);
}

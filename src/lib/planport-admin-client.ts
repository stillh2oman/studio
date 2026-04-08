import type { User } from "firebase/auth";

const LEGACY_ADMIN_EMAILS = new Set([
  "jeff@designersink.us",
  "kevin@designersink.us",
]);

/**
 * Client-side PlanPort staff / admin detection. Anonymous sessions (access code) are never admin.
 * Uses `adminRoles/{uid}` when present, else staff @designersink.us emails so Firestore rule
 * issues on `adminRoles` do not strip toolbar access from firm accounts.
 */
export function isPlanportStaffEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (LEGACY_ADMIN_EMAILS.has(e)) return true;
  return e.endsWith("@designersink.us");
}

export function isPlanportAdminClient(
  user: User | null,
  adminRoleDoc: unknown | null | undefined
): boolean {
  if (!user?.email || user.isAnonymous) return false;
  if (adminRoleDoc) return true;
  return isPlanportStaffEmail(user.email);
}

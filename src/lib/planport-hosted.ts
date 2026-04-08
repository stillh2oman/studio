/**
 * PlanPort admin on Firebase Hosting (separate site from Ledger’s `/planport` routes).
 * After deploying `planport-studio-deploy/planport-auto-login.html` to this site, set
 * NEXT_PUBLIC_PLANPORT_HOSTED_URL to that file’s URL so the Ledger header opens it and
 * Firebase Auth runs on the PlanPort origin (required for automatic sign-in).
 */
export const PLANPORT_HOSTED_OPEN_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_PLANPORT_HOSTED_URL?.trim()) ||
  'https://studio-5055895818-5ccef.web.app/admin';

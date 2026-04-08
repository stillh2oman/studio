/**
 * Blueprints, renderings, and hub folders always live in the PlanPort Firebase project
 * (the app from `firebase/config`), not in the Ledger directory project.
 */
export const PLANPORT_GC_ROOT = "generalContractors" as const;
export const PLANPORT_CLIENT_ROOT = "individualClients" as const;

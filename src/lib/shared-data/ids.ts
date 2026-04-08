/** Deterministic Firestore id for a Ledger-sourced client/contractor (avoids collisions across firms). */
export function sharedClientDocIdForLedger(
  firmId: string,
  ledgerCollection: 'clients' | 'contractors',
  legacyDocId: string,
): string {
  const seg = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `sc_leg_${ledgerCollection === 'clients' ? 'cl' : 'gc'}_${seg(firmId)}_${seg(legacyDocId)}`;
}

/** Deterministic id for a Ledger project. */
export function sharedProjectDocIdForLedger(firmId: string, legacyProjectId: string): string {
  const seg = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `sp_leg_${seg(firmId)}_${seg(legacyProjectId)}`;
}

/** PlanPort hub doc id is already unique within its collection. */
export function sharedClientDocIdForPlanportHub(
  hubCollection: 'individualClients' | 'generalContractors',
  hubDocId: string,
): string {
  const seg = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `sc_pp_${hubCollection === 'individualClients' ? 'ind' : 'gc'}_${seg(hubDocId)}`;
}

export function sharedProjectDocIdForPlanport(hubCollection: 'individualClients' | 'generalContractors', hubId: string, projectId: string): string {
  const seg = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `sp_pp_${hubCollection === 'individualClients' ? 'ind' : 'gc'}_${seg(hubId)}_${seg(projectId)}`;
}

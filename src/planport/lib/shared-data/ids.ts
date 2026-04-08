/** Keep in sync with Ledger: `Ledger 3 Files/src/lib/shared-data/ids.ts` */

export function sharedClientDocIdForLedger(
  firmId: string,
  ledgerCollection: 'clients' | 'contractors',
  legacyDocId: string,
): string {
  const seg = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `sc_leg_${ledgerCollection === 'clients' ? 'cl' : 'gc'}_${seg(firmId)}_${seg(legacyDocId)}`;
}

export function sharedProjectDocIdForLedger(firmId: string, legacyProjectId: string): string {
  const seg = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `sp_leg_${seg(firmId)}_${seg(legacyProjectId)}`;
}

export function sharedClientDocIdForPlanportHub(
  hubCollection: 'individualClients' | 'generalContractors',
  hubDocId: string,
): string {
  const seg = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `sc_pp_${hubCollection === 'individualClients' ? 'ind' : 'gc'}_${seg(hubDocId)}`;
}

export function sharedProjectDocIdForPlanport(
  hubCollection: 'individualClients' | 'generalContractors',
  hubId: string,
  projectId: string,
): string {
  const seg = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `sp_pp_${hubCollection === 'individualClients' ? 'ind' : 'gc'}_${seg(hubId)}_${seg(projectId)}`;
}

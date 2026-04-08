"use client";

import { useMemo } from "react";
import type { Firestore } from "firebase/firestore";
import { useFirestore } from "@/firebase/provider";
import { PLANPORT_CLIENT_ROOT, PLANPORT_GC_ROOT } from "@/lib/planport-project-paths";

export interface DirectoryStore {
  /** Firestore database used for client/contractor directory documents. */
  directoryDb: Firestore;
  contractorsCollection: string;
  clientsCollection: string;
  /** True when directory lives in the Designer's Ledger Firebase project. */
  isLedgerPrimary: boolean;
  /** PlanPort app Firestore (projects, blueprints, admin auth, etc.). */
  planportDb: Firestore;
}

/**
 * Single source of truth for client + contractor directory profiles.
 *
 * PlanPort is the primary system of record:
 * - Clients live in `individualClients`
 * - Contractors live in `generalContractors`
 *
 * Project hubs (blueprints, renderings, files) also live in PlanPort under
 * {@link PLANPORT_GC_ROOT} / {@link PLANPORT_CLIENT_ROOT}.
 */
export function useDirectoryStore(): DirectoryStore {
  const planportDb = useFirestore();

  return useMemo(() => {
    return {
      directoryDb: planportDb,
      contractorsCollection: PLANPORT_GC_ROOT,
      clientsCollection: PLANPORT_CLIENT_ROOT,
      isLedgerPrimary: false,
      planportDb
    };
  }, [planportDb]);
}

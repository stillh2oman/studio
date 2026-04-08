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
  /** True when directory lives in a separate Ledger Firebase project (legacy import path). */
  isLedgerPrimary: boolean;
  /** Primary app Firestore (projects, blueprints, portal data, etc.). */
  planportDb: Firestore;
}

/**
 * Single source of truth for client + contractor directory profiles used by the client portal.
 */
export function useDirectoryStore(): DirectoryStore {
  const planportDb = useFirestore();

  return useMemo(() => {
    return {
      directoryDb: planportDb,
      contractorsCollection: PLANPORT_GC_ROOT,
      clientsCollection: PLANPORT_CLIENT_ROOT,
      isLedgerPrimary: false,
      planportDb,
    };
  }, [planportDb]);
}

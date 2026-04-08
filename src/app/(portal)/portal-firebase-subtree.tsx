"use client";

import { useFirebase as useLedgerFirebase } from "@/firebase/provider";
import { FirebaseProvider as PlanportFirebaseProvider } from "@planport/firebase/provider";

/**
 * Re-provide PlanPort-style Firebase context (Firebase User as `user`) using the same
 * app/auth/firestore instances as the Ledger shell.
 */
export function PortalFirebaseSubtree({ children }: { children: React.ReactNode }) {
  const { firebaseApp, firestore, auth } = useLedgerFirebase();
  return (
    <PlanportFirebaseProvider
      firebaseApp={firebaseApp}
      firestore={firestore}
      auth={auth}
      skipErrorListener
    >
      {children}
    </PlanportFirebaseProvider>
  );
}

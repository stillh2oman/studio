"use client";

import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getLedgerFirebaseOptions, isLedgerFirebaseConfigured } from "@/firebase/ledger-config";

const LEDGER_APP_NAME = "designers-ledger";

let cachedLedgerFirestore: Firestore | null | undefined;

export function getLedgerFirestore(): Firestore | null {
  if (!isLedgerFirebaseConfigured()) {
    return null;
  }
  if (cachedLedgerFirestore !== undefined) {
    return cachedLedgerFirestore;
  }

  try {
    let app: FirebaseApp;
    const existing = getApps().find((a) => a.name === LEDGER_APP_NAME);
    if (existing) {
      app = existing;
    } else {
      app = initializeApp(getLedgerFirebaseOptions(), LEDGER_APP_NAME);
    }
    cachedLedgerFirestore = getFirestore(app);
    return cachedLedgerFirestore;
  } catch (e) {
    console.warn("PlanPort: could not initialize Ledger Firebase app.", e);
    cachedLedgerFirestore = null;
    return null;
  }
}

/** Call after env/config changes (e.g. tests). */
export function resetLedgerFirestoreCacheForTests() {
  cachedLedgerFirestore = undefined;
}

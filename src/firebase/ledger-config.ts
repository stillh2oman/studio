import type { FirebaseOptions } from "firebase/app";

/**
 * Optional second Firebase project for one-way import from legacy Ledger hosting.
 * When unset, import panels should hide or no-op.
 */
export function isLedgerFirebaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_LEDGER_FIREBASE_API_KEY?.trim() &&
      process.env.NEXT_PUBLIC_LEDGER_FIREBASE_PROJECT_ID?.trim()
  );
}

export function getLedgerFirebaseOptions(): FirebaseOptions {
  const projectId =
    process.env.NEXT_PUBLIC_LEDGER_FIREBASE_PROJECT_ID?.trim() || "";
  const apiKey = process.env.NEXT_PUBLIC_LEDGER_FIREBASE_API_KEY?.trim();
  if (!apiKey || !projectId) {
    throw new Error(
      "NEXT_PUBLIC_LEDGER_FIREBASE_API_KEY and NEXT_PUBLIC_LEDGER_FIREBASE_PROJECT_ID are required for Ledger import."
    );
  }

  return {
    apiKey,
    projectId,
    authDomain:
      process.env.NEXT_PUBLIC_LEDGER_FIREBASE_AUTH_DOMAIN?.trim() ||
      `${projectId}.firebaseapp.com`,
    storageBucket: process.env.NEXT_PUBLIC_LEDGER_FIREBASE_STORAGE_BUCKET?.trim(),
    messagingSenderId: process.env.NEXT_PUBLIC_LEDGER_FIREBASE_MESSAGING_SENDER_ID?.trim(),
    appId: process.env.NEXT_PUBLIC_LEDGER_FIREBASE_APP_ID?.trim(),
  };
}

export function getLedgerClientsCollection(): string {
  return process.env.NEXT_PUBLIC_LEDGER_CLIENTS_COLLECTION?.trim() || "clients";
}

export function getLedgerContractorsCollection(): string {
  return process.env.NEXT_PUBLIC_LEDGER_CONTRACTORS_COLLECTION?.trim() || "contractors";
}

/** Field used for Firestore prefix search (must exist on documents; add index if prompted). */
export function getLedgerClientOrderField(): string {
  return process.env.NEXT_PUBLIC_LEDGER_CLIENT_ORDER_FIELD?.trim() || "name";
}

export function getLedgerContractorOrderField(): string {
  return process.env.NEXT_PUBLIC_LEDGER_CONTRACTOR_ORDER_FIELD?.trim() || "name";
}

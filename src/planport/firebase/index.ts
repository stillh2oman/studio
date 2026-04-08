"use client";

/**
 * PlanPort UI entry: Firebase Auth `user` is the raw Firebase User (not Ledger Employee).
 * Reuses Ledger Firestore hooks and shared error utilities.
 */
export {
  FirebaseProvider,
  useFirebase,
  useUser,
  useAuth,
  useFirestore,
  useFirebaseApp,
  useMemoFirebase,
} from "./provider";
export { FirebaseClientProvider } from "./client-provider";
export { useCollection } from "@/firebase/firestore/use-collection";
export { useDoc } from "@/firebase/firestore/use-doc";
export * from "@/firebase/non-blocking-updates";
export * from "@/firebase/non-blocking-login";
export * from "@/firebase/errors";
export * from "@/firebase/error-emitter";

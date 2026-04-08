import admin from "firebase-admin";
import { firebaseConfig } from "@/firebase/config";

let app: admin.app.App | null = null;

export function getAdminApp() {
  if (app) return app;

  if (!admin.apps.length) {
    app = admin.initializeApp();
  } else {
    app = admin.apps[0]!;
  }

  return app;
}

export function getAdminFirestore() {
  return admin.firestore(getAdminApp());
}

/** Default Storage bucket for firm files (timesheet PDFs, etc.). */
export function getAdminStorageBucket() {
  const bucketName =
    process.env.FIREBASE_STORAGE_BUCKET?.trim() || firebaseConfig.storageBucket;
  return admin.storage(getAdminApp()).bucket(bucketName);
}


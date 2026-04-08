import { App, cert, getApp, initializeApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { firebaseConfig } from "@/firebase/config";
import { isPlanportStaffEmail } from "@/lib/planport-admin-client";

const PLANPORT_PROJECT_ID = firebaseConfig.projectId;
const PLANPORT_STORAGE_BUCKET =
  process.env.PLANPORT_STORAGE_BUCKET?.trim() || firebaseConfig.storageBucket;
/** Isolated app name so we never reuse a wrong default Admin app from ADC / another package. */
const PLANPORT_ADMIN_APP = "planport-admin";

function assertPlanportServiceAccount(parsed: { project_id?: string }) {
  const pid = parsed.project_id;
  if (!pid) return;
  if (pid !== PLANPORT_PROJECT_ID) {
    throw new Error(
      `Firebase Admin is using service account project "${pid}" but PlanPort Auth uses "${PLANPORT_PROJECT_ID}". ` +
        `Download a service account JSON from Firebase Console → PlanPort project (${PLANPORT_PROJECT_ID}) → Project settings → Service accounts. ` +
        `Do not use the Designer's Ledger (${pid}) key for verifying admin tokens. ` +
        `Set PLANPORT_FIREBASE_SERVICE_ACCOUNT_JSON (or FIREBASE_SERVICE_ACCOUNT_JSON) to that PlanPort JSON.`
    );
  }
}

/**
 * Admin SDK must use the same Firebase project as the web app Auth (PlanPort),
 * not the Designer's Ledger project — otherwise verifyIdToken fails on "aud" mismatch.
 *
 * We do **not** fall back to `initializeApp({ projectId })` without a credential: that uses
 * Application Default Credentials, which on your machine often points at Designer's Ledger
 * (gcloud ADC or GOOGLE_APPLICATION_CREDENTIALS), producing the wrong `aud` error.
 */
function initFirebaseAdmin(): App {
  try {
    return getApp(PLANPORT_ADMIN_APP);
  } catch {
    /* not created yet */
  }

  const json =
    process.env.PLANPORT_FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ||
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ||
    process.env.FIREBAE_SERVICE_ACCOUNT_JSON?.trim();

  if (!json) {
    throw new Error(
      `PlanPort Firebase Admin: no service account JSON in environment. ` +
        `Set PLANPORT_FIREBASE_SERVICE_ACCOUNT_JSON in .env.local (one line, full JSON). ` +
        `Also accepted: FIREBASE_SERVICE_ACCOUNT_JSON. Check spelling — FIREBAE_SERVICE_ACCOUNT_JSON is wrong. ` +
        `If this variable is missing, Node may use Application Default Credentials from another Firebase project ` +
        `(e.g. designers-ledger) and ID token verification fails with an "aud" mismatch. ` +
        `Restart \`npm run dev\` after changing .env.local.`
    );
  }

  let parsed: { project_id?: string };
  try {
    parsed = JSON.parse(json) as { project_id?: string };
  } catch {
    throw new Error(
      "PlanPort Firebase Admin: service account env value is not valid JSON."
    );
  }

  assertPlanportServiceAccount(parsed);

  return initializeApp(
    {
      credential: cert(parsed as any),
      projectId: PLANPORT_PROJECT_ID,
      storageBucket: PLANPORT_STORAGE_BUCKET,
    },
    PLANPORT_ADMIN_APP
  );
}

export function getPlanportAdminFirestore() {
  return getFirestore(initFirebaseAdmin());
}

export function getPlanportAdminStorage() {
  return getStorage(initFirebaseAdmin());
}

export function getPlanportAdminBucket() {
  return getPlanportAdminStorage().bucket(PLANPORT_STORAGE_BUCKET);
}

export function getPlanportStorageBucketName(): string {
  return PLANPORT_STORAGE_BUCKET;
}

export async function verifyIdToken(idToken: string) {
  const auth = getAuth(initFirebaseAdmin());
  return auth.verifyIdToken(idToken);
}

export async function assertCalendarAdmin(idToken: string | null) {
  if (!idToken?.trim()) {
    throw new Error("Unauthorized");
  }
  const decoded = await verifyIdToken(idToken);
  const email = decoded.email?.toLowerCase();
  if (!isPlanportStaffEmail(email)) {
    throw new Error("Forbidden");
  }
  return { uid: decoded.uid, email: email! };
}

/**
 * PlanPort admin: allowlisted emails or `adminRoles/{uid}` in Firestore (same idea as the client app).
 */
export async function assertPlanportAdmin(
  idToken: string | null
): Promise<DecodedIdToken> {
  if (!idToken?.trim()) {
    throw new Error("Unauthorized");
  }
  const decoded = await verifyIdToken(idToken);
  const email = decoded.email?.toLowerCase();
  if (isPlanportStaffEmail(email)) {
    return decoded;
  }
  const snap = await getPlanportAdminFirestore()
    .collection("adminRoles")
    .doc(decoded.uid)
    .get();
  if (!snap.exists) {
    throw new Error("Forbidden");
  }
  return decoded;
}

/** True if this signed-in user is treated as PlanPort staff/admin (same basis as {@link assertPlanportAdmin}). */
export async function isPlanportAdminDecoded(
  decoded: DecodedIdToken
): Promise<boolean> {
  if (isPlanportStaffEmail(decoded.email)) return true;
  const snap = await getPlanportAdminFirestore()
    .collection("adminRoles")
    .doc(decoded.uid)
    .get();
  return snap.exists;
}

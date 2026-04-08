"use client";

import { useCallback, useEffect, useRef } from "react";
import { doc, getDoc, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import { useFirestore, useUser } from "@planport/firebase";
import { getClientMessaging, registerFcmToken } from "@/firebase/messaging";
import { PLANPORT_CLIENT_ROOT, PLANPORT_GC_ROOT } from "@/lib/planport-project-paths";

export type FcmHubRegistration =
  | { kind: "client"; hubId: string }
  | { kind: "gc"; hubId: string };

const FCM_SW_PATH = "/firebase-messaging-sw.js";
/** Firebase v11 modular SDK has no onTokenRefresh; periodic getToken covers rotation. */
const TOKEN_REFRESH_MS = 6 * 60 * 60 * 1000;
const STALE_MS = 30 * 24 * 60 * 60 * 1000;

function getVapidKey(): string | null {
  const k = process.env.NEXT_PUBLIC_FCM_VAPID_KEY?.trim();
  return k || null;
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    return await navigator.serviceWorker.register(FCM_SW_PATH);
  } catch {
    return null;
  }
}

async function persistToken(
  db: import("firebase/firestore").Firestore,
  uid: string,
  token: string
): Promise<void> {
  await setDoc(
    doc(db, "fcmTokens", uid),
    { token, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

async function persistRecipient(
  db: import("firebase/firestore").Firestore,
  hub: FcmHubRegistration,
  uid: string
): Promise<void> {
  const id = hub.hubId.trim();
  if (!id) return;
  const root = hub.kind === "gc" ? PLANPORT_GC_ROOT : PLANPORT_CLIENT_ROOT;
  await setDoc(
    doc(db, root, id, "notificationRecipients", uid),
    { updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/**
 * Registers FCM when permission is granted; stores token on `fcmTokens/{uid}`.
 * Optionally registers this device under
 * `individualClients/{hubId}/notificationRecipients/{uid}` or
 * `generalContractors/{hubId}/notificationRecipients/{uid}`.
 */
export function useFcmToken(hub: FcmHubRegistration | null | undefined) {
  const db = useFirestore();
  const { user } = useUser();
  const uid = user?.uid ?? null;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const syncToken = useCallback(
    async (force = false) => {
      if (!uid || typeof window === "undefined") {
        return;
      }
      if (typeof Notification === "undefined" || Notification.permission !== "granted") {
        return;
      }
      const vapidKey = getVapidKey();
      if (!vapidKey) {
        console.warn("FCM: NEXT_PUBLIC_FCM_VAPID_KEY is not set.");
        return;
      }
      try {
        const messaging = await getClientMessaging();
        if (!messaging) {
          return;
        }
        const reg = await registerServiceWorker();
        if (!reg) {
          return;
        }
        const tokenRef = doc(db, "fcmTokens", uid);
        const existing = await getDoc(tokenRef);
        const updatedAt = existing.data()?.updatedAt as Timestamp | undefined;
        const stale =
          !updatedAt ||
          (typeof updatedAt.toMillis === "function" &&
            Date.now() - updatedAt.toMillis() > STALE_MS);
        const hasToken = typeof existing.data()?.token === "string" && !!existing.data()!.token;

        if (!force && hasToken && !stale) {
          if (hub?.hubId?.trim()) {
            await persistRecipient(db, hub, uid);
          }
          return;
        }

        const token = await registerFcmToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: reg,
        });
        if (!token) {
          return;
        }
        await persistToken(db, uid, token);
        if (hub?.hubId?.trim()) {
          await persistRecipient(db, hub, uid);
        }
      } catch (e) {
        console.warn("FCM token sync failed:", e);
      }
    },
    [hub, db, uid]
  );

  /** Full registration after user clicks Enable (or permission already granted). */
  const registerAfterPermission = useCallback(async () => {
    if (!uid) {
      return;
    }
    try {
      const messaging = await getClientMessaging();
      if (!messaging) {
        return;
      }
      const vapidKey = getVapidKey();
      if (!vapidKey) {
        return;
      }
      const reg = await registerServiceWorker();
      if (!reg) {
        return;
      }
      const token = await registerFcmToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: reg,
      });
      if (!token) {
        return;
      }
      await persistToken(db, uid, token);
      if (hub?.hubId?.trim()) {
        await persistRecipient(db, hub, uid);
      }
    } catch (e) {
      console.warn("FCM registration failed:", e);
    }
  }, [hub, db, uid]);

  useEffect(() => {
    if (!uid) {
      return;
    }
    void syncToken(false);
  }, [syncToken, uid]);

  useEffect(() => {
    if (!uid || typeof window === "undefined") {
      return;
    }
    intervalRef.current = setInterval(() => {
      void syncToken(true);
    }, TOKEN_REFRESH_MS);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [syncToken, uid]);

  return { registerAfterPermission };
}

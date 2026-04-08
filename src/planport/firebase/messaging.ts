"use client";

/**
 * Firebase Cloud Messaging — browser only.
 * Keep firebase config in sync with {@link ../firebase/config.ts} and `public/firebase-messaging-sw.js`.
 */
import { getApp, getApps } from "firebase/app";
import type { Messaging, MessagePayload } from "firebase/messaging";

let messagingSingleton: Promise<Messaging | null> | null = null;

export async function getClientMessaging(): Promise<Messaging | null> {
  if (typeof window === "undefined") {
    return null;
  }
  messagingSingleton ??= (async () => {
    try {
      const { isSupported, getMessaging } = await import("firebase/messaging");
      if (!(await isSupported())) {
        return null;
      }
      const app = getApps().length ? getApp() : null;
      if (!app) {
        return null;
      }
      return getMessaging(app);
    } catch {
      return null;
    }
  })();
  return messagingSingleton;
}

export async function registerFcmToken(
  messaging: Messaging,
  options: { vapidKey: string; serviceWorkerRegistration: ServiceWorkerRegistration }
): Promise<string> {
  const { getToken } = await import("firebase/messaging");
  return getToken(messaging, {
    vapidKey: options.vapidKey,
    serviceWorkerRegistration: options.serviceWorkerRegistration,
  });
}

export async function subscribeForegroundMessages(
  messaging: Messaging,
  next: (payload: MessagePayload) => void
): Promise<() => void> {
  const { onMessage } = await import("firebase/messaging");
  return onMessage(messaging, next);
}

export type { MessagePayload, Messaging };

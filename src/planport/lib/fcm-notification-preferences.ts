import { doc, type Firestore } from "firebase/firestore";

/**
 * Client notification preference keys (Firestore + Cloud Functions).
 * Document: users/{uid}/notificationPreferences/settings
 */
export const NOTIFICATION_PREFERENCES_DOC = "settings" as const;

export type NotificationPreferenceKey =
  | "newMessage"
  | "documentReady"
  | "approvalRequest"
  | "invoiceIssued"
  | "meetingReminder"
  | "milestoneReached";

export const DEFAULT_NOTIFICATION_PREFERENCES: Record<NotificationPreferenceKey, boolean> = {
  newMessage: true,
  documentReady: true,
  approvalRequest: true,
  invoiceIssued: true,
  meetingReminder: true,
  milestoneReached: false,
};

export function mergeNotificationPreferences(
  partial: Partial<Record<NotificationPreferenceKey, boolean>> | null | undefined
): Record<NotificationPreferenceKey, boolean> {
  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...(partial ?? {}),
  };
}

export function notificationPreferencesDocRef(db: Firestore, uid: string) {
  return doc(db, "users", uid, "notificationPreferences", NOTIFICATION_PREFERENCES_DOC);
}

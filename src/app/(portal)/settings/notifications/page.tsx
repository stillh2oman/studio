import type { Metadata } from "next";
import { NotificationPreferencesClient } from "./NotificationPreferencesClient";

export const metadata: Metadata = {
  title: "Notification settings | PlanPort",
};

export default function NotificationSettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <NotificationPreferencesClient />
    </div>
  );
}

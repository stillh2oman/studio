"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { Header } from "@planport/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useFirestore, useUser } from "@planport/firebase";
import { useFcmToken } from "@planport/hooks/use-fcm-token";
import {
  mergeNotificationPreferences,
  notificationPreferencesDocRef,
  type NotificationPreferenceKey,
} from "@/lib/fcm-notification-preferences";
import { ArrowLeft } from "lucide-react";

const ROWS: { key: NotificationPreferenceKey; label: string }[] = [
  { key: "newMessage", label: "New messages" },
  { key: "documentReady", label: "New shared documents" },
  { key: "approvalRequest", label: "Approvals & agreements" },
  { key: "invoiceIssued", label: "Invoices & billing" },
  { key: "meetingReminder", label: "Meeting reminders" },
  { key: "milestoneReached", label: "Project milestones" },
];

export function NotificationPreferencesClient() {
  const db = useFirestore();
  const { user, isUserLoading } = useUser();
  const uid = user?.uid ?? null;
  const { registerAfterPermission } = useFcmToken(null);

  const [prefs, setPrefs] = useState(mergeNotificationPreferences(undefined));
  const [ready, setReady] = useState(false);

  const prefRef = useMemo(
    () => (uid ? notificationPreferencesDocRef(db, uid) : null),
    [db, uid]
  );

  useEffect(() => {
    if (!prefRef) {
      setReady(!!uid);
      return;
    }
    const unsub = onSnapshot(prefRef, (snap) => {
      const data = snap.data() as Partial<Record<NotificationPreferenceKey, boolean>> | undefined;
      setPrefs(mergeNotificationPreferences(data));
      setReady(true);
    });
    return () => unsub();
  }, [prefRef, uid]);

  const toggle = async (key: NotificationPreferenceKey, value: boolean) => {
    if (!uid || !prefRef) {
      return;
    }
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    await setDoc(
      prefRef,
      {
        ...next,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  };

  useEffect(() => {
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted" &&
      uid
    ) {
      void registerAfterPermission();
    }
  }, [registerAfterPermission, uid]);

  if (isUserLoading) {
    return (
      <div className="container mx-auto px-6 py-16 text-muted-foreground text-sm">Loading…</div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-6 py-16 space-y-4 max-w-lg">
        <p className="text-foreground font-medium">Sign in to manage notification preferences.</p>
        <Button asChild variant="outline">
          <Link href="/portal">Back to PlanPort</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-6 py-10 max-w-xl space-y-6">
        <Button asChild variant="ghost" size="sm" className="w-fit -ml-2 gap-2">
          <Link href="/portal">
            <ArrowLeft className="h-4 w-4" />
            Home
          </Link>
        </Button>
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-xl">Push notifications</CardTitle>
            <CardDescription>
              Choose which PlanPort updates send a browser notification. Changes save automatically.
              Milestone alerts are off by default; all other types start on until you turn them off.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!ready ? (
              <p className="text-sm text-muted-foreground">Loading preferences…</p>
            ) : (
              ROWS.map((row) => (
                <div
                  key={row.key}
                  className="flex items-center justify-between gap-4 border-b border-border pb-4 last:border-0 last:pb-0"
                >
                  <Label htmlFor={`pref-${row.key}`} className="text-sm font-medium cursor-pointer">
                    {row.label}
                  </Label>
                  <Switch
                    id={`pref-${row.key}`}
                    checked={prefs[row.key]}
                    onCheckedChange={(v) => void toggle(row.key, v)}
                  />
                </div>
              ))
            )}
            <p className="text-xs text-muted-foreground leading-relaxed">
              Allow browser notifications when prompted on your project hub so we can deliver these
              alerts. You can change permission anytime in your browser settings.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

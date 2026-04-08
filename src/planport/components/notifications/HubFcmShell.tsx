"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@planport/firebase";
import { getClientMessaging, subscribeForegroundMessages } from "@/firebase/messaging";
import { useFcmToken, type FcmHubRegistration } from "@planport/hooks/use-fcm-token";
import { useToast } from "@/hooks/use-toast";
import { NotificationPermissionBanner } from "@planport/components/notifications/NotificationPermissionBanner";
import { ToastAction } from "@/components/ui/toast";

function toInAppPath(clickUrl: string | undefined): string {
  if (!clickUrl || typeof window === "undefined") {
    return "/portal";
  }
  try {
    const u = clickUrl.startsWith("http")
      ? new URL(clickUrl)
      : new URL(clickUrl, window.location.origin);
    return `${u.pathname}${u.search}${u.hash}` || "/portal";
  } catch {
    return clickUrl.startsWith("/") ? clickUrl : "/portal";
  }
}

export function HubFcmShell({ hub }: { hub: FcmHubRegistration }) {
  const { user } = useUser();
  const { registerAfterPermission } = useFcmToken(hub);
  const { toast } = useToast();
  const router = useRouter();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const routerRef = useRef(router);
  routerRef.current = router;

  const handleEnableFromBanner = useCallback(async () => {
    if (typeof Notification === "undefined") {
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      await registerAfterPermission();
    }
  }, [registerAfterPermission]);

  useEffect(() => {
    if (!user?.uid) {
      return;
    }
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      const messaging = await getClientMessaging();
      if (!messaging || cancelled) {
        return;
      }
      unsubscribe = await subscribeForegroundMessages(messaging, (payload) => {
        const title =
          payload.notification?.title ||
          (payload.data?.title as string | undefined) ||
          "PlanPort";
        const body =
          payload.notification?.body || (payload.data?.body as string | undefined) || "";
        const raw = payload.data?.clickUrl as string | undefined;
        const path = toInAppPath(raw);
        toastRef.current({
          title,
          description: body,
          action: (
            <ToastAction
              altText="Open"
              onClick={() => routerRef.current.push(path)}
            >
              Open
            </ToastAction>
          ),
        });
      });
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [user?.uid]);

  return <NotificationPermissionBanner onEnable={handleEnableFromBanner} />;
}

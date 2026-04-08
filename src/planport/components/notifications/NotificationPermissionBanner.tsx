"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "planport-fcm-banner-dismissed";

function readDismissed(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function NotificationPermissionBanner({
  onEnable,
}: {
  onEnable: () => void | Promise<void>;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  useEffect(() => {
    if (dismissed) {
      setVisible(false);
      return;
    }
    if (typeof Notification === "undefined") {
      setVisible(false);
      return;
    }
    setVisible(Notification.permission === "default");
  }, [dismissed]);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }, []);

  const enable = useCallback(async () => {
    await onEnable();
    setVisible(false);
  }, [onEnable]);

  if (!visible) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="Browser notifications"
      className="w-full border-b border-border bg-secondary/80 backdrop-blur-sm"
    >
      <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <p className="text-sm text-foreground flex-1 leading-relaxed">
          Enable notifications to get real-time updates on your project, invoices, and approvals.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button type="button" size="sm" className="uppercase tracking-wide" onClick={() => void enable()}>
            Enable
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label="Dismiss"
            onClick={dismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

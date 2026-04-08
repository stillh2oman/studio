"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";

/** Clears OAuth query params after showing a toast (admin page). */
export function AdminQuickBooksOAuthFeedback() {
  const sp = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const qb = sp.get("quickbooks");
    const err = sp.get("quickbooks_error");
    if (!qb && !err) return;
    handled.current = true;

    if (qb === "connected") {
      toast({
        title: "QuickBooks connected",
        description: "OAuth completed. Add storage for refresh tokens when you call the QBO API.",
      });
    } else if (err) {
      toast({
        variant: "destructive",
        title: "QuickBooks connection failed",
        description: err,
      });
    }
    router.replace("/admin");
  }, [sp, router, toast]);

  return null;
}

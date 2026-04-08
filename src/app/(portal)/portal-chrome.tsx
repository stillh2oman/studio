"use client";

import { CanonicalHostRedirect } from "@planport/components/CanonicalHostRedirect";
import { Footer } from "@planport/components/layout/Footer";
import { HelpChatWidget } from "@planport/components/layout/HelpChatWidget";
import { PortalFirebaseSubtree } from "./portal-firebase-subtree";

export function PortalChrome({ children }: { children: React.ReactNode }) {
  return (
    <PortalFirebaseSubtree>
      <CanonicalHostRedirect />
      <div className="planport-portal-root dark flex min-h-screen flex-col text-foreground">
        <div className="flex-1">{children}</div>
        <Footer />
      </div>
      <HelpChatWidget />
    </PortalFirebaseSubtree>
  );
}

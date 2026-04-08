import type { Metadata } from "next";
import { PortalChrome } from "./portal-chrome";
import { CANONICAL_HOST_NAME } from "@/lib/canonical-host";

/**
 * Firebase Hosting (Web Frameworks) + Google edge was returning HTML with
 * `Cache-Control: s-maxage=31536000` and serving stale documents after deploy,
 * so the app can get stuck on stale shells. Force dynamic HTML
 * so each request gets fresh shell + current `/_next/static/*` references.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(`https://${CANONICAL_HOST_NAME}`),
  title: "Designer's Ink PlanPort - Secure Blueprint Hub",
  description:
    "Official Designer's Ink platform for secure blueprint access, version control, and field printing services.",
  manifest: "/manifest.json",
};

export default function PortalSegmentLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <PortalChrome>{children}</PortalChrome>;
}

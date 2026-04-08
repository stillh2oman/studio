import type { ReactNode } from "react";
import { HubFcmShell } from "@planport/components/notifications/HubFcmShell";

export default async function ClientDashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  return (
    <>
      <HubFcmShell hub={{ kind: "client", hubId: clientId }} />
      {children}
    </>
  );
}

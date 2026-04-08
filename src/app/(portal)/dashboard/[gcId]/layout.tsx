import type { ReactNode } from "react";
import { HubFcmShell } from "@planport/components/notifications/HubFcmShell";

export default async function ContractorDashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ gcId: string }>;
}) {
  const { gcId } = await params;
  return (
    <>
      <HubFcmShell hub={{ kind: "gc", hubId: gcId }} />
      {children}
    </>
  );
}

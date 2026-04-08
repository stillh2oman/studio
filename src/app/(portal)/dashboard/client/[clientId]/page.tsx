import { ClientDashboardPageClient } from "./ClientDashboardPageClient";

export default async function ClientDashboardPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  return <ClientDashboardPageClient clientId={clientId} />;
}

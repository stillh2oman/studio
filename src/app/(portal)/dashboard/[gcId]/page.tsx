import { ContractorDashboardPageClient } from "./ContractorDashboardPageClient";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ gcId: string }>;
}) {
  const { gcId } = await params;
  return <ContractorDashboardPageClient gcId={gcId} />;
}

import { ContractSignPageClient } from "./ContractSignPageClient";

export default async function ContractSignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ContractSignPageClient token={token} />;
}

import { qbCompanyBaseUrl, QBO_MINOR_VERSION } from "@/lib/quickbooks/qbo-queries";

export { getValidQuickBooksAccessToken } from "@/lib/quickbooks/refreshToken";

export type QboInvoiceRow = {
  Id: string;
  DocNumber?: string;
  TxnDate?: string;
  TotalAmt?: number;
  Balance?: string | number;
  /** Present on query/read when QuickBooks returns line detail. */
  Line?: unknown[];
  CustomerRef?: { value?: string; name?: string };
  BillEmail?: { Address?: string };
  CustomerMemo?: { value?: string };
};

function unwrapQueryInvoices(json: Record<string, unknown>): QboInvoiceRow[] {
  const qr = json.QueryResponse as Record<string, unknown> | undefined;
  if (!qr || !qr.Invoice) return [];
  const inv = qr.Invoice;
  return Array.isArray(inv) ? (inv as QboInvoiceRow[]) : [inv as QboInvoiceRow];
}

export async function queryRecentInvoices(
  realmId: string,
  accessToken: string,
  maxResults = 100
): Promise<QboInvoiceRow[]> {
  const tryQueries = [
    `select Id, DocNumber, TxnDate, TotalAmt, Balance, CustomerRef, BillEmail, Line from Invoice order by TxnDate DESC MAXRESULTS ${maxResults}`,
    `select Id, DocNumber, TxnDate, TotalAmt, Balance, CustomerRef, BillEmail from Invoice order by TxnDate DESC MAXRESULTS ${maxResults}`,
    `select Id, DocNumber, TxnDate, TotalAmt, CustomerRef, BillEmail from Invoice order by TxnDate DESC MAXRESULTS ${maxResults}`,
  ];

  let lastErr = "QBO query failed.";
  for (const q of tryQueries) {
    const url = new URL(`${qbCompanyBaseUrl(realmId)}/query`);
    url.searchParams.set("query", q);
    url.searchParams.set("minorversion", QBO_MINOR_VERSION);

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (res.ok) {
      return unwrapQueryInvoices(json);
    }
    const fault = json.Fault as { Error?: { Detail?: string; Message?: string }[] } | undefined;
    lastErr = fault?.Error?.[0]?.Detail || fault?.Error?.[0]?.Message || `HTTP ${res.status}`;
  }
  throw new Error(lastErr);
}

export async function getCustomerPrimaryEmail(
  realmId: string,
  accessToken: string,
  customerId: string
): Promise<string | null> {
  const url = `${qbCompanyBaseUrl(realmId)}/customer/${encodeURIComponent(customerId)}?minorversion=${QBO_MINOR_VERSION}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) return null;
  const cust = json.Customer as
    | { PrimaryEmailAddr?: { Address?: string } }
    | undefined;
  const addr = cust?.PrimaryEmailAddr?.Address?.trim();
  return addr || null;
}

export function normalizeBillingEmail(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  if (!t.includes("@")) return null;
  return t;
}

export async function readInvoiceById(
  realmId: string,
  accessToken: string,
  invoiceId: string
): Promise<QboInvoiceRow | null> {
  const url = `${qbCompanyBaseUrl(realmId)}/invoice/${encodeURIComponent(invoiceId)}?minorversion=${QBO_MINOR_VERSION}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) return null;
  const inv = json.Invoice as QboInvoiceRow | undefined;
  return inv ?? null;
}

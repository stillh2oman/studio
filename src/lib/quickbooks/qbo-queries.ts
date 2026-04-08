export const QBO_MINOR_VERSION = "65";

export function qbCompanyBaseUrl(realmId: string): string {
  return `https://quickbooks.api.intuit.com/v3/company/${encodeURIComponent(realmId)}`;
}

/** Intuit query language: escape single quotes with backslash. */
export function escapeQuickBooksQueryLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export class QuickBooksRateLimitError extends Error {
  constructor(message = "QuickBooks is busy (rate limit). Please wait a minute and try again.") {
    super(message);
    this.name = "QuickBooksRateLimitError";
  }
}

export class QuickBooksApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "QuickBooksApiError";
    this.status = status;
  }
}

function faultMessage(json: Record<string, unknown>): string | null {
  const fault = json.Fault as { Error?: { Detail?: string; Message?: string }[] } | undefined;
  const row = fault?.Error?.[0];
  return row?.Detail || row?.Message || null;
}

export async function qboFetchJson(
  url: string,
  accessToken: string,
  init?: RequestInit
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers as Record<string, string>),
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (res.status === 429) {
    throw new QuickBooksRateLimitError();
  }
  if (!res.ok) {
    const msg = faultMessage(json) || `QuickBooks request failed (HTTP ${res.status}).`;
    throw new QuickBooksApiError(res.status, msg);
  }
  return json;
}

export async function qboQuery(
  realmId: string,
  accessToken: string,
  querySql: string
): Promise<Record<string, unknown>> {
  const url = new URL(`${qbCompanyBaseUrl(realmId)}/query`);
  url.searchParams.set("query", querySql);
  url.searchParams.set("minorversion", QBO_MINOR_VERSION);
  return qboFetchJson(url.toString(), accessToken);
}

export type QboGetInvoiceOptions = {
  /** Ask QBO for the customer-facing pay/view URL (connect.intuit.com) when available. */
  includeInvoiceLink?: boolean;
};

export async function qboGetInvoice(
  realmId: string,
  accessToken: string,
  invoiceId: string,
  options?: QboGetInvoiceOptions
): Promise<Record<string, unknown>> {
  const u = new URL(`${qbCompanyBaseUrl(realmId)}/invoice/${encodeURIComponent(invoiceId)}`);
  u.searchParams.set("minorversion", QBO_MINOR_VERSION);
  if (options?.includeInvoiceLink) {
    u.searchParams.set("include", "invoiceLink");
  }
  const res = await fetch(u.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (res.status === 429) {
    throw new QuickBooksRateLimitError();
  }
  if (res.status === 404) {
    throw new QuickBooksApiError(404, "Invoice not found in QuickBooks.");
  }
  if (!res.ok) {
    const msg = faultMessage(json) || `QuickBooks invoice read failed (HTTP ${res.status}).`;
    throw new QuickBooksApiError(res.status, msg);
  }
  return json;
}

function unwrapQueryEntities(json: Record<string, unknown>, entityKey: string): Record<string, unknown>[] {
  const qr = json.QueryResponse as Record<string, unknown> | undefined;
  if (!qr || !qr[entityKey]) return [];
  const row = qr[entityKey];
  return Array.isArray(row) ? (row as Record<string, unknown>[]) : [row as Record<string, unknown>];
}

export type QboCustomerRow = {
  Id?: string;
  DisplayName?: string;
  PrimaryEmailAddr?: { Address?: string };
};

export async function queryCustomersByPrimaryEmail(
  realmId: string,
  accessToken: string,
  email: string
): Promise<QboCustomerRow[]> {
  const esc = escapeQuickBooksQueryLiteral(email.trim());
  const sql = `select Id, DisplayName, PrimaryEmailAddr from Customer where PrimaryEmailAddr = '${esc}' MAXRESULTS 20`;
  const json = await qboQuery(realmId, accessToken, sql);
  return unwrapQueryEntities(json, "Customer") as QboCustomerRow[];
}

export type QboInvoiceListRow = {
  Id?: string;
  DocNumber?: string;
  TxnDate?: string;
  DueDate?: string;
  Balance?: string | number;
  CustomerRef?: { value?: string; name?: string };
};

export function parseQboMoney(v: string | number | undefined | null): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export async function queryOpenInvoicesForCustomer(
  realmId: string,
  accessToken: string,
  customerId: string
): Promise<QboInvoiceListRow[]> {
  const esc = escapeQuickBooksQueryLiteral(customerId);
  const sql = `select Id, DocNumber, TxnDate, DueDate, Balance, CustomerRef from Invoice where CustomerRef = '${esc}' and Balance > '0' MAXRESULTS 100`;
  const json = await qboQuery(realmId, accessToken, sql);
  return unwrapQueryEntities(json, "Invoice") as QboInvoiceListRow[];
}

export async function queryAllOpenInvoices(
  realmId: string,
  accessToken: string,
  maxResults = 200
): Promise<QboInvoiceListRow[]> {
  const sql = `select Id, DocNumber, TxnDate, DueDate, Balance, CustomerRef from Invoice where Balance > '0' MAXRESULTS ${maxResults}`;
  const json = await qboQuery(realmId, accessToken, sql);
  return unwrapQueryEntities(json, "Invoice") as QboInvoiceListRow[];
}

export type QboInvoiceDetail = {
  Id: string;
  DocNumber: string;
  TxnDate: string;
  DueDate: string;
  Balance: number;
  CustomerName: string;
};

export function mapInvoiceEntity(inv: Record<string, unknown>): QboInvoiceDetail | null {
  const Id = inv.Id != null ? String(inv.Id) : "";
  if (!Id) return null;
  const DocNumber = inv.DocNumber != null ? String(inv.DocNumber) : "";
  const TxnDate = inv.TxnDate != null ? String(inv.TxnDate) : "";
  const DueDate = inv.DueDate != null ? String(inv.DueDate) : "";
  const Balance = parseQboMoney(inv.Balance as string | number | undefined);
  const cref = inv.CustomerRef as { name?: string } | undefined;
  const CustomerName = cref?.name?.trim() || "Customer";
  return { Id, DocNumber, TxnDate, DueDate, Balance, CustomerName };
}

const STAFF_QBO_INVOICE_HOSTS = new Set(["app.qbo.intuit.com", "app.sandbox.qbo.intuit.com"]);

/** Customer payer portal URL from `include=invoiceLink` read (e.g. connect.intuit.com/...). */
export function extractInvoicePaymentLink(inv: Record<string, unknown>): string | null {
  const raw = inv.InvoiceLink ?? inv.invoiceLink;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("https://")) return null;
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    if (!host.endsWith("intuit.com")) return null;
    if (STAFF_QBO_INVOICE_HOSTS.has(host)) return null;
    return trimmed;
  } catch {
    return null;
  }
}

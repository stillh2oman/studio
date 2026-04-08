"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Auth } from "firebase/auth";
import { useAuth } from "@/firebase/provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CreditCard, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export type ClientBillingSummaryProps = {
  projectId: string;
  hubType: "client" | "gc";
  hubId: string;
  quickbooksInvoiceId: string;
  /** Persisted customer pay link from Firestore (no QBO staff sign-in required). */
  quickbooksInvoicePaymentUrl?: string | null;
};

function formatMoney(n: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);
}

function formatDisplayDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { dateStyle: "long" });
}

const STAFF_QBO_HOSTS = new Set(["app.qbo.intuit.com", "app.sandbox.qbo.intuit.com"]);

/** Only Intuit payer URLs — never staff QBO app (requires sign-in). */
function normalizeCustomerPayUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t.startsWith("https://")) return null;
  try {
    const host = new URL(t).hostname.toLowerCase();
    if (!host.endsWith("intuit.com")) return null;
    if (STAFF_QBO_HOSTS.has(host)) return null;
    return t;
  } catch {
    return null;
  }
}

async function fetchWithIdToken(auth: Auth, input: string, init?: RequestInit) {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in.");
  const token = await user.getIdToken();
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

/** True when there is a positive balance and the due date (calendar day) is before today. */
function isPastDue(balance: number, dueDateRaw: string): boolean {
  if (balance <= 0) return false;
  const due = dueDateRaw ? new Date(dueDateRaw) : null;
  if (!due || Number.isNaN(due.getTime())) return false;
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return startOfToday > startOfDue;
}

export function ClientBillingSummary({
  projectId,
  hubType,
  hubId,
  quickbooksInvoiceId,
  quickbooksInvoicePaymentUrl,
}: ClientBillingSummaryProps) {
  const auth = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState<string>("");
  const [paymentUrlFromApi, setPaymentUrlFromApi] = useState<string | null>(null);

  const urlFromFirestore = useMemo(
    () => normalizeCustomerPayUrl(quickbooksInvoicePaymentUrl),
    [quickbooksInvoicePaymentUrl]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        projectId,
        hubType,
        hubId,
      });
      const res = await fetchWithIdToken(
        auth,
        `/api/quickbooks/project-billing-summary?${qs.toString()}`
      );
      const data = (await res.json()) as {
        balance?: number;
        dueDate?: string;
        paymentUrl?: string | null;
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setBalance(typeof data.balance === "number" ? data.balance : 0);
      setDueDate(data.dueDate ?? "");
      setPaymentUrlFromApi(normalizeCustomerPayUrl(data.paymentUrl));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load billing.");
      setBalance(null);
      setDueDate("");
      setPaymentUrlFromApi(null);
    } finally {
      setLoading(false);
    }
  }, [auth, hubId, hubType, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pastDue = balance != null && isPastDue(balance, dueDate);
  const payHref = urlFromFirestore ?? paymentUrlFromApi ?? null;

  return (
    <Card className="border-border bg-card" key={`qb-billing-${quickbooksInvoiceId}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-ledger-red shrink-0" />
          Billing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-9 w-48" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTitle>Billing</AlertTitle>
            <AlertDescription className="text-sm">{error}</AlertDescription>
          </Alert>
        ) : (
          <>
            {pastDue ? (
              <p className="text-sm font-bold uppercase tracking-widest text-destructive">PAST DUE</p>
            ) : null}
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Outstanding balance</dt>
                <dd className="text-lg font-semibold text-foreground">{formatMoney(balance ?? 0)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Due date</dt>
                <dd
                  className={cn(
                    "text-lg font-semibold",
                    pastDue ? "text-destructive" : "text-foreground"
                  )}
                >
                  {formatDisplayDate(dueDate)}
                </dd>
              </div>
            </dl>
            {payHref ? (
              <Button type="button" className="w-full sm:w-auto" asChild>
                <a href={payHref} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Pay invoice in QuickBooks
                </a>
              </Button>
            ) : (
              <Alert className="border-amber-500/40 bg-secondary">
                <AlertTitle className="text-foreground">Payment link not available yet</AlertTitle>
                <AlertDescription className="text-sm text-muted-foreground">
                  QuickBooks did not return a customer pay link for this invoice (enable online invoice /
                  payments in QuickBooks, or run <strong className="text-foreground">Apply approved to project billing</strong>{" "}
                  in Admin after linking). We never send clients to the staff QuickBooks sign-in page.
                </AlertDescription>
              </Alert>
            )}
            <div className="rounded-md border border-border bg-secondary/50 p-4 space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              <p className="text-foreground font-medium text-sm">Payment terms</p>
              <p>
                In lieu of requiring payment in advance like most designers, we require all invoices be paid within 10
                days of billing.
              </p>
              <p>
                If payment is not received within 10 days, we must pay our employees for the work they completed on
                your project out of pocket until we receive payment. For that reason, all future work on your project
                will stop until past due invoices are paid in full.
              </p>
              <p>Clients with a history of past due payments may be asked to make advance payment for future work.</p>
              <p>
                We accept credit cards, debit cards, Venmo, PayPal and electronic checks. You may also apply for an
                interest-free payment plan through Affirm in the payment portal.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

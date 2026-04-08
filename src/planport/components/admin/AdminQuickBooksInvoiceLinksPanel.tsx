"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser, useCollection, useMemoFirebase } from "@planport/firebase";
import { useDirectoryStore } from "@/firebase/use-directory-store";
import { PLANPORT_CLIENT_ROOT, PLANPORT_GC_ROOT } from "@/lib/planport-project-paths";
import { collection } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  listQbInvoiceLinksAction,
  syncQuickBooksInvoiceLinksAction,
  approveQbInvoiceLinkAction,
  rejectQbInvoiceLinkAction,
  manualLinkQbInvoiceAction,
  pushApprovedQbLinksToProjectsAction,
  type QbInvoiceLinkRow,
} from "@/ai/flows/quickbooks-invoice-links-admin";
import { Loader2, RefreshCw, Receipt, Link2 } from "lucide-react";

function formatUsd(n: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);
}

function designerLineBadge(match: string | null | undefined) {
  switch (match) {
    case "dillon":
      return (
        <Badge variant="outline" className="border-blue-500/50 text-blue-700 dark:text-blue-300">
          Dillon
        </Badge>
      );
    case "walthall":
      return (
        <Badge variant="outline" className="border-violet-500/50 text-violet-700 dark:text-violet-300">
          Walthall
        </Badge>
      );
    case "both":
      return (
        <Badge variant="outline" className="border-border text-foreground">
          Dillon + Walthall
        </Badge>
      );
    default:
      return null;
  }
}

export type HubClientOption = { id: string; label: string };
export type HubGcOption = { id: string; label: string };

function statusBadge(status: string) {
  switch (status) {
    case "suggested":
      return (
        <Badge variant="outline" className="border-ledger-yellow/50 text-ledger-yellow">
          Awaiting approval
        </Badge>
      );
    case "unmatched":
      return <Badge variant="destructive">No email match</Badge>;
    case "approved":
      return (
        <Badge className="bg-primary text-primary-foreground">Linked</Badge>
      );
    case "rejected":
      return <Badge variant="secondary">Rejected</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function AdminQuickBooksInvoiceLinksPanel({
  clients,
  gcs,
}: {
  clients: HubClientOption[];
  gcs: HubGcOption[];
}) {
  const { user } = useUser();
  const { toast } = useToast();
  const { planportDb } = useDirectoryStore();
  const [items, setItems] = useState<QbInvoiceLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [balanceView, setBalanceView] = useState<"all" | "open">("all");
  const [designerView, setDesignerView] = useState<"all" | "dillon" | "walthall">("all");

  const [syncOnlyOpen, setSyncOnlyOpen] = useState(false);
  const [syncDesigner, setSyncDesigner] = useState<"all" | "dillon" | "walthall">("all");

  const [manualHubType, setManualHubType] = useState<"client" | "gc">("client");
  const [manualHubId, setManualHubId] = useState("");
  const [manualProjectId, setManualProjectId] = useState("");
  const [manualInvoiceId, setManualInvoiceId] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [pushingToProjects, setPushingToProjects] = useState(false);

  const loadLinks = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await listQbInvoiceLinksAction(token);
      if (res.ok) {
        setItems(res.items);
      } else {
        toast({ variant: "destructive", title: "Could not load links", description: res.error });
        setItems([]);
      }
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  const projectsQuery = useMemoFirebase(() => {
    if (!manualHubId) return null;
    const root = manualHubType === "client" ? PLANPORT_CLIENT_ROOT : PLANPORT_GC_ROOT;
    return collection(planportDb, root, manualHubId, "projects");
  }, [planportDb, manualHubType, manualHubId]);

  const { data: manualProjects, isLoading: manualProjectsLoading } =
    useCollection(projectsQuery);

  const sortedManualProjects = useMemo(() => {
    const list = (manualProjects ?? []) as { id: string; name?: string }[];
    return [...list].sort((a, b) =>
      (a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: "base" })
    );
  }, [manualProjects]);

  const filtered = useMemo(() => {
    let rows =
      filter === "all"
        ? items
        : filter === "pending"
          ? items.filter((r) => r.status === "suggested" || r.status === "unmatched")
          : items.filter((r) => r.status === filter);
    if (balanceView === "open") {
      rows = rows.filter((r) => (r.qbBalance ?? 0) > 0.009);
    }
    if (designerView === "dillon") {
      rows = rows.filter(
        (r) => r.qbDesignerLineMatch === "dillon" || r.qbDesignerLineMatch === "both"
      );
    }
    if (designerView === "walthall") {
      rows = rows.filter(
        (r) => r.qbDesignerLineMatch === "walthall" || r.qbDesignerLineMatch === "both"
      );
    }
    return rows;
  }, [items, filter, balanceView, designerView]);

  const handlePushApprovedToProjects = async () => {
    if (!user) return;
    setPushingToProjects(true);
    try {
      const token = await user.getIdToken();
      const res = await pushApprovedQbLinksToProjectsAction(token);
      if (res.ok) {
        toast({
          title: "Project billing fields updated",
          description: `Re-applied ${res.updated} approved link(s) to project docs (including any hub copies found by project id). Refresh the project hub.`,
        });
      } else {
        toast({ variant: "destructive", title: "Update failed", description: res.error });
      }
    } finally {
      setPushingToProjects(false);
    }
  };

  const handleSync = async () => {
    if (!user) return;
    setSyncing(true);
    try {
      const token = await user.getIdToken();
      const res = await syncQuickBooksInvoiceLinksAction(token, {
        onlyOutstandingBalance: syncOnlyOpen,
        designerLineFilter: syncDesigner,
      });
      if (res.ok) {
        toast({
          title: "QuickBooks sync complete",
          description: `Fetched ${res.fetched} invoices from QuickBooks, updated ${res.written} link rows.${
            res.skippedByFilter > 0
              ? ` ${res.skippedByFilter} skipped (sync filters).`
              : ""
          }`,
        });
        await loadLinks();
      } else {
        toast({ variant: "destructive", title: "Sync failed", description: res.error });
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleApprove = async (firestoreId: string) => {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await approveQbInvoiceLinkAction(token, firestoreId);
    if (res.ok) {
      toast({
        title: "Link approved",
        description: `Saved QuickBooks invoice on ${res.projectCopiesUpdated} project document(s). Open the project hub to see billing.`,
      });
      await loadLinks();
    } else {
      toast({ variant: "destructive", title: "Approve failed", description: res.error });
    }
  };

  const handleReject = async (firestoreId: string) => {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await rejectQbInvoiceLinkAction(token, firestoreId);
    if (res.ok) {
      toast({ title: "Suggestion rejected" });
      await loadLinks();
    } else {
      toast({ variant: "destructive", title: "Reject failed", description: res.error });
    }
  };

  const handleManualLink = async () => {
    if (!user) return;
    if (!manualInvoiceId.trim() || !manualHubId || !manualProjectId) {
      toast({
        variant: "destructive",
        title: "Missing fields",
        description: "Enter the QuickBooks Invoice ID and pick hub + project.",
      });
      return;
    }
    setManualSubmitting(true);
    try {
      const token = await user.getIdToken();
      const res = await manualLinkQbInvoiceAction(token, {
        qbInvoiceId: manualInvoiceId.trim(),
        hubType: manualHubType,
        hubId: manualHubId,
        projectId: manualProjectId,
      });
      if (res.ok) {
        toast({ title: "Invoice linked to project" });
        setManualInvoiceId("");
        setManualProjectId("");
        await loadLinks();
      } else {
        toast({ variant: "destructive", title: "Manual link failed", description: res.error });
      }
    } finally {
      setManualSubmitting(false);
    }
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Receipt className="w-5 h-5 text-ledger-yellow" />
          Invoices ↔ Projects
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 text-sm text-muted-foreground">
        <p>
          Sync pulls recent QuickBooks invoices and matches billing emails to PlanPort client /
          contractor contacts and linked projects. Approve each suggestion, or link an invoice by
          ID when no email match is found.           <strong className="text-foreground">Linking happens only here in Admin</strong>
          — hubs show a read-only billing card (balance, due date, pay in QuickBooks) only when a project has a
          linked invoice: <strong className="text-foreground">private client hub</strong> when the project lists an
          individual client, otherwise the <strong className="text-foreground">contractor hub only</strong> (one place
          per project). Approving writes the invoice to the{" "}
          <strong className="text-foreground">project</strong>. If an older approval predates that behavior, use{" "}
          <strong className="text-foreground">Apply approved to project billing</strong> once.
        </p>
        <div className="rounded-md border border-border bg-secondary/40 p-3 space-y-3">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Sync scope</p>
          <p className="text-xs text-muted-foreground">
            Limit what gets written on this run (QuickBooks still returns the latest 150 invoices; rows that
            don&apos;t match are skipped).
          </p>
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:items-end">
            <div className="flex items-center gap-2">
              <Checkbox
                id="qb-sync-open-only"
                checked={syncOnlyOpen}
                onCheckedChange={(v) => setSyncOnlyOpen(v === true)}
              />
              <Label htmlFor="qb-sync-open-only" className="text-sm font-normal cursor-pointer">
                Only invoices with outstanding balance
              </Label>
            </div>
            <div className="space-y-1 min-w-[200px]">
              <Label className="text-xs">Product / service lines contain</Label>
              <Select
                value={syncDesigner}
                onValueChange={(v) => setSyncDesigner(v as "all" | "dillon" | "walthall")}
              >
                <SelectTrigger className="h-9 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All (any line items)</SelectItem>
                  <SelectItem value="dillon">&quot;Dillon&quot; in item name</SelectItem>
                  <SelectItem value="walthall">&quot;Walthall&quot; in item name</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Button
            type="button"
            variant="default"
            className="bg-primary text-primary-foreground"
            disabled={!user || syncing}
            onClick={() => void handleSync()}
          >
            {syncing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Sync from QuickBooks
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void loadLinks()}>
            Refresh list
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!user || pushingToProjects}
            onClick={() => void handlePushApprovedToProjects()}
          >
            {pushingToProjects ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Apply approved to project billing
          </Button>
          <div className="flex gap-1 flex-wrap">
            {(
              [
                ["pending", "Pending review"],
                ["approved", "Approved"],
                ["rejected", "Rejected"],
                ["all", "All"],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={filter === key ? "secondary" : "ghost"}
                className={filter === key ? "border border-border" : ""}
                onClick={() => setFilter(key)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:items-end">
          <div className="space-y-1 min-w-[180px]">
            <Label className="text-xs">List: balance</Label>
            <Select value={balanceView} onValueChange={(v) => setBalanceView(v as "all" | "open")}>
              <SelectTrigger className="h-9 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All invoices</SelectItem>
                <SelectItem value="open">Outstanding balance only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 min-w-[220px]">
            <Label className="text-xs">List: product / service name</Label>
            <Select
              value={designerView}
              onValueChange={(v) => setDesignerView(v as "all" | "dillon" | "walthall")}
            >
              <SelectTrigger className="h-9 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="dillon">Includes &quot;Dillon&quot;</SelectItem>
                <SelectItem value="walthall">Includes &quot;Walthall&quot;</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center py-8 border border-dashed border-border rounded-md">
            No rows for this filter. Run <strong className="text-foreground">Sync from QuickBooks</strong>{" "}
            after connecting.
          </p>
        ) : (
          <div className="space-y-3 max-h-[480px] overflow-y-auto border border-border rounded-md">
            {filtered.map((row) => (
              <div
                key={row.firestoreId}
                className="p-4 border-b border-border last:border-0 space-y-2 bg-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">
                        Invoice #{row.qbDocNumber || row.qbInvoiceId}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          (QBO Id {row.qbInvoiceId})
                        </span>
                      </p>
                      {designerLineBadge(row.qbDesignerLineMatch)}
                    </div>
                    <p className="text-xs">
                      {row.qbTxnDate ? `Date ${row.qbTxnDate}` : null}
                      {row.qbTotalAmt != null ? ` · Total ${formatUsd(row.qbTotalAmt)}` : null}
                      {row.qbBalance != null
                        ? ` · Balance ${formatUsd(row.qbBalance)}${row.qbBalance <= 0 ? " (paid)" : ""}`
                        : null}
                    </p>
                    <p className="text-xs break-all">
                      Email: {row.billEmailNorm || "—"}{" "}
                      {row.customerDisplayName ? ` · ${row.customerDisplayName}` : ""}
                    </p>
                    <p className="text-xs text-foreground/90">
                      <Link2 className="w-3 h-3 inline mr-1" />
                      {row.hubType === "client" ? "Client hub" : "Contractor hub"}: {row.hubLabel} →{" "}
                      {row.projectName}
                      {row.emailMatchAmbiguous ? (
                        <span className="text-ledger-yellow ml-1">
                          (multiple projects share this email — verify)
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide">
                      {row.matchSource === "manual" ? "Manual link" : "Email match"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {statusBadge(row.status)}
                    {row.status === "suggested" ? (
                      <div className="flex gap-1">
                        <Button size="sm" className="h-8" onClick={() => void handleApprove(row.firestoreId)}>
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => void handleReject(row.firestoreId)}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : null}
                    {row.status === "unmatched" ? (
                      <p className="text-[10px] max-w-[200px] text-right">
                        Use manual link below with this Invoice ID.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-md border border-dashed border-border p-4 space-y-4">
          <p className="font-medium text-foreground">Manual link</p>
          <p className="text-xs">
            In QuickBooks, open the invoice — the numeric <strong className="text-foreground">Id</strong> in
            the URL or API is what to paste here (not only the printed invoice number).
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="qb-inv-id">QuickBooks Invoice Id</Label>
              <Input
                id="qb-inv-id"
                value={manualInvoiceId}
                onChange={(e) => setManualInvoiceId(e.target.value)}
                placeholder="e.g. 184"
              />
            </div>
            <div className="space-y-2">
              <Label>Hub type</Label>
              <Select
                value={manualHubType}
                onValueChange={(v) => {
                  setManualHubType(v as "client" | "gc");
                  setManualHubId("");
                  setManualProjectId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Private client hub</SelectItem>
                  <SelectItem value="gc">Contractor hub</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Hub</Label>
              <Select
                value={manualHubId || undefined}
                onValueChange={(v) => {
                  setManualHubId(v);
                  setManualProjectId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  {(manualHubType === "client" ? clients : gcs).map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Project</Label>
              <Select
                value={manualProjectId || undefined}
                onValueChange={setManualProjectId}
                disabled={!manualHubId || manualProjectsLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={manualHubId ? "Choose project…" : "Pick hub first"} />
                </SelectTrigger>
                <SelectContent>
                  {sortedManualProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name || p.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            type="button"
            disabled={manualSubmitting || !user}
            onClick={() => void handleManualLink()}
          >
            {manualSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Link invoice to project
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

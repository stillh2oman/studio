"use client";

import { Suspense, useMemo, useState } from "react";
import { Header } from "@planport/components/layout/Header";
import { useCollection, useMemoFirebase } from "@planport/firebase";
import { useDirectoryStore } from "@/firebase/use-directory-store";
import { collection, query, orderBy, where } from "firebase/firestore";
import { getDataAccessMode, CANONICAL_CLIENTS_COLLECTION } from "@/lib/shared-data/feature-flags";
import type { SharedClientDoc } from "@/lib/shared-data/canonical-types";
import {
  mapCanonicalToGcDirectoryRow,
  mapCanonicalToPrivateDirectoryClient,
} from "@/lib/shared-data/planport-canonical-adapters";
import { Building2, LayoutDashboard, Home, Sparkles, FileText, Link2, CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { CreateGCDialog } from "@planport/components/admin/CreateGCDialog";
import { CreateClientDialog } from "@planport/components/admin/CreateClientDialog";
import { EditGCDialog } from "@planport/components/admin/EditGCDialog";
import { CreateProjectDialog } from "@planport/components/admin/CreateProjectDialog";
import { BackupRestoreDialog } from "@planport/components/admin/BackupRestoreDialog";
import { PendingMeetingsPanel } from "@planport/components/admin/PendingMeetingsPanel";
import { AdminClientOnboardingTab } from "@planport/components/admin/AdminClientOnboardingTab";
import { AdminContractsSection } from "@planport/components/admin/AdminContractsSection";
import { PrivateClientDirectoryCard } from "@planport/components/admin/PrivateClientDirectoryCard";
import { dropboxImgSrc } from "@/lib/dropbox-utils";
import { PlanportLogoMark } from "@planport/components/branding/BrandMarks";
import { AdminQuickBooksOAuthFeedback } from "@planport/components/admin/AdminQuickBooksOAuthFeedback";
import { QUICKBOOKS_REDIRECT_URI_PRODUCTION } from "@/lib/quickbooks-oauth-constants";
import { AdminQuickBooksInvoiceLinksPanel } from "@planport/components/admin/AdminQuickBooksInvoiceLinksPanel";

export function AdminPortalClient() {
  const [activeTab, setActiveTab] = useState("contractors");
  const [clientsSection, setClientsSection] = useState<"directory" | "contracts">("directory");

  const { directoryDb, contractorsCollection, clientsCollection, isLedgerPrimary } = useDirectoryStore();

  const canonicalFirmId = process.env.NEXT_PUBLIC_CANONICAL_FIRM_ID?.trim();
  const mode = getDataAccessMode();
  const useCanonAdminList =
    !!canonicalFirmId && (mode === "canonical_read" || mode === "canonical_read_write");

  const gcQuery = useMemoFirebase(
    () => {
      if (!directoryDb) return null;
      if (useCanonAdminList && canonicalFirmId) {
        return query(
          collection(directoryDb, CANONICAL_CLIENTS_COLLECTION),
          where("firmId", "==", canonicalFirmId),
          where("accountKind", "==", "contractor")
        );
      }
      return query(collection(directoryDb, contractorsCollection), orderBy("name"));
    },
    [directoryDb, contractorsCollection, useCanonAdminList, canonicalFirmId]
  );
  const { data: gcsRaw, isLoading: gcsLoading } = useCollection(gcQuery);

  const clientsQuery = useMemoFirebase(
    () => {
      if (!directoryDb) return null;
      if (useCanonAdminList && canonicalFirmId) {
        return query(
          collection(directoryDb, CANONICAL_CLIENTS_COLLECTION),
          where("firmId", "==", canonicalFirmId),
          where("accountKind", "==", "residential")
        );
      }
      return query(collection(directoryDb, clientsCollection), orderBy("husbandName"));
    },
    [directoryDb, clientsCollection, useCanonAdminList, canonicalFirmId]
  );
  const { data: privateClientsRaw, isLoading: clientsLoading } = useCollection(clientsQuery);

  const gcs = useMemo(() => {
    if (!useCanonAdminList || !gcsRaw) return gcsRaw;
    const mapped = gcsRaw
      .map((g) => mapCanonicalToGcDirectoryRow(g as SharedClientDoc & { id: string }))
      .filter(Boolean) as { id: string; name?: string; billingEmail?: string; logoUrl?: string | null; accessCode?: string }[];
    return mapped.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [useCanonAdminList, gcsRaw]);

  const clients = useMemo(() => {
    if (!useCanonAdminList || !privateClientsRaw) return privateClientsRaw;
    const mapped = privateClientsRaw
      .map((c) => mapCanonicalToPrivateDirectoryClient(c as SharedClientDoc & { id: string }))
      .filter(Boolean) as {
      id: string;
      husbandName: string;
      wifeName?: string | null;
      address?: string | null;
      accessCode?: string;
      email?: string;
      phone?: string;
      allowDownloads?: boolean;
    }[];
    return mapped.sort((a, b) => a.husbandName.localeCompare(b.husbandName));
  }, [useCanonAdminList, privateClientsRaw]);

  const clientHubOptions = useMemo(() => {
    if (!clients?.length) return [];
    return clients.map((c: { id: string; husbandName?: string; wifeName?: string }) => ({
      id: c.id,
      label: c.wifeName
        ? `${c.husbandName || "Client"} & ${c.wifeName}`
        : c.husbandName || c.id,
    }));
  }, [clients]);

  const gcHubOptions = useMemo(() => {
    if (!gcs?.length) return [];
    return gcs.map((gc: { id: string; name?: string }) => ({
      id: gc.id,
      label: gc.name || gc.id,
    }));
  }, [gcs]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header userName="Designer's Ink Administrator" />
      <Suspense fallback={null}>
        <AdminQuickBooksOAuthFeedback />
      </Suspense>

      <main className="flex-1 container mx-auto px-6 py-12 space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 planport-surface-glass p-10 rounded-md border border-border">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-4xl md:text-5xl font-bold uppercase tracking-wide text-foreground">
                PlanPort Admin
              </h1>
              <Badge variant="outline" className="text-ledger-yellow border-ledger-yellow/45 h-fit uppercase tracking-wide">
                Proprietary
              </Badge>
            </div>
            <p className="text-sm uppercase tracking-wide text-muted-foreground font-semibold">
              Manage Project Sharing
            </p>
            {isLedgerPrimary && (
              <p className="text-sm text-muted-foreground font-medium">
                Directory sync: client & contractor profiles load from the shared Designer's Ledger Firebase project.
                Blueprint data stays in PlanPort.
              </p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <BackupRestoreDialog />
          </div>
        </div>

        <PendingMeetingsPanel />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <TabsList className="bg-secondary border border-border p-1 h-auto min-h-14 flex-wrap justify-start gap-1 py-1">
              <TabsTrigger
                value="contractors"
                className="h-12 px-6 sm:px-8 text-sm font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <Building2 className="w-5 h-5 mr-2" /> General Contractors
              </TabsTrigger>
              <TabsTrigger
                value="clients"
                className="h-12 px-6 sm:px-8 text-sm font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <Home className="w-5 h-5 mr-2" /> Individual Clients
              </TabsTrigger>
              <TabsTrigger
                value="onboarding"
                className="h-12 px-6 sm:px-8 text-sm font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <Sparkles className="w-5 h-5 mr-2" /> Client Onboarding
              </TabsTrigger>
              <TabsTrigger
                value="billing"
                className="h-12 px-6 sm:px-8 text-sm font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <CreditCard className="w-5 h-5 mr-2" /> Invoices (QuickBooks)
              </TabsTrigger>
            </TabsList>
            {activeTab === "contractors" ? (
              <CreateGCDialog />
            ) : activeTab === "clients" ? (
              <CreateClientDialog />
            ) : null}
          </div>

          <TabsContent value="contractors">
            {gcsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array(3)
                  .fill(0)
                  .map((_, i) => (
                    <Card key={i} className="animate-pulse h-64 bg-secondary" />
                  ))}
              </div>
            ) : gcs && gcs.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {gcs.map((gc) => (
                  <Card
                    key={gc.id}
                    className="group overflow-hidden border-border hover:border-muted-foreground/40 transition-colors duration-200 bg-card"
                  >
                    <div className="h-32 bg-secondary relative flex items-center justify-center border-b border-border overflow-hidden">
                      {gc.logoUrl?.trim() ? (
                        <img
                          src={dropboxImgSrc(gc.logoUrl)}
                          alt={gc.name}
                          className="h-24 w-auto max-w-full object-contain"
                        />
                      ) : (
                        <PlanportLogoMark className="h-24 w-auto object-contain" />
                      )}
                      <div className="absolute top-4 right-4 flex flex-col gap-2 items-end">
                        <Badge className="bg-primary text-primary-foreground font-mono">{gc.accessCode}</Badge>
                      </div>
                    </div>
                    <CardHeader>
                      <CardTitle className="text-xl text-foreground">{gc.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-col gap-2">
                        <Link href={`/dashboard/${gc.id}`} className="w-full">
                          <Button
                            variant="outline"
                            className="w-full justify-between hover:bg-accent hover:text-accent-foreground bg-card"
                          >
                            Open Contractor Hub
                            <LayoutDashboard className="w-4 h-4 ml-2" />
                          </Button>
                        </Link>
                        <CreateProjectDialog type="gc" parentId={gc.id} parentName={gc.name} />
                        <EditGCDialog gc={gc} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="py-20 flex flex-col items-center justify-center bg-card rounded-md border border-dashed border-border text-center space-y-4">
                <Building2 className="w-16 h-16 text-muted-foreground/40" />
                <div className="space-y-2">
                  <h3 className="text-xl font-bold uppercase tracking-wide text-foreground">No Contractors Registered</h3>
                  <p className="text-muted-foreground max-w-xs mx-auto text-sm">
                    Add your first general contractor to begin managing their project hubs.
                  </p>
                </div>
                <CreateGCDialog />
              </div>
            )}
          </TabsContent>

          <TabsContent value="clients">
            <Tabs
              value={clientsSection}
              onValueChange={(v) => setClientsSection(v as "directory" | "contracts")}
              className="w-full"
            >
              <TabsList className="bg-secondary border border-border p-1 h-auto min-h-11 flex-wrap justify-start gap-1 mb-8">
                <TabsTrigger
                  value="directory"
                  className="h-10 px-4 text-xs font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Client directory
                </TabsTrigger>
                <TabsTrigger
                  value="contracts"
                  className="h-10 px-4 text-xs font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Contracts
                </TabsTrigger>
              </TabsList>

              <TabsContent value="directory" className="mt-0 outline-none">
                {clientsLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Array(3)
                      .fill(0)
                      .map((_, i) => (
                        <Card key={i} className="animate-pulse h-64 bg-secondary" />
                      ))}
                  </div>
                ) : clients && clients.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {clients.map((client) => (
                      <PrivateClientDirectoryCard key={client.id} client={client} />
                    ))}
                  </div>
                ) : (
                  <div className="py-20 flex flex-col items-center justify-center bg-card rounded-md border border-dashed border-border text-center space-y-4">
                    <Home className="w-16 h-16 text-muted-foreground/40" />
                    <div className="space-y-2">
                      <h3 className="text-xl font-bold uppercase tracking-wide text-foreground">No Private Clients Found</h3>
                      <p className="text-muted-foreground max-w-md mx-auto text-sm">
                        Onboard your first private homeowner to manage their custom residence project. Completed
                        onboarding questionnaires are saved when clients submit the packet—you can import them when
                        adding a client or when adding another project under an existing client.
                      </p>
                    </div>
                    <CreateClientDialog />
                  </div>
                )}
              </TabsContent>

              <TabsContent value="contracts" className="mt-0 outline-none">
                <AdminContractsSection
                  clients={
                    (clients ?? []).map((c) => ({
                      id: c.id,
                      husbandName: c.husbandName,
                      wifeName: c.wifeName,
                    })) as { id: string; husbandName: string; wifeName?: string | null }[]
                  }
                />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="onboarding">
            <AdminClientOnboardingTab />
          </TabsContent>

          <TabsContent value="billing">
            <div className="space-y-8">
              <Card className="border-border bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Link2 className="w-5 h-5 text-ledger-yellow" />
                    QuickBooks Online
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-muted-foreground">
                  <p>
                    In the Intuit Developer Portal, set the Redirect URI to exactly:
                  </p>
                  <code className="block break-all rounded-md border border-border bg-secondary px-3 py-2 text-xs text-foreground">
                    {QUICKBOOKS_REDIRECT_URI_PRODUCTION}
                  </code>
                  <p>
                    The Connect button sends that same URI as <code className="text-foreground">redirect_uri</code>{" "}
                    to Intuit (or <code className="text-foreground">QUICKBOOKS_REDIRECT_URI</code> from env if set).
                  </p>
                  <p>
                    On Firebase App Hosting, if you see redirects to{" "}
                    <code className="text-foreground">0.0.0.0:8080</code>, set{" "}
                    <code className="text-foreground">PLANPORT_PUBLIC_ORIGIN</code> to your live site URL (see{" "}
                    <code className="text-foreground">.env.example</code>).
                  </p>
                  <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90 w-full sm:w-auto">
                    <a href="/api/auth/quickbooks">Connect</a>
                  </Button>
                </CardContent>
              </Card>
              <AdminQuickBooksInvoiceLinksPanel clients={clientHubOptions} gcs={gcHubOptions} />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

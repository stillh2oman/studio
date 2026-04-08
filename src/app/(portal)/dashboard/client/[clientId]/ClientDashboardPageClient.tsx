
"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Header } from "@planport/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { QRShare } from "@planport/components/auth/QRShare";
import { AddBlueprintDialog } from "@planport/components/blueprints/AddBlueprintDialog";
import { AddRenderingDialog } from "@planport/components/admin/AddRenderingDialog";
import { EditRenderingDialog } from "@planport/components/admin/EditRenderingDialog";
import { AddChiefArchitectFileDialog } from "@planport/components/admin/AddChiefArchitectFileDialog";
import { EditProjectDialog } from "@planport/components/admin/EditProjectDialog";
import { DeleteProjectButton } from "@planport/components/admin/DeleteProjectButton";
import { CreateProjectDialog } from "@planport/components/admin/CreateProjectDialog";
import { AdminProjectUploadToolbar } from "@planport/components/admin/AdminProjectUploadToolbar";
import { NotifyBuilderButton } from "@planport/components/blueprints/NotifyBuilderButton";
import { SecureFileUploadDialog } from "@planport/components/layout/SecureFileUploadDialog";
import { MessageDesignerDialog } from "@planport/components/layout/MessageDesignerDialog";
import { ProjectMeetingStatus } from "@planport/components/scheduling/ProjectMeetingStatus";
import { useDoc, useCollection, useFirestore, useMemoFirebase, useUser } from "@planport/firebase";
import { useDirectoryStore } from "@/firebase/use-directory-store";
import { PLANPORT_CLIENT_ROOT } from "@/lib/planport-project-paths";
import { PROJECT_SIGNING_REQUESTS_SUBCOLLECTION } from "@/lib/planport-contract-types";
import { doc, collection, query, orderBy, deleteDoc } from "firebase/firestore";
import { dropboxImgSrc, toDirectDropboxFileUrl } from "@/lib/dropbox-utils";
import { useToast } from "@/hooks/use-toast";
import { 
  FolderOpen, 
  ChevronRight, 
  Archive, 
  LayoutGrid, 
  User,
  Home,
  MapPin,
  ImageIcon,
  FileArchive,
  ArrowLeft,
  DownloadCloud,
  Users,
  Info,
  Construction,
  Clock,
  ExternalLink,
  Download,
  Trash2,
  Loader2,
  AlertTriangle,
  CloudUpload,
  MessageSquareText,
  FileText,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { emailsFromClientDirectoryRecord } from "@/lib/notify-recipient-emails";
import { syncClientProjectToContractorIfEnabled } from "@/lib/contractor-project-sync";
import { SyncToContractorDialog } from "@planport/components/client/SyncToContractorDialog";
import {
  DesignersInkBodyBannerMark,
  ProjectCoverImage,
  DropboxRenderingImage,
} from "@planport/components/branding/BrandMarks";
import { isPlanportAdminClient } from "@/lib/planport-admin-client";
import { ClientHubOnboardingIntakeCard } from "@planport/components/client/ClientHubOnboardingIntakeCard";
import type { ProjectOnboardingIntake } from "@/lib/onboarding-submission-types";
import { SendContractForProjectDialog } from "@planport/components/admin/SendContractForProjectDialog";
import { ProjectInspirationTab } from "@planport/components/project/ProjectInspirationTab";
import { ClientBillingSummary } from "@planport/components/project/ClientBillingSummary";

const PDFViewer = dynamic(
  () =>
    import("@planport/components/blueprints/PDFViewer").then((mod) => ({
      default: mod.PDFViewer,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[400px] items-center justify-center rounded-md border border-border bg-card">
        <Loader2 className="h-8 w-8 animate-spin text-foreground" />
      </div>
    ),
  }
);

const HUB_TABS = new Set([
  "viewer",
  "renderings",
  "files",
  "documents",
  "inspiration",
  "archive",
]);

const ScheduleMeetingDialog = dynamic(
  () =>
    import("@planport/components/scheduling/ScheduleMeetingDialog").then((mod) => ({
      default: mod.ScheduleMeetingDialog,
    })),
  { ssr: false }
);

const DESIGNER_DETAILS: Record<string, { title: string; email: string }> = {
  "Jeff Dillon": {
    title: "Owner / Designer",
    email: "jeff@designersink.us"
  },
  "Kevin Walthall": {
    title: "Designer",
    email: "kevin@designersink.us"
  }
};

export function ClientDashboardPageClient({ clientId }: { clientId: string }) {
  const db = useFirestore();
  const searchParams = useSearchParams();
  const { directoryDb, clientsCollection, planportDb } = useDirectoryStore();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  
  const adminRoleRef = useMemoFirebase(() => user ? doc(db, "adminRoles", user.uid) : null, [db, user]);
  const { data: adminRole } = useDoc(adminRoleRef);
  const isAdmin = isPlanportAdminClient(user, adminRole);
  /** Match Header admin detection: do not gate on `isUserLoading` (can disagree and hide toolbar while Admin Portal shows). */
  const isStaffDesigner = isAdmin;

  const clientDocRef = useMemoFirebase(
    () => doc(directoryDb, clientsCollection, clientId),
    [directoryDb, clientsCollection, clientId]
  );
  const { data: client } = useDoc(clientDocRef);

  const clientNotifyEmails = useMemo(
    () => emailsFromClientDirectoryRecord(client),
    [client]
  );

  const clientHubDisplayName = useMemo(() => {
    if (!client?.husbandName) return "Client";
    return client.wifeName
      ? `${client.husbandName} & ${client.wifeName}`
      : client.husbandName;
  }, [client]);
  
  const projectsQuery = useMemoFirebase(
    () => query(collection(planportDb, PLANPORT_CLIENT_ROOT, clientId, "projects")),
    [planportDb, clientId]
  );
  const { data: projects, isLoading: projectsLoading } = useCollection(projectsQuery);

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("viewer");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && HUB_TABS.has(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);
  
  const activeProject = projects?.find(p => p.id === activeProjectId);

  const linkedQuickBooksInvoiceId = useMemo(() => {
    if (!activeProject) return null;
    const raw = (activeProject as { quickbooksInvoiceId?: string | null }).quickbooksInvoiceId;
    const s = raw != null ? String(raw).trim() : "";
    return s || null;
  }, [activeProject]);

  const activeProjectOnboardingIntake = (activeProject as { onboardingIntake?: ProjectOnboardingIntake } | undefined)
    ?.onboardingIntake;
  
  const blueprintsQuery = useMemoFirebase(() => {
    if (!clientId || !activeProjectId) return null;
    return query(
      collection(planportDb, PLANPORT_CLIENT_ROOT, clientId, "projects", activeProjectId, "blueprints"),
      orderBy("uploadedAt", "desc")
    );
  }, [planportDb, clientId, activeProjectId]);
  const { data: blueprints, isLoading: blueprintsLoading, error: blueprintsError } =
    useCollection(blueprintsQuery);

  const revisionHistory = useMemo(() => {
    const list = (blueprints ?? []) as any[];
    const latest = list.filter((b) => b.status === "latest");
    const archived = list
      .filter((b) => b.status !== "latest")
      .sort((a, b) => (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? ""));
    return [...latest, ...archived];
  }, [blueprints]);

  const renderingsQuery = useMemoFirebase(() => {
    if (!clientId || !activeProjectId) return null;
    return query(
      collection(planportDb, PLANPORT_CLIENT_ROOT, clientId, "projects", activeProjectId, "renderings"),
      orderBy("uploadedAt", "desc")
    );
  }, [planportDb, clientId, activeProjectId]);
  const { data: renderings, isLoading: renderingsLoading } = useCollection(renderingsQuery);

  const chiefFilesQuery = useMemoFirebase(() => {
    if (!clientId || !activeProjectId || activeTab !== "files") return null;
    return query(
      collection(planportDb, PLANPORT_CLIENT_ROOT, clientId, "projects", activeProjectId, "chiefFiles"),
      orderBy("uploadedAt", "desc")
    );
  }, [planportDb, clientId, activeProjectId, activeTab]);
  const { data: chiefFiles, isLoading: chiefFilesLoading } = useCollection(chiefFilesQuery);

  const documentsQuery = useMemoFirebase(() => {
    if (!clientId || !activeProjectId || activeTab !== "documents") return null;
    return collection(
      planportDb,
      PLANPORT_CLIENT_ROOT,
      clientId,
      "projects",
      activeProjectId,
      "documents"
    );
  }, [planportDb, clientId, activeProjectId, activeTab]);
  const { data: documentsRaw, isLoading: documentsLoading } = useCollection(documentsQuery);

  const projectDocuments = useMemo(() => {
    const list = (documentsRaw ?? []) as {
      id: string;
      name?: string;
      kind?: string;
      url?: string;
      uploadedAt?: string;
      agreementDate?: string;
      projectLocation?: string;
      clientDisplayName?: string;
      clientSignedAt?: string;
      designerSignedAt?: string;
      leadDesignerName?: string;
    }[];
    return [...list].sort((a, b) => (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? ""));
  }, [documentsRaw]);

  const signingRequestsQuery = useMemoFirebase(
    () =>
      clientId && activeProjectId
        ? collection(
            planportDb,
            PLANPORT_CLIENT_ROOT,
            clientId,
            "projects",
            activeProjectId,
            PROJECT_SIGNING_REQUESTS_SUBCOLLECTION
          )
        : null,
    [planportDb, clientId, activeProjectId]
  );
  const { data: signingRequestsRaw } = useCollection(signingRequestsQuery);

  const hubSigningAlerts = useMemo(() => {
    const list = (signingRequestsRaw ?? []) as {
      id: string;
      status?: string;
      templateTitle?: string;
      signToken?: string;
      agreementDate?: string;
    }[];
    return list.filter((r) => r.status === "awaiting_client" || r.status === "client_signed");
  }, [signingRequestsRaw]);

  const [selectedBlueprint, setSelectedBlueprint] = useState<any>(null);

  const blueprintMarkupPersistenceRef = useMemoFirebase(() => {
    if (!clientId || !activeProjectId || !selectedBlueprint?.id) return null;
    return doc(
      planportDb,
      PLANPORT_CLIENT_ROOT,
      clientId,
      "projects",
      activeProjectId,
      "blueprints",
      selectedBlueprint.id
    );
  }, [planportDb, clientId, activeProjectId, selectedBlueprint?.id]);

  useEffect(() => {
    if (!activeProjectId || projects == null) return;
    const exists = projects.some((p) => p.id === activeProjectId);
    if (!exists) {
      setActiveProjectId(null);
      setSelectedBlueprint(null);
    }
  }, [activeProjectId, projects]);

  useEffect(() => {
    if (blueprints && blueprints.length > 0) {
      if (!selectedBlueprint || !blueprints.find(b => b.id === selectedBlueprint.id)) {
        const latest = blueprints.find(b => b.status === 'latest') || blueprints[0];
        setSelectedBlueprint(latest);
      }
    } else {
      setSelectedBlueprint(null);
    }
  }, [blueprints]);

  const handleDeleteChiefFile = async (fileId: string, fileName: string) => {
    if (confirm(`Are you sure you want to remove the link to "${fileName}"?`)) {
      try {
        await deleteDoc(
          doc(planportDb, PLANPORT_CLIENT_ROOT, clientId, "projects", activeProjectId!, "chiefFiles", fileId)
        );
        try {
          await syncClientProjectToContractorIfEnabled(planportDb, clientId, activeProjectId!, "chiefFiles");
        } catch (mirrorErr: unknown) {
          const msg = mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr);
          toast({
            variant: "destructive",
            title: "Removed here — contractor sync failed",
            description: msg,
          });
        }
        toast({ title: "File Link Removed" });
      } catch (e: any) {
        toast({ variant: "destructive", title: "Failed to remove link", description: e.message });
      }
    }
  };

  const handleDeleteRendering = async (renderingId: string, renderingName: string) => {
    if (confirm(`Are you sure you want to remove the rendering "${renderingName}"?`)) {
      try {
        await deleteDoc(
          doc(planportDb, PLANPORT_CLIENT_ROOT, clientId, "projects", activeProjectId!, "renderings", renderingId)
        );
        try {
          await syncClientProjectToContractorIfEnabled(planportDb, clientId, activeProjectId!, "renderings");
        } catch (mirrorErr: unknown) {
          const msg = mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr);
          toast({
            variant: "destructive",
            title: "Removed here — contractor sync failed",
            description: msg,
          });
        }
        toast({ title: "Rendering Removed" });
      } catch (e: any) {
        toast({ variant: "destructive", title: "Failed to remove rendering", description: e.message });
      }
    }
  };


  if (!client && !projectsLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
        <Home className="w-12 h-12 text-muted-foreground animate-bounce" />
        <p className="text-xl font-bold uppercase tracking-wide text-foreground">Client Portfolio Not Found</p>
        <Button onClick={() => (window.location.href = "/portal")}>Return Home</Button>
      </div>
    );
  }

  const headerDesignerName = activeProject?.designerName;
  const headerDesignerInfo = headerDesignerName ? DESIGNER_DETAILS[headerDesignerName] : null;

  return (
    <div className="min-h-screen flex flex-col bg-background pb-12">
      <Header
        userName={isStaffDesigner ? undefined : client?.husbandName || "Client"}
        adminHubContext={
          isStaffDesigner ? `Viewing private client · ${clientHubDisplayName}` : undefined
        }
      />

      {user?.isAnonymous && (
        <div className="border-b border-border bg-background">
          <div className="container mx-auto px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-ledger-yellow">Guest session (access code).</span> To add blueprints, renderings, or project files, sign in on the home page with your Designer's Ink staff email (Administrator Portal)—not the client access code.
            </p>
            <Button asChild size="sm" variant="outline" className="border-ledger-red/45 shrink-0">
              <Link href="/">Staff sign-in</Link>
            </Button>
          </div>
        </div>
      )}

      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-6 flex flex-col md:flex-row items-center gap-6">
          <div className="relative w-24 h-24 rounded-md overflow-hidden border border-border bg-secondary flex items-center justify-center">
             <Home className="w-10 h-10 text-muted-foreground/40" />
          </div>
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-4xl font-bold uppercase tracking-wide text-foreground mb-2">
              {client?.husbandName}{client?.wifeName ? ` & ${client.wifeName}` : ""}'s Portfolio
            </h1>
            <div className="flex flex-wrap justify-center md:justify-start gap-4">
              <Badge variant="secondary" className="flex items-center gap-1.5 px-3 py-1">
                <LayoutGrid className="w-3.5 h-3.5" />
                {projects?.length || 0} Project Folders
              </Badge>
              {client?.allowDownloads && (
                <Badge variant="outline" className="flex items-center gap-1.5 px-3 py-1 border-ledger-yellow/45 text-ledger-yellow font-bold">
                  <DownloadCloud className="w-3.5 h-3.5" /> Downloads Enabled
                </Badge>
              )}
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            {activeProjectId && (
              <div className="bg-secondary p-3 rounded-md flex items-center gap-4 border border-border border-l-4 border-l-ledger-red/50">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">CLIENT INFO</p>
                  <p className="text-sm font-semibold text-foreground">
                    {client?.husbandName}{client?.wifeName ? ` & ${client.wifeName}` : ""}
                  </p>
                  <div className="flex flex-col gap-0.5 mt-1">
                    {client?.email && (
                      <a href={`mailto:${client.email}`} className="text-xs text-muted-foreground hover:text-ledger-yellow transition-colors font-medium">
                        {client.email}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeProjectId && headerDesignerName && (
              <div className="bg-secondary p-3 rounded-md flex items-center gap-4 border border-border border-l-4 border-l-ledger-red/50">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">DESIGNER'S INK LEAD</p>
                  <p className="text-sm font-semibold text-foreground">{headerDesignerName}</p>
                  <div className="flex flex-col gap-0.5 mt-1">
                    <span className="text-xs text-muted-foreground font-medium">{headerDesignerInfo?.title}</span>
                    {headerDesignerInfo?.email && (
                      <a href={`mailto:${headerDesignerInfo.email}`} className="text-xs text-muted-foreground hover:text-ledger-yellow transition-colors font-medium">
                        {headerDesignerInfo.email}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
            <QRShare gcName={client?.husbandName || ""} accessCode={client?.accessCode || ""} />
          </div>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-6 py-8">
        {!activeProjectId ? (
          <div className="space-y-8">
            <Card>
              <CardContent className="py-6 px-4 sm:px-10 flex justify-center bg-card">
                <DesignersInkBodyBannerMark className="h-20 sm:h-24 md:h-32 w-auto max-w-full object-contain" />
              </CardContent>
            </Card>
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
              <div className="space-y-1">
                <h2 className="text-2xl font-bold uppercase tracking-wide text-foreground">Your Project Folders</h2>
                <p className="text-muted-foreground">Select a project to view finalized blueprints and conceptual renderings.</p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <SecureFileUploadDialog 
                  trigger={<Button variant="outline"><CloudUpload className="w-4 h-4 mr-2" />Transmit Files</Button>}
                />
                {isStaffDesigner && (
                  <CreateProjectDialog type="client" parentId={clientId} parentName={clientHubDisplayName} />
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {projects?.map(project => (
                <Card
                  key={project.id}
                  className="group overflow-hidden border-border cursor-pointer transition-colors duration-200 hover:border-muted-foreground/35"
                  onClick={() => setActiveProjectId(project.id)}
                >
                  <div className="relative h-80 w-full bg-background">
                    <ProjectCoverImage
                      renderingUrl={project.renderingUrl}
                      name={project.name}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-700 ease-out"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                    {project.renderingUrl ? (
                      <span className="absolute top-3 right-3 z-10 text-[9px] font-sans font-bold uppercase tracking-wider text-ledger-yellow border border-ledger-yellow/45 px-2 py-0.5 bg-background/90">
                        Rendering
                      </span>
                    ) : null}
                    <div className="absolute bottom-4 left-4 right-4">
                      <Badge className="bg-ink text-ink-foreground font-bold uppercase tracking-wider text-[10px] border border-border">
                        {project.status}
                      </Badge>
                    </div>
                  </div>
                  <CardHeader className="pb-2 bg-card">
                    <CardTitle className="text-xl font-semibold text-foreground group-hover:text-ledger-red transition-colors duration-200">
                      {project.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-4 bg-card">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4 text-foreground shrink-0" />
                      <span className="truncate">{project.address}</span>
                    </div>
                    <div className="flex items-center justify-between pt-4 border-t border-border">
                      <div className="flex items-center gap-2 text-xs font-bold text-foreground uppercase tracking-wide">
                        <FolderOpen className="w-4 h-4 text-ledger-red" />
                        View Project Hub
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 group-hover:text-foreground transition-all duration-200" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-8">
            <aside className="w-full lg:w-72 space-y-6">
              <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setActiveProjectId(null)}><ArrowLeft className="w-4 h-4" />Back to Projects</Button>

              <div className="space-y-2">
                <SecureFileUploadDialog 
                  projectName={activeProject?.name}
                  projectAddress={activeProject?.address}
                  designerEmail={headerDesignerInfo?.email}
                  trigger={<Button className="w-full h-12 font-bold"><CloudUpload className="w-5 h-5 mr-2" />Send Project Files</Button>}
                />
                <MessageDesignerDialog
                  projectName={activeProject?.name}
                  projectAddress={activeProject?.address}
                  designerEmail={headerDesignerInfo?.email}
                  trigger={
                    <Button type="button" variant="outline" className="w-full">
                      <MessageSquareText className="w-4 h-4 mr-2" />
                      Message Designer
                    </Button>
                  }
                />
                {activeProject?.designerName === "Jeff Dillon" && activeProject && (
                  <ScheduleMeetingDialog
                    projectName={activeProject.name}
                    projectAddress={activeProject.address}
                    hubLabel={
                      [client?.husbandName, client?.wifeName].filter(Boolean).join(" & ") ||
                      undefined
                    }
                    planportHubKind="client"
                    planportHubId={clientId}
                    planportProjectId={activeProject.id}
                  />
                )}
                {isStaffDesigner && activeProject && (
                  <AdminProjectUploadToolbar
                    variant="stack"
                    hubType="client"
                    hubId={clientId}
                    projectId={activeProject.id}
                    hubName={clientHubDisplayName}
                    projectName={activeProject.name}
                    notifyRecipientEmails={clientNotifyEmails}
                  />
                )}
                {isStaffDesigner && activeProject && (
                  <SyncToContractorDialog
                    clientId={clientId}
                    projectId={activeProject.id}
                    projectName={activeProject.name}
                    contractorSyncEnabled={
                      (activeProject as { contractorSyncEnabled?: boolean }).contractorSyncEnabled === true
                    }
                    syncedContractorId={
                      (activeProject as { syncedContractorId?: string | null }).syncedContractorId ?? null
                    }
                  />
                )}
              </div>

              {activeProjectOnboardingIntake ? (
                <ClientHubOnboardingIntakeCard intake={activeProjectOnboardingIntake} />
              ) : null}

              <div className="bg-card p-4 rounded-md border border-border space-y-3">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Active Hub</h3>
                <div className="space-y-2">
                  <div className="text-sm font-bold text-foreground">{activeProject?.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1"><Construction className="w-3 h-3" />Phase: {activeProject?.status}</div>
                </div>
              </div>
            </aside>

            <div className="flex-1 space-y-6">
              {activeProject && (
                <>
                  <div className="relative min-h-[20rem] h-[min(32vh,22rem)] w-full rounded-md overflow-hidden border border-border bg-background">
                    <ProjectCoverImage
                      renderingUrl={activeProject.renderingUrl}
                      name={activeProject.name}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
                    <div className="absolute bottom-6 left-6 text-white space-y-2 flex flex-col md:flex-row justify-between items-end w-full pr-12">
                        <div>
                          <h1 className="text-4xl font-bold uppercase tracking-wide">{activeProject.name}</h1>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm opacity-90">
                            <p className="flex items-center gap-2 m-0">
                              <MapPin className="w-4 h-4 text-ledger-red shrink-0" />
                              {activeProject.address}
                            </p>
                            <ProjectMeetingStatus
                              status={
                                (activeProject as { scheduledMeetingStatus?: string })
                                  .scheduledMeetingStatus
                              }
                              startIso={
                                (
                                  activeProject as {
                                    scheduledMeetingStartIso?: string;
                                  }
                                ).scheduledMeetingStartIso
                              }
                            />
                          </div>
                        </div>
                        {isStaffDesigner && (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <DeleteProjectButton
                              hubId={clientId}
                              hubType="client"
                              project={{
                                id: activeProject.id,
                                name: activeProject.name,
                                individualClientId: (activeProject as { individualClientId?: string | null })
                                  .individualClientId,
                                generalContractorId: (activeProject as { generalContractorId?: string | null })
                                  .generalContractorId,
                              }}
                              onDeleted={() => {
                                setActiveProjectId(null);
                                setSelectedBlueprint(null);
                              }}
                            />
                            <EditProjectDialog hubId={clientId} hubType="client" project={activeProject} />
                          </div>
                        )}
                    </div>
                  </div>

                  {hubSigningAlerts.length > 0 ? (
                    <div className="space-y-3">
                      {hubSigningAlerts.map((r) =>
                        r.status === "awaiting_client" ? (
                          <Alert
                            key={r.id}
                            className="border-ledger-yellow/40 bg-card text-foreground"
                          >
                            <FileText className="h-4 w-4 shrink-0" />
                            <AlertTitle>New agreement to review and sign</AlertTitle>
                            <AlertDescription className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <span className="text-sm">
                                <strong className="text-foreground">{r.templateTitle ?? "Agreement"}</strong>
                                {r.agreementDate ? (
                                  <>
                                    {" "}
                                    · Agreement date <span className="whitespace-nowrap">{r.agreementDate}</span>
                                  </>
                                ) : null}
                                . Open the document to read it and add your electronic signature.
                              </span>
                              <Button
                                asChild
                                className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 w-full sm:w-auto"
                              >
                                <Link href={`/contract-sign/${r.signToken}`}>Review &amp; sign</Link>
                              </Button>
                            </AlertDescription>
                          </Alert>
                        ) : (
                          <Alert
                            key={r.id}
                            className="border-border bg-secondary text-muted-foreground"
                          >
                            <Clock className="h-4 w-4 shrink-0" />
                            <AlertTitle>Your signature is on file</AlertTitle>
                            <AlertDescription className="text-sm mt-1">
                              <strong className="text-foreground">{r.templateTitle ?? "Agreement"}</strong> — the lead
                              designer will countersign next. When complete, the executed PDF will appear under the
                              Documents tab.
                            </AlertDescription>
                          </Alert>
                        )
                      )}
                    </div>
                  ) : null}

                  {activeProject && linkedQuickBooksInvoiceId ? (
                    <ClientBillingSummary
                      projectId={activeProject.id}
                      hubType="client"
                      hubId={clientId}
                      quickbooksInvoiceId={linkedQuickBooksInvoiceId}
                      quickbooksInvoicePaymentUrl={
                        (activeProject as { quickbooksInvoicePaymentUrl?: string | null })
                          .quickbooksInvoicePaymentUrl ?? null
                      }
                    />
                  ) : null}

                  {user && !isUserLoading && !isAdmin && (
                    <Alert className="border-border bg-secondary">
                      <Info className="h-4 w-4 text-foreground" />
                      <AlertTitle>Add blueprints, renderings, or project files</AlertTitle>
                      <AlertDescription className="text-sm space-y-3">
                        {user.isAnonymous ? (
                          <>
                            <p>
                              You opened this hub with an access code, which does not include designer tools. Use the home page and sign in with your PlanPort admin email to link new Dropbox PDFs, images, or Chief Architect files.
                            </p>
                            <Button asChild variant="outline" size="sm" className="border-primary/40">
                              <Link href="/portal">Go to sign-in</Link>
                            </Button>
                          </>
                        ) : (
                          <p>Only PlanPort administrator accounts can add items to the project library.</p>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}

                  <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <div className="flex flex-col gap-3 mb-4">
                      <TabsList className="bg-secondary border border-border p-1 w-full flex-wrap justify-start h-auto gap-1">
                        <TabsTrigger
                          value="viewer"
                          className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:border data-[state=active]:border-border transition-colors duration-200"
                        >
                          <LayoutGrid className="w-4 h-4 mr-2" /> Latest Blueprints
                        </TabsTrigger>
                        <TabsTrigger
                          value="renderings"
                          className="data-[state=active]:bg-background data-[state=active]:text-ledger-yellow data-[state=active]:border data-[state=active]:border-ledger-yellow/40 transition-colors duration-200"
                        >
                          <ImageIcon className="w-4 h-4 mr-2" /> Renderings
                        </TabsTrigger>
                        <TabsTrigger
                          value="files"
                          className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:border data-[state=active]:border-border transition-colors duration-200"
                        >
                          <FileArchive className="w-4 h-4 mr-2" /> Project Files
                        </TabsTrigger>
                        <TabsTrigger
                          value="documents"
                          className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:border data-[state=active]:border-border transition-colors duration-200"
                        >
                          <FileText className="w-4 h-4 mr-2" /> Documents
                        </TabsTrigger>
                        <TabsTrigger
                          value="inspiration"
                          className="data-[state=active]:bg-background data-[state=active]:text-ledger-yellow data-[state=active]:border data-[state=active]:border-ledger-yellow/40 transition-colors duration-200"
                        >
                          <Sparkles className="w-4 h-4 mr-2" /> Inspiration
                        </TabsTrigger>
                        <TabsTrigger
                          value="archive"
                          className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:border data-[state=active]:border-border transition-colors duration-200"
                        >
                          <Archive className="w-4 h-4 mr-2" /> History
                        </TabsTrigger>
                      </TabsList>
                      {isStaffDesigner && (
                        <AdminProjectUploadToolbar
                          variant="wrap"
                          hubType="client"
                          hubId={clientId}
                          projectId={activeProjectId!}
                          hubName={clientHubDisplayName}
                          projectName={activeProject.name}
                          notifyRecipientEmails={clientNotifyEmails}
                        />
                      )}
                    </div>

                    <TabsContent value="viewer" className="mt-6 space-y-6">
                      {blueprintsLoading ? (
                        <div className="h-96 flex flex-col items-center justify-center bg-card rounded-md border border-dashed border-border text-center px-6">
                          <Loader2 className="w-12 h-12 animate-spin text-foreground" />
                          <p className="mt-4 text-muted-foreground">Loading blueprint list…</p>
                          <p className="mt-1 text-xs text-muted-foreground max-w-sm">Fetching registered PDFs from the project folder.</p>
                        </div>
                      ) : blueprintsError ? (
                        <div className="h-96 flex flex-col items-center justify-center bg-card rounded-md border border-destructive/35 text-center px-6">
                          <AlertTriangle className="w-12 h-12 text-destructive mb-3" />
                          <p className="text-destructive">Could not load blueprints</p>
                          <p className="text-sm text-muted-foreground mt-2 max-w-md">
                            Check Firestore rules and your sign-in. You need staff access to read this project.
                          </p>
                        </div>
                      ) : selectedBlueprint ? (
                        <div className="grid lg:grid-cols-4 gap-6">
                          <div className="lg:col-span-3 h-[700px] min-h-0">
                             <PDFViewer 
                                url={selectedBlueprint.dropboxFilePath} 
                                title={selectedBlueprint.name} 
                                version={selectedBlueprint.status === 'latest' ? 'LATEST' : 'v' + selectedBlueprint.versionNumber} 
                                gcName={client?.husbandName}
                                projectName={activeProject?.name}
                                allowDownload={client?.allowDownloads}
                                designerEmail={headerDesignerInfo?.email}
                                markupPersistence={{ blueprintRef: blueprintMarkupPersistenceRef }}
                              />
                          </div>
                          <div className="min-w-0 space-y-6">
                            <Card className="min-w-0 overflow-hidden">
                              <CardHeader className="pb-3 flex flex-col gap-3 space-y-0">
                                <CardTitle className="text-sm">Revision History</CardTitle>
                                {isStaffDesigner && (
                                  <div className="flex w-full min-w-0 flex-col gap-2">
                                    <AddBlueprintDialog
                                      hubId={clientId}
                                      hubType="client"
                                      projectId={activeProjectId!}
                                      hubName={clientHubDisplayName}
                                      projectName={activeProject.name}
                                      notifyRecipientEmails={clientNotifyEmails}
                                      initialStatus="latest"
                                      triggerClassName="h-auto min-h-8 w-full justify-center whitespace-normal px-2 py-2 text-[10px] leading-tight sm:text-xs"
                                    />
                                    <AddBlueprintDialog
                                      hubId={clientId}
                                      hubType="client"
                                      projectId={activeProjectId!}
                                      hubName={clientHubDisplayName}
                                      projectName={activeProject.name}
                                      notifyRecipientEmails={clientNotifyEmails}
                                      initialStatus="archived"
                                      triggerClassName="h-auto min-h-8 w-full justify-center whitespace-normal px-2 py-2 text-[10px] leading-tight sm:text-xs"
                                    />
                                  </div>
                                )}
                              </CardHeader>
                              <CardContent className="p-0">
                                <div className="divide-y max-h-[400px] overflow-y-auto">
                                  {blueprintsLoading ? <div className="p-4 flex justify-center"><Loader2 className="w-4 h-4 animate-spin" /></div> : revisionHistory.map(bp => (
                                    <div key={bp.id} onClick={() => setSelectedBlueprint(bp)} className={cn("w-full text-left p-4 hover:bg-secondary transition-colors flex justify-between items-center cursor-pointer", selectedBlueprint.id === bp.id && "bg-secondary border-l-4 border-l-ledger-red/60")}>
                                      <div className="space-y-1 flex-1">
                                        <div className="flex justify-between items-start"><p className="text-sm font-semibold text-foreground truncate max-w-[120px]">{bp.name}</p></div>
                                        <p className="text-[10px] text-muted-foreground">
                                          Uploaded: {bp.uploadedAt ? new Date(bp.uploadedAt).toLocaleDateString() : "—"}
                                        </p>
                                        {isStaffDesigner && bp.status === "latest" && (
                                          <div className="pt-1">
                                            <NotifyBuilderButton
                                              variant="client"
                                              hubDisplayName={clientHubDisplayName}
                                              projectName={activeProject.name}
                                              blueprintName={bp.name}
                                              versionNumber={bp.versionNumber}
                                              recipientEmails={clientNotifyEmails}
                                            />
                                          </div>
                                        )}
                                      </div>
                                      <span className="text-[10px] font-bold border border-ledger-yellow/40 text-ledger-yellow px-2 py-0.5 rounded uppercase ml-2">{bp.status === 'latest' ? 'LATEST' : 'v' + bp.versionNumber}</span>
                                    </div>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        </div>
                      ) : (
                        <div className="h-96 flex flex-col items-center justify-center bg-card rounded-md border border-dashed border-border text-center px-6">
                          <LayoutGrid className="w-16 h-16 text-muted-foreground/20" />
                          <p className="text-muted-foreground mt-4">No blueprints registered for this project</p>
                          <p className="text-xs text-muted-foreground mt-2 max-w-sm">
                            Register a Dropbox share link to a PDF (not a folder). Use the designer toolbar above, or add below.
                          </p>
                          {isStaffDesigner && (
                            <div className="mt-4 flex flex-wrap gap-2 justify-center">
                              <AddBlueprintDialog
                                hubId={clientId}
                                hubType="client"
                                projectId={activeProjectId!}
                                hubName={clientHubDisplayName}
                                projectName={activeProject.name}
                                notifyRecipientEmails={clientNotifyEmails}
                                initialStatus="latest"
                              />
                              <AddBlueprintDialog
                                hubId={clientId}
                                hubType="client"
                                projectId={activeProjectId!}
                                hubName={clientHubDisplayName}
                                projectName={activeProject.name}
                                notifyRecipientEmails={clientNotifyEmails}
                                initialStatus="archived"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="renderings" className="mt-6 space-y-6">
                      <div className="rounded-md border border-destructive/40 bg-card px-4 py-3 text-sm text-destructive font-semibold">
                        Renderings may depict optional upgrades or items which have been changed. The construction documents always supersede the renderings. Consult with the client on any finishes, materials, appliances, cabinets and fixture selections before construction begins.
                      </div>
                      {renderingsLoading ? (
                        <div className="flex justify-center py-24"><Loader2 className="w-10 h-10 animate-spin text-foreground" /></div>
                      ) : renderings && renderings.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                          {renderings.map((r: { id: string; name: string; url: string; uploadedAt?: string }) => (
                            <Card key={r.id} className="overflow-hidden border shadow-md">
                              <div className="relative aspect-[4/3] bg-secondary">
                                <DropboxRenderingImage
                                  url={r.url}
                                  name={r.name}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                                {isStaffDesigner && (
                                  <div className="absolute top-2 right-2 flex gap-1">
                                    <EditRenderingDialog hubId={clientId} hubType="client" projectId={activeProjectId!} rendering={r} />
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="icon"
                                      className="h-8 w-8 bg-black/50 hover:bg-destructive"
                                      onClick={() => handleDeleteRendering(r.id, r.name)}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                )}
                                <a
                                  href={dropboxImgSrc(r.url) || r.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="absolute bottom-2 right-2 h-8 w-8 flex items-center justify-center rounded-md bg-background/80 border border-border text-foreground hover:bg-secondary"
                                  title="Open full size"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              </div>
                              <CardHeader className="py-3">
                                <CardTitle className="text-sm">{r.name}</CardTitle>
                                {r.uploadedAt && (
                                  <p className="text-[10px] text-muted-foreground">Added {new Date(r.uploadedAt).toLocaleDateString()}</p>
                                )}
                              </CardHeader>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <div className="h-72 flex flex-col items-center justify-center bg-card rounded-md border border-dashed border-border text-center px-6">
                          <DesignersInkBodyBannerMark className="h-12 w-auto max-w-[min(100%,280px)] object-contain mb-4 opacity-90" />
                          <p className="text-muted-foreground">No renderings linked yet</p>
                          {isStaffDesigner && (
                            <div className="mt-4">
                              <AddRenderingDialog hubId={clientId} hubType="client" projectId={activeProjectId!} />
                            </div>
                          )}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="files" className="mt-6 space-y-6">
                      {chiefFilesLoading ? (
                        <div className="flex justify-center py-24"><Loader2 className="w-10 h-10 animate-spin text-foreground" /></div>
                      ) : chiefFiles && chiefFiles.length > 0 ? (
                        <div className="space-y-3">
                          {chiefFiles.map((f: { id: string; name: string; url: string; uploadedAt?: string }) => (
                            <Card key={f.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4">
                              <div className="flex items-start gap-3 min-w-0">
                                <FileArchive className="w-8 h-8 text-foreground shrink-0 mt-0.5" />
                                <div className="min-w-0">
                                  <p className="font-semibold text-foreground truncate">{f.name}</p>
                                  {f.uploadedAt && (
                                    <p className="text-[10px] text-muted-foreground">Linked {new Date(f.uploadedAt).toLocaleDateString()}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Button variant="outline" size="sm" asChild>
                                  <a href={toDirectDropboxFileUrl(f.url)} target="_blank" rel="noopener noreferrer">
                                    <Download className="w-4 h-4 mr-1" /> Download
                                  </a>
                                </Button>
                                {isStaffDesigner && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive"
                                    onClick={() => handleDeleteChiefFile(f.id, f.name)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <div className="h-72 flex flex-col items-center justify-center bg-card rounded-md border border-dashed border-border">
                          <FileArchive className="w-14 h-14 text-muted-foreground/25 mb-3" />
                          <p className="text-muted-foreground">No project files linked</p>
                          {isStaffDesigner && (
                            <div className="mt-4">
                              <AddChiefArchitectFileDialog hubId={clientId} hubType="client" projectId={activeProjectId!} />
                            </div>
                          )}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="documents" className="mt-6 space-y-6">
                      {isStaffDesigner && activeProjectId && activeProject ? (
                        <div className="rounded-md border border-border bg-secondary px-4 py-4 sm:px-5 sm:py-5 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                          <div className="min-w-0 space-y-1">
                            <p className="text-sm font-semibold uppercase tracking-wide text-foreground">Agreements for signature</p>
                            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
                              Contracts are not uploaded here as files—you send a template PlanPort has on file. The
                              client gets a <strong className="text-foreground/90">Review &amp; sign</strong> prompt on
                              this hub. Fully executed PDFs show in the list below after you countersign in{" "}
                              <strong className="text-foreground/90">Admin → Individual Clients → Contracts</strong>.
                            </p>
                          </div>
                          <SendContractForProjectDialog
                            clientId={clientId}
                            projectId={activeProjectId}
                            clientLabel={clientHubDisplayName}
                            projectName={activeProject.name}
                            variant="default"
                            triggerClassName="bg-primary text-primary-foreground hover:bg-primary/90"
                          />
                        </div>
                      ) : null}
                      {documentsLoading ? (
                        <div className="flex justify-center py-24">
                          <Loader2 className="w-10 h-10 animate-spin text-foreground" />
                        </div>
                      ) : projectDocuments.length > 0 ? (
                        <div className="space-y-4">
                          {projectDocuments.map((d) => (
                            <Card key={d.id} className="p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                              <div className="flex items-start gap-3 min-w-0">
                                <FileText className="w-8 h-8 text-foreground shrink-0 mt-0.5" />
                                <div className="min-w-0 space-y-1">
                                  <p className="font-semibold text-foreground">{d.name || "Document"}</p>
                                  {d.kind === "signed_contract" ? (
                                    <div className="text-xs text-muted-foreground space-y-0.5">
                                      {d.clientDisplayName ? (
                                        <p>
                                          <span className="font-medium text-foreground/80">Party:</span>{" "}
                                          {d.clientDisplayName}
                                        </p>
                                      ) : null}
                                      {d.agreementDate ? (
                                        <p>
                                          <span className="font-medium text-foreground/80">Agreement date:</span>{" "}
                                          {d.agreementDate}
                                        </p>
                                      ) : null}
                                      {d.projectLocation ? (
                                        <p>
                                          <span className="font-medium text-foreground/80">Location:</span>{" "}
                                          {d.projectLocation}
                                        </p>
                                      ) : null}
                                      {d.clientSignedAt ? (
                                        <p>Client signed: {new Date(d.clientSignedAt).toLocaleString()}</p>
                                      ) : null}
                                      {d.designerSignedAt ? (
                                        <p>
                                          {d.leadDesignerName || "Designer"} signed:{" "}
                                          {new Date(d.designerSignedAt).toLocaleString()}
                                        </p>
                                      ) : null}
                                    </div>
                                  ) : d.uploadedAt ? (
                                    <p className="text-[10px] text-muted-foreground">
                                      Added {new Date(d.uploadedAt).toLocaleDateString()}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                              {d.url ? (
                                <Button variant="outline" size="sm" asChild className="shrink-0">
                                  <a href={toDirectDropboxFileUrl(d.url)} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="w-4 h-4 mr-1" /> Open PDF
                                  </a>
                                </Button>
                              ) : null}
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <div className="h-72 flex flex-col items-center justify-center bg-card rounded-md border border-dashed border-border text-center px-6">
                          <FileText className="w-14 h-14 text-muted-foreground/25 mb-3" />
                          <p className="text-muted-foreground">No documents yet</p>
                          <p className="text-sm text-muted-foreground mt-2 max-w-md">
                            Fully executed agreements appear here after the client signs and the lead designer
                            completes the workflow in Admin → Individual Clients → Contracts. To start a new agreement,
                            open this tab while signed in as staff and use <strong className="text-foreground/90">Send
                            agreement for signature</strong> at the top.
                          </p>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="inspiration" className="mt-6 space-y-6">
                      {activeProjectId ? (
                        <ProjectInspirationTab
                          hubType="client"
                          hubId={clientId}
                          projectId={activeProjectId}
                          projectName={activeProject.name}
                          projectAddress={activeProject.address}
                          hubDisplayLabel={clientHubDisplayName}
                          designerEmail={headerDesignerInfo?.email}
                          isStaffDesigner={isStaffDesigner}
                          isTabActive={activeTab === "inspiration"}
                        />
                      ) : null}
                    </TabsContent>

                    <TabsContent value="archive" className="mt-6 space-y-6">
                      {blueprintsLoading ? (
                        <div className="flex justify-center py-24"><Loader2 className="w-10 h-10 animate-spin text-foreground" /></div>
                      ) : (
                        (() => {
                          const archived = (blueprints?.filter((b: { status: string }) => b.status !== "latest") ?? []).sort(
                            (a: { uploadedAt?: string }, b: { uploadedAt?: string }) =>
                              (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? "")
                          );
                          return archived.length > 0 ? (
                            <div className="grid gap-4">
                              {archived.map((bp: { id: string; name: string; versionNumber?: number; uploadedAt?: string; dropboxFilePath: string }) => (
                                <Card key={bp.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <Archive className="w-8 h-8 text-muted-foreground shrink-0" />
                                    <div className="min-w-0">
                                      <p className="font-semibold text-foreground truncate">{bp.name}</p>
                                      <p className="text-xs text-muted-foreground">
                                        Version {bp.versionNumber != null ? `v${bp.versionNumber}` : "archived"} (Obsolete)
                                        {bp.uploadedAt ? ` · ${new Date(bp.uploadedAt).toLocaleDateString()}` : ""}
                                      </p>
                                    </div>
                                  </div>
                                  <Button variant="outline" size="sm" asChild>
                                    <a href={toDirectDropboxFileUrl(bp.dropboxFilePath)} target="_blank" rel="noopener noreferrer">
                                      <ExternalLink className="w-4 h-4 mr-1" /> Open PDF
                                    </a>
                                  </Button>
                                </Card>
                              ))}
                            </div>
                          ) : (
                            <div className="h-72 flex flex-col items-center justify-center bg-card rounded-md border border-dashed border-border">
                              <Archive className="w-14 h-14 text-muted-foreground/25 mb-3" />
                              <p className="text-muted-foreground">No archived blueprint revisions</p>
                            </div>
                          );
                        })()
                      )}
                    </TabsContent>
                  </Tabs>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

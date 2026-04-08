
"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { Header } from "@planport/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { QRShare } from "@planport/components/auth/QRShare";
import { CreateProjectDialog } from "@planport/components/admin/CreateProjectDialog";
import { AdminProjectUploadToolbar } from "@planport/components/admin/AdminProjectUploadToolbar";
import { EditProjectDialog } from "@planport/components/admin/EditProjectDialog";
import { DeleteProjectButton } from "@planport/components/admin/DeleteProjectButton";
import { AddBlueprintDialog } from "@planport/components/blueprints/AddBlueprintDialog";
import { AddRenderingDialog } from "@planport/components/admin/AddRenderingDialog";
import { EditRenderingDialog } from "@planport/components/admin/EditRenderingDialog";
import { AddChiefArchitectFileDialog } from "@planport/components/admin/AddChiefArchitectFileDialog";
import { NotifyBuilderButton } from "@planport/components/blueprints/NotifyBuilderButton";
import { DeleteBlueprintButton } from "@planport/components/blueprints/DeleteBlueprintButton";
import { SecureFileUploadDialog } from "@planport/components/layout/SecureFileUploadDialog";
import { MessageDesignerDialog } from "@planport/components/layout/MessageDesignerDialog";
import { ProjectMeetingStatus } from "@planport/components/scheduling/ProjectMeetingStatus";
import { useDoc, useCollection, useFirestore, useMemoFirebase, useUser } from "@planport/firebase";
import { useDirectoryStore } from "@/firebase/use-directory-store";
import { PLANPORT_GC_ROOT } from "@/lib/planport-project-paths";
import { doc, collection, query, orderBy, deleteDoc } from "firebase/firestore";
import {
  ContractorHubLogo,
  ProjectCoverImage,
  DropboxRenderingImage,
  DesignersInkBodyBannerMark,
} from "@planport/components/branding/BrandMarks";
import { dropboxImgSrc, toDirectDropboxFileUrl } from "@/lib/dropbox-utils";
import { useToast } from "@/hooks/use-toast";
import { 
  FolderOpen, 
  ChevronRight, 
  Archive, 
  LayoutGrid, 
  Construction,
  Users,
  AlertTriangle,
  Cloud,
  Loader2,
  MapPin,
  ExternalLink,
  ImageIcon,
  Info,
  FileText,
  Clock,
  DownloadCloud,
  ArrowLeft,
  Trash2,
  FileArchive,
  Download,
  CloudUpload,
  MessageSquareText,
  Link2Off,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  emailsFromClientDirectoryRecord,
  emailsFromGcContacts,
  uniqueEmails,
} from "@/lib/notify-recipient-emails";
import {
  disableContractorProjectSync,
  syncGcProjectToClientIfEnabled,
} from "@/lib/contractor-project-sync";
import { isPlanportAdminClient } from "@/lib/planport-admin-client";
import { ProjectInspirationTab } from "@planport/components/project/ProjectInspirationTab";
import { ClientBillingSummary } from "@planport/components/project/ClientBillingSummary";
import { showBillingOnContractorHub } from "@/lib/planport-project-billing-visibility";

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

export function ContractorDashboardPageClient({ gcId }: { gcId: string }) {
  const db = useFirestore();
  const { directoryDb, contractorsCollection, clientsCollection, planportDb } = useDirectoryStore();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  
  const adminRoleRef = useMemoFirebase(() => user ? doc(db, "adminRoles", user.uid) : null, [db, user]);
  const { data: adminRole } = useDoc(adminRoleRef);
  
  const isAdmin = isPlanportAdminClient(user, adminRole);
  const isStaffDesigner = isAdmin;

  const gcDocRef = useMemoFirebase(
    () => doc(directoryDb, contractorsCollection, gcId),
    [directoryDb, contractorsCollection, gcId]
  );
  const { data: gc } = useDoc(gcDocRef);
  
  const projectsQuery = useMemoFirebase(
    () => query(collection(planportDb, PLANPORT_GC_ROOT, gcId, "projects")),
    [planportDb, gcId]
  );
  const { data: projects, isLoading: projectsLoading } = useCollection(projectsQuery);

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("viewer");
  
  const activeProject = projects?.find(p => p.id === activeProjectId);

  const linkedQuickBooksInvoiceId = useMemo(() => {
    if (!activeProject) return null;
    const raw = (activeProject as { quickbooksInvoiceId?: string | null }).quickbooksInvoiceId;
    const s = raw != null ? String(raw).trim() : "";
    return s || null;
  }, [activeProject]);

  const linkedClientRef = useMemoFirebase(() => {
    const clientId = activeProject?.individualClientId;
    if (!clientId) return null;
    return doc(directoryDb, clientsCollection, clientId);
  }, [directoryDb, clientsCollection, activeProject?.individualClientId]);
  const { data: linkedClient } = useDoc(linkedClientRef);

  const blueprintNotifyRecipientEmails = useMemo(
    () =>
      uniqueEmails([
        ...emailsFromGcContacts(gc?.contacts),
        ...emailsFromClientDirectoryRecord(linkedClient),
      ]),
    [gc?.contacts, linkedClient]
  );
  
  const blueprintsQuery = useMemoFirebase(() => {
    if (!gcId || !activeProjectId) return null;
    return query(
      collection(planportDb, PLANPORT_GC_ROOT, gcId, "projects", activeProjectId, "blueprints"),
      orderBy("uploadedAt", "desc")
    );
  }, [planportDb, gcId, activeProjectId]);
  
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
    if (!gcId || !activeProjectId) return null;
    return query(
      collection(planportDb, PLANPORT_GC_ROOT, gcId, "projects", activeProjectId, "renderings"),
      orderBy("uploadedAt", "desc")
    );
  }, [planportDb, gcId, activeProjectId]);
  const { data: renderings, isLoading: renderingsLoading } = useCollection(renderingsQuery);

  const chiefFilesQuery = useMemoFirebase(() => {
    if (!gcId || !activeProjectId || activeTab !== 'files') return null;
    return query(
      collection(planportDb, PLANPORT_GC_ROOT, gcId, "projects", activeProjectId, "chiefFiles"),
      orderBy("uploadedAt", "desc")
    );
  }, [planportDb, gcId, activeProjectId, activeTab]);
  const { data: chiefFiles, isLoading: chiefFilesLoading } = useCollection(chiefFilesQuery);

  const [selectedBlueprint, setSelectedBlueprint] = useState<any>(null);
  const [stopSyncLoading, setStopSyncLoading] = useState(false);

  const blueprintMarkupPersistenceRef = useMemoFirebase(() => {
    if (!gcId || !activeProjectId || !selectedBlueprint?.id) return null;
    return doc(
      planportDb,
      PLANPORT_GC_ROOT,
      gcId,
      "projects",
      activeProjectId,
      "blueprints",
      selectedBlueprint.id
    );
  }, [planportDb, gcId, activeProjectId, selectedBlueprint?.id]);

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

  const getMapUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  const handleStopClientHubSync = async () => {
    const cid = activeProject?.individualClientId;
    if (!cid || !activeProject?.id) return;
    if (
      !confirm(
        "Stop two-way sync? Each hub keeps its current files; they will no longer update each other automatically."
      )
    ) {
      return;
    }
    setStopSyncLoading(true);
    try {
      await disableContractorProjectSync(planportDb, cid, activeProject.id);
      toast({
        title: "Two-way sync turned off",
        description: "You can turn it on again from the private client portal.",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast({ variant: "destructive", title: "Could not stop sync", description: msg });
    } finally {
      setStopSyncLoading(false);
    }
  };

  const handleDeleteChiefFile = async (fileId: string, fileName: string) => {
    if (confirm(`Are you sure you want to remove the link to "${fileName}"?`)) {
      try {
        await deleteDoc(
          doc(planportDb, PLANPORT_GC_ROOT, gcId, "projects", activeProjectId!, "chiefFiles", fileId)
        );
        try {
          await syncGcProjectToClientIfEnabled(planportDb, gcId, activeProjectId!, "chiefFiles");
        } catch (mirrorErr: unknown) {
          const msg = mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr);
          toast({
            variant: "destructive",
            title: "Removed here — client hub sync failed",
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
          doc(planportDb, PLANPORT_GC_ROOT, gcId, "projects", activeProjectId!, "renderings", renderingId)
        );
        try {
          await syncGcProjectToClientIfEnabled(planportDb, gcId, activeProjectId!, "renderings");
        } catch (mirrorErr: unknown) {
          const msg = mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr);
          toast({
            variant: "destructive",
            title: "Removed here — client hub sync failed",
            description: msg,
          });
        }
        toast({ title: "Rendering Removed" });
      } catch (e: any) {
        toast({ variant: "destructive", title: "Failed to remove rendering", description: e.message });
      }
    }
  };


  if (!gc && !projectsLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
        <Construction className="w-12 h-12 text-muted-foreground animate-bounce" />
        <p className="text-xl font-bold uppercase tracking-wide text-foreground">Contractor Folder Not Found</p>
        <Button onClick={() => (window.location.href = "/portal")}>Back to Login</Button>
      </div>
    );
  }

  const headerDesignerName = activeProject?.designerName;
  const headerDesignerInfo = headerDesignerName ? DESIGNER_DETAILS[headerDesignerName] : null;

  return (
    <div className="min-h-screen flex flex-col bg-background pb-12">
      <Header
        userName={isStaffDesigner ? undefined : gc?.name || "Loading..."}
        adminHubContext={
          isStaffDesigner ? `Viewing contractor hub · ${gc?.name ?? "…"}` : undefined
        }
      />

      {user?.isAnonymous && (
        <div className="border-b border-border bg-background">
          <div className="container mx-auto px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-ledger-yellow">Guest session (access code).</span> Designer tools (add blueprints, renderings, project files) require signing in on the home page with your staff email.
            </p>
            <Button asChild size="sm" variant="outline" className="border-ledger-red/45 shrink-0">
              <Link href="/">Staff sign-in</Link>
            </Button>
          </div>
        </div>
      )}

      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-6 flex flex-col md:flex-row items-center gap-6">
          <div className="relative w-28 h-28 rounded-md overflow-hidden border border-border bg-secondary flex items-center justify-center">
            <ContractorHubLogo logoUrl={gc?.logoUrl} name={gc?.name || "Contractor"} />
          </div>
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-4xl font-bold uppercase tracking-wide text-foreground mb-2">{gc?.name}</h1>
            <div className="flex flex-wrap justify-center md:justify-start gap-4">
              <Badge variant="secondary" className="flex items-center gap-1.5 px-3 py-1">
                <Users className="w-3.5 h-3.5" />
                {projects?.length || 0} Projects
              </Badge>
              {gc?.allowDownloads && (
                <Badge variant="outline" className="flex items-center gap-1.5 px-3 py-1 border-ledger-yellow/45 text-ledger-yellow font-bold">
                  <DownloadCloud className="w-3.5 h-3.5" /> Downloads Enabled
                </Badge>
              )}
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            {activeProjectId && (
              <>
                {(linkedClient || activeProject?.ownerName) && (
                  <div className="bg-secondary p-3 rounded-md flex items-center gap-4 border border-border border-l-4 border-l-ledger-red/50">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">CLIENT INFO</p>
                      <p className="text-sm font-semibold text-foreground">
                        {linkedClient
                          ? `${linkedClient.husbandName}${linkedClient.wifeName ? ` & ${linkedClient.wifeName}` : ""}`
                          : activeProject?.ownerName}
                      </p>
                      <div className="flex flex-col gap-0.5 mt-1">
                        {linkedClient?.email ? (
                          <a
                            href={`mailto:${linkedClient.email}`}
                            className="text-xs text-muted-foreground hover:text-ledger-yellow transition-colors font-medium truncate max-w-[180px]"
                          >
                            {linkedClient.email}
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground font-medium truncate max-w-[180px]">
                            Project Stakeholder
                          </span>
                        )}
                        {linkedClient?.phone && (
                          <a
                            href={`tel:${linkedClient.phone}`}
                            className="text-xs text-muted-foreground hover:text-ledger-yellow transition-colors font-medium"
                          >
                            {linkedClient.phone}
                          </a>
                        )}
                        {(linkedClient?.address || activeProject?.address) && (
                          <a
                            href={getMapUrl((linkedClient?.address || activeProject?.address) as string)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted-foreground hover:text-ledger-yellow transition-colors font-medium truncate max-w-[220px]"
                          >
                            {linkedClient?.address || activeProject?.address}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {headerDesignerName && (
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
              </>
            )}
            <QRShare gcName={gc?.name || ""} accessCode={gc?.accessCode || ""} />
          </div>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-6 py-8">
        {!activeProjectId ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <h2 className="text-2xl font-bold uppercase tracking-wide text-foreground">Active Projects</h2>
                <p className="text-muted-foreground">Select a project to view the latest blueprints and renderings.</p>
              </div>
              <div className="flex gap-2">
                <SecureFileUploadDialog 
                  trigger={
                    <Button variant="outline">
                      <CloudUpload className="w-4 h-4 mr-2" />
                      Transmit Files
                    </Button>
                  }
                />
                <MessageDesignerDialog
                  designerEmail={headerDesignerInfo?.email}
                  trigger={
                    <Button variant="outline">
                      <MessageSquareText className="w-4 h-4 mr-2" />
                      Message Designer
                    </Button>
                  }
                />
                {isStaffDesigner && <CreateProjectDialog type="gc" parentId={gcId} parentName={gc?.name || "Contractor"} />}
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
                      <Badge
                        className={cn(
                          "font-bold uppercase tracking-wider text-[10px] border border-border",
                          project.status === "Bid Phase" || project.status === "Draft Phase"
                            ? "bg-background text-ledger-yellow border-ledger-yellow/45"
                            : "bg-ink text-ink-foreground"
                        )}
                      >
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
                        Enter Folder
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 group-hover:text-foreground transition-all duration-200" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-8 animate-in fade-in slide-in-from-left-4 duration-500">
            <aside className="w-full lg:w-72 space-y-6">
              <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setActiveProjectId(null)}><ArrowLeft className="w-4 h-4" />Back to All Projects</Button>

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
                    hubLabel={gc?.name ? `${gc.name} (contractor hub)` : undefined}
                    planportHubKind="gc"
                    planportHubId={gcId}
                    planportProjectId={activeProject.id}
                  />
                )}
                {isStaffDesigner && activeProject && (
                  <AdminProjectUploadToolbar
                    variant="stack"
                    hubType="gc"
                    hubId={gcId}
                    projectId={activeProject.id}
                    hubName={gc?.name || "Contractor"}
                    projectName={activeProject.name}
                    contacts={gc?.contacts}
                    notifyRecipientEmails={emailsFromClientDirectoryRecord(linkedClient)}
                  />
                )}
                {isStaffDesigner && activeProject?.individualClientId && (
                  <div className="rounded-md border border-dashed border-border bg-card p-3 space-y-2">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {(activeProject as { contractorSyncEnabled?: boolean }).contractorSyncEnabled === true
                        ? "Two-way sync with the private client hub is on — changes here or on the client portal stay matched."
                        : "This project is linked to a private client. Turn on sync from the client portal to mirror updates both ways."}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
                      disabled={stopSyncLoading}
                      onClick={() => void handleStopClientHubSync()}
                    >
                      {stopSyncLoading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Link2Off className="w-4 h-4 mr-2" />
                      )}
                      Turn off two-way sync
                    </Button>
                  </div>
                )}
              </div>

              <div>
                <div className="flex justify-between items-center mb-4"><h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Directories</h2></div>
                <div className="space-y-2">
                  {projects?.map(project => (
                    <button
                      key={project.id}
                      onClick={() => setActiveProjectId(project.id)}
                      className={cn(
                        "w-full flex items-center justify-between p-3 rounded-xl transition-all duration-200 border",
                        activeProjectId === project.id
                          ? "bg-background text-ledger-yellow border-ledger-yellow/40"
                          : "bg-card text-foreground border-border hover:border-muted-foreground/35"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <FolderOpen
                          className={cn(
                            "w-4 h-4",
                            activeProjectId === project.id ? "text-ledger-yellow" : "text-muted-foreground"
                          )}
                        />
                        <span className="text-sm font-semibold uppercase tracking-wide truncate max-w-[140px]">
                          {project.name}
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 opacity-50" />
                    </button>
                  ))}
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
                    <div className="absolute bottom-6 left-6 right-6 flex flex-col md:flex-row justify-between items-end gap-4">
                      <div className="text-white space-y-2">
                        <h1 className="text-4xl font-bold uppercase tracking-wide">{activeProject.name}</h1>
                        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm opacity-90 items-center">
                          <span className="flex items-center gap-2"><Users className="w-4 h-4 text-foreground" />Client: {activeProject.ownerName}</span>
                          <a href={getMapUrl(activeProject.address)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-ledger-yellow transition-colors"><MapPin className="w-4 h-4 text-ledger-red" />{activeProject.address}</a>
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
                      <div className="flex flex-col items-end gap-3">
                        <Badge
                          className={cn(
                            "px-6 py-2 font-bold uppercase tracking-wider text-xs border border-border",
                            activeProject.status === "Bid Phase" || activeProject.status === "Draft Phase"
                              ? "bg-background text-ledger-yellow border-ledger-yellow/45"
                              : "bg-ink text-ink-foreground"
                          )}
                        >
                          {activeProject.status}
                        </Badge>
                        {isStaffDesigner && (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <DeleteProjectButton
                              hubId={gcId}
                              hubType="gc"
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
                            <EditProjectDialog key={activeProject.id} hubId={gcId} project={activeProject} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {activeProject &&
                  linkedQuickBooksInvoiceId &&
                  showBillingOnContractorHub(activeProject as Record<string, unknown>) ? (
                    <ClientBillingSummary
                      projectId={activeProject.id}
                      hubType="gc"
                      hubId={gcId}
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
                          <LayoutGrid className="w-4 h-4 mr-2" /> Blueprints
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
                          value="inspiration"
                          className="data-[state=active]:bg-background data-[state=active]:text-ledger-yellow data-[state=active]:border data-[state=active]:border-ledger-yellow/40 transition-colors duration-200"
                        >
                          <Sparkles className="w-4 h-4 mr-2" /> Inspiration
                        </TabsTrigger>
                        <TabsTrigger
                          value="archive"
                          className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:border data-[state=active]:border-border transition-colors duration-200"
                        >
                          <Archive className="w-4 h-4 mr-2" /> Archives
                        </TabsTrigger>
                      </TabsList>
                      {isStaffDesigner && (
                        <AdminProjectUploadToolbar
                          variant="wrap"
                          hubType="gc"
                          hubId={gcId}
                          projectId={activeProjectId!}
                          hubName={gc?.name || ""}
                          projectName={activeProject.name}
                          contacts={gc?.contacts}
                          notifyRecipientEmails={emailsFromClientDirectoryRecord(linkedClient)}
                        />
                      )}
                    </div>

                    <TabsContent value="viewer" className="mt-0 space-y-6">
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
                              gcName={gc?.name}
                              projectName={activeProject?.name}
                              allowDownload={gc?.allowDownloads}
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
                                      hubId={gcId}
                                      projectId={activeProjectId!}
                                      hubName={gc?.name || ""}
                                      projectName={activeProject.name}
                                      contacts={gc?.contacts}
                                      notifyRecipientEmails={emailsFromClientDirectoryRecord(linkedClient)}
                                      initialStatus="latest"
                                      triggerClassName="h-auto min-h-8 w-full justify-center whitespace-normal px-2 py-2 text-[10px] leading-tight sm:text-xs"
                                    />
                                    <AddBlueprintDialog
                                      hubId={gcId}
                                      projectId={activeProjectId!}
                                      hubName={gc?.name || ""}
                                      projectName={activeProject.name}
                                      contacts={gc?.contacts}
                                      notifyRecipientEmails={emailsFromClientDirectoryRecord(linkedClient)}
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
                                        <div className="flex justify-between items-start"><p className="text-sm font-semibold text-foreground truncate max-w-[120px]">{bp.name}</p>{isStaffDesigner && <DeleteBlueprintButton hubId={gcId} projectId={activeProjectId!} blueprintId={bp.id} blueprintName={bp.name} />}</div>
                                        <p className="text-[10px] text-muted-foreground">
                                          Uploaded: {bp.uploadedAt ? new Date(bp.uploadedAt).toLocaleDateString() : "—"}
                                        </p>
                                        {isStaffDesigner && bp.status === 'latest' && <div className="pt-1"><NotifyBuilderButton hubDisplayName={gc?.name || "Contractor"} projectName={activeProject.name} blueprintName={bp.name} versionNumber={bp.versionNumber} recipientEmails={blueprintNotifyRecipientEmails} /></div>}
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
                                hubId={gcId}
                                projectId={activeProjectId!}
                                hubName={gc?.name || ""}
                                projectName={activeProject.name}
                                contacts={gc?.contacts}
                                notifyRecipientEmails={emailsFromClientDirectoryRecord(linkedClient)}
                                initialStatus="latest"
                              />
                              <AddBlueprintDialog
                                hubId={gcId}
                                projectId={activeProjectId!}
                                hubName={gc?.name || ""}
                                projectName={activeProject.name}
                                contacts={gc?.contacts}
                                notifyRecipientEmails={emailsFromClientDirectoryRecord(linkedClient)}
                                initialStatus="archived"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="renderings" className="mt-0 space-y-6">
                      <div className="rounded-md border border-destructive/40 bg-card px-4 py-3 text-sm text-destructive font-semibold">
                        Renderings may depict optional upgrades or items which have been changed. The construction documents always supersede the renderings. Consult with the client on any finishes, materials, appliances, cabinets and fixture selections before construction begins.
                      </div>
                      {renderingsLoading ? (
                        <div className="flex justify-center py-24"><Loader2 className="w-10 h-10 animate-spin text-foreground" /></div>
                      ) : renderings && renderings.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                          {renderings.map((r: { id: string; name: string; url: string; uploadedAt?: string }) => (
                            <Card key={r.id} className="overflow-hidden border shadow-md group">
                              <div className="relative aspect-[4/3] bg-secondary">
                                <DropboxRenderingImage
                                  url={r.url}
                                  name={r.name}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                                {isStaffDesigner && (
                                  <div className="absolute top-2 right-2 flex gap-1">
                                    <EditRenderingDialog hubId={gcId} projectId={activeProjectId!} rendering={r} />
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
                          <p className="text-xs text-muted-foreground mt-1 max-w-md">Add a Dropbox share link (anyone with the link) for each image.</p>
                          {isStaffDesigner && (
                            <div className="mt-4"><AddRenderingDialog hubId={gcId} projectId={activeProjectId!} /></div>
                          )}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="files" className="mt-0 space-y-6">
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
                                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteChiefFile(f.id, f.name)}>
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
                          {isStaffDesigner && <div className="mt-4"><AddChiefArchitectFileDialog hubId={gcId} projectId={activeProjectId!} /></div>}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="inspiration" className="mt-0 space-y-6">
                      {activeProjectId ? (
                        <ProjectInspirationTab
                          hubType="gc"
                          hubId={gcId}
                          projectId={activeProjectId}
                          projectName={activeProject.name}
                          projectAddress={activeProject.address}
                          hubDisplayLabel={gc?.name || "Contractor hub"}
                          designerEmail={headerDesignerInfo?.email}
                          isStaffDesigner={isStaffDesigner}
                          isTabActive={activeTab === "inspiration"}
                        />
                      ) : null}
                    </TabsContent>

                    <TabsContent value="archive" className="mt-0 space-y-6">
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

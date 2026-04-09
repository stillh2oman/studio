
"use client"

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TasksTab } from '@/components/tasks/tasks-tab';
import { TimesheetTab } from '@/components/timesheets/timesheet-tab';
import { ArchiveTab } from '@/components/archive/archive-tab';
import { TemplatesTab } from '@/components/templates/templates-tab';
import { CalculatorTab } from '@/components/calculator/calculator-tab';
import { TeamTab } from '@/components/team/team-tab';
import { ProjectStatusTab } from '@/components/projects/project-status-tab';
import { GlobalNotesTab } from '@/components/projects/global-notes-tab';
import { ReportsTab } from '@/components/reports/reports-tab';
import { HomeTab } from '@/components/home/home-tab';
import { InboxTab } from '@/components/inbox/inbox-tab';
import { BillableHoursTab } from '@/components/billable-hours/billable-hours-tab';
import { PrintingTab } from '@/components/printing/printing-tab';
import { ClientDialog, ProjectDialog } from '@/components/shared/entity-dialogs';
import { ContractorDialog } from '@/components/shared/contractor-dialog';
import { useLedgerData, BUILD_VERSION } from '@/hooks/use-ledger-data';
import { useUser, useFirestore } from '@/firebase';
import { LoginView } from '@/components/auth/login-view';
import { EmergencyAlertBanner } from '@/components/shared/emergency-alert-banner';
import { ProjectMapView } from '@/components/projects/project-map-view';
import { useVoiceNote } from '@/components/voice-notes/voice-note-provider';
import { GlobalSearch } from '@/components/shared/global-search';
import { FocusMode } from '@/components/shared/focus-mode';
import { WebcamRecorderDialog } from '@/components/recording/webcam-recorder-dialog';
import { Clock, Archive, Loader2, Database, Pencil, Trash2, ListTodo, Activity, LogOut, Calculator as CalculatorIcon, BarChart3, Home as HomeIcon, DollarSign, MessageSquare, ClipboardList, FileCode, Printer, Plus, UserPlus, ExternalLink, Map as MapIcon, Mic, Square, Radio, User, Inbox, LayoutGrid, LayoutList, MapPin, Building2, CheckCircle2, ChevronRight, Filter, UserCog, Columns, Settings, ArrowUpDown, ChevronUp, ChevronDown, Search, Mail, Phone, Share2, ArrowRightLeft, HardHat, Share, Monitor, Sparkles, Video, Eye, EyeOff } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Client, Project, ProjectStatus, Employee, Designer, ProjectNote, Contractor } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Link from 'next/link';
import { cn, formatDropboxUrl, DEFAULT_PROJECT_RENDERING } from '@/lib/utils';
import { PLANPORT_HOSTED_OPEN_URL } from '@/lib/planport-hosted';
import { ScrollArea } from '@/components/ui/scroll-area';
import { doc, updateDoc } from 'firebase/firestore';
import { format } from 'date-fns';

/** Only these signed-in users get the Billing tab and billing KPIs on Home. */
const BILLING_TAB_FULL_NAMES = new Set(['jeff dillon', 'kevin walthall', 'tammi dillon']);
/** Explicitly excluded even if allowlist changes (Sarah VandeBurgh, Chris Fleming, Jorrie Holly). */
const BILLING_TAB_EXCLUDED_NAMES = new Set(['sarah vandeburgh', 'chris fleming', 'jorrie holly']);
/** Reports tab: archived timesheets + owner KPIs (Jeff & Tammi only). */
const REPORTS_TAB_FULL_NAMES = new Set(['jeff dillon', 'tammi dillon']);

type SortConfig<T> = { key: keyof T | string; direction: 'asc' | 'desc' } | null;

function ProjectKanbanCard({ project, clients, onEdit, onDelete, updateStatus, onToggleHidden, showRendering = true }: { project: Project, clients: Client[], onEdit: (p: Project) => void, onDelete: (id: string) => void, updateStatus: (id: string, s: ProjectStatus) => void, onToggleHidden: (id: string, hidden: boolean) => void, showRendering?: boolean }) {
  const router = useRouter();
  const client = clients.find(c => c.id === project.clientId);
  const displayImageUrl = showRendering ? formatDropboxUrl(project.renderingUrl || DEFAULT_PROJECT_RENDERING) : null;
  const isDataUrl = !!displayImageUrl && displayImageUrl.startsWith('data:image');

  return (
    <Card className="group relative bg-card/40 border-border/50 hover:border-primary/50 hover:shadow-xl transition-all duration-300 overflow-hidden">
      <div className="absolute top-0 left-0 w-1.5 h-full bg-primary/20 group-hover:bg-primary transition-colors z-10" />
      {displayImageUrl && (
        <div className="relative h-32 w-full overflow-hidden border-b border-border/20 bg-black/20">
          <Image src={displayImageUrl} alt={project.name} fill unoptimized={isDataUrl} className="object-cover transition-transform duration-500 group-hover:scale-110" data-ai-hint="architectural rendering" />
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent opacity-60" />
        </div>
      )}
      <CardContent className="p-4 space-y-4 relative">
        <div className="space-y-1">
          <div className="flex justify-between items-start gap-2">
            <button onClick={() => router.push(`/projects/${project.id}`)} className="text-sm font-black text-white hover:text-primary transition-colors text-left leading-tight">{project.name}</button>
            <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title={project.hiddenFromCards ? 'Unhide card' : 'Hide card'}
                onClick={() => onToggleHidden(project.id, !project.hiddenFromCards)}
              >
                {project.hiddenFromCards ? <Eye className="h-3.5 w-3.5 text-emerald-400" /> : <EyeOff className="h-3.5 w-3.5 text-amber-400" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(project)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-rose-500" onClick={() => onDelete(project.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">{client?.name || 'Assigned Account'}</p>
            <Badge variant="outline" className="text-[7px] px-1 py-0 h-3.5 border-primary/20 text-primary uppercase font-black">{project.designer || 'Jeff Dillon'}</Badge>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[9px] text-muted-foreground"><MapPin className="h-2.5 w-2.5 text-accent" /><span className="truncate">{project.address || 'GPS Location Only'}</span></div>
          <div className="flex items-center gap-2 text-[9px] text-muted-foreground"><Building2 className="h-2.5 w-2.5 text-primary" /><span className="truncate">{project.constructionCompany || 'Firm Builder Not Assigned'}</span></div>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-border/20">
          <div className="flex gap-1">
            {project.nature?.map(n => (<Badge key={n} variant="outline" className="text-[7px] px-1 py-0 h-3.5 border-accent/20 text-accent uppercase font-black">{n}</Badge>))}
          </div>
          <button onClick={() => router.push(`/projects/${project.id}`)} className="text-[9px] font-black uppercase tracking-widest text-primary flex items-center gap-1 group/btn">Open <ChevronRight className="h-2 w-2 group-hover/btn:translate-x-0.5 transition-transform" /></button>
        </div>
      </CardContent>
    </Card>
  );
}

function buildContractorLogoCandidates(input?: string) {
  const raw = String(input || '').trim();
  if (!raw) return [] as string[];

  const withProtocol = raw.startsWith('http://') || raw.startsWith('https://')
    ? raw
    : raw.startsWith('//')
      ? `https:${raw}`
      : `https://${raw}`;

  const candidates = new Set<string>();
  candidates.add(withProtocol);

  const formatted = formatDropboxUrl(withProtocol);
  if (formatted) candidates.add(formatted);

  if (withProtocol.includes('dropbox.com')) {
    try {
      const u = new URL(withProtocol);
      const path = u.pathname;

      // Keep host and force raw=1 / dl=1 variants.
      const rawVariant = new URL(withProtocol);
      rawVariant.searchParams.set('raw', '1');
      rawVariant.searchParams.delete('dl');
      candidates.add(rawVariant.toString());

      const dlVariant = new URL(withProtocol);
      dlVariant.searchParams.set('dl', '1');
      dlVariant.searchParams.delete('raw');
      candidates.add(dlVariant.toString());

      // Try both Dropbox hosts because link behavior differs by shape.
      const userContentHost = new URL(withProtocol);
      userContentHost.hostname = 'dl.dropboxusercontent.com';
      userContentHost.searchParams.set('raw', '1');
      userContentHost.searchParams.delete('dl');
      candidates.add(userContentHost.toString());

      const wwwHost = new URL(withProtocol);
      wwwHost.hostname = 'www.dropbox.com';
      wwwHost.searchParams.set('raw', '1');
      wwwHost.searchParams.delete('dl');
      candidates.add(wwwHost.toString());

      // Legacy "/s/..." links often work withusercontent + dl=1 as well.
      if (path.startsWith('/s/')) {
        const legacyDl = new URL(withProtocol);
        legacyDl.hostname = 'dl.dropboxusercontent.com';
        legacyDl.searchParams.set('dl', '1');
        legacyDl.searchParams.delete('raw');
        candidates.add(legacyDl.toString());
      }
    } catch {
      // Ignore malformed URLs and keep basic candidates.
    }
  }

  const expanded = new Set<string>(Array.from(candidates).filter(Boolean));
  for (const candidate of Array.from(expanded)) {
    if (candidate.startsWith('data:image')) continue;
    expanded.add(`/api/media/logo-proxy?url=${encodeURIComponent(candidate)}`);
  }

  return Array.from(expanded);
}

function ContractorLogoImage({ name, logoUrl }: { name: string; logoUrl?: string }) {
  const candidates = useMemo(() => buildContractorLogoCandidates(logoUrl), [logoUrl]);
  const [index, setIndex] = useState(0);
  const src = candidates[index];

  if (!src) return null;

  return (
    <div className="relative w-full h-24 rounded-md overflow-hidden border border-border/50 bg-muted/20">
      <img
        src={src}
        alt={`${name} logo`}
        className="h-full w-full object-contain p-2"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => {
          if (index < candidates.length - 1) {
            setIndex(index + 1);
          }
        }}
      />
    </div>
  );
}

function LedgerCommandCenter() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isRecording, recordingTime, startRecording, stopRecording, openVoiceNoteDialog } = useVoiceNote();
  const [activeTab, setActiveTab] = useState('home');
  const [isClientDialogOpen, setIsClientDialogOpen] = useState(false);
  const [isContractorDialogOpen, setIsContractorDialogOpen] = useState(false);
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingContractor, setEditingContractor] = useState<Contractor | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [initialTaskId, setInitialTaskId] = useState<string | null>(null);
  const [initialBillableEditId, setInitialBillableEditId] = useState<string | null>(null);
  const [designerFilter, setDesignerFilter] = useState<Designer | 'All'>('All');
  const [projectSortConfig, setProjectSortConfig] = useState<SortConfig<Project>>(null);
  const [clientSortConfig, setClientSortConfig] = useState<SortConfig<Client>>(null);
  const [accountsView, setAccountsView] = useState<'cards' | 'list'>('cards');
  const [accountsTypeFilter, setAccountsTypeFilter] = useState<'clients' | 'contractors'>('clients');
  const [accountsSortKey, setAccountsSortKey] = useState<'type' | 'name' | 'email' | 'phone' | 'project' | 'accessCode'>('name');
  const [accountsSortDir, setAccountsSortDir] = useState<'asc' | 'desc'>('asc');
  const [showHiddenClients, setShowHiddenClients] = useState(false);
  const [projectRegistryView, setProjectRegistryView] = useState<'cards' | 'cards_no_rendering' | 'list'>('cards');
  const [showHiddenProjectCards, setShowHiddenProjectCards] = useState(false);
  const [isWebcamRecorderOpen, setIsWebcamRecorderOpen] = useState(false);

  const appLogoUrl = "/logo.png";

  const { 
    clients, contractors, projects, billableEntries, archivedBillableEntries, printEntries, archivedPrintEntries, tasks, archivedTasks, calendarEvents, allEmployees, permissions, isBoss, isLoaded, dataRootId,
    addClient, updateClient, deleteClient, addContractor, updateContractor, deleteContractor, addProject, updateProject, updateProjectStatus, deleteProject, addBillableEntry, updateBillableEntry, updateBillableEntryStatus, deleteBillableEntry, addPrintEntry, updatePrintEntry, updatePrintEntryStatus, deletePrintEntry, addTask, updateTask, deleteTask, addCalendarEvent, updateCalendarEvent, deleteCalendarEvent, restoreData, updateEmployeeStatus,
    payroll, costs, income, leaveBanks, addPayroll, deletePayroll, addMonthlyCost, deleteMonthlyCost, addMonthlyIncome, deleteMonthlyIncome, updateLeaveBank, rawData,
    textTemplates, addTextTemplate, updateTextTemplate, deleteTextTemplate, passwordVault, addPassword, updatePassword, deletePassword, supplies, addSupplyItem, deleteSupplyItem,
    templateRequests, addTemplateRequest, updateTemplateRequest, deleteTemplateRequest,
    addProjectNote, updateProjectNote, deleteProjectNote,
    addTimesheetEntry, updateTimesheetEntry, deleteTimesheetEntry,
    restoreArchivedBillableEntry, restoreArchivedPrintEntry, restoreArchivedTask, restoreArchivedProject,
    messagesInbox, messagesOutbox, sendMessage, markMessageRead, deleteMessage,
    referenceLibrary, addReferenceDoc, updateReferenceDoc, deleteReferenceDoc,
    migrateClientsToOnboardingSchema, migrateContractorsToOnboardingSchema,
    timesheetPdfArchive,
    deleteTimesheetPdfArchive,
    payPeriodSubmissions,
  } = useLedgerData(user?.id); 

  const sessionFullNameLower = useMemo(
    () => (user ? `${user.firstName || ''} ${user.lastName || ''}`.trim().toLowerCase() : ''),
    [user]
  );
  const canSeeBillingTab = useMemo(
    () => BILLING_TAB_FULL_NAMES.has(sessionFullNameLower) && !BILLING_TAB_EXCLUDED_NAMES.has(sessionFullNameLower),
    [sessionFullNameLower]
  );
  const canSeeFirmCommand = useMemo(() => sessionFullNameLower === 'jeff dillon', [sessionFullNameLower]);
  const canSeeInboxTab = useMemo(() => sessionFullNameLower === 'jeff dillon', [sessionFullNameLower]);
  const canSeeReportsTab = useMemo(() => REPORTS_TAB_FULL_NAMES.has(sessionFullNameLower), [sessionFullNameLower]);

  const handleLogin = (employeeId: string) => { localStorage.setItem('di_ledger_session_employee_id', employeeId); window.location.reload(); };
  const handleLogout = async () => { if (user?.id) { const empRef = doc(firestore, 'employees', user.id); await updateDoc(empRef, { isOnline: false }).catch(() => {}); } localStorage.removeItem('di_ledger_session_employee_id'); window.location.reload(); };

  const openHostedPlanPort = () => {
    window.open(PLANPORT_HOSTED_OPEN_URL, '_blank', 'noopener,noreferrer');
  };

  const handleEditProject = (p: Project) => {
    setEditingProject(p);
    setIsProjectDialogOpen(true);
  };

  const handleMarkClientAsContractor = (client: Client) => {
    if (!client?.id) return;
    updateClient(client.id, { isContractor: true });
    toast({
      title: "Moved to Contractors",
      description: `${client.name || 'Client'} is now marked as a contractor.`,
    });
    setAccountsTypeFilter('contractors');
  };

  const handleMarkContractorAsClient = (contractor: Contractor) => {
    if (!contractor?.id) return;
    const existingClient = clients.find(c => c.id === contractor.id);

    if (existingClient) {
      updateClient(contractor.id, {
        isContractor: false,
        name: contractor.companyName || existingClient.name || '',
        email: contractor.billingEmail || existingClient.email || '',
        phoneNumber: (contractor.contacts || [])[0]?.phone || existingClient.phoneNumber || '',
      });
    } else {
      addClient({
        name: contractor.companyName || 'Unnamed Client',
        email: contractor.billingEmail || '',
        phoneNumber: (contractor.contacts || [])[0]?.phone || '',
        accessCode: contractor.accessCode || '',
        permitPdfDownloads: !!contractor.permitPdfDownloads,
        additionalStakeholders: (contractor.contacts || []).map((c: any) => ({
          name: c?.name || '',
          title: c?.title || '',
          email: c?.email || '',
          phone: c?.phone || '',
        })),
        isContractor: false,
      });
      deleteContractor(contractor.id);
    }

    toast({
      title: "Moved to Clients",
      description: `${contractor.companyName || 'Contractor'} is now in the client tab.`,
    });
    setAccountsTypeFilter('clients');
  };

  const handleHideClient = (client: Client) => {
    if (!client?.id) return;
    updateClient(client.id, { hiddenFromDatabase: true });
    toast({ title: "Client hidden", description: `${client.name || 'Client'} hidden from database list.` });
  };

  const handleUnhideClient = (client: Client) => {
    if (!client?.id) return;
    updateClient(client.id, { hiddenFromDatabase: false });
    toast({ title: "Client visible", description: `${client.name || 'Client'} restored to database list.` });
  };

  useEffect(() => { const handleKeyDown = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setIsSearchOpen(prev => !prev); } }; window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown); }, []);
  useEffect(() => {
    if (!user) return;
    if (activeTab === 'billing' && !canSeeBillingTab) setActiveTab('home');
    else if (activeTab === 'inbox' && !canSeeInboxTab) setActiveTab('home');
    else if (activeTab === 'team' && !canSeeFirmCommand) setActiveTab('home');
    else if (activeTab === 'reports' && !canSeeReportsTab) setActiveTab('home');
    else if (activeTab === 'plan_database') setActiveTab('home');
  }, [user, activeTab, canSeeBillingTab, canSeeInboxTab, canSeeFirmCommand, canSeeReportsTab]);

  useEffect(() => {
    if (isUserLoading) return;
    const bid = searchParams.get('billableId');
    const tab = searchParams.get('tab');
    if (bid) {
      if (!canSeeBillingTab) {
        router.replace('/', { scroll: false });
        return;
      }
      setActiveTab('billing');
      setInitialBillableEditId(bid);
      router.replace('/', { scroll: false });
      return;
    }
    if (tab === 'billing' && canSeeBillingTab) {
      setActiveTab('billing');
      router.replace('/', { scroll: false });
    }
  }, [searchParams, canSeeBillingTab, router, isUserLoading]);

  useEffect(() => {
    if (!isBoss || !dataRootId) return;
    const key = `di_client_schema_migrated_v2_${dataRootId}`;
    if (typeof window !== 'undefined' && localStorage.getItem(key) === '1') return;
    migrateClientsToOnboardingSchema()
      .then(() => {
        if (typeof window !== 'undefined') localStorage.setItem(key, '1');
      })
      .catch(() => {});
    const contractorKey = `di_contractor_schema_migrated_v1_${dataRootId}`;
    if (typeof window !== 'undefined' && localStorage.getItem(contractorKey) !== '1') {
      migrateContractorsToOnboardingSchema()
        .then(() => {
          if (typeof window !== 'undefined') localStorage.setItem(contractorKey, '1');
        })
        .catch(() => {});
    }
  }, [isBoss, dataRootId, migrateClientsToOnboardingSchema, migrateContractorsToOnboardingSchema]);

  const filteredProjects = useMemo(() => {
    let items = projects.filter(p => !p.isArchived && p.status !== 'Archived');
    if (user && designerFilter === 'All') {
      const userFull = `${user.firstName} ${user.lastName}`.trim().toLowerCase();
      const groupA = ['jeff dillon', 'jorrie holly', 'sarah vandeburgh'];
      const groupB = ['kevin walthall', 'chris fleming'];
      if (groupA.includes(userFull)) items = items.filter(p => p.designer !== 'Kevin Walthall');
      else if (groupB.includes(userFull)) items = items.filter(p => p.designer !== 'Jeff Dillon');
    }
    if (designerFilter !== 'All') items = items.filter(p => p.designer === designerFilter);
    items.sort((a, b) => { if (projectSortConfig) { let aVal: any = a[projectSortConfig.key as keyof Project]; let bVal: any = b[projectSortConfig.key as keyof Project]; if (projectSortConfig.key === 'clientName') { aVal = clients.find(c => c.id === a.clientId)?.name || ''; bVal = clients.find(c => c.id === b.clientId)?.name || ''; } if (aVal < bVal) return projectSortConfig.direction === 'asc' ? -1 : 1; if (aVal > bVal) return projectSortConfig.direction === 'asc' ? 1 : -1; return 0; } else return (a.name || '').localeCompare(b.name || ''); });
    return items;
  }, [projects, designerFilter, projectSortConfig, clients, user]);

  const visibleProjectCards = useMemo(() => {
    return filteredProjects.filter((p) => showHiddenProjectCards || !p.hiddenFromCards);
  }, [filteredProjects, showHiddenProjectCards]);

  const selectableClients = useMemo<Client[]>(() => {
    const merged = [...clients];
    const seen = new Set(merged.map(c => c.id));
    for (const contractor of contractors) {
      if (!contractor?.id || seen.has(contractor.id)) continue;
      merged.push({
        id: contractor.id,
        name: contractor.companyName || 'Unnamed Contractor',
        firstName: contractor.companyName || '',
        lastName: '',
        email: contractor.billingEmail || '',
        phoneNumber: (contractor.contacts || [])[0]?.phone || '',
        accessCode: contractor.accessCode || '',
        isContractor: true,
      });
      seen.add(contractor.id);
    }
    return merged;
  }, [clients, contractors]);

  const accountRows = useMemo(() => {
    const contractorNameById = new Map(contractors.map(c => [c.id, c.companyName]));
    const clientRows = clients.map((c) => ({
      id: c.id,
      type: 'Client' as const,
      name: c.name || '',
      firstName: c.firstName || '',
      lastName: c.lastName || '',
      secondary: c.secondaryClientName || '',
      email: c.email || '',
      phone: c.phoneNumber || '',
      accessCode: c.accessCode || '',
      projectName: c.initialProjectName || '',
      associatedProjectIds: Array.isArray(c.associatedProjectIds) ? c.associatedProjectIds : [],
      projectAddress: c.projectAddress || '',
      projectRenderingUrl: c.projectRenderingUrl || '',
      assignedContractorName: contractorNameById.get(c.assignedContractorId || '') || '',
      discountEligibility: c.discountEligibility || '',
      permitPdfDownloads: !!c.permitPdfDownloads,
      hiddenFromDatabase: !!c.hiddenFromDatabase,
      stakeholders: c.additionalStakeholders || [],
      contacts: [] as any[],
      raw: c,
    }));
    const contractorRows = contractors.map((c) => ({
      id: c.id,
      type: 'Contractor' as const,
      name: c.companyName || '',
      firstName: '',
      lastName: '',
      secondary: '',
      email: c.billingEmail || '',
      phone: (c.contacts || [])[0]?.phone || '',
      accessCode: c.accessCode || '',
      projectName: '',
      projectAddress: '',
      projectRenderingUrl: '',
      assignedContractorName: '',
      discountEligibility: '',
      permitPdfDownloads: !!c.permitPdfDownloads,
      hiddenFromDatabase: false,
      stakeholders: [] as any[],
      contacts: c.contacts || [],
      raw: c,
    }));
    const all = [...clientRows, ...contractorRows];
    const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
    const dir = accountsSortDir === 'asc' ? 1 : -1;
    all.sort((a, b) => {
      if (accountsSortKey === 'name' && a.type === 'Client' && b.type === 'Client') {
        const aKey = `${String(a.lastName || '').toLowerCase()}|${String(a.firstName || '').toLowerCase()}|${String(a.name || '').toLowerCase()}`;
        const bKey = `${String(b.lastName || '').toLowerCase()}|${String(b.firstName || '').toLowerCase()}|${String(b.name || '').toLowerCase()}`;
        return aKey.localeCompare(bKey) * dir;
      }
      const av =
        accountsSortKey === 'type' ? a.type :
        accountsSortKey === 'email' ? a.email :
        accountsSortKey === 'phone' ? a.phone :
        accountsSortKey === 'project' ? a.projectName :
        accountsSortKey === 'accessCode' ? a.accessCode :
        a.name;
      const bv =
        accountsSortKey === 'type' ? b.type :
        accountsSortKey === 'email' ? b.email :
        accountsSortKey === 'phone' ? b.phone :
        accountsSortKey === 'project' ? b.projectName :
        accountsSortKey === 'accessCode' ? b.accessCode :
        b.name;
      return String(av || '').localeCompare(String(bv || '')) * dir;
    });
    return all.filter((row) => {
      if (accountsTypeFilter === 'clients') {
        if (row.type !== 'Client') return false;
        if (!showHiddenClients && row.hiddenFromDatabase) return false;
        if (row.type === 'Client') {
          (row as any).associatedProjectNames = ((row as any).associatedProjectIds || [])
            .map((id: string) => projectNameById.get(id) || id)
            .filter(Boolean);
        }
        return true;
      }
      return row.type === 'Contractor';
    });
  }, [clients, contractors, projects, accountsSortKey, accountsSortDir, accountsTypeFilter, showHiddenClients]);

  if (isUserLoading) return (<div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>);
  if (!user) return <LoginView onLogin={handleLogin} onRestore={restoreData} />;

  const handleGlobalNavigation = (tab: string, subTab?: string, entityId?: string) => {
    if (tab === 'billing' && !canSeeBillingTab) return;
    if (tab === 'inbox' && !canSeeInboxTab) return;
    if (tab === 'team' && !canSeeFirmCommand) return;
    if (tab === 'reports' && !canSeeReportsTab) return;
    setActiveTab(tab);
    if (entityId && tab === 'tasks') setInitialTaskId(entityId);
  };

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-accent selection:text-accent-foreground">
      <EmergencyAlertBanner />
      <header className="border-b border-border/40 bg-card/30 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1800px] mx-auto px-6 h-auto min-h-24 py-4 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <button onClick={() => setActiveTab('home')} className="flex items-center gap-5 group text-left">
              <div className="h-14 w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 transition-all overflow-hidden p-1">
                <Image src={appLogoUrl} alt="Logo" width={48} height={48} className="object-contain" priority />
              </div>
              <div><h1 className="text-3xl font-headline font-bold text-white leading-none">Designer's Ink</h1><div className="flex items-center gap-2 mt-1"><p className="text-[10px] text-accent font-bold uppercase tracking-widest leading-none">{user ? `${user.firstName} ${user.lastName}` : 'System Session'}</p><p className="text-[8px] text-muted-foreground uppercase tracking-widest font-bold ml-2">{user?.role || 'Administrator'}</p></div></div>
            </button>
          </div>
          <div className="flex flex-wrap gap-4 items-center justify-center">
             <div className="flex items-center gap-2">
               <Button variant="ghost" size="icon" className="h-11 w-11 rounded-full border border-border/50 text-muted-foreground hover:text-primary transition-all" onClick={() => setIsSearchOpen(true)} title="Global Search (Ctrl+K)"><Search className="h-5 w-5" /></Button>
               <FocusMode />
               {isRecording ? (
                 <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 px-4 py-2 rounded-full animate-in zoom-in duration-300">
                   <div className="flex items-center gap-2">
                     <div className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                     <span className="text-[10px] font-black uppercase text-rose-500 tracking-widest">Recording</span>
                   </div>
                   <div className="h-4 w-px bg-rose-500/20" />
                   <span className="text-xs font-mono font-bold text-white">{recordingTime}s</span>
                   <Button size="sm" className="bg-rose-500 hover:bg-rose-600 h-8 gap-2 rounded-full px-4" onClick={stopRecording}>
                     <Square className="h-3.5 w-3.5 fill-current" /> Finish
                   </Button>
                 </div>
               ) : (
                 <>
                   <Button
                     variant="outline"
                     className="h-11 rounded-full px-6 border-primary/30 text-primary font-bold gap-2 hover:bg-primary/10 transition-all"
                     onClick={startRecording}
                   >
                     <Mic className="h-4 w-4" /> Voice Note
                   </Button>
                   <Button
                     variant="outline"
                     className="h-11 rounded-full px-6 border-accent/30 text-accent font-bold gap-2 hover:bg-accent/10 transition-all"
                     onClick={() => openVoiceNoteDialog('meeting')}
                   >
                     <Sparkles className="h-4 w-4" /> Meeting Notes
                   </Button>
                  {canSeeFirmCommand ? (
                    <Button
                      variant="outline"
                      className="h-11 rounded-full px-6 border-primary/30 text-primary font-bold gap-2 hover:bg-primary/10 transition-all"
                      onClick={() => setIsWebcamRecorderOpen(true)}
                    >
                      <Video className="h-4 w-4" /> Record
                    </Button>
                  ) : null}
                 </>
               )}
             </div>
             {canSeeFirmCommand ? (
               <button onClick={() => setActiveTab('team')} className={cn("text-xs px-5 py-2.5 rounded-full bg-primary/20 text-white border border-primary/30 hover:bg-primary/30 transition-all font-medium", activeTab === 'team' && "bg-primary text-white border-primary")}>Firm Command</button>
             ) : null}
             <Button
               variant="outline"
               className="h-11 rounded-full px-6 border-accent/40 text-white font-bold gap-2 hover:bg-accent/10 transition-all"
               onClick={openHostedPlanPort}
               title="Open hosted PlanPort admin"
             >
               <ExternalLink className="h-4 w-4" /> PlanPort
             </Button>
             <Button
               asChild
               variant="outline"
               className="h-11 rounded-full px-6 border-primary/30 text-primary font-bold gap-2 hover:bg-primary/10 transition-all"
               title="Import a PlanPort export file"
             >
               <Link href="/import/planport">
                 <Database className="h-4 w-4" /> Import PlanPort
               </Link>
             </Button>
             <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-white gap-2"><LogOut className="h-4 w-4" /> Reset Session</Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1800px] mx-auto px-6 py-10 min-w-0 w-full">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-10 min-w-0 w-full">
          <TabsList className="bg-card/50 border border-border/50 p-1.5 h-auto shadow-2xl rounded-2xl flex flex-wrap gap-1 items-center w-full">
            <TabsTrigger value="home" className="flex-1 min-w-[100px] h-12 rounded-xl transition-all">Home</TabsTrigger>
            <TabsTrigger value="registry" className="flex-1 min-w-[100px] h-12 rounded-xl transition-all">Databases</TabsTrigger>
            <TabsTrigger value="notes" className="flex-1 min-w-[100px] h-12 rounded-xl transition-all">Notes</TabsTrigger>
            {canSeeInboxTab ? <TabsTrigger value="inbox" className="flex-1 min-w-[100px] h-12 rounded-xl transition-all">Inbox</TabsTrigger> : null}
            {canSeeBillingTab ? <TabsTrigger value="billing" className="flex-1 min-w-[100px] h-12 rounded-xl transition-all">Billing</TabsTrigger> : null}
            {canSeeReportsTab ? <TabsTrigger value="reports" className="flex-1 min-w-[100px] h-12 rounded-xl transition-all">Reports</TabsTrigger> : null}
            <TabsTrigger value="tasks" className="flex-1 min-w-[100px] h-12 rounded-xl transition-all">Tasks</TabsTrigger>
            <TabsTrigger value="timesheets" className="flex-1 min-w-[100px] h-12 rounded-xl transition-all">Time Sheets</TabsTrigger>
            <TabsTrigger value="status" className="flex-1 min-w-[100px] h-12 rounded-xl transition-all">Pipeline</TabsTrigger>
            <TabsTrigger value="templates" className="flex-1 min-w-[100px] h-12 rounded-xl transition-all">Templates</TabsTrigger>
            <TabsTrigger value="toolset" className="flex-1 min-w-[100px] h-12 rounded-xl transition-all">Toolset</TabsTrigger>
            <TabsTrigger value="archive" className="flex-1 min-w-[100px] h-12 rounded-xl transition-all">Archives</TabsTrigger>
          </TabsList>

          <TabsContent value="home"><HomeTab tasks={tasks} projects={filteredProjects} clients={selectableClients} billableEntries={billableEntries} calendarEvents={calendarEvents} messagesInbox={messagesInbox} messagesOutbox={messagesOutbox} onAddEvent={addCalendarEvent} onUpdateEvent={updateCalendarEvent} onDeleteEvent={deleteCalendarEvent} onSendMessage={sendMessage} onMarkRead={markMessageRead} onDeleteMessage={deleteMessage} currentEmployee={user} allEmployees={allEmployees} onUpdateStatus={updateEmployeeStatus} onViewTask={(task) => { setInitialTaskId(task.id); setActiveTab('tasks'); }} showBillingKpis={canSeeBillingTab} /></TabsContent>
          <TabsContent value="notes">
            <GlobalNotesTab
              projects={filteredProjects}
              clients={selectableClients}
              dataRootId={dataRootId ?? null}
              onAddNote={addProjectNote}
              onUpdateNote={updateProjectNote}
              onDeleteNote={deleteProjectNote}
            />
          </TabsContent>
          {canSeeInboxTab ? (
            <TabsContent value="inbox">
              {activeTab === "inbox" ? (
                <InboxTab
                  projects={filteredProjects}
                  clients={selectableClients}
                  onAddNote={(projectId, note) =>
                    addProjectNote(projectId, {
                      text: String(note?.text || ""),
                      authorName: user ? `${user.firstName} ${user.lastName}` : "Inbox",
                      attachments: Array.isArray(note?.attachments) ? note.attachments : [],
                    })
                  }
                  onAddTask={(task) => addTask(task)}
                />
              ) : null}
            </TabsContent>
          ) : null}

          <TabsContent value="registry">
            <Tabs defaultValue="projects" className="space-y-6">
              <TabsList><TabsTrigger value="projects">Projects</TabsTrigger><TabsTrigger value="clients">Accounts (Clients & Contractors)</TabsTrigger></TabsList>
              
              <TabsContent value="projects">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-lg font-headline font-bold text-white flex items-center gap-2">
                      <LayoutGrid className="h-5 w-5 text-primary" /> Project Registry
                    </h3>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                      Cards • No Renderings • Sortable List
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <select
                      className="h-9 rounded-md border border-border bg-background px-3 text-xs font-bold text-foreground"
                      value={designerFilter}
                      onChange={(e) => setDesignerFilter(e.target.value as any)}
                      title="Filter projects by lead designer"
                    >
                      <option value="All">All designers</option>
                      <option value="Jeff Dillon">Jeff</option>
                      <option value="Kevin Walthall">Kevin</option>
                    </select>
                    <Button
                      variant={projectRegistryView === 'cards' ? 'default' : 'outline'}
                      size="sm"
                      className="gap-2"
                      onClick={() => setProjectRegistryView('cards')}
                    >
                      <LayoutGrid className="h-4 w-4" /> Cards
                    </Button>
                    <Button
                      variant={projectRegistryView === 'cards_no_rendering' ? 'default' : 'outline'}
                      size="sm"
                      className="gap-2"
                      onClick={() => setProjectRegistryView('cards_no_rendering')}
                    >
                      <Monitor className="h-4 w-4" /> No Renderings
                    </Button>
                    <Button
                      variant={projectRegistryView === 'list' ? 'default' : 'outline'}
                      size="sm"
                      className="gap-2"
                      onClick={() => setProjectRegistryView('list')}
                    >
                      <Columns className="h-4 w-4" /> List
                    </Button>
                    <Button
                      variant={showHiddenProjectCards ? 'default' : 'outline'}
                      size="sm"
                      className="gap-2"
                      onClick={() => setShowHiddenProjectCards(v => !v)}
                    >
                      {showHiddenProjectCards ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      {showHiddenProjectCards ? 'Showing Hidden Cards' : 'Show Hidden Cards'}
                    </Button>
                    <Button onClick={() => { setEditingProject(null); setIsProjectDialogOpen(true); }} className="gap-2 bg-primary">
                      <Plus className="h-4 w-4" /> Add Project
                    </Button>
                    <Button variant="outline" onClick={() => { setEditingClient(null); setIsClientDialogOpen(true); }} className="gap-2">
                      <UserPlus className="h-4 w-4" /> Add Client
                    </Button>
                  </div>
                </div>

                {projectRegistryView === 'list' ? (
                  <Card className="border-border/50 shadow-lg overflow-hidden bg-card/30">
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader className="bg-muted/50">
                          <TableRow>
                            <TableHead>
                              <button
                                className="flex items-center gap-1 font-bold"
                                onClick={() => setProjectSortConfig({ key: 'name', direction: projectSortConfig?.key === 'name' && projectSortConfig.direction === 'asc' ? 'desc' : 'asc' })}
                              >
                                Project <ArrowUpDown className="h-3 w-3 opacity-60" />
                              </button>
                            </TableHead>
                            <TableHead>
                              <button
                                className="flex items-center gap-1 font-bold"
                                onClick={() => setProjectSortConfig({ key: 'clientName', direction: projectSortConfig?.key === 'clientName' && projectSortConfig.direction === 'asc' ? 'desc' : 'asc' })}
                              >
                                Client <ArrowUpDown className="h-3 w-3 opacity-60" />
                              </button>
                            </TableHead>
                            <TableHead>
                              <button
                                className="flex items-center gap-1 font-bold"
                                onClick={() => setProjectSortConfig({ key: 'status', direction: projectSortConfig?.key === 'status' && projectSortConfig.direction === 'asc' ? 'desc' : 'asc' })}
                              >
                                Status <ArrowUpDown className="h-3 w-3 opacity-60" />
                              </button>
                            </TableHead>
                            <TableHead>
                              <button
                                className="flex items-center gap-1 font-bold"
                                onClick={() => setProjectSortConfig({ key: 'designer', direction: projectSortConfig?.key === 'designer' && projectSortConfig.direction === 'asc' ? 'desc' : 'asc' })}
                              >
                                Designer <ArrowUpDown className="h-3 w-3 opacity-60" />
                              </button>
                            </TableHead>
                            <TableHead>Address</TableHead>
                            <TableHead className="w-36">
                              <button
                                className="flex items-center gap-1 font-bold"
                                onClick={() => setProjectSortConfig({ key: 'createdAt', direction: projectSortConfig?.key === 'createdAt' && projectSortConfig.direction === 'asc' ? 'desc' : 'asc' })}
                              >
                                Created <ArrowUpDown className="h-3 w-3 opacity-60" />
                              </button>
                            </TableHead>
                            <TableHead className="w-24 text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredProjects.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center py-10 text-muted-foreground italic">
                                No projects found.
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredProjects.map((p) => {
                              const client = clients.find(c => c.id === p.clientId);
                              return (
                                <TableRow key={p.id} className="hover:bg-muted/20 transition-colors">
                                  <TableCell className="font-bold text-white">
                                    <button className="hover:text-primary transition-colors text-left" onClick={() => router.push(`/projects/${p.id}`)}>
                                      {p.name}
                                    </button>
                                    {p.hiddenFromCards ? (
                                      <Badge variant="outline" className="ml-2 h-4 text-[8px] uppercase border-amber-500/40 text-amber-400">Hidden Card</Badge>
                                    ) : null}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground">{client?.name || '—'}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="h-5 text-[8px] bg-primary/5 border-primary/20 text-primary uppercase font-bold">
                                      {p.status || 'Active'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground">{p.designer || '—'}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground truncate max-w-[260px]">{p.address || '—'}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground">{p.createdAt ? format(new Date(p.createdAt), 'MMM d, yyyy') : '—'}</TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex gap-1 justify-end">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => updateProject(p.id, { hiddenFromCards: !p.hiddenFromCards })}
                                        title={p.hiddenFromCards ? 'Unhide card' : 'Hide card'}
                                      >
                                        {p.hiddenFromCards ? <Eye className="h-4 w-4 text-emerald-400" /> : <EyeOff className="h-4 w-4 text-amber-400" />}
                                      </Button>
                                      <Button variant="ghost" size="icon" onClick={() => handleEditProject(p)}><Pencil className="h-4 w-4" /></Button>
                                      <Button variant="ghost" size="icon" className="text-rose-500" onClick={() => { if(confirm(`Delete ${p.name}?`)) deleteProject(p.id); }}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {visibleProjectCards.map(p => (
                      <ProjectKanbanCard
                        key={p.id}
                        project={p}
                        clients={clients}
                        onEdit={handleEditProject}
                        onDelete={deleteProject}
                        updateStatus={updateProjectStatus}
                        onToggleHidden={(id, hidden) => updateProject(id, { hiddenFromCards: hidden })}
                        showRendering={projectRegistryView === 'cards'}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="clients">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
                  <div className="space-y-1">
                    <h3 className="text-lg font-headline font-bold text-white">Accounts Registry</h3>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Client + Contractor Cards / Sortable List</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant={accountsTypeFilter === 'clients' ? 'default' : 'outline'} size="sm" className="gap-2" onClick={() => setAccountsTypeFilter('clients')}>
                      <UserPlus className="h-4 w-4" /> Clients
                    </Button>
                    <Button variant={accountsTypeFilter === 'contractors' ? 'default' : 'outline'} size="sm" className="gap-2" onClick={() => setAccountsTypeFilter('contractors')}>
                      <Building2 className="h-4 w-4" /> Contractors
                    </Button>
                    <Button variant={accountsView === 'cards' ? 'default' : 'outline'} size="sm" className="gap-2" onClick={() => setAccountsView('cards')}>
                      <LayoutGrid className="h-4 w-4" /> Cards
                    </Button>
                    <Button variant={accountsView === 'list' ? 'default' : 'outline'} size="sm" className="gap-2" onClick={() => setAccountsView('list')}>
                      <Columns className="h-4 w-4" /> List
                    </Button>
                    {accountsTypeFilter === 'clients' ? (
                      <Button variant={showHiddenClients ? 'default' : 'outline'} size="sm" className="gap-2" onClick={() => setShowHiddenClients(v => !v)}>
                        {showHiddenClients ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        {showHiddenClients ? 'Showing Hidden' : 'Show Hidden'}
                      </Button>
                    ) : null}
                    <Button onClick={() => { setEditingClient(null); setIsClientDialogOpen(true); }} className="gap-2 bg-primary">
                      <UserPlus className="h-4 w-4" /> Add Client
                    </Button>
                    <Button variant="outline" onClick={() => { setEditingContractor(null); setIsContractorDialogOpen(true); }} className="gap-2">
                      <Building2 className="h-4 w-4" /> Add Contractor
                    </Button>
                  </div>
                </div>

                {accountsView === 'cards' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {accountRows.map((a) => (
                      <Card
                        key={`${a.type}-${a.id}`}
                        className={cn(
                          "border-border/50",
                          a.type === 'Contractor' ? "bg-zinc-600/50" : "bg-card/30"
                        )}
                      >
                        <CardContent className="p-4 space-y-3">
                          {a.type === 'Client' ? (
                            <ContractorLogoImage
                              name={a.name}
                              logoUrl={String(a.projectRenderingUrl || '').trim() || undefined}
                            />
                          ) : null}
                          {a.type === 'Contractor' ? <ContractorLogoImage name={a.name} logoUrl={(a.raw as Contractor).logoUrl} /> : null}
                          <div className="flex items-center justify-between">
                            <div className="font-bold text-white">{a.name}</div>
                            <Badge variant="outline" className="text-[8px] uppercase">{a.type}</Badge>
                          </div>
                          {a.secondary ? <div className="text-xs text-muted-foreground">Secondary: {a.secondary}</div> : null}
                          {a.type === 'Client' && a.hiddenFromDatabase ? <div className="text-xs text-amber-400">Hidden from database list</div> : null}
                          <div className="text-xs text-muted-foreground">Email: {a.email || '—'}</div>
                          <div className="text-xs text-muted-foreground">Phone: {a.phone || '—'}</div>
                          {a.type === 'Client' ? (
                            <>
                              <div className="text-xs text-muted-foreground">Project: {a.projectName || '—'}</div>
                              <div className="text-xs text-muted-foreground">Associated Projects: {(a as any).associatedProjectNames?.length ? (a as any).associatedProjectNames.join(', ') : '—'}</div>
                              <div className="text-xs text-muted-foreground">Address: {a.projectAddress || '—'}</div>
                              <div className="text-xs text-muted-foreground">Rendering: {a.projectRenderingUrl || '—'}</div>
                              <div className="text-xs text-muted-foreground">Assigned GC: {a.assignedContractorName || 'Owner-Builder / No GC'}</div>
                              <div className="text-xs text-muted-foreground">Discount Eligibility: {a.discountEligibility || '—'}</div>
                            </>
                          ) : (
                            <>
                              <div className="text-xs text-muted-foreground">Contacts: {a.contacts.length}</div>
                              <div className="text-xs text-muted-foreground">Billing Email: {a.email || '—'}</div>
                              <div className="text-xs text-muted-foreground">Contact Titles: {a.contacts.length ? a.contacts.map((c: any) => c.title || '—').join(', ') : '—'}</div>
                              <div className="text-xs text-muted-foreground">Discount Eligible: {(a.raw as Contractor).qualifiesForDiscount ? 'Yes' : 'No'}</div>
                            </>
                          )}
                          {a.type === 'Client' ? (
                            <div className="text-xs text-muted-foreground">Permit PDF Downloads: {a.permitPdfDownloads ? 'Enabled' : 'Disabled'}</div>
                          ) : null}
                          <div className="flex gap-1 justify-end pt-1 border-t border-border/40">
                            {a.type === 'Client' ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                title={a.hiddenFromDatabase ? "Unhide client" : "Hide client"}
                                onClick={() => (a.hiddenFromDatabase ? handleUnhideClient(a.raw as Client) : handleHideClient(a.raw as Client))}
                              >
                                {a.hiddenFromDatabase ? <Eye className="h-4 w-4 text-emerald-400" /> : <EyeOff className="h-4 w-4 text-amber-400" />}
                              </Button>
                            ) : null}
                            {a.type === 'Client' ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Mark as Contractor"
                                onClick={() => handleMarkClientAsContractor(a.raw as Client)}
                              >
                                <ArrowRightLeft className="h-4 w-4 text-amber-400" />
                              </Button>
                            ) : null}
                            {a.type === 'Contractor' ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Move to Client"
                                onClick={() => handleMarkContractorAsClient(a.raw as Contractor)}
                              >
                                <ArrowRightLeft className="h-4 w-4 text-sky-400" />
                              </Button>
                            ) : null}
                            <Button variant="ghost" size="icon" onClick={() => {
                              if (a.type === 'Client') { setEditingClient(a.raw as Client); setIsClientDialogOpen(true); }
                              else { setEditingContractor(a.raw as Contractor); setIsContractorDialogOpen(true); }
                            }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-rose-500" onClick={() => {
                              if (a.type === 'Client') { if (confirm(`Delete ${a.name}?`)) deleteClient(a.id); }
                              else { if (confirm(`Delete ${a.name}?`)) deleteContractor(a.id); }
                            }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card className="border-border/50 shadow-lg overflow-hidden bg-card/30">
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader className="bg-muted/50">
                          <TableRow>
                            <TableHead><button className="flex items-center gap-1 font-bold" onClick={() => { setAccountsSortKey('type'); setAccountsSortDir(accountsSortKey === 'type' && accountsSortDir === 'asc' ? 'desc' : 'asc'); }}>Type <ArrowUpDown className="h-3 w-3 opacity-60" /></button></TableHead>
                            <TableHead><button className="flex items-center gap-1 font-bold" onClick={() => { setAccountsSortKey('name'); setAccountsSortDir(accountsSortKey === 'name' && accountsSortDir === 'asc' ? 'desc' : 'asc'); }}>Name <ArrowUpDown className="h-3 w-3 opacity-60" /></button></TableHead>
                            <TableHead><button className="flex items-center gap-1 font-bold" onClick={() => { setAccountsSortKey('email'); setAccountsSortDir(accountsSortKey === 'email' && accountsSortDir === 'asc' ? 'desc' : 'asc'); }}>Email <ArrowUpDown className="h-3 w-3 opacity-60" /></button></TableHead>
                            <TableHead><button className="flex items-center gap-1 font-bold" onClick={() => { setAccountsSortKey('phone'); setAccountsSortDir(accountsSortKey === 'phone' && accountsSortDir === 'asc' ? 'desc' : 'asc'); }}>Phone <ArrowUpDown className="h-3 w-3 opacity-60" /></button></TableHead>
                            <TableHead><button className="flex items-center gap-1 font-bold" onClick={() => { setAccountsSortKey('project'); setAccountsSortDir(accountsSortKey === 'project' && accountsSortDir === 'asc' ? 'desc' : 'asc'); }}>Project <ArrowUpDown className="h-3 w-3 opacity-60" /></button></TableHead>
                            <TableHead><button className="flex items-center gap-1 font-bold" onClick={() => { setAccountsSortKey('accessCode'); setAccountsSortDir(accountsSortKey === 'accessCode' && accountsSortDir === 'asc' ? 'desc' : 'asc'); }}>Access Code <ArrowUpDown className="h-3 w-3 opacity-60" /></button></TableHead>
                            <TableHead>Permit PDF</TableHead>
                            <TableHead className="w-20 text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {accountRows.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={8} className="text-center py-10 text-muted-foreground italic">No accounts found.</TableCell>
                            </TableRow>
                          ) : accountRows.map((a) => (
                            <TableRow key={`${a.type}-${a.id}`} className="hover:bg-muted/20">
                              <TableCell><Badge variant="outline" className="text-[8px] uppercase">{a.type}</Badge></TableCell>
                              <TableCell className="font-bold text-white">{a.name}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{a.email || '—'}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{a.phone || '—'}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{a.projectName || '—'}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{a.accessCode || '—'}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{a.permitPdfDownloads ? 'Yes' : 'No'}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex gap-1 justify-end">
                                  {a.type === 'Client' ? (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      title={a.hiddenFromDatabase ? "Unhide client" : "Hide client"}
                                      onClick={() => (a.hiddenFromDatabase ? handleUnhideClient(a.raw as Client) : handleHideClient(a.raw as Client))}
                                    >
                                      {a.hiddenFromDatabase ? <Eye className="h-4 w-4 text-emerald-400" /> : <EyeOff className="h-4 w-4 text-amber-400" />}
                                    </Button>
                                  ) : null}
                                  {a.type === 'Client' ? (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      title="Mark as Contractor"
                                      onClick={() => handleMarkClientAsContractor(a.raw as Client)}
                                    >
                                      <ArrowRightLeft className="h-4 w-4 text-amber-400" />
                                    </Button>
                                  ) : null}
                                  {a.type === 'Contractor' ? (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      title="Move to Client"
                                      onClick={() => handleMarkContractorAsClient(a.raw as Contractor)}
                                    >
                                      <ArrowRightLeft className="h-4 w-4 text-sky-400" />
                                    </Button>
                                  ) : null}
                                  <Button variant="ghost" size="icon" onClick={() => {
                                    if (a.type === 'Client') { setEditingClient(a.raw as Client); setIsClientDialogOpen(true); }
                                    else { setEditingContractor(a.raw as Contractor); setIsContractorDialogOpen(true); }
                                  }}><Pencil className="h-4 w-4" /></Button>
                                  <Button variant="ghost" size="icon" className="text-rose-500" onClick={() => {
                                    if (a.type === 'Client') { if (confirm(`Delete ${a.name}?`)) deleteClient(a.id); }
                                    else { if (confirm(`Delete ${a.name}?`)) deleteContractor(a.id); }
                                  }}><Trash2 className="h-4 w-4" /></Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </TabsContent>

          {canSeeBillingTab ? (
            <TabsContent value="billing">
              <Tabs defaultValue="hours">
                <TabsList>
                  <TabsTrigger value="hours">Hours</TabsTrigger>
                  <TabsTrigger value="printing">Printing</TabsTrigger>
                </TabsList>
                <TabsContent value="hours">
                  <BillableHoursTab 
                    clients={selectableClients} 
                    projects={filteredProjects} 
                    entries={billableEntries} 
                    archivedEntries={archivedBillableEntries}
                    onAddEntry={addBillableEntry} 
                    onUpdateEntry={updateBillableEntry} 
                    onDeleteEntry={deleteBillableEntry} 
                    onUpdateStatus={updateBillableEntryStatus} 
                    onAddProject={() => setIsProjectDialogOpen(true)} 
                    onUpdateProject={updateProject}
                    initialBillableEditId={initialBillableEditId}
                    onClearInitialBillableEdit={() => setInitialBillableEditId(null)}
                  />
                </TabsContent>
                <TabsContent value="printing">
                  <PrintingTab 
                    clients={selectableClients} 
                    projects={filteredProjects} 
                    entries={printEntries} 
                    onAddEntry={addPrintEntry} 
                    onUpdateEntry={updatePrintEntry} 
                    onDeleteEntry={deletePrintEntry} 
                    onUpdateStatus={updatePrintEntryStatus} 
                    onAddProject={() => setIsProjectDialogOpen(true)} 
                    onAddClient={() => setIsClientDialogOpen(true)} 
                  />
                </TabsContent>
              </Tabs>
            </TabsContent>
          ) : null}
          {canSeeReportsTab ? (
            <TabsContent value="reports">
              <ReportsTab
                projects={projects}
                billableEntries={billableEntries}
                archivedBillableEntries={archivedBillableEntries}
                printEntries={printEntries}
                archivedPrintEntries={archivedPrintEntries}
                clients={selectableClients}
                tasks={tasks}
                archivedTasks={archivedTasks}
                payroll={payroll}
                payPeriodSubmissions={payPeriodSubmissions}
                timesheetPdfArchive={timesheetPdfArchive}
                onDeleteTimesheetPdfArchive={deleteTimesheetPdfArchive}
                leaveBanks={leaveBanks}
                allEmployees={allEmployees}
              />
            </TabsContent>
          ) : null}
          <TabsContent value="tasks"><TasksTab clients={selectableClients} projects={projects} tasks={tasks} calendarEvents={calendarEvents} onAddTask={addTask} onUpdateTask={updateTask} onDeleteTask={deleteTask} onAddEvent={addCalendarEvent} onUpdateEvent={updateCalendarEvent} onDeleteEvent={deleteCalendarEvent} currentEmployee={user} initialTaskId={initialTaskId} onClearInitialTask={() => setInitialTaskId(null)} allEmployees={allEmployees} /></TabsContent>
          <TabsContent value="timesheets"><TimesheetTab projects={filteredProjects} employeeId={user?.id || null} allEmployees={allEmployees} leaveBanks={leaveBanks} onAddEntry={addTimesheetEntry} onUpdateEntry={updateTimesheetEntry} onDeleteEntry={deleteTimesheetEntry} onUpdateLeaveBank={updateLeaveBank} onAddProject={() => setIsProjectDialogOpen(true)} isGlobalAdmin={isBoss} /></TabsContent>
          <TabsContent value="status"><ProjectStatusTab projects={filteredProjects} clients={selectableClients} onUpdateStatus={updateProjectStatus} /></TabsContent>
          <TabsContent value="templates"><TemplatesTab requests={templateRequests} onAddRequest={addTemplateRequest} onUpdateRequest={updateTemplateRequest} onDeleteRequest={deleteTemplateRequest} /></TabsContent>
          <TabsContent value="toolset"><CalculatorTab templates={textTemplates} onAddTemplate={addTextTemplate} onUpdateTemplate={updateTextTemplate} onDeleteTemplate={deleteTextTemplate} /></TabsContent>
          <TabsContent value="archive"><ArchiveTab clients={selectableClients} projects={projects} billableEntries={archivedBillableEntries} printEntries={printEntries} taskEntries={archivedTasks} onUpdateBillable={updateBillableEntry} onDeleteBillable={deleteBillableEntry} onUpdatePrint={updatePrintEntry} onDeletePrint={deletePrintEntry} onUpdateTask={updateTask} onDeleteTask={deleteTask} onRestoreBillable={restoreArchivedBillableEntry} onRestorePrint={restoreArchivedPrintEntry} onRestoreTask={restoreArchivedTask} onRestoreProject={restoreArchivedProject} /></TabsContent>
          {canSeeFirmCommand ? (
            <TabsContent value="team"><TeamTab collaborators={[]} allEmployees={allEmployees} ownerUid={user?.id || ""} isOwner={true} payroll={payroll} costs={costs} income={income} leaveBanks={leaveBanks} onAddPayroll={addPayroll} onDeletePayroll={deletePayroll} onAddCost={addMonthlyCost} onDeleteCost={deleteMonthlyCost} onAddIncome={addMonthlyIncome} onDeleteIncome={deleteMonthlyIncome} onUpdateLeaveBank={updateLeaveBank} isBoss={isBoss} restoreData={restoreData} rawData={rawData} onUpdatePermissions={() => {}} onRevoke={() => {}} /></TabsContent>
          ) : null}
        </Tabs>
      </main>

      <GlobalSearch open={isSearchOpen} onOpenChange={setIsSearchOpen} data={{ clients, projects, tasks, billableEntries, printEntries, notes: [], library: referenceLibrary, templates: textTemplates }} onNavigate={handleGlobalNavigation} includeBillingInSearch={canSeeBillingTab} />
      <ClientDialog open={isClientDialogOpen} onOpenChange={setIsClientDialogOpen} onSave={editingClient ? (d) => updateClient(editingClient.id, d) : addClient} initialData={editingClient} clients={clients} contractors={contractors} projects={projects} allowContractorToggle={false} />
      <ContractorDialog open={isContractorDialogOpen} onOpenChange={setIsContractorDialogOpen} onSave={editingContractor ? (d) => updateContractor(editingContractor.id, d) : addContractor} initialData={editingContractor} />
      <ProjectDialog open={isProjectDialogOpen} onOpenChange={setIsProjectDialogOpen} clients={selectableClients} contractors={contractors} projects={projects} onSave={editingProject ? (d) => updateProject(editingProject.id, d) : addProject} onAddClientTrigger={() => setIsClientDialogOpen(true)} initialData={editingProject} />
      <WebcamRecorderDialog open={isWebcamRecorderOpen} onOpenChange={setIsWebcamRecorderOpen} />
    </div>
  );
}

export default function Home() {
  return (<Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}><LedgerCommandCenter /></Suspense>);
}

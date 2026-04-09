
"use client"

import { useMemo, useCallback, useEffect } from 'react';
import { getApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getStorage, ref, deleteObject } from 'firebase/storage';
import {
  collection,
  doc,
  query,
  where,
  orderBy,
  setDoc,
  deleteDoc,
  updateDoc,
  getDocs,
  getCountFromServer,
} from 'firebase/firestore';
import { 
  useFirestore, 
  useCollection, 
  useMemoFirebase, 
  useDoc,
  setDocumentNonBlocking,
  updateDocumentNonBlocking,
  deleteDocumentNonBlocking
} from '@/firebase';
import { 
  Client, Project, BillableEntry, PrintEntry, Task, Employee, TextTemplate, 
  TemplateChangeRequest, Plan, 
  PayrollEntry, MonthlyCost, MonthlyIncome, CalendarEvent, 
  PasswordEntry, LeaveBank, SupplyItem, EmployeeWorkStatus, 
  Message, ProjectNote, ReferenceDocument, IntegrationConfig, 
  PayPeriodSubmission, Contractor, MemoryBankFile, TimesheetPdfArchive, QuickTask
} from '@/lib/types';
import { ChecklistCategory, DEFAULT_CHECKLIST } from '@/lib/checklist-data';
import {
  PLAN_REVIEW_PROMPTS,
  mergePlanReviewPromptsFromFirestore,
} from '@/lib/plan-review/prompts';
import type { PlanReviewPromptTemplate } from '@/lib/plan-review/types';
import type { PlanDatabaseConfig, PlanDatabaseRecord } from '@/lib/plan-database/types';
import { useToast } from '@/hooks/use-toast';
import {
  archiveTimesheetPdfFromBrowser,
  patchTimesheetArchivePdfFromBrowser,
} from '@/lib/timesheet-archive-client';
import {
  getDataAccessMode,
  CANONICAL_CLIENTS_COLLECTION,
  CANONICAL_PROJECTS_COLLECTION,
  isDualWriteEnabled,
} from '@/lib/shared-data/feature-flags';
import type { SharedClientDoc, SharedProjectDoc } from '@/lib/shared-data/canonical-types';
import { deriveLedgerFromCanonical } from '@/lib/shared-data/ledger-canonical-derive';
import {
  mapInternalClientToCanonical,
  mapInternalContractorToCanonical,
  mapInternalProjectToCanonical,
} from '@/lib/shared-data/internal-mappers';
import { sharedClientDocIdForLedger, sharedProjectDocIdForLedger } from '@/lib/shared-data/ids';
import { upsertCanonicalClient, upsertCanonicalProject } from '@/lib/shared-data/canonical-repository';

const EMPTY_CONFIG: IntegrationConfig = {};

/** Browser Storage rules need request.auth — match TimesheetTab pre-submit + provider anonymous flow. */
async function ensureFirebaseAuthForClientUpload() {
  try {
    const auth = getAuth(getApp());
    if (!auth.currentUser) await signInAnonymously(auth);
  } catch {
    /* Anonymous may be disabled in Firebase Console */
  }
}

// STABLE BUILD VERSION
export const BUILD_VERSION = "1.7.7-REPORTS-TIMESHEET-PDF";

function ledgerMapClient(c: any): Client {
  const legacyFull = String(c.name ?? c.clientName ?? c.fullName ?? '').trim();
  const rawFirst = String(c.firstName ?? '').trim();
  const rawLast = String(c.lastName ?? '').trim();
  const parsed = legacyFull.split(/\s+/).filter(Boolean);
  const firstName = rawFirst || (parsed.length > 1 ? parsed.slice(0, -1).join(' ') : parsed[0] || '');
  const lastName = rawLast || (parsed.length > 1 ? parsed[parsed.length - 1] : '');
  const name = legacyFull || `${firstName} ${lastName}`.trim() || 'Unnamed Client';

  return {
    ...c,
    id: c.id,
    name,
    firstName,
    lastName,
    secondaryClientName: c.secondaryClientName ?? '',
    email: c.email ?? c.billingEmail ?? '',
    phoneNumber: c.phoneNumber ?? '',
    isContractor: !!(c.isContractor || c.companyName || c.contacts),
    contacts: Array.isArray(c.contacts) ? c.contacts : c.isContractor ? [] : undefined,
    accessCode: c.accessCode || '',
    additionalStakeholders: Array.isArray(c.additionalStakeholders) ? c.additionalStakeholders : [],
    permitPdfDownloads: !!c.permitPdfDownloads,
    initialProjectName: c.initialProjectName ?? '',
    associatedProjectIds: Array.isArray(c.associatedProjectIds) ? c.associatedProjectIds : [],
    projectAddress: c.projectAddress ?? '',
    projectRenderingUrl: c.projectRenderingUrl ?? '',
    assignedContractorId: c.assignedContractorId ?? '',
    discountEligibility: c.discountEligibility ?? '',
    hiddenFromDatabase: !!c.hiddenFromDatabase,
  };
}

function ledgerMapProject(p: any): Project {
  return {
    ...p,
    id: p.id,
    name: p.name ?? 'Untitled Project',
    clientId: p.clientId ?? '',
    hiddenFromCards: !!p.hiddenFromCards,
    contractorId: p.contractorId || '',
    status: p.status ?? 'Initial Meeting',
    address: p.address ?? '',
    lat: typeof p.lat === 'number' ? p.lat : undefined,
    lng: typeof p.lng === 'number' ? p.lng : undefined,
    constructionCompany: p.constructionCompany ?? '',
    hourlyRate: p.hourlyRate ?? 0,
    hasHourlyDiscount: !!p.hasHourlyDiscount,
    currentHeatedSqFt: p.currentHeatedSqFt ?? 0,
    createdAt: p.createdAt ?? new Date().toISOString(),
    nature: p.nature ?? [],
    designer: p.designer ?? 'Jeff Dillon',
    renderingUrl: (p.renderingUrl ?? p.renderingSource ?? p.rendering ?? '') || '',
  };
}

export function useLedgerData(sessionEmployeeId?: string | null) {
  const firestore = useFirestore();
  const { toast } = useToast();

  const activeUserId = useMemo(() => {
    if (sessionEmployeeId) return sessionEmployeeId;
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('di_ledger_session_employee_id');
      return saved || "hE7guhWJu6gZm9dIQzHDkEBRmMr1"; 
    }
    return "hE7guhWJu6gZm9dIQzHDkEBRmMr1";
  }, [sessionEmployeeId]);

  const myEmployeeRef = useMemoFirebase(() => 
    activeUserId ? doc(firestore, 'employees', activeUserId) : null
  , [firestore, activeUserId]);
  
  const { data: myEmployeeData } = useDoc<Employee>(myEmployeeRef);

  const myBossId = myEmployeeData?.bossId;
  const myRole = myEmployeeData?.role;
  const myFirstName = myEmployeeData?.firstName;

  const isBoss = useMemo(() => {
    const first = (myFirstName || '').toLowerCase();
    return first.includes('jeff') || myRole === 'Administrator' || activeUserId === "hE7guhWJu6gZm9dIQzHDkEBRmMr1";
  }, [myFirstName, myRole, activeUserId]);

  const dataRootId = useMemo(() => {
    if (isBoss) return activeUserId;
    return myBossId || activeUserId;
  }, [activeUserId, myBossId, isBoss]);

  const isLoaded = !!dataRootId;

  const dataAccessMode = getDataAccessMode();
  const useCanonicalLists =
    dataAccessMode === 'canonical_read' || dataAccessMode === 'canonical_read_write';

  // Collection Refs
  const clientsRef = useMemoFirebase(
    () =>
      dataRootId && !useCanonicalLists
        ? collection(firestore, 'employees', dataRootId, 'clients')
        : null,
    [firestore, dataRootId, useCanonicalLists],
  );
  const projectsRef = useMemoFirebase(
    () =>
      dataRootId && !useCanonicalLists
        ? collection(firestore, 'employees', dataRootId, 'projects')
        : null,
    [firestore, dataRootId, useCanonicalLists],
  );

  const canonicalClientsQueryRef = useMemoFirebase(
    () =>
      dataRootId && useCanonicalLists
        ? query(collection(firestore, CANONICAL_CLIENTS_COLLECTION), where('firmId', '==', dataRootId))
        : null,
    [firestore, dataRootId, useCanonicalLists],
  );
  const canonicalProjectsQueryRef = useMemoFirebase(
    () =>
      dataRootId && useCanonicalLists
        ? query(collection(firestore, CANONICAL_PROJECTS_COLLECTION), where('firmId', '==', dataRootId))
        : null,
    [firestore, dataRootId, useCanonicalLists],
  );
  const tasksRef = useMemoFirebase(() => dataRootId ? collection(firestore, 'employees', dataRootId, 'tasks') : null, [firestore, dataRootId]);
  const quickTasksRef = useMemoFirebase(
    () => (dataRootId ? collection(firestore, 'employees', dataRootId, 'quick_tasks') : null),
    [firestore, dataRootId],
  );
  const billablesRef = useMemoFirebase(() => dataRootId ? collection(firestore, 'employees', dataRootId, 'billable_hour_entries') : null, [firestore, dataRootId]);
  const printsRef = useMemoFirebase(() => dataRootId ? collection(firestore, 'employees', dataRootId, 'print_job_entries') : null, [firestore, dataRootId]);
  const archBillablesRef = useMemoFirebase(() => dataRootId ? collection(firestore, 'employees', dataRootId, 'archived_billable_hour_entries') : null, [firestore, dataRootId]);
  const archivedPrintsRef = useMemoFirebase(() => dataRootId ? collection(firestore, 'employees', dataRootId, 'archived_print_job_entries') : null, [firestore, dataRootId]);
  const calendarEventsRef = useMemoFirebase(() => dataRootId ? collection(firestore, 'employees', dataRootId, 'calendar_events') : null, [firestore, dataRootId]);
  const plansRef = useMemoFirebase(() => dataRootId ? collection(firestore, 'employees', dataRootId, 'plans') : null, [firestore, dataRootId]);
  const contractorsRef = useMemoFirebase(() => dataRootId ? collection(firestore, 'employees', dataRootId, 'contractors') : null, [firestore, dataRootId]);
  const suppliesRef = useMemoFirebase(() => dataRootId ? collection(firestore, 'employees', dataRootId, 'supplies') : null, [firestore, dataRootId]);
  const leaveBanksRef = useMemoFirebase(() => dataRootId ? collection(firestore, 'employees', dataRootId, 'leave_banks') : null, [firestore, dataRootId]);
  const payrollRef = useMemoFirebase(() => dataRootId ? collection(firestore, 'employees', dataRootId, 'payroll_entries') : null, [firestore, dataRootId]);
  const costsRef = useMemoFirebase(() => dataRootId ? collection(firestore, 'employees', dataRootId, 'monthly_costs') : null, [firestore, dataRootId]);
  const incomeRef = useMemoFirebase(() => dataRootId ? collection(firestore, 'employees', dataRootId, 'monthly_income') : null, [firestore, dataRootId]);
  const textTemplatesRef = useMemoFirebase(() => dataRootId ? collection(firestore, 'employees', dataRootId, 'text_templates') : null, [firestore, dataRootId]);
  const templateRequestsRef = useMemoFirebase(() => dataRootId ? collection(firestore, 'employees', dataRootId, 'template_requests') : null, [firestore, dataRootId]);
  const passwordVaultRef = useMemoFirebase(() => dataRootId ? collection(firestore, 'employees', dataRootId, 'password_vault') : null, [firestore, dataRootId]);
  const messagesRef = useMemoFirebase(() => dataRootId ? collection(firestore, 'employees', dataRootId, 'messages') : null, [firestore, dataRootId]);
  const referenceLibraryRef = useMemoFirebase(() => dataRootId ? collection(firestore, 'employees', dataRootId, 'reference_library') : null, [firestore, dataRootId]);
  const submissionsRef = useMemoFirebase(() => dataRootId ? collection(firestore, 'employees', dataRootId, 'pay_period_submissions') : null, [firestore, dataRootId]);
  const timesheetArchiveQueryRef = useMemoFirebase(
    () =>
      dataRootId
        ? query(collection(firestore, 'employees', dataRootId, 'timesheet_report_archive'), orderBy('createdAt', 'desc'))
        : null,
    [firestore, dataRootId]
  );
  const memoryBankRef = useMemoFirebase(() => dataRootId ? collection(firestore, 'employees', dataRootId, 'memory_bank_files') : null, [firestore, dataRootId]);
  
  const checklistTemplateRef = useMemoFirebase(() => dataRootId ? doc(firestore, 'employees', dataRootId, 'config', 'checklist_template') : null, [firestore, dataRootId]);
  const planReviewPromptsRef = useMemoFirebase(
    () => (dataRootId ? doc(firestore, 'employees', dataRootId, 'config', 'plan_review_prompts') : null),
    [firestore, dataRootId],
  );
  const integrationConfigRef = useMemoFirebase(() => dataRootId ? doc(firestore, 'employees', dataRootId, 'config', 'integrations') : null, [firestore, dataRootId]);
  const planDatabaseConfigRef = useMemoFirebase(
    () => (dataRootId ? doc(firestore, 'employees', dataRootId, 'config', 'plan_database') : null),
    [firestore, dataRootId],
  );

  const staffRef = useMemoFirebase(() => dataRootId ? query(collection(firestore, 'employees'), where('bossId', '==', dataRootId)) : null, [firestore, dataRootId]);

  const { data: clientsRaw } = useCollection<Client>(clientsRef);
  const { data: projectsRaw } = useCollection<any>(projectsRef);
  const { data: canonicalClientsRaw } = useCollection<SharedClientDoc>(canonicalClientsQueryRef);
  const { data: canonicalProjectsRaw } = useCollection<SharedProjectDoc>(canonicalProjectsQueryRef);
  const { data: tasksRaw } = useCollection<Task>(tasksRef);
  const { data: quickTasksRaw } = useCollection<QuickTask>(quickTasksRef);
  const { data: billablesRaw } = useCollection<any>(billablesRef);
  const { data: printsRaw } = useCollection<any>(printsRef);
  const { data: archBillablesRaw } = useCollection<any>(archBillablesRef);
  const { data: archPrintsRaw } = useCollection<any>(archivedPrintsRef);
  const { data: eventsRaw } = useCollection<CalendarEvent>(calendarEventsRef);
  const { data: plansRaw } = useCollection<Plan>(plansRef);
  const { data: contractorsRaw } = useCollection<Contractor>(contractorsRef);
  const { data: suppliesRaw } = useCollection<SupplyItem>(suppliesRef);
  const { data: leaveBanksRaw } = useCollection<LeaveBank>(leaveBanksRef);
  const { data: payrollRaw } = useCollection<PayrollEntry>(payrollRef);
  const { data: costsRaw } = useCollection<MonthlyCost>(costsRef);
  const { data: incomeRaw } = useCollection<MonthlyIncome>(incomeRef);
  const { data: templatesRaw } = useCollection<TextTemplate>(textTemplatesRef);
  const { data: templateReqsRaw } = useCollection<TemplateChangeRequest>(templateRequestsRef);
  const { data: vaultRaw } = useCollection<PasswordEntry>(passwordVaultRef);
  const { data: messagesRaw } = useCollection<Message>(messagesRef);
  const { data: libraryRaw } = useCollection<ReferenceDocument>(referenceLibraryRef);
  const { data: submissionsRaw } = useCollection<PayPeriodSubmission>(submissionsRef);
  const { data: timesheetArchiveRaw } = useCollection<TimesheetPdfArchive>(timesheetArchiveQueryRef);
  const { data: memoryBankFilesRaw } = useCollection<MemoryBankFile>(memoryBankRef);
  const { data: subordinatesRaw } = useCollection<Employee>(staffRef);
  const { data: checklistTemplateData } = useDoc<any>(checklistTemplateRef);
  const { data: planReviewPromptsDoc } = useDoc<any>(planReviewPromptsRef);
  const { data: integrationConfigData } = useDoc<IntegrationConfig>(integrationConfigRef);
  const { data: planDatabaseConfigData } = useDoc<PlanDatabaseConfig>(planDatabaseConfigRef);

  const planDatabasePlansRef = useMemoFirebase(
    () => (dataRootId ? collection(firestore, 'employees', dataRootId, 'plan_database') : null),
    [firestore, dataRootId],
  );
  const { data: planDatabasePlansRaw } = useCollection<PlanDatabaseRecord>(planDatabasePlansRef);

  const checklistTemplate = useMemo(() => checklistTemplateData?.categories || DEFAULT_CHECKLIST, [checklistTemplateData]);
  const planReviewPrompts = useMemo(
    () => mergePlanReviewPromptsFromFirestore(planReviewPromptsDoc?.prompts),
    [planReviewPromptsDoc],
  );
  const integrationConfig = useMemo(() => integrationConfigData || EMPTY_CONFIG, [integrationConfigData]);
  const planDatabaseConfig = useMemo(() => {
    const base = planDatabaseConfigData;
    if (base?.rootFolderPath?.trim()) return base;
    return {
      rootFolderPath: '/Projects/Completed Plans',
      updatedAt: new Date().toISOString(),
    } satisfies PlanDatabaseConfig;
  }, [planDatabaseConfigData]);

  const allEmployees = useMemo(() => {
    const list = [...(subordinatesRaw || [])];
    if (myEmployeeData && !list.find(e => e.id === myEmployeeData.id)) {
      list.push(myEmployeeData);
    }
    return list;
  }, [subordinatesRaw, myEmployeeData]);

  const mapEntry = (e: any) => {
    const hours = Number(e.hours ?? e.billableHours ?? 0);
    const sheets = Number(e.sheets ?? e.quantity ?? 0);
    const rate = Number(e.rate ?? e.hourlyRate ?? 0);
    const lateFee = Number(e.lateFee ?? 0);
    let total = Number(e.total);
    if (isNaN(total) || total === 0) {
      if (hours > 0) total = (hours * rate) + lateFee;
      else if (sheets > 0) total = (sheets * rate) + lateFee;
    }
    return { ...e, hours, sheets, rate, total, status: e.status || 'Not Sent', date: e.date || new Date().toISOString() };
  };

  const derivedCanonical = useMemo(() => {
    if (!useCanonicalLists) return null;
    return deriveLedgerFromCanonical(
      canonicalClientsRaw as Parameters<typeof deriveLedgerFromCanonical>[0],
      canonicalProjectsRaw as Parameters<typeof deriveLedgerFromCanonical>[1],
      ledgerMapClient,
      ledgerMapProject,
    );
  }, [useCanonicalLists, canonicalClientsRaw, canonicalProjectsRaw]);

  const mappedAccounts = useMemo(() => {
    if (useCanonicalLists && derivedCanonical) return derivedCanonical.mappedAccounts;
    return (clientsRaw || []).map(ledgerMapClient);
  }, [useCanonicalLists, derivedCanonical, clientsRaw]);

  const clients = useMemo(() => {
    if (useCanonicalLists && derivedCanonical) return derivedCanonical.clients;
    return mappedAccounts.filter((c) => !c.isContractor);
  }, [useCanonicalLists, derivedCanonical, mappedAccounts]);

  const contractors = useMemo(() => {
    if (useCanonicalLists && derivedCanonical) return derivedCanonical.contractors;
    const fromDedicated = ((contractorsRaw || []) as any[]).map((c) => ({
      id: c.id,
      companyName: c.companyName || c.name || 'Unnamed Contractor',
      logoUrl: c.logoUrl || '',
      billingEmail: c.billingEmail || c.email || '',
      contacts: Array.isArray(c.contacts)
        ? c.contacts.map((ct: any) => ({
            name: ct?.name || '',
            title: ct?.title || ct?.role || '',
            email: ct?.email || '',
            phone: ct?.phone || ct?.phoneNumber || '',
          }))
        : [],
      accessCode: c.accessCode || '',
      permitPdfDownloads: !!c.permitPdfDownloads,
      qualifiesForDiscount: c.qualifiesForDiscount !== false,
    } as Contractor));
    const fromLegacyClients = mappedAccounts
      .filter(c => c.isContractor)
      .map((c) => ({
        id: c.id,
        companyName: c.name,
        logoUrl: c.logoUrl,
        billingEmail: c.billingEmail || c.email || '',
        contacts: c.contacts || [],
        accessCode: c.accessCode,
        permitPdfDownloads: c.permitPdfDownloads,
        qualifiesForDiscount: (c as any).qualifiesForDiscount !== false,
      } as Contractor));
    const byId = new Map<string, Contractor>();
    [...fromLegacyClients, ...fromDedicated].forEach((c) => {
      if (!c?.id) return;
      byId.set(c.id, c);
    });
    return Array.from(byId.values());
  }, [useCanonicalLists, derivedCanonical, contractorsRaw, mappedAccounts]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (process.env.NODE_ENV === 'production') return;
    const mode = getDataAccessMode();
    if (mode !== 'canonical_read' && mode !== 'dual_verify') return;
    if (!dataRootId) return;
    let cancelled = false;
    void (async () => {
      try {
        const qc = query(
          collection(firestore, CANONICAL_CLIENTS_COLLECTION),
          where('firmId', '==', dataRootId),
        );
        const qp = query(
          collection(firestore, CANONICAL_PROJECTS_COLLECTION),
          where('firmId', '==', dataRootId),
        );
        const [snapC, snapP] = await Promise.all([getCountFromServer(qc), getCountFromServer(qp)]);
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.info('[canonical dev] clients collection count:', snapC.data().count, 'projects:', snapP.data().count);
        if (mode === 'dual_verify' && clientsRaw) {
          // eslint-disable-next-line no-console
          console.info(
            '[dual_verify dev] legacy employees/.../clients docs:',
            clientsRaw.length,
            'projects:',
            (projectsRaw || []).length,
          );
        }
      } catch (e) {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.warn('[canonical dev] count query failed (indexes / rules / empty DB?)', e);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firestore, dataRootId, clientsRaw, projectsRaw]);

  const activeProjects = useMemo(() => {
    if (useCanonicalLists && derivedCanonical) return derivedCanonical.activeProjects;
    return (projectsRaw || []).map(ledgerMapProject);
  }, [useCanonicalLists, derivedCanonical, projectsRaw]);
  const billableEntries = useMemo(() => (billablesRaw || []).map(mapEntry), [billablesRaw]);
  const printEntries = useMemo(() => (printsRaw || []).map(mapEntry), [printsRaw]);
  const archivedBillableEntries = useMemo(() => (archBillablesRaw || []).map(mapEntry), [archBillablesRaw]);
  const archivedPrintEntries = useMemo(() => (archPrintsRaw || []).map(mapEntry), [archPrintsRaw]);

  const allProjects = useMemo(() => {
    const projectMap = new Map<string, Project>();
    
    activeProjects.forEach(p => {
      if (p.id) projectMap.set(p.id, p);
    });
    
    archivedBillableEntries.forEach(entry => {
      const pId = entry.projectId;
      if (pId && !projectMap.has(pId)) {
        projectMap.set(pId, {
          id: pId,
          name: (entry as any).projectName || (entry as any).project || 'Historical Site',
          clientId: entry.clientId || '',
          status: 'Archived',
          isArchived: true,
          nature: [],
          designer: 'Jeff Dillon',
          createdAt: entry.date
        } as Project);
      }
    });

    archivedPrintEntries.forEach(entry => {
      const pId = entry.projectId;
      if (pId && !projectMap.has(pId)) {
        projectMap.set(pId, {
          id: pId,
          name: (entry as any).projectName || (entry as any).project || 'Historical Site',
          clientId: entry.clientId || '',
          status: 'Archived',
          isArchived: true,
          nature: [],
          designer: 'Jeff Dillon',
          createdAt: entry.date
        } as Project);
      }
    });

    return Array.from(projectMap.values());
  }, [activeProjects, archivedBillableEntries, archivedPrintEntries]);

  const calendarEvents = useMemo(() => {
    if (!eventsRaw) return [];
    return eventsRaw.filter(event => {
      if (event.visibility === 'Global' || !event.visibility) return true;
      return event.ownerId === activeUserId;
    });
  }, [eventsRaw, activeUserId]);

  const myDisplayName = useMemo(
    () => `${myEmployeeData?.firstName ?? ''} ${myEmployeeData?.lastName ?? ''}`.trim(),
    [myEmployeeData?.firstName, myEmployeeData?.lastName]
  );

  const messagesInbox = useMemo(() => 
    (messagesRaw || []).filter(m => m.recipientId === activeUserId || m.recipientId === 'all')
  , [messagesRaw, activeUserId]);

  const messagesOutbox = useMemo(() => {
    const list = (messagesRaw || []).filter((m) => {
      if (m.senderId === activeUserId || m.senderId === myEmployeeData?.id) return true;
      // Legacy: Firestore drops undefined fields — older sends may lack senderId but match name.
      if (!m.senderId && myDisplayName && m.senderName === myDisplayName) return true;
      return false;
    });
    return [...list].sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt)));
  }, [messagesRaw, activeUserId, myEmployeeData?.id, myDisplayName]);

  const memoryBankFiles = useMemo(() => (memoryBankFilesRaw || []), [memoryBankFilesRaw]);

  const quickTasks = useMemo(
    () => (quickTasksRaw || []).filter((t) => t.status !== 'Completed'),
    [quickTasksRaw],
  );
  const archivedQuickTasks = useMemo(
    () => (quickTasksRaw || []).filter((t) => t.status === 'Completed'),
    [quickTasksRaw],
  );

  const registerPortalCode = (code: string, accountId: string, firmId: string, accountType: 'client' | 'contractor' = 'client') => {
    if (!code) return;
    const portalRef = doc(firestore, 'portals', code.toUpperCase());
    setDocumentNonBlocking(portalRef, {
      code: code.toUpperCase(),
      accountId,
      firmId,
      accountType,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  };

  const sendMessage = (m: any) => {
    if (!dataRootId) return;
    const senderId = String(myEmployeeData?.id || activeUserId || '').trim();
    if (!senderId) {
      toast({ variant: 'destructive', title: 'Cannot send', description: 'Your profile is still loading. Try again in a moment.' });
      return;
    }
    const senderName = `${myEmployeeData?.firstName ?? ''} ${myEmployeeData?.lastName ?? ''}`.trim() || 'Team member';
    const ref = doc(collection(firestore, 'employees', dataRootId, 'messages'));
    setDocumentNonBlocking(ref, { 
      ...m, 
      id: ref.id, 
      senderId, 
      senderName, 
      sentAt: new Date().toISOString() 
    }, { merge: true });
  };

  const markMessageRead = (messageId: string, recipientId: string) => {
    if (!dataRootId || !activeUserId) return;
    const ref = doc(firestore, 'employees', dataRootId, 'messages', messageId);
    if (recipientId === 'all') {
      updateDocumentNonBlocking(ref, { [`readBy.${activeUserId}`]: new Date().toISOString() });
    } else {
      updateDocumentNonBlocking(ref, { readAt: new Date().toISOString() });
    }
  };

  const deleteMessage = (messageId: string, type: 'inbox' | 'outbox') => {
    if (!dataRootId) return;
    deleteDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'messages', messageId));
  };

  const deleteClient = (id: string) => {
    if (!dataRootId) return;
    const account = mappedAccounts.find(c => c.id === id);
    if (account?.accessCode) {
      deleteDocumentNonBlocking(doc(firestore, 'portals', account.accessCode.toUpperCase()));
    }
    deleteDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'clients', id));
  };

  const syncAllPortalCodes = async () => {
    if (!dataRootId) return;
    const q = collection(firestore, 'employees', dataRootId, 'clients');
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const data = d.data();
      if (data.accessCode) {
        await setDoc(doc(firestore, 'portals', data.accessCode.toUpperCase()), {
          code: data.accessCode.toUpperCase(),
          accountId: d.id,
          firmId: dataRootId,
          accountType: 'client',
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
    }

    const contractorsQ = collection(firestore, 'employees', dataRootId, 'contractors');
    const contractorsSnap = await getDocs(contractorsQ);
    for (const d of contractorsSnap.docs) {
      const data = d.data();
      if (data.accessCode) {
        await setDoc(doc(firestore, 'portals', data.accessCode.toUpperCase()), {
          code: data.accessCode.toUpperCase(),
          accountId: d.id,
          firmId: dataRootId,
          accountType: 'contractor',
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
    }
  };

  const restoreData = async (data: any) => {
    if (!dataRootId) return;
    toast({ title: "Nuclear Reconstruction Active", description: "Deploying backup stream..." });
    
    const collections = [
      'clients', 'contractors', 'projects', 'tasks', 'billable_hour_entries', 'print_job_entries',
      'archived_billable_hour_entries', 'archived_print_job_entries', 'calendar_events',
      'plans', 'supplies', 'leave_banks', 'payroll_entries', 'monthly_costs',
      'monthly_income', 'text_templates', 'template_requests', 'password_vault',
      'messages', 'reference_library', 'pay_period_submissions', 'timesheet_report_archive'
    ];

    try {
      for (const coll of collections) {
        const items = data[coll];
        if (items && Array.isArray(items)) {
          for (const item of items) {
            if (!item.id) continue;
            const itemRef = doc(firestore, 'employees', dataRootId, coll, item.id);
            await setDoc(itemRef, item, { merge: true });
          }
        }
      }
      
      if (data.config) {
        if (data.config.checklist_template) {
          await setDoc(doc(firestore, 'employees', dataRootId, 'config', 'checklist_template'), data.config.checklist_template, { merge: true });
        }
        if (data.config.integrations) {
          await setDoc(doc(firestore, 'employees', dataRootId, 'config', 'integrations'), data.config.integrations, { merge: true });
        }
        if (data.config.plan_review_prompts) {
          await setDoc(
            doc(firestore, 'employees', dataRootId, 'config', 'plan_review_prompts'),
            data.config.plan_review_prompts,
            { merge: true },
          );
        }
      }

      toast({ title: "Reconstruction Complete", description: "Firm registry has been fully synchronized." });
    } catch (e: any) {
      console.error("Restore failed:", e);
      toast({ variant: "destructive", title: "Restore Failed", description: e.message });
    }
  };

  const migrateClientsToOnboardingSchema = async () => {
    if (!dataRootId) return;
    const snap = await getDocs(collection(firestore, 'employees', dataRootId, 'clients'));
    for (const d of snap.docs) {
      const data = d.data() as any;
      // Contractors are now separate and will be handled by dedicated contractor flow.
      if (data?.isContractor) continue;
      const patch: any = {};
      if (typeof data.secondaryClientName !== 'string') patch.secondaryClientName = "";
      if (typeof data.firstName !== 'string' || typeof data.lastName !== 'string') {
        const full = String(data.name || '').trim();
        const parts = full.split(/\s+/).filter(Boolean);
        patch.firstName = typeof data.firstName === 'string' ? data.firstName : (parts.slice(0, -1).join(' ') || parts[0] || "");
        patch.lastName = typeof data.lastName === 'string' ? data.lastName : (parts.length > 1 ? parts[parts.length - 1] : "");
      }
      if (typeof data.email !== 'string') patch.email = data.billingEmail || "";
      if (typeof data.phoneNumber !== 'string') patch.phoneNumber = "";
      if (!Array.isArray(data.additionalStakeholders)) patch.additionalStakeholders = [];
      if (typeof data.initialProjectName !== 'string') patch.initialProjectName = "";
      if (!Array.isArray(data.associatedProjectIds)) patch.associatedProjectIds = [];
      if (typeof data.projectAddress !== 'string') patch.projectAddress = "";
      if (typeof data.projectRenderingUrl !== 'string') patch.projectRenderingUrl = "";
      if (typeof data.assignedContractorId !== 'string') patch.assignedContractorId = "";
      if (typeof data.discountEligibility !== 'string') patch.discountEligibility = "";
      if (typeof data.hiddenFromDatabase !== 'boolean') patch.hiddenFromDatabase = false;
      if (typeof data.permitPdfDownloads !== 'boolean') patch.permitPdfDownloads = false;
      if (Object.keys(patch).length > 0) {
        await setDoc(doc(firestore, 'employees', dataRootId, 'clients', d.id), patch, { merge: true });
      }
    }
  };

  const migrateContractorsToOnboardingSchema = async () => {
    if (!dataRootId) return;
    const snap = await getDocs(collection(firestore, 'employees', dataRootId, 'contractors'));
    for (const d of snap.docs) {
      const data = d.data() as any;
      const patch: any = {};
      if (typeof data.companyName !== 'string') patch.companyName = data.name || "";
      if (typeof data.billingEmail !== 'string') patch.billingEmail = data.email || "";
      if (typeof data.accessCode !== 'string') patch.accessCode = "";
      if (typeof data.permitPdfDownloads !== 'boolean') patch.permitPdfDownloads = false;
      if (typeof data.qualifiesForDiscount !== 'boolean') patch.qualifiesForDiscount = true;
      if (!Array.isArray(data.contacts)) patch.contacts = [];
      else {
        const normalized = data.contacts.map((c: any) => ({
          name: c?.name || '',
          title: c?.title || c?.role || '',
          email: c?.email || '',
          phone: c?.phone || c?.phoneNumber || '',
        }));
        patch.contacts = normalized;
      }
      if (Object.keys(patch).length > 0) {
        await setDoc(doc(firestore, 'employees', dataRootId, 'contractors', d.id), patch, { merge: true });
      }
    }
  };

  const rawData = useMemo(() => {
    if (!isLoaded) return null;
    return {
      clients: clientsRaw || [],
      projects: projectsRaw || [],
      tasks: tasksRaw || [],
      billable_hour_entries: billablesRaw || [],
      print_job_entries: printsRaw || [],
      archived_billable_hour_entries: archBillablesRaw || [],
      archived_print_job_entries: archPrintsRaw || [],
      calendar_events: eventsRaw || [],
      plans: plansRaw || [],
      contractors: contractors || [],
      supplies: suppliesRaw || [],
      leave_banks: leaveBanksRaw || [],
      payroll_entries: payrollRaw || [],
      monthly_costs: costsRaw || [],
      monthly_income: incomeRaw || [],
      text_templates: templatesRaw || [],
      template_requests: templateReqsRaw || [],
      password_vault: vaultRaw || [],
      messages: messagesRaw || [],
      reference_library: libraryRaw || [],
      pay_period_submissions: submissionsRaw || [],
      timesheet_report_archive: timesheetArchiveRaw || [],
      config: {
        checklist_template: checklistTemplateData || null,
        integrations: integrationConfigData || null,
        plan_review_prompts: planReviewPromptsDoc || null,
      },
      exportedAt: new Date().toISOString(),
      version: BUILD_VERSION
    };
  }, [
    isLoaded, clientsRaw, projectsRaw, tasksRaw, billablesRaw, printsRaw, 
    archBillablesRaw, archPrintsRaw, eventsRaw, plansRaw, suppliesRaw, 
    leaveBanksRaw, payrollRaw, costsRaw, incomeRaw, templatesRaw, contractors,
    templateReqsRaw, vaultRaw, messagesRaw, libraryRaw, submissionsRaw, timesheetArchiveRaw,
    checklistTemplateData, integrationConfigData, planReviewPromptsDoc,
  ]);

  const leaveBanks = useMemo(() => {
    const items = (leaveBanksRaw || []) as (LeaveBank & { id: string })[];
    const bestByEmployee = new Map<string, (LeaveBank & { id: string })>();

    const score = (b: LeaveBank & { id: string }) => {
      // Prefer canonical doc id == employeeId, then newest updatedAt.
      const canonical = b.employeeId && b.id === b.employeeId ? 10 : 0;
      const updated = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      return canonical * 1_000_000_000_000 + (isNaN(updated) ? 0 : updated);
    };

    for (const b of items) {
      const empId = String((b as any).employeeId || b.id || "").trim();
      if (!empId) continue;
      const existing = bestByEmployee.get(empId);
      if (!existing || score(b) > score(existing)) {
        bestByEmployee.set(empId, { ...b, employeeId: empId });
      }
    }

    return Array.from(bestByEmployee.values());
  }, [leaveBanksRaw]);

  const archiveTimesheetPdfReport = useCallback(
    async (
      pdfBlob: Blob,
      meta: {
        employeeId: string;
        payPeriodId: string;
        employeeName: string;
        periodStart: string;
        periodEnd: string;
        submittedAt: string;
        stats?: {
          billable: number;
          nonBillable: number;
          holiday: number;
          pto: number;
          overtime: number;
        };
      },
    ) => {
      if (!dataRootId) {
        return {
          success: false as const,
          downloadUrl: undefined as string | undefined,
          uploadError: 'No firm workspace' as string | undefined,
        };
      }
      try {
        const form = new FormData();
        form.append('firmId', dataRootId);
        form.append('employeeId', meta.employeeId);
        form.append('payPeriodId', meta.payPeriodId);
        form.append('employeeName', meta.employeeName);
        form.append('periodStart', meta.periodStart);
        form.append('periodEnd', meta.periodEnd);
        form.append('submittedAt', meta.submittedAt);
        form.append('stats', JSON.stringify(meta.stats || {}));
        form.append('file', pdfBlob, 'timesheet.pdf');

        const res = await fetch('/api/timesheet/submit-archive', {
          method: 'POST',
          body: form,
        });
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
          downloadUrl?: string;
          docId?: string;
          storagePath?: string;
          uploadError?: string;
          emailSent?: boolean;
          emailError?: string;
        };

        if (!res.ok || !data.success) {
          await ensureFirebaseAuthForClientUpload();
          const fallback = await archiveTimesheetPdfFromBrowser(firestore, dataRootId, pdfBlob, meta);
          if (fallback.success) {
            return {
              success: true as const,
              downloadUrl: fallback.downloadUrl,
              uploadError: fallback.uploadError,
            };
          }
          const primary = data.error || res.statusText || 'Timesheet submit failed';
          return {
            success: false as const,
            downloadUrl: fallback.downloadUrl,
            uploadError: [primary, fallback.uploadError].filter(Boolean).join(' — '),
          };
        }

        let uploadError: string | undefined = data.uploadError;
        if (!data.emailSent && data.emailError) {
          uploadError = [uploadError, `Email failed: ${data.emailError}`].filter(Boolean).join(' | ');
        }

        let finalDownloadUrl = data.downloadUrl;
        if (!finalDownloadUrl && data.docId && data.storagePath) {
          await ensureFirebaseAuthForClientUpload();
          let patch = await patchTimesheetArchivePdfFromBrowser(
            firestore,
            dataRootId,
            pdfBlob,
            data.docId,
            data.storagePath,
          );
          if (!patch.downloadUrl) {
            await ensureFirebaseAuthForClientUpload();
            patch = await patchTimesheetArchivePdfFromBrowser(
              firestore,
              dataRootId,
              pdfBlob,
              data.docId,
              data.storagePath,
            );
          }
          if (patch.downloadUrl) {
            finalDownloadUrl = patch.downloadUrl;
          } else if (patch.error) {
            uploadError = [uploadError, patch.error].filter(Boolean).join(' | ');
          }
        }

        return { success: true as const, downloadUrl: finalDownloadUrl, uploadError };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Network error';
        console.error('[archiveTimesheetPdfReport]', e);
        try {
          await ensureFirebaseAuthForClientUpload();
          const fallback = await archiveTimesheetPdfFromBrowser(firestore, dataRootId, pdfBlob, meta);
          if (fallback.success) {
            return {
              success: true as const,
              downloadUrl: fallback.downloadUrl,
              uploadError: fallback.uploadError || `Used browser upload after: ${msg}`,
            };
          }
          return {
            success: false as const,
            downloadUrl: fallback.downloadUrl,
            uploadError: [msg, fallback.uploadError].filter(Boolean).join(' — '),
          };
        } catch {
          return {
            success: false as const,
            downloadUrl: undefined,
            uploadError: msg,
          };
        }
      }
    },
    [dataRootId, firestore],
  );

  const deleteTimesheetPdfArchive = useCallback(
    (archiveDocId: string, storagePath?: string) => {
      if (!dataRootId || !archiveDocId) return;
      if (storagePath && typeof window !== 'undefined') {
        try {
          const app = getApp();
          const storage = getStorage(app);
          void deleteObject(ref(storage, storagePath)).catch((e) =>
            console.warn('[deleteTimesheetPdfArchive] storage', e),
          );
        } catch (e) {
          console.warn('[deleteTimesheetPdfArchive] storage init', e);
        }
      }
      deleteDocumentNonBlocking(
        doc(firestore, 'employees', dataRootId, 'timesheet_report_archive', archiveDocId),
      );
    },
    [dataRootId, firestore],
  );

  return {
    clients, 
    projects: allProjects,
    allProjects,
    // Project-task system only (Quick Tasks are a separate collection).
    tasks: (tasksRaw || []).filter(
      (t) =>
        t.status !== 'Completed' &&
        !(
          !t.projectId &&
          (t.category === 'Return Communication' || t.category === 'Personal')
        ),
    ),
    archivedTasks: (tasksRaw || []).filter(
      (t) =>
        t.status === 'Completed' &&
        !(
          !t.projectId &&
          (t.category === 'Return Communication' || t.category === 'Personal')
        ),
    ),
    quickTasks,
    archivedQuickTasks,
    billableEntries, 
    printEntries, 
    archivedBillableEntries, 
    archivedPrintEntries,
    calendarEvents, 
    plans: plansRaw || [], 
    contractors,
    supplies: suppliesRaw || [], 
    leaveBanks, 
    payroll: payrollRaw || [], 
    costs: costsRaw || [], 
    income: incomeRaw || [], 
    textTemplates: templatesRaw || [], 
    templateRequests: templateReqsRaw || [], 
    passwordVault: vaultRaw || [], 
    messagesInbox,
    messagesOutbox,
    sendMessage,
    markMessageRead,
    deleteMessage,
    referenceLibrary: libraryRaw || [], 
    payPeriodSubmissions: submissionsRaw || [],
    timesheetPdfArchive: timesheetArchiveRaw || [],
    archiveTimesheetPdfReport,
    deleteTimesheetPdfArchive,
    allEmployees,
    integrationConfig,
    memoryBankFiles,
    rawData,
    syncAllPortalCodes,
    migrateClientsToOnboardingSchema,
    migrateContractorsToOnboardingSchema,
    updateIntegrationConfig: (config: Partial<IntegrationConfig>) => {
      if (!dataRootId) return;
      setDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'config', 'integrations'), { ...config, lastUpdated: new Date().toISOString() }, { merge: true });
    },
    permissions: {
      billable: 'write', printing: 'write', tasks: 'write', plans: 'write', templates: 'write',
      ai_prompts: 'write', profitability: 'write', status: 'write', notes: 'write',
      projects_db: 'write', clients: 'write', archive: 'write', reports: 'write',
      calculator: 'write', timesheets: 'write', supplies: 'write'
    }, 
    activeUserId, dataRootId, isBoss, isLoaded,
    checklistTemplate,
    planReviewPrompts,
    planDatabasePlans: planDatabasePlansRaw || [],
    planDatabaseConfig,
    updatePlanDatabaseConfig: (patch: Partial<PlanDatabaseConfig>) => {
      if (!dataRootId) return;
      const now = new Date().toISOString();
      setDocumentNonBlocking(
        doc(firestore, 'employees', dataRootId, 'config', 'plan_database'),
        { ...patch, updatedAt: now },
        { merge: true },
      );
    },
    updatePlanDatabaseRecord: (id: string, patch: Partial<PlanDatabaseRecord>) => {
      if (!dataRootId || !id) return;
      const now = new Date().toISOString();
      updateDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'plan_database', id), {
        ...patch,
        updatedAt: now,
      });
    },
    restoreData,
    addQuickTask: (t: Omit<QuickTask, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { status?: 'Active' }) => {
      if (!dataRootId) return;
      const ref = doc(collection(firestore, 'employees', dataRootId, 'quick_tasks'));
      const now = new Date().toISOString();
      setDocumentNonBlocking(
        ref,
        {
          id: ref.id,
          name: String(t.name || '').trim(),
          notes: typeof t.notes === 'string' ? t.notes : '',
          priority: t.priority,
          deadline: t.deadline,
          category: t.category,
          status: 'Active',
          createdAt: now,
          updatedAt: now,
        } satisfies QuickTask,
        { merge: true },
      );
    },
    completeQuickTask: (id: string) => {
      if (!dataRootId || !id) return;
      const now = new Date().toISOString();
      updateDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'quick_tasks', id), {
        status: 'Completed',
        completedAt: now,
        updatedAt: now,
      });
    },
    updateChecklistTemplate: (categories: ChecklistCategory[]) => {
      if (!dataRootId) return;
      setDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'config', 'checklist_template'), { categories, updatedAt: new Date().toISOString() }, { merge: true });
    },
    savePlanReviewPrompts: (prompts: PlanReviewPromptTemplate[]) => {
      if (!dataRootId) return;
      const allowed = new Set(PLAN_REVIEW_PROMPTS.map((p) => p.id));
      if (prompts.length !== PLAN_REVIEW_PROMPTS.length) return;
      for (const p of prompts) {
        if (!allowed.has(p.id)) return;
        if (p.categoryId !== 'residential' && p.categoryId !== 'commercial') return;
      }
      setDocumentNonBlocking(
        doc(firestore, 'employees', dataRootId, 'config', 'plan_review_prompts'),
        {
          prompts: prompts.map((p) => ({
            id: p.id,
            categoryId: p.categoryId,
            name: p.name,
            group: p.group,
            focusBody: p.focusBody,
          })),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
    },
    resetPlanReviewPrompts: () => {
      if (!dataRootId) return;
      deleteDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'config', 'plan_review_prompts'));
    },
    /**
     * Create a client with a caller-supplied id (used by import workflows).
     * This keeps clientId stable so downstream imports can attach projects reliably.
     */
    createClientWithId: (id: string, c: any) => {
      if (!dataRootId) return;
      if (!id) return;
      const ref = doc(firestore, 'employees', dataRootId, 'clients', id);
      setDocumentNonBlocking(ref, { ...c, id }, { merge: true });
      if (c.accessCode) registerPortalCode(c.accessCode, id, dataRootId, 'client');
      if (isDualWriteEnabled()) {
        const client = ledgerMapClient({ ...c, id });
        const canon = mapInternalClientToCanonical(dataRootId, client);
        const cid = sharedClientDocIdForLedger(dataRootId, 'clients', id);
        void upsertCanonicalClient(firestore, cid, canon).catch((e) =>
          console.warn('[canonical dual-write] createClientWithId', e),
        );
      }
      return id;
    },
    addClient: (c: any) => {
      if (!dataRootId) return;
      const ref = doc(collection(firestore, 'employees', dataRootId, 'clients'));
      const newId = ref.id;
      setDocumentNonBlocking(ref, { ...c, id: newId }, { merge: true });
      if (c.accessCode) registerPortalCode(c.accessCode, newId, dataRootId, 'client');
      if (isDualWriteEnabled()) {
        const client = ledgerMapClient({ ...c, id: newId });
        const canon = mapInternalClientToCanonical(dataRootId, client);
        const cid = sharedClientDocIdForLedger(dataRootId, 'clients', newId);
        void upsertCanonicalClient(firestore, cid, canon).catch((e) =>
          console.warn('[canonical dual-write] addClient', e),
        );
      }
    },
    updateClient: (id: string, d: any) => {
      if (!dataRootId) return;
      updateDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'clients', id), d);
      if (d.accessCode) registerPortalCode(d.accessCode, id, dataRootId, 'client');
      if (isDualWriteEnabled()) {
        const cur = clients.find((x) => x.id === id);
        if (cur) {
          const merged = ledgerMapClient({ ...cur, ...d, id });
          const canon = mapInternalClientToCanonical(dataRootId, merged);
          const cid = sharedClientDocIdForLedger(dataRootId, 'clients', id);
          void upsertCanonicalClient(firestore, cid, canon).catch((e) =>
            console.warn('[canonical dual-write] updateClient', e),
          );
        }
      }
    },
    deleteClient,
    addContractor: (c: any) => {
      if (!dataRootId) return;
      const ref = doc(collection(firestore, 'employees', dataRootId, 'contractors'));
      const newId = ref.id;
      setDocumentNonBlocking(ref, { ...c, id: newId }, { merge: true });
      if (c.accessCode) registerPortalCode(c.accessCode, newId, dataRootId, 'contractor');
      if (isDualWriteEnabled()) {
        const co: Contractor = {
          id: newId,
          companyName: c.companyName || c.name || 'Unnamed Contractor',
          logoUrl: c.logoUrl || '',
          billingEmail: c.billingEmail || c.email || '',
          contacts: Array.isArray(c.contacts) ? c.contacts : [],
          accessCode: c.accessCode || '',
          permitPdfDownloads: !!c.permitPdfDownloads,
          qualifiesForDiscount: c.qualifiesForDiscount !== false,
        };
        const canon = mapInternalContractorToCanonical(dataRootId, co);
        const cid = sharedClientDocIdForLedger(dataRootId, 'contractors', newId);
        void upsertCanonicalClient(firestore, cid, canon).catch((e) =>
          console.warn('[canonical dual-write] addContractor', e),
        );
      }
    },
    updateContractor: (id: string, d: any) => {
      if (!dataRootId) return;
      updateDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'contractors', id), d);
      if (d.accessCode) registerPortalCode(d.accessCode, id, dataRootId, 'contractor');
      if (isDualWriteEnabled()) {
        const cur = contractors.find((x) => x.id === id);
        if (cur) {
          const merged: Contractor = { ...cur, ...d, id };
          const canon = mapInternalContractorToCanonical(dataRootId, merged);
          const cid = sharedClientDocIdForLedger(dataRootId, 'contractors', id);
          void upsertCanonicalClient(firestore, cid, canon).catch((e) =>
            console.warn('[canonical dual-write] updateContractor', e),
          );
        }
      }
    },
    deleteContractor: (id: string) => {
      if (!dataRootId) return;
      deleteDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'contractors', id));
    },
    /**
     * Create a project with a caller-supplied id (used by import workflows).
     */
    createProjectWithId: (id: string, p: any) => {
      if (!dataRootId) return;
      if (!id) return;
      const ref = doc(firestore, 'employees', dataRootId, 'projects', id);
      setDocumentNonBlocking(ref, { ...p, id, nature: p.nature || [] }, { merge: true });
      if (isDualWriteEnabled()) {
        const full = ledgerMapProject({ ...p, id });
        const links = {
          sharedResidentialId: full.clientId
            ? sharedClientDocIdForLedger(dataRootId, 'clients', full.clientId)
            : undefined,
          sharedContractorId: full.contractorId
            ? sharedClientDocIdForLedger(dataRootId, 'contractors', full.contractorId)
            : undefined,
        };
        const canon = mapInternalProjectToCanonical(dataRootId, full, links);
        const pid = sharedProjectDocIdForLedger(dataRootId, id);
        void upsertCanonicalProject(firestore, pid, canon).catch((e) =>
          console.warn('[canonical dual-write] createProjectWithId', e),
        );
      }
      return id;
    },
    addProject: (p: any) => {
      if (!dataRootId) return;
      const ref = doc(collection(firestore, 'employees', dataRootId, 'projects'));
      const newId = ref.id;
      setDocumentNonBlocking(ref, { ...p, id: newId, nature: p.nature || [] }, { merge: true });
      if (isDualWriteEnabled()) {
        const full = ledgerMapProject({ ...p, id: newId });
        const links = {
          sharedResidentialId: full.clientId
            ? sharedClientDocIdForLedger(dataRootId, 'clients', full.clientId)
            : undefined,
          sharedContractorId: full.contractorId
            ? sharedClientDocIdForLedger(dataRootId, 'contractors', full.contractorId)
            : undefined,
        };
        const canon = mapInternalProjectToCanonical(dataRootId, full, links);
        const pid = sharedProjectDocIdForLedger(dataRootId, newId);
        void upsertCanonicalProject(firestore, pid, canon).catch((e) =>
          console.warn('[canonical dual-write] addProject', e),
        );
      }
    },
    updateProject: (id: string, d: any) => {
      if (!dataRootId) return;
      updateDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'projects', id), d);
      if (isDualWriteEnabled()) {
        const cur = allProjects.find((x) => x.id === id);
        if (cur) {
          const merged = ledgerMapProject({ ...cur, ...d, id });
          const links = {
            sharedResidentialId: merged.clientId
              ? sharedClientDocIdForLedger(dataRootId, 'clients', merged.clientId)
              : undefined,
            sharedContractorId: merged.contractorId
              ? sharedClientDocIdForLedger(dataRootId, 'contractors', merged.contractorId)
              : undefined,
          };
          const canon = mapInternalProjectToCanonical(dataRootId, merged, links);
          const pid = sharedProjectDocIdForLedger(dataRootId, id);
          void upsertCanonicalProject(firestore, pid, canon).catch((e) =>
            console.warn('[canonical dual-write] updateProject', e),
          );
        }
      }
    },
    deleteProject: (id: string) => {
      if (!dataRootId) return;
      deleteDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'projects', id));
    },
    updateProjectStatus: (id: string, s: any) => {
      if (!dataRootId) return;
      const update: any = { status: s, lastStatusUpdate: new Date().toISOString() };
      if (s === 'Archived') update.isArchived = true;
      updateDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'projects', id), update);
      if (isDualWriteEnabled()) {
        const cur = allProjects.find((x) => x.id === id);
        if (cur) {
          const merged = ledgerMapProject({ ...cur, ...update, id });
          const links = {
            sharedResidentialId: merged.clientId
              ? sharedClientDocIdForLedger(dataRootId, 'clients', merged.clientId)
              : undefined,
            sharedContractorId: merged.contractorId
              ? sharedClientDocIdForLedger(dataRootId, 'contractors', merged.contractorId)
              : undefined,
          };
          const canon = mapInternalProjectToCanonical(dataRootId, merged, links);
          void upsertCanonicalProject(firestore, sharedProjectDocIdForLedger(dataRootId, id), canon).catch((e) =>
            console.warn('[canonical dual-write] updateProjectStatus', e),
          );
        }
      }
    },
    addTask: (t: any) => {
      if (!dataRootId) return;
      const ref = doc(collection(firestore, 'employees', dataRootId, 'tasks'));
      setDocumentNonBlocking(ref, { ...t, id: ref.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
    },
    updateTask: (id: string, u: any) => {
      if (!dataRootId) return;
      updateDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'tasks', id), { ...u, updatedAt: new Date().toISOString() });
    },
    deleteTask: (id: string) => {
      if (!dataRootId) return;
      deleteDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'tasks', id));
    },
    addEmployee: (data: any) => {
      const ref = doc(collection(firestore, 'employees'));
      setDocumentNonBlocking(ref, { ...data, id: ref.id, bossId: dataRootId }, { merge: true });
    },
    updateEmployee: (id: string, data: any) => {
      updateDocumentNonBlocking(doc(firestore, 'employees', id), data);
    },
    deleteEmployee: (id: string) => {
      deleteDocumentNonBlocking(doc(firestore, 'employees', id));
    },
    addBillableEntry: (e: any) => {
      if (!dataRootId) return;
      const ref = doc(collection(firestore, 'employees', dataRootId, 'billable_hour_entries'));
      setDocumentNonBlocking(ref, { ...e, id: ref.id }, { merge: true });
    },
    updateBillableEntry: (id: string, d: any) => {
      if (!dataRootId) return;
      updateDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'billable_hour_entries', id), d);
    },
    deleteBillableEntry: (id: string) => {
      if (!dataRootId) return;
      deleteDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'billable_hour_entries', id));
    },
    updateBillableEntryStatus: (id: string, s: any) => {
      if (!dataRootId) return;
      const entry = billableEntries.find(e => e.id === id);
      if (s === 'Paid' && entry) {
        const archRef = doc(firestore, 'employees', dataRootId, 'archived_billable_hour_entries', id);
        setDocumentNonBlocking(archRef, { ...entry, status: 'Paid', archivedAt: new Date().toISOString() }, { merge: true });
        deleteDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'billable_hour_entries', id));
      } else {
        updateDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'billable_hour_entries', id), { status: s });
      }
    },
    addPrintEntry: (e: any) => {
      if (!dataRootId) return;
      const ref = doc(collection(firestore, 'employees', dataRootId, 'print_job_entries'));
      setDocumentNonBlocking(ref, { ...e, id: ref.id }, { merge: true });
    },
    updatePrintEntry: (id: string, d: any) => {
      if (!dataRootId) return;
      updateDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'print_job_entries', id), d);
    },
    updatePrintEntryStatus: (id: string, s: any) => {
      if (!dataRootId) return;
      const entry = printEntries.find(e => e.id === id);
      if (s === 'Paid' && entry) {
        const archRef = doc(firestore, 'employees', dataRootId, 'archived_print_job_entries', id);
        setDocumentNonBlocking(archRef, { ...entry, status: 'Paid', archivedAt: new Date().toISOString() }, { merge: true });
        deleteDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'print_job_entries', id));
      } else {
        updateDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'print_job_entries', id), { status: s });
      }
    },
    deletePrintEntry: (id: string) => {
      if (!dataRootId) return;
      deleteDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'print_job_entries', id));
    },
    addCalendarEvent: (e: any) => {
      if (!dataRootId) return undefined;
      const ref = doc(collection(firestore, 'employees', dataRootId, 'calendar_events'));
      const id = ref.id;
      setDocumentNonBlocking(ref, { ...e, id, ownerId: activeUserId }, { merge: true });
      return id;
    },
    updateCalendarEvent: (id: string, d: any) => {
      if (!dataRootId) return;
      updateDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'calendar_events', id), d);
    },
    deleteCalendarEvent: (id: string) => {
      if (!dataRootId) return;
      deleteDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'calendar_events', id));
    },
    addProjectNote: (pId: string, n: any) => {
      if (!dataRootId) return;
      const ref = doc(collection(firestore, 'employees', dataRootId, 'projects', pId, 'notes'));
      setDocumentNonBlocking(ref, { ...n, id: ref.id, authorId: activeUserId, authorName: `${myEmployeeData?.firstName} ${myEmployeeData?.lastName}`, createdAt: new Date().toISOString() }, { merge: true });
    },
    updateProjectNote: (pId: string, nId: string, u: any) => {
      if (!dataRootId) return;
      updateDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'projects', pId, 'notes', nId), u);
    },
    deleteProjectNote: (pId: string, nId: string) => {
      if (!dataRootId) return;
      deleteDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'projects', pId, 'notes', nId));
    },
    addTimesheetEntry: (e: any) => {
      if (!e.employeeId) return;
      const ref = doc(collection(firestore, 'employees', e.employeeId, 'timesheet_entries'));
      setDocumentNonBlocking(ref, { ...e, id: ref.id }, { merge: true });
    },
    updateTimesheetEntry: (empId: string, id: string, u: any) => {
      updateDocumentNonBlocking(doc(firestore, 'employees', empId, 'timesheet_entries', id), u);
    },
    deleteTimesheetEntry: (empId: string, id: string) => {
      deleteDocumentNonBlocking(doc(firestore, 'employees', empId, 'timesheet_entries', id));
    },
    restoreArchivedBillableEntry: (id: string) => {
      if (!dataRootId) return;
      const archived = archivedBillableEntries.find((e: any) => e.id === id);
      if (!archived) return;
      const { archivedAt, ...payload } = archived as any;
      setDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'billable_hour_entries', id), payload, { merge: true });
      deleteDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'archived_billable_hour_entries', id));
    },
    restoreArchivedPrintEntry: (id: string) => {
      if (!dataRootId) return;
      const archived = archivedPrintEntries.find((e: any) => e.id === id);
      if (!archived) return;
      const { archivedAt, ...payload } = archived as any;
      setDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'print_job_entries', id), payload, { merge: true });
      deleteDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'archived_print_job_entries', id));
    },
    restoreArchivedTask: (id: string) => {
      if (!dataRootId) return;
      updateDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'tasks', id), { status: 'In Progress', updatedAt: new Date().toISOString() });
    },
    restoreArchivedProject: (id: string) => {
      if (!dataRootId) return;
      updateDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'projects', id), { status: 'Initial Meeting', isArchived: false, hiddenFromCards: false, lastStatusUpdate: new Date().toISOString() });
    },
    submitTimesheet: (employeeId: string, payPeriodId: string, employeeName: string) => {
      if (!dataRootId) return;
      const id = `${employeeId}_${payPeriodId}`;
      const ref = doc(firestore, 'employees', dataRootId, 'pay_period_submissions', id);
      setDocumentNonBlocking(ref, { id, employeeId, payPeriodId, employeeName, submittedAt: new Date().toISOString() }, { merge: true });
    },
    updateLeaveBank: (empId: string, updates: Partial<LeaveBank>) => {
      if (!dataRootId) return;
      const ref = doc(firestore, 'employees', dataRootId, 'leave_banks', empId);
      setDocumentNonBlocking(ref, { ...updates, id: empId, employeeId: empId, updatedAt: new Date().toISOString() }, { merge: true });
    },
    updateEmployeeStatus: (id: string, status: EmployeeWorkStatus) => {
      updateDocumentNonBlocking(doc(firestore, 'employees', id), { workStatus: status, lastStatusUpdate: new Date().toISOString() });
    },
    addTextTemplate: (t: any) => {
      if (!dataRootId) return;
      const ref = doc(collection(firestore, 'employees', dataRootId, 'text_templates'));
      setDocumentNonBlocking(ref, { ...t, id: ref.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
    },
    updateTextTemplate: (id: string, u: any) => {
      if (!dataRootId) return;
      updateDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'text_templates', id), { ...u, updatedAt: new Date().toISOString() });
    },
    deleteTextTemplate: (id: string) => {
      if (!dataRootId) return;
      deleteDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'text_templates', id));
    },
    addPassword: (p: any) => {
      if (!dataRootId) return;
      const ref = doc(collection(firestore, 'employees', dataRootId, 'password_vault'));
      setDocumentNonBlocking(ref, { ...p, id: ref.id, updatedAt: new Date().toISOString() }, { merge: true });
    },
    updatePassword: (id: string, u: any) => {
      if (!dataRootId) return;
      updateDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'password_vault', id), { ...u, updatedAt: new Date().toISOString() });
    },
    deletePassword: (id: string) => {
      if (!dataRootId) return;
      deleteDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'password_vault', id));
    },
    addSupplyItem: (s: any) => {
      if (!dataRootId) return;
      const ref = doc(collection(firestore, 'employees', dataRootId, 'supplies'));
      setDocumentNonBlocking(ref, { ...s, id: ref.id, requestedBy: `${myEmployeeData?.firstName} ${myEmployeeData?.lastName}`, createdAt: new Date().toISOString() }, { merge: true });
    },
    deleteSupplyItem: (id: string) => {
      if (!dataRootId) return;
      deleteDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'supplies', id));
    },
    addReferenceDoc: (d: any) => {
      if (!dataRootId) return;
      const ref = doc(collection(firestore, 'employees', dataRootId, 'reference_library'));
      setDocumentNonBlocking(ref, { ...d, id: ref.id, updatedAt: new Date().toISOString() }, { merge: true });
    },
    updateReferenceDoc: (id: string, u: any) => {
      if (!dataRootId) return;
      updateDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'reference_library', id), { ...u, updatedAt: new Date().toISOString() });
    },
    deleteReferenceDoc: (id: string) => {
      if (!dataRootId) return;
      deleteDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'reference_library', id));
    },
    addTemplateRequest: (r: any) => {
      if (!dataRootId) return;
      const ref = doc(collection(firestore, 'employees', dataRootId, 'template_requests'));
      setDocumentNonBlocking(ref, { ...r, id: ref.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
    },
    updateTemplateRequest: (id: string, u: any) => {
      if (!dataRootId) return;
      updateDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'template_requests', id), { ...u, updatedAt: new Date().toISOString() });
    },
    deleteTemplateRequest: (id: string) => {
      if (!dataRootId) return;
      deleteDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'template_requests', id));
    },
    addPayroll: (p: any) => {
      if (!dataRootId) return;
      const ref = doc(collection(firestore, 'employees', dataRootId, 'payroll_entries'));
      setDocumentNonBlocking(ref, { ...p, id: ref.id }, { merge: true });
    },
    deletePayroll: (id: string) => {
      if (!dataRootId) return;
      deleteDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'payroll_entries', id));
    },
    addMonthlyCost: (c: any) => {
      if (!dataRootId) return;
      const ref = doc(collection(firestore, 'employees', dataRootId, 'monthly_costs'));
      setDocumentNonBlocking(ref, { ...c, id: ref.id }, { merge: true });
    },
    updateMonthlyCost: (id: string, patch: Partial<MonthlyCost>) => {
      if (!dataRootId) return;
      updateDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'monthly_costs', id), patch);
    },
    deleteMonthlyCost: (id: string) => {
      if (!dataRootId) return;
      deleteDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'monthly_costs', id));
    },
    addMonthlyIncome: (i: any) => {
      if (!dataRootId) return;
      const ref = doc(collection(firestore, 'employees', dataRootId, 'monthly_income'));
      setDocumentNonBlocking(ref, { ...i, id: ref.id }, { merge: true });
    },
    deleteMonthlyIncome: (id: string) => {
      if (!dataRootId) return;
      deleteDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'monthly_income', id));
    },
    myEmployeeData
  };
}

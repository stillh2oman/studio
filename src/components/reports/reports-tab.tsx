
"use client"

import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import {
  BillableEntry, Project, Employee, PrintEntry, Client, Task,
  PayrollEntry, PayPeriodSubmission, TimesheetPdfArchive, LeaveBank, ProjectNote,
} from '@/lib/types';
import {
  DollarSign, Clock, TrendingUp, Activity, Users, Calendar, BarChart3, AlertTriangle,
  PieChart as PieChartIcon, LayoutTemplate, FileText, Download, Briefcase, ListTodo,
  Wallet, Receipt, Target, Percent, UserCheck, FolderKanban, Timer, Trash2, Sparkles, Loader2,
} from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth, parseISO, subDays, startOfDay, startOfYear, isValid, getISOWeek, getISOWeekYear } from 'date-fns';
import { cn } from '@/lib/utils';
import { getEffectiveInvoiceStatus } from '@/lib/invoice-status';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useLedgerData } from '@/hooks/use-ledger-data';
import { useFirestore } from '@/firebase';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { AiProjectStatusPayload } from '@/lib/ai-project-status-report';

interface ReportsTabProps {
  projects: Project[];
  billableEntries: BillableEntry[];
  archivedBillableEntries: BillableEntry[];
  printEntries: PrintEntry[];
  archivedPrintEntries: PrintEntry[];
  clients: Client[];
  tasks: Task[];
  archivedTasks: Task[];
  payroll: PayrollEntry[];
  payPeriodSubmissions: PayPeriodSubmission[];
  timesheetPdfArchive: TimesheetPdfArchive[];
  onDeleteTimesheetPdfArchive?: (archiveId: string, storagePath?: string) => void;
  leaveBanks: LeaveBank[];
  allEmployees: Employee[];
}

const HISTORICAL_BASELINES: Record<string, number> = {
  'Apr 25': 47346.00,
  'May 25': 49297.62,
  'Jun 25': 39577.92,
  'Jul 25': 48344.19,
  'Aug 25': 43946.35,
  'Sep 25': 46363.29,
  'Oct 25': 45167.25,
  'Nov 25': 37786.35,
  'Dec 25': 31178.90,
  'Jan 26': 43614.91,
  'Feb 26': 36257.07
};

function entryPaidTotal(entry: BillableEntry | PrintEntry) {
  const eff = getEffectiveInvoiceStatus(entry);
  const isPaid = eff === 'Paid';
  const t = Number(entry.total) || 0;
  return { isPaid, total: t, isPastDue: eff === 'Past Due' };
}

const AI_REPORT_CACHE_KEY = 'di_ai_project_report_cache';

function summarizeBillingForProject(projectId: string, entries: BillableEntry[]) {
  const mine = entries.filter((e) => e.projectId === projectId);
  let totalHours = 0;
  let openTotal = 0;
  for (const e of mine) {
    totalHours += Number(e.hours) || 0;
    const st = String(e.status || '').toLowerCase().replace(/_/g, '').replace(/\s/g, '');
    if (st !== 'paid') openTotal += Number(e.total) || 0;
  }
  return { totalHours, openTotal, entryCount: mine.length };
}

function renderSimpleMarkdown(text: string) {
  return text.split('\n').map((line, i) => {
    const t = line.trimEnd();
    if (t.startsWith('## ')) {
      return (
        <h3 key={i} className="text-base font-headline font-bold text-white mt-6 mb-2 border-b border-border/40 pb-1 first:mt-0">
          {t.slice(3)}
        </h3>
      );
    }
    if (t.startsWith('### ')) {
      return (
        <h4 key={i} className="text-sm font-bold text-primary mt-4 mb-1">
          {t.slice(4)}
        </h4>
      );
    }
    if (t.startsWith('- ') || t.startsWith('* ')) {
      return (
        <li key={i} className="text-sm text-muted-foreground ml-4 list-disc">
          {t.replace(/^[-*]\s+/, '')}
        </li>
      );
    }
    if (!t) return <div key={i} className="h-2" />;
    return (
      <p key={i} className="text-sm text-muted-foreground leading-relaxed">
        {t}
      </p>
    );
  });
}

export function ReportsTab({
  projects,
  billableEntries,
  archivedBillableEntries,
  printEntries,
  archivedPrintEntries,
  clients,
  tasks,
  archivedTasks,
  payroll,
  payPeriodSubmissions,
  timesheetPdfArchive,
  onDeleteTimesheetPdfArchive,
  leaveBanks,
  allEmployees,
}: ReportsTabProps) {
  const { toast } = useToast();
  const [isMounted, setIsMounted] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TimesheetPdfArchive | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const allBillables = useMemo(() => [...(billableEntries || []), ...(archivedBillableEntries || [])], [billableEntries, archivedBillableEntries]);
  const allPrints = useMemo(() => [...(printEntries || []), ...(archivedPrintEntries || [])], [printEntries, archivedPrintEntries]);

  const revenueStatusData = useMemo(() => {
    const statusMap: Record<string, number> = {
      'Paid': 0,
      'Invoice Sent': 0,
      'Not Sent': 0,
      'Past Due': 0
    };

    const classify = (entry: BillableEntry | PrintEntry) => {
      const statusKey = getEffectiveInvoiceStatus(entry);
      statusMap[statusKey] = (statusMap[statusKey] || 0) + (Number(entry.total) || 0);
    };

    allBillables.forEach(classify);
    allPrints.forEach(classify);

    return Object.entries(statusMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allBillables, allPrints]);

  const monthlyTrendData = useMemo(() => {
    if (!isMounted) return [];
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = subMonths(now, 11 - i);
      return format(d, 'MMM yy');
    });

    return months.map(monthLabel => {
      const monthIndex = months.indexOf(monthLabel);
      const monthDate = parseISO(format(subMonths(now, 11 - monthIndex), 'yyyy-MM-01'));
      const start = startOfMonth(monthDate);
      const end = endOfMonth(monthDate);

      const monthBillables = allBillables.filter(e => {
        try {
          const d = parseISO(e.date);
          return d >= start && d <= end;
        } catch { return false; }
      });

      const monthPrints = allPrints.filter(e => {
        try {
          const d = parseISO(e.date);
          return d >= start && d <= end;
        } catch { return false; }
      });

      const serviceTotal = monthBillables.reduce((acc, curr) => acc + (Number(curr.total) || 0), 0);
      const printTotal = monthPrints.reduce((acc, curr) => acc + (Number(curr.total) || 0), 0);
      const historicalBaseline = HISTORICAL_BASELINES[monthLabel] || 0;
      const totalIncome = serviceTotal + printTotal + historicalBaseline;

      return {
        name: monthLabel,
        Services: serviceTotal + historicalBaseline,
        Printing: printTotal,
        Total: totalIncome
      };
    });
  }, [allBillables, allPrints, isMounted]);

  const clientRevenueData = useMemo(() => {
    const clientMap: Record<string, number> = {};

    allBillables.forEach(entry => {
      const client = clients.find(c => c.id === entry.clientId);
      const name = client?.name || (entry as any).clientName || (entry as any).client || 'Unknown Client';
      clientMap[name] = (clientMap[name] || 0) + (Number(entry.total) || 0);
    });

    allPrints.forEach(entry => {
      const client = clients.find(c => c.id === entry.clientId);
      const name = client?.name || (entry as any).clientName || (entry as any).client || 'Unknown Client';
      clientMap[name] = (clientMap[name] || 0) + (Number(entry.total) || 0);
    });

    return Object.entries(clientMap)
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [allBillables, allPrints, clients]);

  const pastDueReportData = useMemo(() => {
    const pastDueMap: Record<string, number> = {};

    const processEntry = (entry: BillableEntry | PrintEntry) => {
      if (getEffectiveInvoiceStatus(entry) !== 'Past Due') return;
      const client = clients.find(c => c.id === entry.clientId);
      const name = client?.name || (entry as any).clientName || (entry as any).client || 'Unknown Account';
      pastDueMap[name] = (pastDueMap[name] || 0) + 1;
    };

    allBillables.forEach(processEntry);
    allPrints.forEach(processEntry);

    return Object.entries(pastDueMap)
      .map(([name, count]) => ({ name, count }))
      .filter(item => item.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [allBillables, allPrints, clients]);

  const STATUS_COLORS = {
    'Paid': '#10b981',
    'Invoice Sent': '#0ea5e9',
    'Not Sent': '#f59e0b',
    'Past Due': '#ef4444'
  };

  const CHART_THEME = {
    background: 'transparent',
    text: '#94a3b8',
    grid: 'rgba(148, 163, 184, 0.1)',
    tooltip: {
      contentStyle: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' },
      itemStyle: { color: '#f8fafc' }
    }
  };

  const rolling12MonthRevenue = useMemo(() => {
    return monthlyTrendData.reduce((acc, curr) => acc + curr.Total, 0);
  }, [monthlyTrendData]);

  const last30DayBilledHours = useMemo(() => {
    const thirtyDaysAgo = startOfDay(subDays(new Date(), 30));
    return allBillables
      .filter(e => {
        try {
          const d = parseISO(e.date);
          return d >= thirtyDaysAgo;
        } catch { return false; }
      })
      .reduce((acc, curr) => acc + (Number(curr.hours) || 0), 0);
  }, [allBillables]);

  const last30DayPrintRevenue = useMemo(() => {
    const thirtyDaysAgo = startOfDay(subDays(new Date(), 30));
    return allPrints
      .filter(e => {
        try {
          const d = parseISO(e.date);
          return d >= thirtyDaysAgo;
        } catch { return false; }
      })
      .reduce((acc, curr) => acc + (Number(curr.total) || 0), 0);
  }, [allPrints]);

  const initialLayoutProjectsCount = useMemo(() => {
    return projects.filter(p => p.status === 'Initial Layout And Modeling').length;
  }, [projects]);

  const executiveKpis = useMemo(() => {
    if (!isMounted) return [];
    const now = new Date();
    const yStart = startOfYear(now);
    const d90 = subDays(now, 90);
    const d30 = subDays(now, 30);
    const dayStart = startOfDay(now);

    const payrollYtd = (payroll || []).reduce((sum, p) => {
      try {
        const d = parseISO(p.date);
        if (isValid(d) && d >= yStart) return sum + (Number(p.amount) || 0);
      } catch { /* ignore */ }
      return sum;
    }, 0);

    const submissions90 = (payPeriodSubmissions || []).filter(s => {
      try {
        const d = parseISO(s.submittedAt);
        return isValid(d) && d >= d90;
      } catch { return false; }
    }).length;

    const totalPto = (leaveBanks || []).reduce((s, b) => s + (Number(b.ptoHours) || 0), 0);

    const activeProjects = projects.filter(p => p.status !== 'Archived' && !p.isArchived);
    const clientsWithProjects = new Set(activeProjects.map(p => p.clientId).filter(Boolean)).size;
    const avgProjPerClient = clientsWithProjects > 0 ? (activeProjects.length / clientsWithProjects) : 0;

    const newProjects90 = projects.filter(p => {
      try {
        const c = parseISO(p.createdAt || '');
        return isValid(c) && c >= d90;
      } catch { return false; }
    }).length;

    const waitingClient = projects.filter(p => p.status === 'Waiting On Client / Bids').length;

    const openTasks = tasks || [];
    const overdueOpen = openTasks.filter(t => {
      try {
        const dl = parseISO(t.deadline);
        return isValid(dl) && startOfDay(dl) < dayStart;
      } catch { return false; }
    }).length;

    const completed30 = (archivedTasks || []).filter(t => {
      try {
        const u = parseISO(t.updatedAt || t.createdAt || '');
        return isValid(u) && u >= startOfDay(d30);
      } catch { return false; }
    }).length;

    const highOpen = openTasks.filter(t => t.priority === 'High').length;
    const denom = openTasks.length + completed30;
    const completionRate = denom > 0 ? Math.round((completed30 / denom) * 100) : 0;

    let outstandingAr = 0;
    let pastDueAr = 0;
    [...allBillables, ...allPrints].forEach(e => {
      const { isPaid, total, isPastDue } = entryPaidTotal(e);
      if (!isPaid) outstandingAr += total;
      if (isPastDue) pastDueAr += total;
    });

    const kpiCategoryStyle = (c: string) =>
      c === 'Payroll' ? 'border-emerald-500/20 bg-emerald-500/5' :
      c === 'Projects' ? 'border-sky-500/20 bg-sky-500/5' :
      c === 'Tasks' ? 'border-violet-500/20 bg-violet-500/5' :
      'border-amber-500/20 bg-amber-500/5';

    const rows: { category: string; label: string; value: string; icon: React.ReactNode }[] = [
      { category: 'Payroll', label: 'Payroll paid YTD', value: `$${payrollYtd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, icon: <Wallet className="h-5 w-5 text-emerald-400" /> },
      { category: 'Payroll', label: 'Payroll log entries', value: String((payroll || []).length), icon: <Receipt className="h-5 w-5 text-emerald-400" /> },
      { category: 'Payroll', label: 'Timesheet submissions (90d)', value: String(submissions90), icon: <UserCheck className="h-5 w-5 text-emerald-400" /> },
      { category: 'Payroll', label: 'Firm PTO hours (remaining)', value: `${totalPto.toFixed(1)}h`, icon: <Timer className="h-5 w-5 text-emerald-400" /> },
      { category: 'Projects', label: 'Active projects', value: String(activeProjects.length), icon: <FolderKanban className="h-5 w-5 text-sky-400" /> },
      { category: 'Projects', label: 'In layout & modeling', value: String(initialLayoutProjectsCount), icon: <LayoutTemplate className="h-5 w-5 text-sky-400" /> },
      { category: 'Projects', label: 'Waiting on client / bids', value: String(waitingClient), icon: <Clock className="h-5 w-5 text-sky-400" /> },
      { category: 'Projects', label: 'Avg active projects / client', value: avgProjPerClient.toFixed(2), icon: <Briefcase className="h-5 w-5 text-sky-400" /> },
      { category: 'Projects', label: 'New projects (90d)', value: String(newProjects90), icon: <TrendingUp className="h-5 w-5 text-sky-400" /> },
      { category: 'Tasks', label: 'Open tasks', value: String(openTasks.length), icon: <ListTodo className="h-5 w-5 text-violet-400" /> },
      { category: 'Tasks', label: 'Overdue open tasks', value: String(overdueOpen), icon: <AlertTriangle className="h-5 w-5 text-violet-400" /> },
      { category: 'Tasks', label: 'Tasks completed (30d)', value: String(completed30), icon: <Target className="h-5 w-5 text-violet-400" /> },
      { category: 'Tasks', label: 'High-priority open', value: String(highOpen), icon: <Activity className="h-5 w-5 text-violet-400" /> },
      { category: 'Tasks', label: '30d completion intensity %', value: `${completionRate}%`, icon: <Percent className="h-5 w-5 text-violet-400" /> },
      { category: 'Billing', label: 'Rolling 12-mo revenue', value: `$${rolling12MonthRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, icon: <DollarSign className="h-5 w-5 text-amber-400" /> },
      { category: 'Billing', label: 'Outstanding AR (unpaid)', value: `$${outstandingAr.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, icon: <BarChart3 className="h-5 w-5 text-amber-400" /> },
      { category: 'Billing', label: 'Past-due balance', value: `$${pastDueAr.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, icon: <AlertTriangle className="h-5 w-5 text-amber-400" /> },
      { category: 'Billing', label: 'Billable hours (30d)', value: `${last30DayBilledHours.toFixed(1)}h`, icon: <Clock className="h-5 w-5 text-amber-400" /> },
      { category: 'Billing', label: 'Print revenue (30d)', value: `$${last30DayPrintRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, icon: <PieChartIcon className="h-5 w-5 text-amber-400" /> },
      { category: 'Payroll', label: 'People on roster', value: String((allEmployees || []).length), icon: <Users className="h-5 w-5 text-emerald-400" /> },
    ];

    return rows.map((r) => ({ ...r, categoryClass: kpiCategoryStyle(r.category) }));
  }, [
    isMounted, payroll, payPeriodSubmissions, leaveBanks, projects, tasks, archivedTasks,
    allBillables, allPrints, rolling12MonthRevenue, last30DayBilledHours, last30DayPrintRevenue,
    initialLayoutProjectsCount, allEmployees,
  ]);

  const { dataRootId } = useLedgerData();
  const firestore = useFirestore();
  const [aiReportMarkdown, setAiReportMarkdown] = useState('');
  const [aiReportGeneratedAt, setAiReportGeneratedAt] = useState<string | null>(null);
  const [aiReportLoading, setAiReportLoading] = useState(false);

  const isoWeekKey = useMemo(() => {
    const now = new Date();
    return `${getISOWeekYear(now)}-W${String(getISOWeek(now)).padStart(2, '0')}`;
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AI_REPORT_CACHE_KEY);
      if (raw) {
        const x = JSON.parse(raw) as { markdown?: string; generatedAt?: string };
        if (x.markdown) setAiReportMarkdown(x.markdown);
        if (x.generatedAt) setAiReportGeneratedAt(x.generatedAt);
      }
    } catch {
      // ignore
    }
  }, []);

  const generateAiStatusReport = useCallback(
    async (fromAuto: boolean): Promise<boolean> => {
      if (!dataRootId || !firestore) {
        if (!fromAuto) {
          toast({ variant: 'destructive', title: 'Reports', description: 'Firm data not loaded yet.' });
        }
        return false;
      }
      const active = projects.filter((p) => !p.isArchived && p.status !== 'Archived');
      if (!active.length) {
        if (!fromAuto) {
          toast({ title: 'No active projects', description: 'Nothing to include in the report.' });
        }
        return false;
      }
      setAiReportLoading(true);
      try {
        const payload: AiProjectStatusPayload[] = await Promise.all(
          active.map(async (p) => {
            const clientName = clients.find((c) => c.id === p.clientId)?.name || '—';
            const openTasks = tasks
              .filter((t) => t.projectId === p.id && t.status !== 'Completed')
              .map((t) => ({
                title: t.name || 'Untitled task',
                status: t.status,
                priority: t.priority,
                deadline: t.deadline,
                assignedTo: t.assignedTo,
              }));
            const b = summarizeBillingForProject(p.id, billableEntries);
            const notesCol = collection(firestore, 'employees', dataRootId, 'projects', p.id, 'notes');
            const q = query(notesCol, orderBy('createdAt', 'desc'), limit(8));
            const snap = await getDocs(q);
            const recentNotes = snap.docs.map((d) => {
              const n = d.data() as ProjectNote;
              const excerpt = String(n.text || '')
                .replace(/\s+/g, ' ')
                .slice(0, 320);
              return `${n.authorName || 'Team'} (${String(n.createdAt || '').slice(0, 10)}): ${excerpt}`;
            });
            return {
              id: p.id,
              name: p.name,
              clientName,
              status: p.status,
              designer: p.designer,
              address: p.address,
              lastStatusUpdate: p.lastStatusUpdate,
              openTasks,
              billing: {
                totalHours: b.totalHours,
                uninvoicedOrOpenTotal: b.openTotal,
                entryCount: b.entryCount,
              },
              recentNotes,
            };
          }),
        );

        const res = await fetch('/api/reports/ai-project-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projects: payload,
            weekOf: format(new Date(), 'yyyy-MM-dd'),
          }),
        });
        const j = (await res.json()) as { error?: string; markdown?: string; generatedAt?: string };
        if (!res.ok || !j.markdown) {
          throw new Error(j.error || 'Generation failed');
        }
        setAiReportMarkdown(j.markdown);
        const at = j.generatedAt || new Date().toISOString();
        setAiReportGeneratedAt(at);
        try {
          localStorage.setItem(AI_REPORT_CACHE_KEY, JSON.stringify({ markdown: j.markdown, generatedAt: at }));
        } catch {
          // ignore
        }
        try {
          localStorage.setItem(`di_ai_report_fetched_${isoWeekKey}`, '1');
        } catch {
          // ignore
        }
        if (!fromAuto) {
          toast({ title: 'Report ready', description: 'AI project status has been updated.' });
        }
        return true;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        if (!fromAuto) {
          toast({ variant: 'destructive', title: 'AI report failed', description: msg });
        }
        return false;
      } finally {
        setAiReportLoading(false);
      }
    },
    [dataRootId, firestore, projects, tasks, billableEntries, clients, toast, isoWeekKey],
  );

  useEffect(() => {
    if (!isMounted || !dataRootId || !firestore) return;
    const key = `di_ai_report_fetched_${isoWeekKey}`;
    try {
      if (localStorage.getItem(key) === '1') return;
    } catch {
      // ignore
    }
    const t = setTimeout(() => {
      void generateAiStatusReport(true);
    }, 1200);
    return () => clearTimeout(t);
  }, [isMounted, dataRootId, firestore, isoWeekKey, generateAiStatusReport]);

  if (!isMounted) {
    return (
      <div className="space-y-8 animate-pulse p-6">
        <div className="h-20 bg-muted/20 rounded-3xl" />
        <div className="grid grid-cols-4 gap-6">
          {[1,2,3,4].map(i => <div key={i} className="h-32 bg-muted/20 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-2 gap-8">
          <div className="h-[400px] bg-muted/20 rounded-2xl" />
          <div className="h-[400px] bg-muted/20 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-border/50 pb-8">
        <div>
          <h2 className="text-4xl font-headline font-bold text-white flex items-center gap-3">
            <BarChart3 className="h-10 w-10 text-primary" /> Reports
          </h2>
          <p className="text-muted-foreground text-sm uppercase tracking-widest font-semibold mt-1">
            Owner dashboard — timesheet PDFs & firm KPIs
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Snapshot</p>
          <div className="text-2xl font-headline font-bold text-accent">
            {format(new Date(), 'MMMM yyyy')}
          </div>
        </div>
      </header>

      <Card className="border-border/50 bg-card/30 shadow-xl border-primary/15">
        <CardHeader className="bg-muted/30 border-b border-border/50 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-lg font-headline flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary shrink-0" /> AI active project status
            </CardTitle>
            <CardDescription className="mt-1">
              Weekly narrative: project status, open tasks, billing hours, and recent project notes. Refreshes automatically once per ISO week when you open this tab (if not already fetched this week), or use Generate anytime.
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            className="shrink-0 gap-2"
            disabled={aiReportLoading}
            onClick={() => void generateAiStatusReport(false)}
          >
            {aiReportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate report
          </Button>
        </CardHeader>
        <CardContent className="pt-4">
          {aiReportGeneratedAt && isValid(parseISO(aiReportGeneratedAt)) ? (
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-3">
              Generated {format(parseISO(aiReportGeneratedAt), 'MMM d, yyyy h:mm a')}
            </p>
          ) : null}
          {!aiReportMarkdown && !aiReportLoading ? (
            <p className="text-sm text-muted-foreground italic py-4">
              No report yet — click Generate or wait for the weekly auto-run (requires GEMINI_API_KEY on the server).
            </p>
          ) : null}
          {aiReportLoading && !aiReportMarkdown ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2 py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Generating with Gemini…
            </p>
          ) : null}
          {aiReportMarkdown ? (
            <ScrollArea className="h-[min(520px,55vh)] rounded-lg border border-border/40 bg-background/30 p-4">
              <div className="space-y-1 pr-4">{renderSimpleMarkdown(aiReportMarkdown)}</div>
            </ScrollArea>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/30 shadow-xl">
        <CardHeader className="bg-muted/30 border-b border-border/50">
          <CardTitle className="text-lg font-headline flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Timesheet PDF archive
          </CardTitle>
          <CardDescription>
            PDFs uploaded when timesheets are submitted (server-side storage; appears here after a short sync delay).
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {!timesheetPdfArchive?.length ? (
            <p className="text-sm text-muted-foreground italic py-8 text-center">No archived PDFs yet.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Pay period</TableHead>
                    <TableHead className="text-right">PDF</TableHead>
                    {onDeleteTimesheetPdfArchive ? <TableHead className="w-[100px] text-right">Remove</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timesheetPdfArchive.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs font-mono">
                        {row.createdAt ? format(parseISO(row.createdAt), 'MMM d, yyyy h:mm a') : '—'}
                      </TableCell>
                      <TableCell className="font-semibold text-white">{row.employeeName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.periodStart} → {row.periodEnd}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.downloadUrl ? (
                          <Button variant="outline" size="sm" className="gap-1.5" asChild>
                            <a href={row.downloadUrl} target="_blank" rel="noopener noreferrer" download>
                              <Download className="h-3.5 w-3.5" /> Open
                            </a>
                          </Button>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">
                            {row.uploadError ? 'Upload failed' : 'No file'}
                          </Badge>
                        )}
                      </TableCell>
                      {onDeleteTimesheetPdfArchive ? (
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            aria-label="Remove archive row"
                            onClick={() => setDeleteTarget(row)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove this archive entry?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This deletes the Firestore record and the stored PDF (if present). This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => {
                        if (deleteTarget && onDeleteTimesheetPdfArchive) {
                          onDeleteTimesheetPdfArchive(
                            deleteTarget.id,
                            deleteTarget.storagePath?.trim() || undefined,
                          );
                          toast({
                            title: 'Archive removed',
                            description: `${deleteTarget.employeeName} — ${deleteTarget.periodStart} → ${deleteTarget.periodEnd}`,
                          });
                        }
                        setDeleteTarget(null);
                      }}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </CardContent>
      </Card>

      <div>
        <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-4 px-1">Executive KPIs (20)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {executiveKpis.map((kpi, i) => (
            <Card key={i} className={cn('border shadow-lg overflow-hidden hover:border-primary/25 transition-colors', kpi.categoryClass)}>
              <CardContent className="p-4 flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-background/40 border border-white/5 shrink-0">
                  {kpi.icon}
                </div>
                <div className="min-w-0">
                  <Badge variant="outline" className="text-[8px] uppercase font-black mb-1.5 h-5 px-1.5 border-white/10">
                    {kpi.category}
                  </Badge>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground leading-tight">{kpi.label}</p>
                  <p className="text-lg font-bold text-white tracking-tight truncate">{kpi.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="border-border/50 shadow-2xl bg-card/30 overflow-hidden">
          <CardHeader className="bg-muted/30 border-b border-border/50">
            <CardTitle className="text-xl font-headline flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" /> 12-Month Billing Trend
            </CardTitle>
            <CardDescription>Professional services, printing, and pre-launch baselines.</CardDescription>
          </CardHeader>
          <CardContent className="pt-8 h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyTrendData}>
                <defs>
                  <linearGradient id="colorServices" x1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b1a2a" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b1a2a" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} vertical={false} />
                <XAxis dataKey="name" stroke={CHART_THEME.text} fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke={CHART_THEME.text} fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val/1000}k`} />
                <Tooltip contentStyle={CHART_THEME.tooltip.contentStyle} itemStyle={CHART_THEME.tooltip.itemStyle} formatter={(val: number) => `$${val.toLocaleString()}`} />
                <Area type="monotone" dataKey="Services" stroke="#8b1a2a" fillOpacity={1} fill="url(#colorServices)" strokeWidth={3} />
                <Area type="monotone" dataKey="Printing" stroke="#f59e0b" fillOpacity={0} strokeWidth={2} strokeDasharray="5 5" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-2xl bg-card/30 overflow-hidden">
          <CardHeader className="bg-muted/30 border-b border-border/50">
            <CardTitle className="text-xl font-headline flex items-center gap-2">
              <Users className="h-5 w-5 text-accent" /> Top Clients by Revenue
            </CardTitle>
            <CardDescription>Accounts ranked by total billed (services + print).</CardDescription>
          </CardHeader>
          <CardContent className="pt-8 h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={clientRevenueData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} horizontal={true} vertical={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" stroke={CHART_THEME.text} fontSize={10} tickLine={false} axisLine={false} width={120} />
                <Tooltip contentStyle={CHART_THEME.tooltip.contentStyle} itemStyle={CHART_THEME.tooltip.itemStyle} formatter={(val: number) => `$${val.toLocaleString()}`} />
                <Bar dataKey="revenue" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-2xl bg-card/30 overflow-hidden">
          <CardHeader className="bg-muted/30 border-b border-border/50">
            <CardTitle className="text-xl font-headline flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-emerald-500" /> Revenue Lifecycle
            </CardTitle>
            <CardDescription>Paid vs outstanding (billable + print).</CardDescription>
          </CardHeader>
          <CardContent className="pt-8 h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={revenueStatusData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                  {revenueStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name as keyof typeof STATUS_COLORS] || '#8b5cf6'} />
                  ))}
                </Pie>
                <Tooltip {...CHART_THEME.tooltip} formatter={(val: number) => `$${val.toLocaleString()}`} />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-2xl bg-card/30 overflow-hidden">
          <CardHeader className="bg-rose-500/10 border-b border-rose-500/20">
            <CardTitle className="text-xl font-headline flex items-center gap-2 text-rose-500">
              <AlertTriangle className="h-5 w-5" /> Delinquency frequency
            </CardTitle>
            <CardDescription>Past-due invoice counts by client.</CardDescription>
          </CardHeader>
          <CardContent className="pt-8 h-[350px]">
            {pastDueReportData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                <Users className="h-8 w-8 opacity-20" />
                <p className="text-sm italic">No past due history in the ledger.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pastDueReportData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} horizontal={true} vertical={false} />
                  <XAxis type="number" stroke={CHART_THEME.text} fontSize={10} hide />
                  <YAxis dataKey="name" type="category" stroke={CHART_THEME.text} fontSize={10} tickLine={false} axisLine={false} width={120} />
                  <Tooltip contentStyle={CHART_THEME.tooltip.contentStyle} itemStyle={CHART_THEME.tooltip.itemStyle} formatter={(val: number) => [`${val} occurrences`, 'Past Due Count']} />
                  <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

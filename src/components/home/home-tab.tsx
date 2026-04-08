
"use client"

import { useMemo, useState, useEffect, useCallback } from 'react';
import { Task, Project, Client, Employee, CalendarEvent, CalendarEventType, EmployeeWorkStatus, Message, CalendarVisibility, EventLocationType, BillableEntry, TimesheetEntry } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Clock, Calendar as CalendarIcon, CalendarRange, Layout, Plus, ChevronRight, ListTodo, Globe, X, Trash2, Sun, Cloud, CloudRain, CloudLightning, Snowflake, Thermometer, Loader2, Shield, Bell, ExternalLink, RefreshCw } from 'lucide-react';
import { format, isPast, parseISO, isSameDay, startOfDay, addHours, addDays, isBefore, isValid } from 'date-fns';
import { cn } from '@/lib/utils';
import { MessageArea } from './message-area';
import { HomeMap } from './home-map';
import { useLedgerData } from '@/hooks/use-ledger-data';
import { useFirestore } from '@/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_GOOGLE_CALENDAR_ID, GOOGLE_CALENDAR_TIME_ZONE } from '@/lib/google-calendar-constants';
import { getEffectiveInvoiceStatus } from '@/lib/invoice-status';

function googleDedupeKey(ev: CalendarEvent): string | null {
  if (!ev.googleCalendarEventId) return null;
  const cal = String(ev.googleCalendarListId || DEFAULT_GOOGLE_CALENDAR_ID).trim();
  return `${cal}::${ev.googleCalendarEventId}`;
}

/** Google / API JSON may return `error` as string or `{ message }` — never pass raw objects to toast (breaks React children). */
function apiErrorToMessage(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim()) return raw;
  if (raw && typeof raw === 'object' && 'message' in raw) {
    const m = (raw as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m;
  }
  return '';
}

interface HomeTabProps {
  tasks: Task[];
  projects: Project[];
  clients: Client[];
  billableEntries: BillableEntry[];
  calendarEvents: CalendarEvent[];
  messagesInbox: Message[];
  messagesOutbox: Message[];
  onAddEvent: (event: Omit<CalendarEvent, 'id' | 'ownerId'>) => void | string | undefined;
  onUpdateEvent: (id: string, event: Partial<CalendarEvent>) => void;
  onDeleteEvent: (id: string) => void;
  onSendMessage: (msg: Omit<Message, 'id' | 'sentAt' | 'senderId' | 'senderName'>) => void;
  onMarkRead: (messageId: string, recipientId: string) => void;
  onDeleteMessage: (messageId: string, type: 'inbox' | 'outbox') => void;
  currentEmployee: Employee | null;
  allEmployees: Employee[];
  onUpdateStatus: (id: string, status: EmployeeWorkStatus) => void;
  onViewTask: (task: Task) => void;
  isOwner?: boolean;
  /** When false, hides Billing summary KPI tiles (matches Billing tab visibility). */
  showBillingKpis?: boolean;
}

const PRIORITY_ORDER: Record<string, number> = { 'High': 3, 'Medium': 2, 'Low': 1 };
const ANCHOR_DATE = new Date('2026-02-28T00:00:00Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_PERIOD = 14 * MS_PER_DAY;

const parse12hToISO = (dateStr: string, hour: string, min: string, period: string) => {
  let h = parseInt(hour);
  const m = parseInt(min);
  if (period === 'PM' && h < 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  const date = new Date(dateStr + 'T00:00:00');
  date.setHours(h, m);
  return date.toISOString();
};

function safeParseTime(iso: string | undefined): Date | null {
  if (!iso || typeof iso !== 'string') return null;
  const d = parseISO(iso);
  return isValid(d) ? d : null;
}

const getPayPeriodForDate = (date: Date | string) => {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00Z') : new Date(date.toISOString().split('T')[0] + 'T00:00:00Z');
  const diff = d.getTime() - ANCHOR_DATE.getTime();
  const periodIndex = Math.floor(diff / MS_PER_PERIOD);
  const startDate = new Date(ANCHOR_DATE.getTime() + periodIndex * MS_PER_PERIOD);
  const endDate = new Date(startDate.getTime() + 13 * MS_PER_DAY);
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  };
};

export function HomeTab({ 
  tasks, projects, clients, billableEntries, calendarEvents, messagesInbox, messagesOutbox,
  onAddEvent, onUpdateEvent, onDeleteEvent, onSendMessage, onMarkRead, onDeleteMessage,
  currentEmployee, allEmployees, onUpdateStatus, onViewTask, isOwner = false, showBillingKpis = true
}: HomeTabProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { dataRootId, quickTasks, addQuickTask: addQuickTaskToDb, completeQuickTask } = useLedgerData();
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formVisibility, setFormVisibility] = useState<CalendarVisibility>('Global');
  const [formLocationType, setFormLocationType] = useState<EventLocationType>('In-Person');
  const [formProjectIds, setFormProjectIds] = useState<string[]>([]);
  const [startH, setStartH] = useState('8');
  const [startM, setStartM] = useState('00');
  const [startP, setStartP] = useState('AM');
  const [endH, setEndH] = useState('9');
  const [endM, setEndM] = useState('00');
  const [endP, setEndP] = useState('AM');

  // Quick Task (non-project) capture — lightweight entry on Home tab
  const [quickTaskName, setQuickTaskName] = useState('');
  const [quickTaskNotes, setQuickTaskNotes] = useState('');
  const [quickTaskPriority, setQuickTaskPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');
  const [quickTaskDeadline, setQuickTaskDeadline] = useState(''); // yyyy-mm-dd
  const [quickTaskCategory, setQuickTaskCategory] = useState<'Return Communication' | 'Personal'>('Return Communication');
  const [completingQuickTaskIds, setCompletingQuickTaskIds] = useState<Set<string>>(() => new Set());

  const displayQuickTasks = useMemo(() => {
    const list = Array.isArray(quickTasks) ? quickTasks : [];
    return list
      .slice()
      .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))
      .slice(0, 8);
  }, [quickTasks]);

  const addQuickTask = () => {
    const name = quickTaskName.trim();
    if (!name) {
      toast({ variant: 'destructive', title: 'Task name required', description: 'Enter a quick task (e.g. “Return phone call”).' });
      return;
    }
    addQuickTaskToDb?.({
      name,
      notes: quickTaskNotes.trim(),
      priority: quickTaskPriority as any,
      deadline: quickTaskDeadline || new Date().toISOString().slice(0, 10),
      category: quickTaskCategory as any,
    });
    setQuickTaskName('');
    setQuickTaskNotes('');
    setQuickTaskPriority('Medium');
    setQuickTaskDeadline('');
    setQuickTaskCategory('Return Communication');
    toast({ title: 'Quick task added' });
  };

  const [currentTime, setCurrentTime] = useState(new Date());
  const [weather, setWeather] = useState<{ temp: number; code: number } | null>(null);
  const [isAlarmDialogOpen, setIsAlarmDialogOpen] = useState(false);
  const [alarmTimeInput, setAlarmTimeInput] = useState('08:00');
  const [alarmLabelInput, setAlarmLabelInput] = useState('Alarm');
  const [activeAlarm, setActiveAlarm] = useState<{ atIso: string; label: string; triggered: boolean } | null>(null);
  const [employeeHourKpis, setEmployeeHourKpis] = useState<Array<{
    employeeId: string;
    employeeName: string;
    totalHours: number;
    billableHours: number;
    nonBillableHours: number;
    leaveHours: number;
    /** (non-billable + leave) / billable × 100; null when billable is 0. */
    nbPlusLeaveVsBillablePct: number | null;
    billablePct: number;
    nonBillablePct: number;
    leavePct: number;
  }>>([]);
  const [isLoadingEmployeeHourKpis, setIsLoadingEmployeeHourKpis] = useState(false);

  const [googleMirrorEvents, setGoogleMirrorEvents] = useState<CalendarEvent[]>([]);
  /** Server has OAuth env vars — treat Google two-way sync as available. */
  const [googleOAuthReady, setGoogleOAuthReady] = useState(false);
  /** Last Google Calendar list request succeeded (token OK). */
  const [googleMirrorLoaded, setGoogleMirrorLoaded] = useState(false);
  const [googleFetchError, setGoogleFetchError] = useState<string | null>(null);
  /** Which credential store the API used: env vs Firestore Connection Hub. */
  const [googleOAuthCredentialSource, setGoogleOAuthCredentialSource] = useState<'env' | 'hub' | null>(null);
  const [googleSyncLoading, setGoogleSyncLoading] = useState(false);
  const [googleCalendarIds, setGoogleCalendarIds] = useState<string[]>([]);
  /** null = use Google’s “selected” calendars; string[] = only these calendar ids from Google */
  const [googleScheduleCalPick, setGoogleScheduleCalPick] = useState<string[] | null>(null);
  const [isGoogleCalPickerOpen, setIsGoogleCalPickerOpen] = useState(false);
  const [googleCalPickerOptions, setGoogleCalPickerOptions] = useState<
    { id: string; summary: string; selected: boolean; primary: boolean }[]
  >([]);
  const [googleCalPickerDraft, setGoogleCalPickerDraft] = useState<Set<string>>(() => new Set());
  const [googleCalPickerLoading, setGoogleCalPickerLoading] = useState(false);
  const [formLocation, setFormLocation] = useState('');
  const [syncToGoogle, setSyncToGoogle] = useState(true);
  const [isSavingCalendar, setIsSavingCalendar] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem('di_schedule_sync_google') === '0') setSyncToGoogle(false);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!dataRootId) return;
    try {
      const raw = localStorage.getItem(`di_google_schedule_cal_pick_${dataRootId}`);
      if (raw === null) {
        setGoogleScheduleCalPick(null);
        return;
      }
      const p = JSON.parse(raw) as unknown;
      if (Array.isArray(p) && p.every((x) => typeof x === 'string')) {
        setGoogleScheduleCalPick(p);
      } else {
        setGoogleScheduleCalPick(null);
      }
    } catch {
      setGoogleScheduleCalPick(null);
    }
  }, [dataRootId]);

  const loadGoogleSchedule = useCallback(async () => {
    if (!dataRootId) return;
    setGoogleSyncLoading(true);
    try {
      let url = `/api/calendar/google-events?days=400&daysPast=0&ownerId=${encodeURIComponent(dataRootId)}`;
      if (googleScheduleCalPick !== null) {
        url += `&scheduleCalendars=${encodeURIComponent(JSON.stringify(googleScheduleCalPick))}`;
      } else {
        url += '&aggregate=1';
      }
      const res = await fetch(url, { cache: 'no-store' });
      const data = (await res.json()) as {
        events?: CalendarEvent[];
        configured?: boolean;
        oauthEnvConfigured?: boolean;
        oauthFirestoreConfigured?: boolean;
        oauthCredentialSource?: 'env' | 'hub';
        error?: string;
        calendarIds?: string[];
      };
      if (Array.isArray(data.events)) {
        setGoogleMirrorEvents(
          data.events.map((e) => ({ ...e, ownerId: dataRootId })),
        );
      } else {
        setGoogleMirrorEvents([]);
      }
      setGoogleCalendarIds(Array.isArray(data.calendarIds) ? data.calendarIds : []);
      setGoogleOAuthCredentialSource(
        data.oauthCredentialSource === 'env' || data.oauthCredentialSource === 'hub'
          ? data.oauthCredentialSource
          : null,
      );
      setGoogleOAuthReady(
        data.oauthEnvConfigured === true || data.oauthFirestoreConfigured === true,
      );
      setGoogleMirrorLoaded(data.configured === true);
      setGoogleFetchError(
        data.configured === true ? null : typeof data.error === 'string' ? data.error : null,
      );
      if (data.error && !data.configured) {
        console.warn('Google Calendar schedule sync:', data.error);
      }
    } catch (err) {
      console.warn('Google Calendar schedule sync failed', err);
      setGoogleMirrorEvents([]);
      setGoogleOAuthReady(false);
      setGoogleMirrorLoaded(false);
      setGoogleFetchError(null);
      setGoogleOAuthCredentialSource(null);
    } finally {
      setGoogleSyncLoading(false);
    }
  }, [dataRootId, googleScheduleCalPick]);

  const openGoogleCalPicker = useCallback(async () => {
    if (!dataRootId || !googleOAuthReady) {
      toast({
        variant: 'destructive',
        title: 'Google not connected',
        description: 'Configure Google OAuth first to pick calendars.',
      });
      return;
    }
    setIsGoogleCalPickerOpen(true);
    setGoogleCalPickerLoading(true);
    try {
      const res = await fetch(
        `/api/calendar/google-events?listOnly=1&ownerId=${encodeURIComponent(dataRootId)}`,
        { cache: 'no-store' },
      );
      const data = (await res.json()) as {
        calendars?: { id: string; summary: string; selected: boolean; primary: boolean }[];
        error?: string;
        configured?: boolean;
      };
      if (!res.ok || data.configured === false) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Could not list calendars');
      }
      const calendars = Array.isArray(data.calendars) ? data.calendars : [];
      setGoogleCalPickerOptions(calendars);
      const defaultIds = calendars.filter((c) => c.selected).map((c) => c.id);
      const initial = googleScheduleCalPick !== null ? googleScheduleCalPick : defaultIds;
      setGoogleCalPickerDraft(new Set(initial));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      toast({ variant: 'destructive', title: 'Calendar list failed', description: msg });
      setIsGoogleCalPickerOpen(false);
    } finally {
      setGoogleCalPickerLoading(false);
    }
  }, [dataRootId, googleOAuthReady, googleScheduleCalPick, toast]);

  const saveGoogleCalPicker = useCallback(() => {
    if (!dataRootId) return;
    const key = `di_google_schedule_cal_pick_${dataRootId}`;
    const defaultIds = new Set(googleCalPickerOptions.filter((c) => c.selected).map((c) => c.id));
    const draft = googleCalPickerDraft;
    const sameAsGoogleDefault =
      defaultIds.size === draft.size && [...defaultIds].every((id) => draft.has(id));
    if (sameAsGoogleDefault) {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
      setGoogleScheduleCalPick(null);
    } else {
      const arr = googleCalPickerOptions.filter((c) => googleCalPickerDraft.has(c.id)).map((c) => c.id);
      try {
        localStorage.setItem(key, JSON.stringify(arr));
      } catch {
        // ignore
      }
      setGoogleScheduleCalPick(arr);
    }
    setIsGoogleCalPickerOpen(false);
    toast({ title: 'Schedule calendars updated' });
  }, [dataRootId, googleCalPickerDraft, googleCalPickerOptions, toast]);

  const toggleGoogleCalPickerId = useCallback((id: string) => {
    setGoogleCalPickerDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const resetGoogleCalPickerToDefaults = useCallback(() => {
    if (!dataRootId) return;
    try {
      localStorage.removeItem(`di_google_schedule_cal_pick_${dataRootId}`);
    } catch {
      // ignore
    }
    setGoogleScheduleCalPick(null);
    setIsGoogleCalPickerOpen(false);
    toast({
      title: 'Using Google’s calendar list',
      description: 'Schedule again follows calendars you enable in Google Calendar.',
    });
  }, [dataRootId, toast]);

  useEffect(() => {
    void loadGoogleSchedule();
    const interval = setInterval(() => void loadGoogleSchedule(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadGoogleSchedule]);

  const fetchWeather = useCallback(async () => {
    try {
      const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=36.1156&longitude=-97.0584&current_weather=true&temperature_unit=fahrenheit');
      const data = await res.json();
      if (data.current_weather) setWeather({ temp: Math.round(data.current_weather.temperature), code: data.current_weather.weathercode });
    } catch (e) { console.warn("Weather sync failed", e); }
  }, []);

  useEffect(() => {
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 10000);
    fetchWeather();
    const weatherTimer = setInterval(fetchWeather, 600000);
    return () => {
      clearInterval(clockTimer);
      clearInterval(weatherTimer);
    };
  }, [fetchWeather]);

  useEffect(() => {
    const key = `di_alarm_${currentEmployee?.id || 'default'}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.atIso) setActiveAlarm(parsed);
    } catch {
      // ignore bad local state
    }
  }, [currentEmployee?.id]);

  useEffect(() => {
    const key = `di_alarm_${currentEmployee?.id || 'default'}`;
    if (!activeAlarm) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(activeAlarm));
  }, [activeAlarm, currentEmployee?.id]);

  useEffect(() => {
    if (!activeAlarm || activeAlarm.triggered) return;
    const now = new Date().getTime();
    const target = new Date(activeAlarm.atIso).getTime();
    if (now >= target) {
      toast({
        title: `Alarm: ${activeAlarm.label || 'Reminder'}`,
        description: `It is ${format(new Date(), 'h:mm a')}.`,
      });
      setActiveAlarm(prev => (prev ? { ...prev, triggered: true } : prev));
    }
  }, [currentTime, activeAlarm, toast]);

  const weatherIcon = useMemo(() => {
    if (!weather) return <Thermometer className="h-4 w-4" />;
    const code = weather.code;
    if (code === 0) return <Sun className="h-5 w-5 text-amber-400" />;
    if (code <= 3) return <Cloud className="h-5 w-5 text-sky-300" />;
    if (code <= 67) return <CloudRain className="h-5 w-5 text-sky-500" />;
    if (code <= 77) return <Snowflake className="h-5 w-5 text-white" />;
    if (code <= 99) return <CloudLightning className="h-5 w-5 text-indigo-400" />;
    return <Cloud className="h-5 w-5" />;
  }, [weather]);

  const currentPayPeriod = useMemo(() => getPayPeriodForDate(new Date()), []);

  const shouldShowEmployeeHoursKpi = useMemo(() => {
    const first = String(currentEmployee?.firstName || '').toLowerCase();
    const last = String(currentEmployee?.lastName || '').toLowerCase();
    return first.includes('jeff') || last.includes('dillon');
  }, [currentEmployee]);

  useEffect(() => {
    if (!shouldShowEmployeeHoursKpi || !allEmployees.length) {
      setEmployeeHourKpis([]);
      return;
    }

    let isCancelled = false;
    const loadEmployeeHourKpis = async () => {
      setIsLoadingEmployeeHourKpis(true);
      try {
            const { startDate, endDate } = currentPayPeriod;
        const targetNames = ['chris', 'jorrie', 'sarah'];
        const targetEmployees = allEmployees.filter((emp) =>
          targetNames.some((name) => String(emp.firstName || '').toLowerCase().includes(name)),
        );
        const rows = await Promise.all(
          targetEmployees.map(async (emp) => {
            const q = query(
              collection(firestore, 'employees', emp.id, 'timesheet_entries'),
              where('date', '>=', startDate),
              where('date', '<=', endDate),
            );
            const snap = await getDocs(q);
            const entries = snap.docs.map(d => d.data() as TimesheetEntry);

            let billableHours = 0;
            let nonBillableHours = 0;
            let leaveHours = 0;
            for (const e of entries) {
              const h = Number(e.hoursWorked || 0);
              if (e.billingType === 'Billable') billableHours += h;
              else if (e.billingType === 'Non-Billable') nonBillableHours += h;
              else if (e.billingType === 'PTO' || e.billingType === 'Holiday') leaveHours += h;
              else nonBillableHours += h;
            }
            const totalHours = billableHours + nonBillableHours + leaveHours;
            const billablePct = totalHours > 0 ? (billableHours / totalHours) * 100 : 0;
            const nonBillablePct = totalHours > 0 ? (nonBillableHours / totalHours) * 100 : 0;
            const leavePct = totalHours > 0 ? (leaveHours / totalHours) * 100 : 0;
            const nbPlusLeave = nonBillableHours + leaveHours;
            const nbPlusLeaveVsBillablePct =
              billableHours > 0 ? (nbPlusLeave / billableHours) * 100 : null;
            return {
              employeeId: emp.id,
              employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
              totalHours,
              billableHours,
              nonBillableHours,
              leaveHours,
              nbPlusLeaveVsBillablePct,
              billablePct,
              nonBillablePct,
              leavePct,
            };
          }),
        );

        if (!isCancelled) {
          setEmployeeHourKpis(rows.sort((a, b) => a.employeeName.localeCompare(b.employeeName)));
        }
      } catch {
        if (!isCancelled) setEmployeeHourKpis([]);
      } finally {
        if (!isCancelled) setIsLoadingEmployeeHourKpis(false);
      }
    };

    loadEmployeeHourKpis();
    return () => { isCancelled = true; };
  }, [shouldShowEmployeeHoursKpi, allEmployees, firestore, currentPayPeriod]);

  const sortedProjects = useMemo(() => [...projects].sort((a, b) => a.name.localeCompare(b.name)), [projects]);

  const activeProjectsCount = useMemo(
    () => (projects || []).filter(p => !p.isArchived && p.status !== 'Archived').length,
    [projects],
  );

  const billingCounts = useMemo(() => {
    const counts = { notSent: 0, sent: 0, pastDue: 0 };
    for (const e of billableEntries || []) {
      if (e.status === 'Paid') continue;
      const eff = getEffectiveInvoiceStatus(e);
      if (eff === 'Not Sent') counts.notSent++;
      else if (eff === 'Invoice Sent') counts.sent++;
      else if (eff === 'Past Due') counts.pastDue++;
    }
    return counts;
  }, [billableEntries]);

  const pastDueProjectsCount = useMemo(() => {
    const set = new Set<string>();
    for (const e of billableEntries || []) {
      if (getEffectiveInvoiceStatus(e) === 'Past Due' && e.projectId) set.add(e.projectId);
    }
    return set.size;
  }, [billableEntries]);

  const myTasks = useMemo(() => {
    if (!currentEmployee) return [];
    const searchFirst = (currentEmployee.firstName || '').toLowerCase().trim();
    const searchLast = (currentEmployee.lastName || '').toLowerCase().trim();
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);

    return tasks.filter(t => {
      const assigned = (t.assignedTo || '').toLowerCase().trim();
      const isAssigned = assigned.includes(searchFirst) && assigned.includes(searchLast);
      if (!isAssigned || t.status === 'Completed') return false;
      if (!t.deadline) return false;
      const d = startOfDay(parseISO(t.deadline));
      return isBefore(d, today) || isSameDay(d, today) || isSameDay(d, tomorrow);
    }).sort((a, b) => (PRIORITY_ORDER[b.priority] || 0) - (PRIORITY_ORDER[a.priority] || 0) || (a.deadline || '9999').localeCompare(b.deadline || '9999'));
  }, [tasks, currentEmployee]);

  const scheduleEventsMerged = useMemo(() => {
    const fromDb = calendarEvents || [];
    const linked = new Set<string>();
    for (const e of fromDb) {
      const k = googleDedupeKey(e);
      if (k) linked.add(k);
    }
    const fromGoogle = googleMirrorEvents.filter((g) => {
      const k = googleDedupeKey(g);
      return k && !linked.has(k);
    });
    return [...fromDb, ...fromGoogle];
  }, [calendarEvents, googleMirrorEvents]);

  const displayScheduleRows = useMemo(() => {
    const todayStart = startOfDay(new Date());
    return (scheduleEventsMerged || [])
      .filter((ev) => ev.type !== 'CommandBlock')
      .map((e) => ({ e, start: safeParseTime(e.startTime), end: safeParseTime(e.endTime) }))
      .filter(
        (row): row is { e: CalendarEvent; start: Date; end: Date } =>
          row.start !== null &&
          row.end !== null &&
          !isBefore(startOfDay(row.start), todayStart),
      )
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, 200);
  }, [scheduleEventsMerged]);

  const runSaveCalendarEvent = async () => {
    const startTime = parse12hToISO(formDate, startH, startM, startP);
    const endTime = parse12hToISO(formDate, endH, endM, endP);
    const basePayload = {
      title: formTitle,
      startTime,
      endTime,
      description: formDesc,
      type: editingId ? (calendarEvents.find((x) => x.id === editingId)?.type || 'CompanyEvent') : 'CompanyEvent',
      visibility: formVisibility,
      locationType: formLocationType,
      projectIds: formProjectIds,
      clientIds: formProjectIds.map((pid) => projects.find((p) => p.id === pid)?.clientId).filter(Boolean) as string[],
      location: formLocation.trim() || undefined,
    };
    const editing = editingId ? scheduleEventsMerged.find((x) => x.id === editingId) : undefined;

    setIsSavingCalendar(true);
    try {
      if (editing?.externalSource === 'google' && editing.googleCalendarEventId && editing.googleCalendarListId) {
        const res = await fetch('/api/calendar/google-events', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firmId: dataRootId,
            calendarId: editing.googleCalendarListId,
            eventId: editing.googleCalendarEventId,
            title: basePayload.title,
            description: basePayload.description,
            startTime: basePayload.startTime,
            endTime: basePayload.endTime,
            timeZone: GOOGLE_CALENDAR_TIME_ZONE,
            locationType: basePayload.locationType,
            location: formLocation.trim() || undefined,
          }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: unknown };
        if (!res.ok) {
          toast({
            variant: 'destructive',
            title: 'Google Calendar',
            description: apiErrorToMessage(j.error) || 'Update failed',
          });
          return;
        }
        toast({ title: 'Event updated', description: 'Saved to Google Calendar.' });
        await loadGoogleSchedule();
        setIsEventDialogOpen(false);
        return;
      }

      if (editingId && editing?.googleCalendarEventId && googleOAuthReady && syncToGoogle) {
        const cal = editing.googleCalendarListId || DEFAULT_GOOGLE_CALENDAR_ID;
        const res = await fetch('/api/calendar/google-events', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firmId: dataRootId,
            calendarId: cal,
            eventId: editing.googleCalendarEventId,
            title: basePayload.title,
            description: basePayload.description,
            startTime: basePayload.startTime,
            endTime: basePayload.endTime,
            timeZone: GOOGLE_CALENDAR_TIME_ZONE,
            locationType: basePayload.locationType,
            location: formLocation.trim() || undefined,
          }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: unknown };
        if (!res.ok) {
          toast({
            variant: 'destructive',
            title: 'Google Calendar',
            description: apiErrorToMessage(j.error) || 'Update failed',
          });
        } else {
          toast({ title: 'Synced', description: 'Google Calendar updated.' });
        }
        onUpdateEvent(editingId, basePayload);
        await loadGoogleSchedule();
        setIsEventDialogOpen(false);
        return;
      }

      if (!editingId && googleOAuthReady && syncToGoogle) {
        const res = await fetch('/api/calendar/google-events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firmId: dataRootId,
            title: basePayload.title,
            description: basePayload.description,
            startTime: basePayload.startTime,
            endTime: basePayload.endTime,
            timeZone: GOOGLE_CALENDAR_TIME_ZONE,
            locationType: basePayload.locationType,
            location: formLocation.trim() || undefined,
          }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          error?: unknown;
          googleEventId?: string;
          htmlLink?: string;
          googleMeetLink?: string;
          calendarId?: string;
        };
        if (res.ok && j.googleEventId) {
          onAddEvent({
            ...basePayload,
            googleCalendarEventId: j.googleEventId,
            googleCalendarListId: j.calendarId || DEFAULT_GOOGLE_CALENDAR_ID,
            googleCalendarHtmlLink: j.htmlLink,
            googleMeetLink: j.googleMeetLink,
          });
          toast({ title: 'Event added', description: 'Saved in Ledger and Google Calendar.' });
        } else {
          onAddEvent(basePayload);
          toast({
            variant: 'destructive',
            title: 'Google sync failed',
            description: apiErrorToMessage(j.error) || 'Event saved in Ledger only.',
          });
        }
        await loadGoogleSchedule();
        setIsEventDialogOpen(false);
        return;
      }

      if (editingId) onUpdateEvent(editingId, basePayload);
      else onAddEvent(basePayload);
      setIsEventDialogOpen(false);
    } finally {
      setIsSavingCalendar(false);
    }
  };

  const onCalendarFormSubmit = (formEv: React.FormEvent<HTMLFormElement>) => {
    formEv.preventDefault();
    formEv.stopPropagation();
    void runSaveCalendarEvent().catch((err: unknown) => {
      console.error(err);
      toast({
        variant: 'destructive',
        title: 'Calendar save failed',
        description: err instanceof Error ? err.message : 'Unexpected error — see console.',
      });
    });
  };

  const handleDialogDelete = async () => {
    if (!editingId) return;
    const row = scheduleEventsMerged.find((x) => x.id === editingId);
    if (!row) return;

    setIsSavingCalendar(true);
    try {
      if (row.externalSource === 'google' && row.googleCalendarEventId && row.googleCalendarListId) {
        const qs = new URLSearchParams({
          calendarId: row.googleCalendarListId,
          eventId: row.googleCalendarEventId,
          firmId: dataRootId,
        });
        const res = await fetch(`/api/calendar/google-events?${qs}`, { method: 'DELETE' });
        const j = (await res.json().catch(() => ({}))) as { error?: unknown };
        if (!res.ok) {
          toast({
            variant: 'destructive',
            title: 'Google Calendar',
            description: apiErrorToMessage(j.error) || 'Delete failed',
          });
          return;
        }
        toast({ title: 'Removed', description: 'Deleted from Google Calendar.' });
        await loadGoogleSchedule();
        setIsEventDialogOpen(false);
        return;
      }

      if (row.googleCalendarEventId && googleOAuthReady && syncToGoogle) {
        const cal = row.googleCalendarListId || DEFAULT_GOOGLE_CALENDAR_ID;
        const qs = new URLSearchParams({
          calendarId: cal,
          eventId: row.googleCalendarEventId,
          firmId: dataRootId,
        });
        const res = await fetch(`/api/calendar/google-events?${qs}`, { method: 'DELETE' });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: unknown };
          toast({
            variant: 'destructive',
            title: 'Google Calendar',
            description: apiErrorToMessage(j.error) || 'Delete failed',
          });
        }
      }
      onDeleteEvent(editingId);
      await loadGoogleSchedule();
      setIsEventDialogOpen(false);
    } catch (err: unknown) {
      console.error(err);
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Unexpected error — see console.',
      });
    } finally {
      setIsSavingCalendar(false);
    }
  };

  const openNewEvent = () => {
    setEditingId(null);
    setFormTitle('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormDesc('');
    setFormVisibility('Global');
    setFormLocationType('In-Person');
    setFormLocation('');
    setFormProjectIds([]);
    setStartH('8');
    setStartM('00');
    setStartP('AM');
    setEndH('9');
    setEndM('00');
    setEndP('AM');
    setIsEventDialogOpen(true);
  };

  const openEditEvent = (calRow: CalendarEvent) => {
    const s = safeParseTime(calRow.startTime);
    const endDt = safeParseTime(calRow.endTime);
    if (!s || !endDt) {
      toast({
        variant: 'destructive',
        title: 'Cannot edit event',
        description: 'This event has invalid dates. Fix it in Google Calendar or delete and recreate it in Ledger.',
      });
      return;
    }
    const datePart = calRow.startTime.includes('T') ? calRow.startTime.split('T')[0] : format(s, 'yyyy-MM-dd');
    setEditingId(calRow.id);
    setFormTitle(calRow.title);
    setFormDate(datePart);
    setFormDesc(calRow.description || '');
    setFormVisibility(calRow.visibility || 'Global');
    setFormLocationType(calRow.locationType || 'In-Person');
    setFormLocation(calRow.location || '');
    setFormProjectIds(calRow.projectIds || []);
    const sH = s.getHours(); setStartH((sH % 12 || 12).toString()); setStartM(s.getMinutes().toString().padStart(2, '0')); setStartP(sH >= 12 ? 'PM' : 'AM');
    const eH = endDt.getHours(); setEndH((eH % 12 || 12).toString()); setEndM(endDt.getMinutes().toString().padStart(2, '0')); setEndP(eH >= 12 ? 'PM' : 'AM');
    setIsEventDialogOpen(true);
  };

  const handleOpenRadar = () => {
    window.open(`https://weather.com/weather/radar/interactive/l/74074:4:US`, '_blank');
  };

  const openAlarmDialog = () => {
    const now = new Date();
    const hh = now.getHours().toString().padStart(2, '0');
    const mm = now.getMinutes().toString().padStart(2, '0');
    setAlarmTimeInput(`${hh}:${mm}`);
    setAlarmLabelInput(activeAlarm?.label || 'Alarm');
    setIsAlarmDialogOpen(true);
  };

  const setAlarm = () => {
    if (!alarmTimeInput) return;
    const [h, m] = alarmTimeInput.split(':').map(Number);
    const target = new Date();
    target.setHours(h || 0, m || 0, 0, 0);
    if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1);

    setActiveAlarm({
      atIso: target.toISOString(),
      label: alarmLabelInput.trim() || 'Alarm',
      triggered: false,
    });
    setIsAlarmDialogOpen(false);
    toast({ title: 'Alarm Set', description: `Next alarm at ${format(target, 'MMM d, h:mm a')}.` });
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div className="space-y-2">
          <h2 className="text-4xl font-headline font-bold text-white flex items-center gap-3"><Layout className="h-10 w-10 text-primary" /> Welcome, {currentEmployee?.firstName}</h2>
          <div className="flex items-center gap-4"><p className="text-muted-foreground text-sm uppercase tracking-widest font-semibold">Command Dashboard</p><div className="h-1 w-1 rounded-full bg-border" /><p className="text-[10px] text-accent font-black uppercase tracking-[0.2em]">{format(currentTime, 'MMMM do, yyyy')}</p></div>
        </div>
        <div className="flex items-center gap-6 bg-card/50 border border-border/50 px-6 py-3 rounded-2xl shadow-xl backdrop-blur-md">
          <button
            onClick={openAlarmDialog}
            className="flex items-center gap-3 border-r border-border/50 pr-6 hover:bg-white/5 p-2 rounded-xl transition-all"
            title="Click to set an alarm"
          >
            <Clock className="h-10 w-10 text-primary" />
            <div className="text-left">
              <p className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                Local Time <Bell className="h-3 w-3 text-accent" />
              </p>
              <p className="text-xl font-bold text-white tabular-nums tracking-tight">{format(currentTime, 'h:mm a')}</p>
              {activeAlarm && !activeAlarm.triggered ? (
                <p className="text-[10px] text-accent font-bold">Alarm {format(parseISO(activeAlarm.atIso), 'h:mm a')}</p>
              ) : null}
            </div>
          </button>
          
          <button 
            onClick={handleOpenRadar}
            className="flex items-center gap-3 hover:bg-white/5 p-2 rounded-xl transition-all cursor-pointer group/weather active:scale-95"
            title="View Live Radar (Stillwater)"
          >
            <div className="group-hover/weather:scale-110 transition-transform">
              {weatherIcon}
            </div>
            <div className="text-left">
              <p className="text-[10px] uppercase font-bold text-muted-foreground group-hover/weather:text-primary transition-colors">Stillwater, OK</p>
              <p className="text-xl font-bold text-white tabular-nums tracking-tight">{weather ? `${weather.temp}°F` : '--°F'}</p>
            </div>
          </button>
        </div>
      </header>

      <div className={cn('grid grid-cols-1 md:grid-cols-2 gap-4', showBillingKpis && 'xl:grid-cols-5')}>
        <Card className="border-border/50 bg-card/30">
          <CardContent className="p-5">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Active Projects</div>
            <div className="text-3xl font-headline font-black text-white mt-2 tabular-nums">{activeProjectsCount}</div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/30">
          <CardContent className="p-5">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Past Due Projects</div>
            <div className="text-3xl font-headline font-black text-rose-500 mt-2 tabular-nums">{pastDueProjectsCount}</div>
          </CardContent>
        </Card>
        {showBillingKpis ? (
          <>
            <Card className="border-border/50 bg-card/30">
              <CardContent className="p-5">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Billing - Not Sent</div>
                <div className="text-3xl font-headline font-black text-amber-400 mt-2 tabular-nums">{billingCounts.notSent}</div>
              </CardContent>
            </Card>
            <Card className="border-border/50 bg-card/30">
              <CardContent className="p-5">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Billing - Sent</div>
                <div className="text-3xl font-headline font-black text-sky-400 mt-2 tabular-nums">{billingCounts.sent}</div>
              </CardContent>
            </Card>
            <Card className="border-border/50 bg-card/30">
              <CardContent className="p-5">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Billing - Past Due</div>
                <div className="text-3xl font-headline font-black text-rose-500 mt-2 tabular-nums">{billingCounts.pastDue}</div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {shouldShowEmployeeHoursKpi && (
        <Card className="border-border/50 bg-card/20">
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="text-sm text-white">Employee Hours Breakdown</CardTitle>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
              Current Pay Period: {currentPayPeriod.startDate} - {currentPayPeriod.endDate}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Leave combines PTO and holiday. “NB+L vs billable” is (non-billable + leave) ÷ billable × 100 (— if no billable hours).
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoadingEmployeeHourKpis ? (
              <div className="text-xs text-muted-foreground">Loading employee KPI breakdown...</div>
            ) : employeeHourKpis.length === 0 ? (
              <div className="text-xs text-muted-foreground">No timesheet data for current pay period.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {employeeHourKpis.map((row) => (
                  <div key={row.employeeId} className="rounded-md border border-border/50 p-3 bg-background/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-white">{row.employeeName.split(' ')[0]}</div>
                      <Badge variant="outline" className="text-[9px] h-4 tabular-nums">
                        {row.totalHours.toFixed(2)}h total
                      </Badge>
                    </div>
                    <div className="space-y-1 text-[11px] tabular-nums">
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Billable</span>
                        <span className="text-emerald-400 font-semibold">{row.billableHours.toFixed(2)} h</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Non-billable</span>
                        <span className="text-amber-400 font-semibold">{row.nonBillableHours.toFixed(2)} h</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Leave</span>
                        <span className="text-sky-400 font-semibold">{row.leaveHours.toFixed(2)} h</span>
                      </div>
                      <div className="pt-1 mt-1 border-t border-border/40 flex justify-between gap-2 leading-tight">
                        <span className="text-muted-foreground text-[10px]">NB+L vs billable</span>
                        <span className="text-white font-bold">
                          {row.nbPlusLeaveVsBillablePct !== null
                            ? `${row.nbPlusLeaveVsBillablePct.toFixed(1)}%`
                            : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2 text-[10px] text-muted-foreground">
                        <span>% of period · B / NB / L</span>
                        <span>
                          <span className="text-emerald-400/90">{row.billablePct.toFixed(1)}%</span>
                          <span className="text-muted-foreground mx-0.5">/</span>
                          <span className="text-amber-400/90">{row.nonBillablePct.toFixed(1)}%</span>
                          <span className="text-muted-foreground mx-0.5">/</span>
                          <span className="text-sky-400/90">{row.leavePct.toFixed(1)}%</span>
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 space-y-8">
          <HomeMap projects={projects} clients={clients} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <h3 className="font-headline text-lg text-primary flex items-center gap-2 border-b border-primary/20 pb-2"><ListTodo className="h-4 w-4" /> Priority Pipeline</h3>
              {myTasks.length === 0 ? <div className="py-6 text-center bg-muted/5 border-dashed border rounded-xl text-[10px] uppercase font-bold text-muted-foreground">No priority tasks</div> : (
                myTasks.map(t => {
                  const project = projects.find(p => p.id === t.projectId);
                  const isOverdue = t.deadline && isPast(startOfDay(parseISO(t.deadline))) && t.status !== 'Completed';
                  return (
                    <Card key={t.id} className={cn("bg-card/30 border-border/50 hover:border-foreground/30 cursor-pointer overflow-hidden", isOverdue && "border-rose-500/20 bg-rose-500/5")} onClick={() => onViewTask(t)}>
                      <CardContent className="p-3 flex justify-between items-center"><div className="space-y-1 flex-1 min-w-0"><Badge variant="secondary" className="text-[8px] h-4 mb-1 uppercase font-bold">{project?.name || 'Firm'}</Badge><h4 className={cn("font-bold text-sm text-white truncate", isOverdue && "text-rose-500")}>{t.name || 'Untitled'}</h4><p className="text-[10px] text-muted-foreground line-clamp-1 italic">{t.description}</p></div><ChevronRight className="h-4 w-4 text-muted-foreground ml-2" /></CardContent>
                    </Card>
                  );
                })
              )}
            </div>
            <MessageArea inbox={messagesInbox} outbox={messagesOutbox} employees={allEmployees} currentUserId={currentEmployee?.id || ''} onSendMessage={onSendMessage} onMarkRead={onMarkRead} onDeleteMessage={onDeleteMessage} />
          </div>
        </div>

        <div className="lg:col-span-4">
          <Card className="border-border/50 shadow-2xl bg-card/30 overflow-hidden h-fit flex flex-col mb-8">
            <CardHeader className="bg-muted/30 border-b border-border/50 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <ListTodo className="h-5 w-5 text-primary shrink-0" />
                  <CardTitle className="text-xl font-headline text-white truncate">Quick Task</CardTitle>
                </div>
                <Badge variant="outline" className="text-[9px] h-4 tabular-nums">
                  No project
                </Badge>
              </div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold pl-7 leading-snug">
                Fast capture for follow-ups (calls, emails, reminders)
              </p>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Task</Label>
                <Input
                  value={quickTaskName}
                  onChange={(e) => setQuickTaskName(e.target.value)}
                  placeholder="Return phone call…"
                  className="h-11"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addQuickTask();
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Notes (optional)</Label>
                <Input
                  value={quickTaskNotes}
                  onChange={(e) => setQuickTaskNotes(e.target.value)}
                  placeholder="Context / callback number / next step…"
                  className="h-11"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Category</Label>
                  <select
                    className="flex h-11 w-full rounded-md border bg-background px-3 text-sm font-bold shadow-inner"
                    value={quickTaskCategory}
                    onChange={(e) => setQuickTaskCategory(e.target.value as any)}
                  >
                    <option value="Return Communication">Return Communication</option>
                    <option value="Personal">Personal</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Priority</Label>
                  <select
                    className="flex h-11 w-full rounded-md border bg-background px-3 text-sm font-bold shadow-inner"
                    value={quickTaskPriority}
                    onChange={(e) => setQuickTaskPriority(e.target.value as any)}
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Due date</Label>
                <Input
                  type="date"
                  value={quickTaskDeadline}
                  onChange={(e) => setQuickTaskDeadline(e.target.value)}
                  className="h-11"
                />
              </div>
              <Button type="button" className="w-full h-11" onClick={addQuickTask}>
                <Plus className="h-4 w-4 mr-2" /> Add Quick Task
              </Button>

              {displayQuickTasks.length ? (
                <div className="pt-3 border-t border-border/40 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Recent quick tasks
                  </p>
                  <div className="space-y-2">
                    {displayQuickTasks.map((t) => (
                      <div
                        key={t.id}
                        className="w-full rounded-md border border-border/40 bg-background/20 hover:bg-background/30 px-3 py-2 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={completingQuickTaskIds.has(t.id)}
                            aria-label={`Mark "${t.name || 'task'}" completed`}
                            className="mt-1"
                            onCheckedChange={(checked) => {
                              if (!checked) return;
                              setCompletingQuickTaskIds((prev) => {
                                const next = new Set(prev);
                                next.add(t.id);
                                return next;
                              });
                              completeQuickTask?.(t.id);
                              toast({ title: 'Task completed', description: 'Moved to Archives.' });
                            }}
                            onClick={(e) => e.stopPropagation()}
                            disabled={completingQuickTaskIds.has(t.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-white truncate">
                                {t.name || 'Task'}
                              </span>
                              <Badge variant="outline" className="text-[9px] h-4">
                                {t.priority}
                              </Badge>
                            </div>
                            {t.notes ? (
                              <div className="text-[11px] text-muted-foreground line-clamp-1">{t.notes}</div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-2xl bg-card/30 overflow-hidden h-fit flex flex-col">
            <CardHeader className="bg-muted/30 border-b border-border/50 py-4 flex flex-row items-center justify-between gap-2">
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5 text-primary shrink-0" />
                  <CardTitle className="text-xl font-headline text-white">Schedule</CardTitle>
                  {googleSyncLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" /> : null}
                </div>
                {googleMirrorLoaded ? (
                  <p className="text-[9px] uppercase tracking-wider text-emerald-500/90 font-semibold pl-7 leading-snug">
                    Google sync on ·{' '}
                    {googleScheduleCalPick === null
                      ? googleCalendarIds.length
                        ? `${googleCalendarIds.length} calendar${googleCalendarIds.length > 1 ? 's' : ''} (Google defaults)`
                        : `primary (${DEFAULT_GOOGLE_CALENDAR_ID})`
                      : googleCalendarIds.length === 0
                        ? 'Custom: no Google calendars'
                        : `${googleCalendarIds.length} calendar${googleCalendarIds.length > 1 ? 's' : ''} (your pick)`}
                  </p>
                ) : googleOAuthReady ? (
                  <p className="text-[9px] uppercase tracking-wider text-amber-500/90 font-semibold pl-7 leading-snug">
                    Google sync on (
                    {googleOAuthCredentialSource === 'hub' ? 'Connection Hub' : 'server env'}
                    ) · feed unavailable
                    {googleFetchError ? ` — ${googleFetchError.slice(0, 120)}` : ''}
                  </p>
                ) : (
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold pl-7 leading-snug">
                    Google sync off — add GOOGLE_CLIENT_* + GOOGLE_REFRESH_TOKEN in server env, or Google credentials in Inbox → Connection Hub
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {googleOAuthReady ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2"
                    title="Choose which Google calendars appear on Schedule"
                    onClick={() => void openGoogleCalPicker()}
                    disabled={googleCalPickerLoading}
                  >
                    <CalendarRange className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2"
                  title="Refresh from Google"
                  onClick={() => void loadGoogleSchedule()}
                  disabled={googleSyncLoading}
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', googleSyncLoading && 'animate-spin')} />
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-2" onClick={openNewEvent}>
                  <Plus className="h-3 w-3" /> Add
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px] p-4">
                <div className="space-y-3">
                  {displayScheduleRows.map(({ e: calRow, start }) => {
                    const isGoogleOnly = calRow.externalSource === 'google';
                    const meetUrl = calRow.googleMeetLink;
                    return (
                      <div
                        key={calRow.id}
                        onClick={() => openEditEvent(calRow)}
                        className="flex gap-4 p-3 rounded-xl border border-border/50 bg-muted/20 hover:border-primary/50 cursor-pointer transition-all"
                      >
                        <div className={cn("flex flex-col items-center justify-center w-12 h-12 rounded-lg border shrink-0", calRow.type === 'TaskBlock' ? 'border-primary/20 bg-primary/10' : calRow.type === 'CommandBlock' ? 'border-violet-500/30 bg-violet-500/10' : 'border-accent/20 bg-accent/10')}><span className={cn("text-[8px] uppercase font-black", calRow.type === 'TaskBlock' ? 'text-primary' : calRow.type === 'CommandBlock' ? 'text-violet-300' : 'text-accent')}>{format(start, 'MMM')}</span><span className="text-xl font-bold text-white mt-0.5">{format(start, 'd')}</span></div>
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-xs font-bold truncate text-white">{calRow.title}</h4>
                            {isGoogleOnly ? <Badge variant="secondary" className="text-[7px] h-3 px-1 uppercase shrink-0">Google</Badge> : null}
                            {calRow.visibility === 'Private' && <Shield className="h-2.5 w-2.5 text-accent shrink-0" />}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[9px] text-muted-foreground font-bold">{format(start, 'h:mm a')}</p>
                            {calRow.locationType ? <Badge variant="outline" className="text-[7px] h-3 px-1 uppercase">{calRow.locationType}</Badge> : null}
                            {calRow.location ? <span className="text-[8px] text-muted-foreground truncate max-w-[140px]">{calRow.location}</span> : null}
                          </div>
                        </div>
                        {meetUrl ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            title="Open Meet"
                            onClick={(clickEv) => {
                              clickEv.stopPropagation();
                              window.open(meetUrl, '_blank', 'noopener,noreferrer');
                            }}
                          >
                            <Globe className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                  {displayScheduleRows.length === 0 && (
                    <div className="text-center py-10 opacity-30">
                      <CalendarIcon className="h-8 w-8 mx-auto mb-2" />
                      <p className="text-[10px] font-bold uppercase">No events scheduled</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

        </div>
      </div>

      <Dialog open={isGoogleCalPickerOpen} onOpenChange={setIsGoogleCalPickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-headline text-xl">Google calendars on Schedule</DialogTitle>
            <DialogDescription>
              Check the calendars to show on Home. This is saved in this browser only (per firm account).
            </DialogDescription>
          </DialogHeader>
          {googleCalPickerLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ScrollArea className="max-h-[min(320px,45vh)] pr-3">
              <div className="space-y-2">
                {googleCalPickerOptions.map((c, i) => (
                  <div
                    key={c.id}
                    className="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/10 p-2.5"
                  >
                    <Checkbox
                      id={`gcal-pick-${i}`}
                      checked={googleCalPickerDraft.has(c.id)}
                      onCheckedChange={() => toggleGoogleCalPickerId(c.id)}
                      className="mt-0.5"
                    />
                    <label htmlFor={`gcal-pick-${i}`} className="text-sm cursor-pointer flex-1 min-w-0 leading-snug">
                      <span className="font-semibold text-white">{c.summary}</span>
                      {c.primary ? (
                        <span className="text-[10px] uppercase text-muted-foreground ml-2">Primary</span>
                      ) : null}
                    </label>
                  </div>
                ))}
                {googleCalPickerOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No calendars returned from Google.</p>
                ) : null}
              </div>
            </ScrollArea>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setIsGoogleCalPickerOpen(false)}>
              Cancel
            </Button>
            <div className="flex flex-wrap gap-2 justify-end">
              <Button type="button" variant="secondary" onClick={resetGoogleCalPickerToDefaults}>
                Use Google defaults
              </Button>
              <Button type="button" onClick={saveGoogleCalPicker} disabled={googleCalPickerLoading}>
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isEventDialogOpen}
        onOpenChange={(open) => {
          if (typeof open === 'boolean') setIsEventDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-headline text-2xl">{editingId ? 'Edit Event' : 'New Event'}</DialogTitle>
            {editingId && scheduleEventsMerged.find((x) => x.id === editingId)?.googleCalendarHtmlLink ? (
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-xs text-primary justify-start gap-1"
                onClick={() => {
                  const u = scheduleEventsMerged.find((x) => x.id === editingId)?.googleCalendarHtmlLink;
                  if (u) window.open(u, '_blank', 'noopener,noreferrer');
                }}
              >
                <ExternalLink className="h-3 w-3" /> Open in Google Calendar
              </Button>
            ) : null}
          </DialogHeader>
          <form onSubmit={onCalendarFormSubmit} className="space-y-6 py-4">
            <div className="space-y-2"><Label>Title</Label><Input value={formTitle} onChange={e => setFormTitle(e.target.value)} required /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Visibility</Label><div className="flex gap-2"><Button type="button" variant={formVisibility === 'Global' ? 'default' : 'outline'} size="sm" className="flex-1" onClick={() => setFormVisibility('Global')}><Globe className="h-3 w-3 mr-1.5" /> Global</Button><Button type="button" variant={formVisibility === 'Private' ? 'default' : 'outline'} size="sm" className="flex-1" onClick={() => setFormVisibility('Private')}><Shield className="h-3 w-3 mr-1.5" /> Private</Button></div></div>
              <div className="space-y-2"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Location Type</Label><div className="flex flex-wrap gap-1">{(['In-Person', 'Online', 'On-Site'] as EventLocationType[]).map(type => (<Button key={type} type="button" variant={formLocationType === type ? 'default' : 'outline'} size="sm" className="px-2 h-8 text-[10px]" onClick={() => setFormLocationType(type)}>{type}</Button>))}</div></div>
            </div>
            <div className="space-y-2"><Label className="text-[10px] uppercase font-bold">Link Projects</Label><ScrollArea className="h-32 border p-3 rounded-lg bg-muted/10"><div className="grid grid-cols-1 gap-2">{sortedProjects.map(p => (<div key={p.id} className="flex items-center gap-2"><Checkbox id={`link-p-${p.id}`} checked={formProjectIds.includes(p.id)} onCheckedChange={(c) => { if (c) setFormProjectIds(prev => [...prev, p.id]); else setFormProjectIds(prev => prev.filter(id => id !== p.id)); }} /><Label htmlFor={`link-p-${p.id}`} className="text-xs truncate">{p.name}</Label></div>))}</div></ScrollArea></div>
            <div className="space-y-2"><Label>Date</Label><Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} required /></div>
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-2"><Label className="text-[10px] font-bold">Start Time</Label><div className="flex items-center gap-1.5"><Input className="w-14 text-center" value={startH} onChange={e => setStartH(e.target.value)} /><span className="font-bold">:</span><Input className="w-14 text-center" value={startM} onChange={e => setStartM(e.target.value)} /><select className="h-9 rounded-md border bg-background text-xs px-1" value={startP} onChange={e => setStartP(e.target.value)}><option value="AM">AM</option><option value="PM">PM</option></select></div></div>
              <div className="space-y-2"><Label className="text-[10px] font-bold">End Time</Label><div className="flex items-center gap-1.5"><Input className="w-14 text-center" value={endH} onChange={e => setEndH(e.target.value)} /><span className="font-bold">:</span><Input className="w-14 text-center" value={endM} onChange={e => setEndM(e.target.value)} /><select className="h-9 rounded-md border bg-background text-xs px-1" value={endP} onChange={e => setEndP(e.target.value)}><option value="AM">AM</option><option value="PM">PM</option></select></div></div>
            </div>
            <div className="space-y-2"><Label>Location / address</Label><Input value={formLocation} onChange={(e) => setFormLocation(e.target.value)} placeholder="Optional — syncs to Google when enabled" /></div>
            <div className="space-y-2"><Label>Description</Label><Input value={formDesc} onChange={e => setFormDesc(e.target.value)} /></div>
            {googleOAuthReady ? (
              <div className="flex items-start gap-2 rounded-lg border border-border/50 p-3 bg-muted/10">
                <Checkbox
                  id="di-sync-google"
                  checked={syncToGoogle}
                  onCheckedChange={(c) => {
                    const on = !!c;
                    setSyncToGoogle(on);
                    try {
                      localStorage.setItem('di_schedule_sync_google', on ? '1' : '0');
                    } catch {
                      // ignore
                    }
                  }}
                />
                <Label htmlFor="di-sync-google" className="text-xs leading-snug cursor-pointer font-normal">
                  Two-way sync: new Ledger events and edits also create/update/delete on Google Calendar ({DEFAULT_GOOGLE_CALENDAR_ID}). Turn off to keep changes local-only.
                </Label>
              </div>
            ) : null}
            <DialogFooter className="flex justify-between sm:justify-between border-t pt-6 flex-wrap gap-2">
              {editingId ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-rose-500"
                  disabled={isSavingCalendar}
                  onClick={() => {
                    void handleDialogDelete().catch((err: unknown) => {
                      console.error(err);
                      toast({
                        variant: 'destructive',
                        title: 'Delete failed',
                        description: err instanceof Error ? err.message : 'Unexpected error — see console.',
                      });
                    });
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </Button>
              ) : (
                <div />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setIsEventDialogOpen(false)} disabled={isSavingCalendar}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-primary" disabled={isSavingCalendar}>
                  {isSavingCalendar ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {editingId ? 'Update' : 'Save'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isAlarmDialogOpen} onOpenChange={setIsAlarmDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-accent" /> Set Alarm
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Alarm Time</Label>
              <Input type="time" value={alarmTimeInput} onChange={(e) => setAlarmTimeInput(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Label (optional)</Label>
              <Input value={alarmLabelInput} onChange={(e) => setAlarmLabelInput(e.target.value)} placeholder="Alarm" />
            </div>
            {activeAlarm ? (
              <div className="text-xs text-muted-foreground">
                Current: {format(parseISO(activeAlarm.atIso), 'MMM d, h:mm a')} {activeAlarm.triggered ? '(Triggered)' : ''}
              </div>
            ) : null}
          </div>
          <DialogFooter className="flex justify-between sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              className="text-rose-500"
              onClick={() => setActiveAlarm(null)}
            >
              Clear Alarm
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setIsAlarmDialogOpen(false)}>Cancel</Button>
              <Button type="button" onClick={setAlarm}>Save Alarm</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

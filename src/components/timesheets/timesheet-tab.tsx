
"use client"

import { useState, useMemo, useEffect, useRef } from 'react';
import { Project, TimesheetEntry, Employee, TimesheetBillingType, LeaveBank, PayPeriodSubmission } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ClipboardCheck, Plus, Pencil, Trash2, Palmtree, Gift, ArrowUpDown, ChevronUp, ChevronDown, Clock, X, ChevronLeft, ChevronRight, FileDown, Send, Lock, UserCog } from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { getApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { collection, query, orderBy } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { format, parseISO, isAfter, addDays, subDays, addHours, differenceInDays } from 'date-fns';
import { useLedgerData } from '@/hooks/use-ledger-data';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

type SortConfig = { key: keyof TimesheetEntry | 'projectName'; direction: 'asc' | 'desc' } | null;

interface TimeSegment {
  id: string;
  startH: string;
  startM: string;
  startP: string;
  endH: string;
  endM: string;
  endP: string;
}

const ANCHOR_DATE = new Date('2026-02-28T00:00:00Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_PERIOD = 14 * MS_PER_DAY;
/** Hours after the *next* pay period starts that employees may still submit / edit the prior period (if not yet submitted). */
const PAY_PERIOD_SUBMISSION_GRACE_HOURS = 24;

const billingTypeOptions: TimesheetBillingType[] = ['Billable', 'Non-Billable', 'PTO', 'Holiday'];

const getPayPeriodForDate = (date: Date | string) => {
  let d = typeof date === 'string' ? new Date(date + 'T00:00:00Z') : new Date(date.toISOString().split('T')[0] + 'T00:00:00Z');
  const diff = d.getTime() - ANCHOR_DATE.getTime();
  const periodIndex = Math.floor(diff / MS_PER_PERIOD);
  const startDate = new Date(ANCHOR_DATE.getTime() + periodIndex * MS_PER_PERIOD);
  const endDate = new Date(startDate.getTime() + 13 * MS_PER_DAY);
  return { 
    id: startDate.toISOString().split('T')[0], 
    startDate: startDate.toISOString().split('T')[0], 
    endDate: endDate.toISOString().split('T')[0],
    week1End: new Date(startDate.getTime() + 6 * MS_PER_DAY).toISOString().split('T')[0],
    week2Start: new Date(startDate.getTime() + 7 * MS_PER_DAY).toISOString().split('T')[0]
  };
};

type PayPeriodShape = ReturnType<typeof getPayPeriodForDate>;

const getNextPayPeriod = (period: PayPeriodShape): PayPeriodShape => {
  const d = parseISO(period.endDate + 'T12:00:00.000Z');
  return getPayPeriodForDate(addDays(d, 1));
};

const getPreviousPayPeriod = (period: PayPeriodShape): PayPeriodShape => {
  const d = parseISO(period.startDate + 'T12:00:00.000Z');
  return getPayPeriodForDate(subDays(d, 1));
};

/** End of window to submit / edit a period that has never been submitted (24h into the following period). */
const getUnsubmittedGraceEnd = (period: PayPeriodShape) => {
  const next = getNextPayPeriod(period);
  return addHours(parseISO(next.startDate + 'T00:00:00.000Z'), PAY_PERIOD_SUBMISSION_GRACE_HOURS);
};

const parseTimeToDecimal = (v: string): number => {
  if (!v) return 0;
  if (v.includes(':')) { 
    const p = v.split(':'); 
    const hours = parseInt(p[0]) || 0;
    const minutes = (parseInt(p[1]) || 0) / 60;
    return hours + minutes; 
  }
  const num = parseFloat(v);
  return isNaN(num) ? 0 : num;
};

const parse12hTo24h = (h: string, m: string, p: string) => {
  let hr = parseInt(h || '0');
  if (p === 'PM' && hr < 12) hr += 12;
  if (p === 'AM' && hr === 12) hr = 0;
  return `${hr.toString().padStart(2, '0')}:${(m || '00').padStart(2, '0')}`;
};

const parse24hTo12h = (t: string) => {
  if (!t || t === '—') return { hour: '8', min: '00', period: 'AM' };
  const [h, m] = t.split(':').map(Number);
  return { hour: (h % 12 || 12).toString(), min: m.toString().padStart(2, '0'), period: h >= 12 ? 'PM' : 'AM' };
};

interface TimesheetTabProps {
  projects: Project[];
  onAddEntry: (entry: Omit<TimesheetEntry, 'id'>) => void;
  onUpdateEntry: (empId: string, id: string, entry: Partial<TimesheetEntry>) => void;
  onDeleteEntry: (empId: string, id: string) => void;
  onUpdateLeaveBank: (empId: string, bank: Partial<LeaveBank>) => void;
  employeeId: string | null;
  canEdit?: boolean;
  isGlobalAdmin?: boolean;
  allEmployees: Employee[];
  leaveBanks: LeaveBank[];
  onAddProject: () => void;
}

export function TimesheetTab({ projects, onAddEntry, onUpdateEntry, onDeleteEntry, onUpdateLeaveBank, employeeId, canEdit = true, isGlobalAdmin = false, allEmployees, leaveBanks, onAddProject }: TimesheetTabProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { payPeriodSubmissions, archiveTimesheetPdfReport } = useLedgerData();
  const [currentDate, setCurrentDate] = useState<Date | null>(() => new Date());
  const [viewingEmployeeId, setViewingEmployeeId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [entryDate, setEntryDate] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [segments, setSegments] = useState<TimeSegment[]>([
    { id: Math.random().toString(36).substr(2, 9), startH: '8', startM: '00', startP: 'AM', endH: '5', endM: '00', endP: 'PM' }
  ]);

  const [manualHours, setManualHours] = useState('');
  const [billingType, setBillingType] = useState<TimesheetBillingType>('Billable');
  const [activityName, setActivityName] = useState('');
  const [descriptionOfWork, setDescriptionOfWork] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  /** After a payroll submit, any edit to this period marks the doc id until they submit again. */
  const [payrollResubmitNeededBySubmissionId, setPayrollResubmitNeededBySubmissionId] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (employeeId) setViewingEmployeeId(employeeId);
  }, [employeeId]);

  const prevViewingEmployeeIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!viewingEmployeeId) return;
    const viewingChanged = prevViewingEmployeeIdRef.current !== viewingEmployeeId;
    prevViewingEmployeeIdRef.current = viewingEmployeeId;

    const now = new Date();
    const periodNow = getPayPeriodForDate(now);
    const priorPeriod = getPreviousPayPeriod(periodNow);
    const priorSubmissionId = `${viewingEmployeeId}_${priorPeriod.id}`;
    const priorSubmitted = payPeriodSubmissions.some((s) => s.id === priorSubmissionId);
    const graceEnd = getUnsubmittedGraceEnd(priorPeriod);

    if (viewingChanged) {
      if (!priorSubmitted && !isAfter(now, graceEnd)) {
        setCurrentDate(parseISO(priorPeriod.startDate + 'T12:00:00.000Z'));
      } else {
        setCurrentDate(now);
      }
      setEntryDate(now.toISOString().split('T')[0]);
    }
  }, [viewingEmployeeId, payPeriodSubmissions]);

  const entriesQuery = useMemoFirebase(() => 
    viewingEmployeeId ? query(collection(firestore, 'employees', viewingEmployeeId, 'timesheet_entries'), orderBy('date', 'asc')) : null
  , [firestore, viewingEmployeeId]);
  
  const { data: entries } = useCollection<TimesheetEntry>(entriesQuery);
  const currentPeriod = useMemo(() => currentDate ? getPayPeriodForDate(currentDate) : null, [currentDate]);
  
  const periodSubmission = useMemo(() => {
    if (!currentPeriod || !viewingEmployeeId) return null;
    const submissionId = `${viewingEmployeeId}_${currentPeriod.id}`;
    return payPeriodSubmissions.find(s => s.id === submissionId) || null;
  }, [payPeriodSubmissions, currentPeriod, viewingEmployeeId]);

  const isPrivilegedUser = useMemo(() => {
    const profile = allEmployees.find(e => e.id === employeeId);
    if (!profile) return isGlobalAdmin;
    const name = profile.firstName.toLowerCase();
    return isGlobalAdmin || ['jeff', 'kevin', 'tammi'].some(n => name.includes(n));
  }, [allEmployees, employeeId, isGlobalAdmin]);

  /** Jeff & Tammi bypass period lock (post-submit and grace) so they can edit/resubmit any time. */
  const isJeffOrTammiPeriodLockExempt = useMemo(() => {
    const me = allEmployees.find((e) => e.id === employeeId);
    if (!me) return false;
    const f = (me.firstName || '').toLowerCase();
    const l = (me.lastName || '').toLowerCase();
    return (f.includes('jeff') && l.includes('dillon')) || (f.includes('tammi') && l.includes('dillon'));
  }, [allEmployees, employeeId]);

  const isPostSubmitLocked = useMemo(() => {
    if (isJeffOrTammiPeriodLockExempt) return false;
    if (!periodSubmission) return false;
    return isAfter(new Date(), addDays(parseISO(periodSubmission.submittedAt), 1));
  }, [periodSubmission, isJeffOrTammiPeriodLockExempt]);

  const isGraceMissedLocked = useMemo(() => {
    if (isJeffOrTammiPeriodLockExempt) return false;
    if (!currentPeriod || periodSubmission || isPrivilegedUser) return false;
    return isAfter(new Date(), getUnsubmittedGraceEnd(currentPeriod));
  }, [currentPeriod, periodSubmission, isPrivilegedUser, isJeffOrTammiPeriodLockExempt]);

  const isLocked = isPostSubmitLocked || isGraceMissedLocked;

  const needsPayrollResubmit = useMemo(() => {
    if (!periodSubmission || isLocked) return false;
    return !!payrollResubmitNeededBySubmissionId[periodSubmission.id];
  }, [periodSubmission, isLocked, payrollResubmitNeededBySubmissionId]);

  const markPayrollResubmitNeeded = () => {
    if (!periodSubmission || isLocked) return;
    setPayrollResubmitNeededBySubmissionId((prev) => {
      if (prev[periodSubmission.id]) return prev;
      toast({
        title: 'Payroll submit out of date',
        description: 'You changed hours after submitting. Submit the timesheet again so payroll matches your edits.',
      });
      return { ...prev, [periodSubmission.id]: true };
    });
  };

  const clearPayrollResubmitNeeded = (submissionId: string) => {
    setPayrollResubmitNeededBySubmissionId((prev) => {
      if (!prev[submissionId]) return prev;
      const next = { ...prev };
      delete next[submissionId];
      return next;
    });
  };

  const currentEntries = useMemo(() => {
    return (entries || []).filter(e => getPayPeriodForDate(e.date).id === currentPeriod?.id);
  }, [entries, currentPeriod]);

  const sortedEntries = useMemo(() => {
    let items = [...currentEntries];
    if (sortConfig) {
      items.sort((a, b) => {
        let aVal: any = a[sortConfig.key as keyof TimesheetEntry];
        let bVal: any = b[sortConfig.key as keyof TimesheetEntry];
        if (sortConfig.key === 'projectName') {
          aVal = projects.find(p => p.id === a.projectId)?.name || a.customProjectName || '';
          bVal = projects.find(p => p.id === b.projectId)?.name || b.customProjectName || '';
        }
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return items;
  }, [currentEntries, sortConfig, projects]);

  const stats = useMemo(() => {
    const totals = { billable: 0, nonBillable: 0, holiday: 0, pto: 0, overtime: 0, week1Worked: 0, week2Worked: 0 };
    if (!currentPeriod) return totals;
    
    currentEntries.forEach(e => {
      const hrs = Number(e.hoursWorked) || 0;
      const isWeek1 = e.date <= currentPeriod.week1End;
      
      if (e.billingType === 'Billable') {
        totals.billable += hrs;
        if (isWeek1) totals.week1Worked += hrs; else totals.week2Worked += hrs;
      } else if (e.billingType === 'Non-Billable') {
        totals.nonBillable += hrs;
        if (isWeek1) totals.week1Worked += hrs; else totals.week2Worked += hrs;
      } else if (e.billingType === 'PTO') {
        totals.pto += hrs;
        if (isWeek1) totals.week1Worked += hrs; else totals.week2Worked += hrs;
      } else if (e.billingType === 'Holiday') {
        totals.holiday += hrs;
      }
    });

    totals.overtime = Math.max(0, totals.week1Worked - 40) + Math.max(0, totals.week2Worked - 40);
    return totals;
  }, [currentEntries, currentPeriod]);

  const currentEmployeeProfile = useMemo(() => allEmployees.find(e => e.id === viewingEmployeeId), [allEmployees, viewingEmployeeId]);

  const selectableEmployees = useMemo(() => {
    return [...allEmployees]
      .filter(e => ["sarah", "chris", "jorrie"].some(n => e.firstName.toLowerCase().includes(n)))
      .sort((a, b) => (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName));
  }, [allEmployees]);

  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => a.name.localeCompare(b.name));
  }, [projects]);

  const isEligibleForLeave = useMemo(() => {
    const name = currentEmployeeProfile?.firstName?.toLowerCase() || '';
    return name.includes('chris') || name.includes('sarah');
  }, [currentEmployeeProfile]);

  const availableBillingTypes = useMemo(() => {
    if (isEligibleForLeave) return billingTypeOptions;
    return billingTypeOptions.filter(opt => opt !== 'PTO' && opt !== 'Holiday');
  }, [isEligibleForLeave]);

  const currentLeaveBank = useMemo(() => {
    if (!viewingEmployeeId) return null;
    return (
      leaveBanks.find(b => b.employeeId === viewingEmployeeId) ||
      leaveBanks.find(b => (b as any).id === viewingEmployeeId) ||
      null
    );
  }, [leaveBanks, viewingEmployeeId]);

  const updateSegment = (id: string, updates: Partial<TimeSegment>) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const handleAddSegment = () => {
    if (editingEntryId) return;
    setSegments(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), startH: '8', startM: '00', startP: 'AM', endH: '5', endM: '00', endP: 'PM' }]);
  };

  const handleRemoveSegment = (id: string) => {
    setSegments(prev => prev.filter(s => s.id !== id));
  };

  const totalFormHours = useMemo(() => {
    if (billingType !== 'Billable') {
      return parseTimeToDecimal(manualHours);
    }
    return segments.reduce((sum, seg) => {
      const st = parse12hTo24h(seg.startH, seg.startM, seg.startP);
      const et = parse12hTo24h(seg.endH, seg.endM, seg.endP);
      const [sh, sm] = st.split(':').map(Number);
      const [eh, em] = et.split(':').map(Number);
      let hours = (eh + em/60) - (sh + sm/60);
      if (hours < 0) hours += 24;
      return sum + hours;
    }, 0);
  }, [segments, billingType, manualHours]);

  const handleHoursBlur = () => {
    setManualHours(parseTimeToDecimal(manualHours).toFixed(2));
  };

  const applyLeaveBankAdjustment = (
    prevType: TimesheetBillingType | null,
    prevHours: number,
    nextType: TimesheetBillingType | null,
    nextHours: number,
  ) => {
    if (!isEligibleForLeave || !viewingEmployeeId || !currentLeaveBank) return;

    const prevPto = prevType === 'PTO' ? prevHours : 0;
    const prevHoliday = prevType === 'Holiday' ? prevHours : 0;
    const nextPto = nextType === 'PTO' ? nextHours : 0;
    const nextHoliday = nextType === 'Holiday' ? nextHours : 0;

    // Balances are stored as remaining hours.
    const deltaPto = prevPto - nextPto;
    const deltaHoliday = prevHoliday - nextHoliday;

    const newPto = Math.max(0, (Number(currentLeaveBank.ptoHours) || 0) + deltaPto);
    const newHoliday = Math.max(0, (Number(currentLeaveBank.holidayHours) || 0) + deltaHoliday);

    if (
      Math.abs(newPto - (Number(currentLeaveBank.ptoHours) || 0)) < 0.001 &&
      Math.abs(newHoliday - (Number(currentLeaveBank.holidayHours) || 0)) < 0.001
    ) {
      return;
    }

    onUpdateLeaveBank(viewingEmployeeId, { ptoHours: newPto, holidayHours: newHoliday });
  };

  const handlePrevPeriod = () => {
    if (currentDate) setCurrentDate(subDays(currentDate, 14));
  };

  const handleNextPeriod = () => {
    if (currentDate) setCurrentDate(addDays(currentDate, 14));
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => (prev?.key === key && prev.direction === 'asc') ? { key, direction: 'desc' } : { key, direction: 'asc' });
  };

  const generateReport = async () => {
    if (!currentEmployeeProfile || !currentPeriod || isLocked) return;
    setIsGenerating(true);

    try {
      const doc = new jsPDF();
      const primaryColor = [139, 26, 42]; 
      const accentColor = [245, 158, 11]; 

      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(0, 0, 210, 40, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(24);
      doc.text("DESIGNER'S INK", 15, 20);
      doc.setFontSize(12);
      doc.text("TIMESHEET REPORT", 15, 30);
      
      doc.setFontSize(10);
      doc.text(`Employee: ${currentEmployeeProfile.firstName} ${currentEmployeeProfile.lastName}`, 140, 20);
      doc.text(`Period: ${currentPeriod.startDate} to ${currentPeriod.endDate}`, 140, 28);

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(14);
      doc.text("PERIOD SUMMARY", 15, 55);
      
      const summaryData = [
        ["Category", "Total Hours"],
        ["Billable Hours", stats.billable.toFixed(2)],
        ["Non-Billable Hours", stats.nonBillable.toFixed(2)],
        ["Holiday Leave", stats.holiday.toFixed(2)],
        ["PTO Leave", stats.pto.toFixed(2)],
        ["Overtime Hours", { content: stats.overtime.toFixed(2), styles: { fontStyle: 'bold', textColor: accentColor } }]
      ];

      autoTable(doc, {
        startY: 60,
        head: [summaryData[0]],
        body: summaryData.slice(1),
        theme: 'striped',
        headStyles: { fillColor: primaryColor },
        margin: { left: 15, right: 15 }
      });

      doc.setFontSize(14);
      doc.text("ACTIVITY JOURNAL", 15, (doc as any).lastAutoTable.finalY + 15);

      const tableData = sortedEntries.map(e => [
        e.date,
        projects.find(p => p.id === e.projectId)?.name || e.customProjectName || 'General',
        e.billingType,
        `${e.startTime} - ${e.endTime}`,
        e.hoursWorked.toFixed(2),
        e.descriptionOfWork || '—'
      ]);

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 20,
        head: [["Date", "Project", "Type", "Time Block", "Hours", "Notes"]],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: primaryColor },
        styles: { fontSize: 8 },
        columnStyles: {
          5: { cellWidth: 60 }
        }
      });

      const filename = `Timesheet_${currentEmployeeProfile.lastName}_${currentPeriod.id}.pdf`;
      const pdfBlob = doc.output('blob');

      const submittedAtIso = new Date().toISOString();

      try {
        const auth = getAuth(getApp());
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
      } catch {
        /* Browser PDF fallback needs request.auth; server upload may still work. */
      }

      const archiveResult = await archiveTimesheetPdfReport(pdfBlob, {
        employeeId: currentEmployeeProfile.id,
        payPeriodId: currentPeriod.id,
        employeeName: `${currentEmployeeProfile.firstName} ${currentEmployeeProfile.lastName}`,
        periodStart: currentPeriod.startDate,
        periodEnd: currentPeriod.endDate,
        submittedAt: submittedAtIso,
        stats: {
          billable: stats.billable,
          nonBillable: stats.nonBillable,
          holiday: stats.holiday,
          pto: stats.pto,
          overtime: stats.overtime,
        },
      });

      if (!archiveResult.success) {
        toast({
          variant: 'destructive',
          title: 'Submit failed',
          description: archiveResult.uploadError || 'Could not archive PDF or record submission.',
        });
      } else {
        clearPayrollResubmitNeeded(`${currentEmployeeProfile.id}_${currentPeriod.id}`);
      }

      if (archiveResult.success && archiveResult.uploadError) {
        toast({
          title: 'Timesheet archived',
          description: `${archiveResult.uploadError} The PDF is in Reports → Timesheet PDF archive.`,
        });
      } else if (archiveResult.success) {
        toast({
          title: 'Payroll submission complete',
          description: 'PDF saved to Timesheet PDF archive; jeff@designersink.us and tammidillon73@gmail.com were emailed.',
        });
      }

      if (archiveResult.success) {
        try {
          const url = URL.createObjectURL(pdfBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.rel = 'noopener';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch {
          /* optional local copy */
        }
      }

    } catch (err) {
      console.error("PDF/Email Generation failed", err);
      toast({
        variant: 'destructive',
        title: 'Timesheet submit error',
        description: err instanceof Error ? err.message : 'Something went wrong while building or submitting the PDF.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !viewingEmployeeId || isLocked) return;

    if (billingType === 'Billable' && !selectedProjectId.trim()) {
      toast({ variant: 'destructive', title: 'Project required', description: 'Choose a related project for billable time.' });
      return;
    }

    if (editingEntryId) {
      const existingEntry = (entries || []).find(en => en.id === editingEntryId);
      const prevType = existingEntry?.billingType || null;
      const prevHours = Number(existingEntry?.hoursWorked || 0);

      if (billingType === 'Billable') {
        const seg = segments[0];
        if (!seg) return;
        const st = parse12hTo24h(seg.startH, seg.startM, seg.startP);
        const et = parse12hTo24h(seg.endH, seg.endM, seg.endP);
        const [sh, sm] = st.split(':').map(Number);
        const [eh, em] = et.split(':').map(Number);
        let hours = (eh + em / 60) - (sh + sm / 60);
        if (hours < 0) hours += 24;

        onUpdateEntry(viewingEmployeeId, editingEntryId, {
          projectId: selectedProjectId || 'manual',
          customProjectName: activityName,
          payPeriodId: getPayPeriodForDate(entryDate).id,
          date: entryDate,
          startTime: st,
          endTime: et,
          hoursWorked: hours,
          billingType,
          descriptionOfWork,
        });
        applyLeaveBankAdjustment(prevType, prevHours, 'Billable', hours);
      } else {
        const hours = parseTimeToDecimal(manualHours);
        onUpdateEntry(viewingEmployeeId, editingEntryId, {
          projectId: 'manual',
          customProjectName: activityName,
          payPeriodId: getPayPeriodForDate(entryDate).id,
          date: entryDate,
          startTime: '—',
          endTime: '—',
          hoursWorked: hours,
          billingType,
          descriptionOfWork,
        });
        applyLeaveBankAdjustment(prevType, prevHours, billingType, hours);
      }

      markPayrollResubmitNeeded();
      setCurrentDate(new Date(entryDate + 'T12:00:00Z'));
      resetForm();
      return;
    }

    if (billingType === 'Billable') {
      segments.forEach(seg => {
        const st = parse12hTo24h(seg.startH, seg.startM, seg.startP);
        const et = parse12hTo24h(seg.endH, seg.endM, seg.endP);
        const [sh, sm] = st.split(':').map(Number);
        const [eh, em] = et.split(':').map(Number);
        let hours = (eh + em/60) - (sh + sm/60);
        if (hours < 0) hours += 24;

        onAddEntry({ 
          employeeId: viewingEmployeeId, 
          projectId: selectedProjectId || 'manual', 
          customProjectName: activityName, 
          payPeriodId: getPayPeriodForDate(entryDate).id, 
          date: entryDate, 
          startTime: st, 
          endTime: et, 
          hoursWorked: hours, 
          billingType, 
          descriptionOfWork 
        });
      });
    } else {
      const hours = parseTimeToDecimal(manualHours);
      onAddEntry({ 
        employeeId: viewingEmployeeId, 
        projectId: 'manual', 
        customProjectName: activityName, 
        payPeriodId: getPayPeriodForDate(entryDate).id, 
        date: entryDate, 
        startTime: '—', 
        endTime: '—', 
        hoursWorked: hours, 
        billingType, 
        descriptionOfWork 
      });
      applyLeaveBankAdjustment(null, 0, billingType, hours);
    }

    markPayrollResubmitNeeded();
    setCurrentDate(new Date(entryDate + 'T12:00:00Z'));
    resetForm();
  };

  const handleEdit = (entry: TimesheetEntry) => {
    if (isLocked) return;
    setEditingEntryId(entry.id); setEntryDate(entry.date); setBillingType(entry.billingType); setActivityName(entry.customProjectName || ''); setSelectedProjectId(entry.projectId === 'manual' ? '' : entry.projectId); setDescriptionOfWork(entry.descriptionOfWork || '');
    if (entry.billingType === 'Billable') {
      const s = parse24hTo12h(entry.startTime);
      const e = parse24hTo12h(entry.endTime);
      setSegments([{ id: entry.id, startH: s.hour, startM: s.min, startP: s.period, endH: e.hour, endM: e.min, endP: e.period }]);
    } else {
      setManualHours(entry.hoursWorked.toString());
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (entry: TimesheetEntry) => {
    if (!viewingEmployeeId || isLocked) return;
    onDeleteEntry(viewingEmployeeId, entry.id);
    applyLeaveBankAdjustment(entry.billingType, Number(entry.hoursWorked || 0), null, 0);
    markPayrollResubmitNeeded();
  };

  const resetForm = () => {
    setEditingEntryId(null);
    setActivityName('');
    setSelectedProjectId('');
    setDescriptionOfWork('');
    setManualHours('');
    setSegments([
      { id: Math.random().toString(36).substr(2, 9), startH: '8', startM: '00', startP: 'AM', endH: '5', endM: '00', endP: 'PM' }
    ]);
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig?.key !== column) return <ArrowUpDown className="ml-2 h-3.5 w-3.5 opacity-30" />;
    return sortConfig.direction === 'asc' ? <ChevronUp className="ml-2 h-3.5 w-3.5 text-primary" /> : <ChevronDown className="ml-2 h-3.5 w-3.5 text-primary" />;
  };

  if (!currentPeriod) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-card/30 p-6 rounded-3xl border border-border/50 gap-4">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex bg-muted/50 rounded-xl p-1 border border-border/50">
            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={handlePrevPeriod}><ChevronLeft className="h-5 w-5" /></Button>
            <div className="px-4 flex flex-col justify-center">
              <h2 className="text-xl font-headline font-bold text-white leading-none">Time Sheets</h2>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mt-1">{currentPeriod.startDate} - {currentPeriod.endDate}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={handleNextPeriod}><ChevronRight className="h-5 w-5" /></Button>
          </div>
          
          <div className="flex flex-col gap-1">
            {periodSubmission ? (
              <div className={cn(
                'flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg border',
                needsPayrollResubmit ? 'bg-amber-500/10 border-amber-500/30' : 'bg-emerald-500/10 border-emerald-500/20'
              )}>
                <Badge className={cn('text-white border-none text-[8px]', needsPayrollResubmit ? 'bg-amber-600' : 'bg-emerald-500')}>
                  {needsPayrollResubmit ? 'RESUBMIT FOR PAYROLL' : 'SUBMITTED'}
                </Badge>
                <span className="text-[10px] text-muted-foreground font-medium">on {format(parseISO(periodSubmission.submittedAt), 'MMM d, h:mm a')}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/5 border border-amber-500/10">
                <Badge variant="outline" className="text-[8px] border-amber-500/30 text-amber-500">PENDING SUBMITTAL</Badge>
              </div>
            )}
          </div>

          {isEligibleForLeave && currentLeaveBank && (
            <div className="flex gap-3">
              <Card className="bg-emerald-500/10 border-emerald-500/20 px-4 py-2 flex items-center gap-3">
                <Palmtree className="h-4 w-4 text-emerald-500" />
                <div>
                  <p className="text-[8px] uppercase font-black text-emerald-500 leading-none mb-1">Remaining PTO</p>
                  <p className="text-sm font-bold text-white leading-none">{Number(currentLeaveBank.ptoHours || 0).toFixed(1)}h</p>
                </div>
              </Card>
              <Card className="bg-sky-500/10 border-sky-500/20 px-4 py-2 flex items-center gap-3">
                <Gift className="h-4 w-4 text-sky-500" />
                <div>
                  <p className="text-[8px] uppercase font-black text-sky-500 leading-none mb-1">Remaining Holiday</p>
                  <p className="text-sm font-bold text-white leading-none">{Number(currentLeaveBank.holidayHours || 0).toFixed(1)}h</p>
                </div>
              </Card>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-4 items-center">
          {isPrivilegedUser && (
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] uppercase font-black text-primary tracking-widest ml-1 flex items-center gap-1.5">
                <UserCog className="h-3 w-3" /> Overseer Selection
              </Label>
              <select 
                className="flex h-10 rounded-lg border border-primary/20 bg-background pl-3 pr-8 text-xs font-bold shadow-inner focus:ring-2 focus:ring-primary outline-none transition-all cursor-pointer hover:bg-primary/5" 
                value={viewingEmployeeId || ''} 
                onChange={e => setViewingEmployeeId(e.target.value)}
              >
                <option value={employeeId || ''}>My Timesheet</option>
                <optgroup label="Firm Staff">
                  {selectableEmployees.map(d => (
                    <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>
                  ))}
                </optgroup>
              </select>
            </div>
          )}

          <Button 
            onClick={generateReport} 
            disabled={isGenerating || sortedEntries.length === 0 || isLocked} 
            className="bg-accent text-accent-foreground font-black h-12 px-8 gap-2 shadow-lg shadow-accent/20"
          >
            {isGenerating ? <Clock className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {needsPayrollResubmit ? 'RESUBMIT TIMESHEET (PAYROLL)' : 'SUBMIT TIMESHEET'}
          </Button>
        </div>
      </header>

      {needsPayrollResubmit && (
        <Alert className="bg-amber-500/10 border-amber-500/30 text-amber-100">
          <ClipboardCheck className="h-4 w-4" />
          <AlertTitle className="text-xs font-bold uppercase">Resubmit for payroll</AlertTitle>
          <AlertDescription className="text-[11px] opacity-95">
            This pay period was already submitted, then the log was changed. Use <strong>Resubmit Timesheet (Payroll)</strong> above so payroll matches your current hours.
          </AlertDescription>
        </Alert>
      )}

      {isLocked && (
        <Alert className="bg-rose-500/10 border-rose-500/20 text-rose-200">
          <Lock className="h-4 w-4" />
          <AlertTitle className="text-xs font-bold uppercase">Period Locked</AlertTitle>
          <AlertDescription className="text-[10px] opacity-90">
            {isPostSubmitLocked ? (
              <>Submittal was more than 24 hours ago. Records for this period are now strictly read-only.</>
            ) : (
              <>
                The deadline to submit this pay period has passed ({PAY_PERIOD_SUBMISSION_GRACE_HOURS} hours into the next period). Contact an administrator if you need changes.
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Billable', value: stats.billable, color: 'text-white' },
          { label: 'Non-Billable', value: stats.nonBillable, color: 'text-muted-foreground' },
          { label: 'Leave Taken', value: stats.holiday + stats.pto, color: 'text-emerald-400' },
          { label: 'Overtime', value: stats.overtime, color: 'text-accent', active: stats.overtime > 0 }
        ].map(stat => (
          <Card key={stat.label} className={cn("border-border/50 bg-card/30 p-4", stat.active && "border-accent/30 bg-accent/5")}>
            <p className="text-[9px] uppercase font-black tracking-widest text-muted-foreground mb-1">{stat.label}</p>
            <p className={cn("text-2xl font-bold", stat.color)}>{stat.value.toFixed(2)}h</p>
          </Card>
        ))}
      </div>

      {canEdit && !isLocked && (
        <Card className="border-border/50 shadow-xl bg-card/50">
          <CardHeader className="bg-muted/30">
            <CardTitle className="text-lg flex items-center gap-2">
              {editingEntryId ? <Pencil className="h-4 w-4 text-accent" /> : <Plus className="h-4 w-4 text-primary" />} 
              {editingEntryId ? 'Edit Time Log' : 'Log Daily Activity'}
            </CardTitle>
            {editingEntryId ? (
              <div className="pt-2">
                <Badge variant="outline" className="border-accent/40 text-accent text-[10px] uppercase font-black tracking-widest">
                  Editing existing entry
                </Badge>
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="pt-6">
            <form key={billingType} onSubmit={handleAddLog} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">Work Date</Label>
                  <Input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} required />
                </div>
                {billingType === 'Billable' ? (
                  <div className="space-y-2 col-span-2">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Related Project</Label>
                    <div className="flex gap-2">
                      <select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm font-bold shadow-inner focus:ring-2 focus:ring-primary outline-none" value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)} required>
                        <option value="">Choose Project...</option>
                        {sortedProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <Button type="button" variant="outline" size="icon" onClick={onAddProject} title="Add Missing Project"><Plus className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ) : null}
                <div className={cn('space-y-2', billingType !== 'Billable' && 'md:col-span-3')}>
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">Activity Type</Label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-bold shadow-inner focus:ring-2 focus:ring-primary outline-none" 
                    value={billingType} 
                    onChange={e => {
                      const next = e.target.value as TimesheetBillingType;
                      setBillingType(next);
                      if (next !== 'Billable') setSelectedProjectId('');
                    }}
                  >
                    {availableBillingTypes.map(opt => (
                      <option key={opt} value={opt}>{opt === 'Billable' ? 'Billable Hours' : opt === 'Holiday' ? 'Holiday Leave' : opt === 'Non-Billable' ? 'Non-Billable' : 'PTO (Leave Bank)'}</option>
                    ))}
                  </select>
                </div>
              </div>

              {billingType === 'Billable' ? (
                <div className="space-y-4">
                  <Label className="text-[10px] uppercase font-black text-primary tracking-widest block px-1">Work Segments</Label>
                  <div className="space-y-3">
                    {segments.map((seg, index) => (
                      <div key={seg.id} className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-muted/20 rounded-2xl border border-border/50 animate-in slide-in-from-left-2 duration-300 relative group/seg">
                        <div className="space-y-2">
                          <Label className="text-[9px] uppercase font-bold text-muted-foreground">Shift Start</Label>
                          <div className="flex items-center gap-2">
                            <Input className="w-14 h-9 text-center font-bold bg-[#1a1c1e]" value={seg.startH} onChange={e => updateSegment(seg.id, { startH: e.target.value })} />
                            <span className="font-bold">:</span>
                            <Input className="w-14 h-9 text-center font-bold bg-[#1a1c1e]" value={seg.startM} onChange={e => updateSegment(seg.id, { startM: e.target.value })} />
                            <select className="bg-[#1a1c1e] text-white border border-border/50 rounded-md px-2 text-xs font-bold h-9 outline-none" value={seg.startP} onChange={e => updateSegment(seg.id, { startP: e.target.value })}>
                              <option value="AM">AM</option>
                              <option value="PM">PM</option>
                            </select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[9px] uppercase font-bold text-muted-foreground">Shift End</Label>
                          <div className="flex items-center gap-2">
                            <Input className="w-14 h-9 text-center font-bold bg-[#1a1c1e]" value={seg.endH} onChange={e => updateSegment(seg.id, { endH: e.target.value })} />
                            <span className="font-bold">:</span>
                            <Input className="w-14 h-9 text-center font-bold bg-[#1a1c1e]" value={seg.endM} onChange={e => updateSegment(seg.id, { endM: e.target.value })} />
                            <select className="bg-[#1a1c1e] text-white border border-border/50 rounded-md px-2 text-xs font-bold h-9 outline-none" value={seg.endP} onChange={e => updateSegment(seg.id, { endP: e.target.value })}>
                              <option value="AM">AM</option>
                              <option value="PM">PM</option>
                            </select>
                          </div>
                        </div>
                        {segments.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-rose-500 text-white shadow-lg opacity-0 group-hover/seg:opacity-100 transition-opacity" onClick={() => handleRemoveSegment(seg.id)}><X className="h-3 w-3" /></Button>
                        )}
                      </div>
                    ))}
                  </div>
                  {!editingEntryId && (
                    <Button type="button" variant="outline" size="sm" className="w-full h-10 border-dashed gap-2" onClick={handleAddSegment}>
                      <Plus className="h-4 w-4" /> Add Time Block
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-2 p-6 bg-muted/20 rounded-2xl border border-border/50">
                  <Label className="text-[10px] uppercase font-black text-emerald-500">Duration (Hours / e.g. 1:30)</Label>
                  <Input value={manualHours} onChange={e => setManualHours(e.target.value)} onBlur={handleHoursBlur} placeholder="e.g. 4.5 or 4:30" className="h-12 text-lg font-bold bg-[#1a1c1e]" />
                </div>
              )}

              {billingType !== 'PTO' && (
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                    {billingType === 'Holiday' ? 'Which recognized holiday?' : 'Description of Work'}
                  </Label>
                  <Textarea value={descriptionOfWork} onChange={e => setDescriptionOfWork(e.target.value)} placeholder={billingType === 'Holiday' ? 'e.g. Christmas Day, New Years...' : 'Detailed tasks performed during this session...'} className="h-24 bg-background/50" />
                </div>
              )}
              
              <div className="flex justify-between items-center pt-4 border-t border-border/50">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20"><Clock className="h-5 w-5 text-primary" /></div>
                  <div>
                    <p className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">Entry Total</p>
                    <p className="text-2xl font-headline font-bold text-white leading-none">{totalFormHours.toFixed(2)}h</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  {editingEntryId && <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>}
                  <Button type="submit" className="px-10 h-12 text-lg font-bold shadow-lg shadow-primary/20 bg-primary">{editingEntryId ? 'Update Log' : 'Save To Timesheet'}</Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50 shadow-lg overflow-hidden bg-card/50">
        <CardHeader className="bg-muted/20 py-4"><CardTitle className="text-sm font-headline uppercase tracking-widest text-muted-foreground">Period Journal</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('date')}><div className="flex items-center">Date <SortIcon column="date" /></div></TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('projectName')}><div className="flex items-center">Project / Activity <SortIcon column="projectName" /></div></TableHead>
                <TableHead className="text-center">Time Block</TableHead>
                <TableHead className="text-right cursor-pointer hover:bg-muted/80" onClick={() => handleSort('hoursWorked')}><div className="flex items-center justify-end">Hours <SortIcon column="hoursWorked" /></div></TableHead>
                {!isLocked && <TableHead className="w-20"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedEntries.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground italic">No logs recorded for this pay period.</TableCell></TableRow>
              ) : sortedEntries.map(e => (
                <TableRow key={e.id} className="hover:bg-muted/30 transition-colors group">
                  <TableCell className="text-xs font-bold text-white">{e.date}</TableCell>
                  <TableCell>
                    <div className="text-sm font-bold text-white">{projects.find(p => p.id === e.projectId)?.name || e.customProjectName || 'General Task'}</div>
                    <Badge variant="outline" className={cn("text-[8px] uppercase h-4 px-1.5", e.billingType === 'Billable' ? 'border-primary/30 text-primary' : e.billingType === 'PTO' ? 'border-emerald-500/30 text-emerald-500' : 'border-muted text-muted-foreground')}>{e.billingType}</Badge>
                  </TableCell>
                  <TableCell className="text-center text-xs font-mono text-muted-foreground">{e.startTime} - {e.endTime}</TableCell>
                  <TableCell className="text-right font-bold text-accent tabular-nums">{Number(e.hoursWorked || 0).toFixed(2)}h</TableCell>
                  {!isLocked && (
                    <TableCell>
                      <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(e)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500" onClick={() => handleDelete(e)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

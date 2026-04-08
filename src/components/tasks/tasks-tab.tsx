
"use client"

import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Client, Project, Task, TaskStatus, EmployeeName, Priority, SubTask, Comment, Attachment, TaskCategory, CalendarEvent, Employee } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Plus, Pencil, Trash2, MessageSquare, ListTodo, Clock, Paperclip, FileText, X, ChevronUp, ChevronDown, ArrowUpDown, Share2, Shield, Calendar as CalendarIcon, UserPlus, Eye, ExternalLink, AlertCircle, AlertTriangle, CheckCircle2, Mail, Send, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useUser } from '@/firebase';
import { TaskCalendar } from './task-calendar';
import { useLedgerData } from '@/hooks/use-ledger-data';
import Image from 'next/image';
import { isPast, parseISO, startOfDay, addDays, endOfDay, subMinutes, isWithinInterval, addMinutes, addHours } from 'date-fns';
import { sendEmail } from '@/services/resend-service';
import { useToast } from '@/hooks/use-toast';

const EMPLOYEES: EmployeeName[] = ["Chris Fleming", "Jeff Dillon", "Jorrie Holly", "Kevin Walthall", "Sarah VandeBurgh", "Tammi Dillon"].sort() as EmployeeName[];
const PRIORITIES: Priority[] = ["High", "Low", "Medium"].sort() as Priority[];
const STATUSES: TaskStatus[] = ["Assigned", "Completed", "In Progress", "Need Review", "Unassigned"].sort() as TaskStatus[];
const CATEGORIES: TaskCategory[] = ["Personal", "Project Related", "Return Communication"].sort() as TaskCategory[];

const TASK_NAME_OPTIONS = [
  "3D Modeling", "Client Changes", "Construction Documents", "Follow Up with Client", 
  "Initial Layout", "Miscellaneous", "Onboarding", "Print Request", "Return E-Mail", 
  "Return Phone Call", "Review Work", "Schedule Meeting with Client"
].sort();

const parseTimeToDecimal = (v: string): number => {
  if (!v) return 0;
  if (v.includes(':')) {
    const parts = v.split(':');
    const h = parseInt(parts[0]) || 0;
    const m = parseInt(parts[1]) || 0;
    return h + (m / 60);
  }
  const num = parseFloat(v);
  return isNaN(num) ? 0 : num;
};

const handleOpenAttachment = (attachment: Attachment) => {
  if (!attachment.url || attachment.url === '#') return;
  const win = window.open();
  if (win) {
    win.document.write(`<html><head><title>View: ${attachment.name}</title></head><body style="margin:0; background: #1a1c1e; display: flex; align-items: center; justify-center: center;">${attachment.type.startsWith('image/') ? `<img src="${attachment.url}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />` : `<iframe src="${attachment.url}" frameborder="0" style="border:0; width:100vw; height:100vh;" allowfullscreen></iframe>`}</body></html>`);
    win.document.close();
  }
};

interface AttachmentThumbnailProps { attachment: Attachment; className?: string; onRemove?: () => void; showRemove?: boolean; }

function AttachmentThumbnail({ attachment, className, onRemove, showRemove = false }: AttachmentThumbnailProps) {
  const isImage = attachment.type.startsWith('image/');
  return (
    <div className={cn("relative group", className)}>
      <button type="button" onClick={() => handleOpenAttachment(attachment)} className={cn("relative block w-full overflow-hidden rounded-lg border border-border bg-muted/50 transition-all hover:border-primary/50 text-left", isImage ? "aspect-video" : "h-20")} title={`View ${attachment.name}`}>{isImage ? (<div className="relative h-full w-full bg-black/20"><Image src={attachment.url} alt={attachment.name} fill unoptimized className="object-cover transition-transform group-hover:scale-110" /></div>) : (<div className="flex flex-col items-center justify-center p-2 h-full gap-1"><FileText className="h-6 w-6 text-primary/40" /><span className="text-[10px] font-bold text-center truncate w-full px-1">{attachment.name}</span></div>)}<div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"><ExternalLink className="h-4 w-4 text-white drop-shadow-md" /></div></button>
      {showRemove && onRemove && (<button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }} className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-20 hover:bg-rose-600"><X className="h-3 w-3" /></button>)}
    </div>
  );
}

interface TasksTabProps { clients: Client[]; projects: Project[]; tasks: Task[]; calendarEvents: CalendarEvent[]; onAddTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => void; onUpdateTask: (id: string, task: Partial<Task>) => void; onDeleteTask: (id: string) => void; onAddEvent: (event: Omit<CalendarEvent, 'id' | 'ownerId'>) => void; onUpdateEvent: (id: string, event: Partial<CalendarEvent>) => void; onDeleteEvent: (id: string) => void; onAddProject?: () => void; onAddClient?: () => void; canEdit?: boolean; currentEmployee: Employee | null; initialTaskId?: string | null; onClearInitialTask?: () => void; allEmployees: Employee[]; }

type SortConfig = { key: keyof Task | 'projectName' | 'clientName'; direction: 'asc' | 'desc'; } | null;

export function TasksTab({ clients, projects, tasks, calendarEvents, onAddTask, onUpdateTask, onDeleteTask, onAddEvent, onUpdateEvent, onDeleteEvent, onAddProject, onAddClient, canEdit = true, currentEmployee, initialTaskId, onClearInitialTask, allEmployees }: TasksTabProps) {
  const { user } = useUser();
  const { checklistTemplate, dataRootId } = useLedgerData();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false); const [editingId, setEditingId] = useState<string | null>(null); const [viewingTask, setViewingTask] = useState<Task | null>(null); const [sortConfig, setSortConfig] = useState<SortConfig>(null); const [showCalendar, setShowCalendar] = useState(false);
  const [taskName, setTaskName] = useState(''); const [projectId, setProjectId] = useState(''); const [description, setDescription] = useState(''); const [assignedTo, setAssignedTo] = useState<EmployeeName>('Jeff Dillon'); const [priority, setPriority] = useState<Priority>('Medium'); const [deadline, setDeadline] = useState(''); const [isHardDeadline, setIsHardDeadline] = useState(false); const [status, setStatus] = useState<TaskStatus>('Unassigned'); const [category, setCategory] = useState<TaskCategory>('Project Related'); const [estimatedHours, setEstimatedHours] = useState('0'); const [subTasks, setSubTasks] = useState<SubTask[]>([]); const [attachments, setAttachments] = useState<Attachment[]>([]); const [newSubTask, setNewSubTask] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sortedProjects = useMemo(() => [...projects].sort((a, b) => a.name.localeCompare(b.name)), [projects]);
  const [isCommentDialogOpen, setIsCommentDialogOpen] = useState(false); const [activeTaskId, setActiveTaskId] = useState<string | null>(null); const [newComment, setNewComment] = useState('');

  useEffect(() => { if (initialTaskId) { const task = tasks.find(t => t.id === initialTaskId); if (task) { setViewingTask(task); if (onClearInitialTask) onClearInitialTask(); } } }, [initialTaskId, tasks, onClearInitialTask]);

  useEffect(() => {
    if (taskName === "Construction Documents" && subTasks.length === 0) {
      const flatTasks: SubTask[] = [];
      checklistTemplate.forEach((cat: any) => { cat.subTasks.forEach((sub: any) => { flatTasks.push({ id: Math.random().toString(36).substr(2, 9), text: `[${cat.label}] ${sub.label}`, completed: false, attachments: [] }); }); });
      if (flatTasks.length > 0) { setSubTasks(flatTasks); setEstimatedHours("20"); setPriority('High'); }
    }
  }, [taskName, subTasks.length, checklistTemplate]);

  const resetForm = () => { setEditingId(null); setTaskName(''); setProjectId(''); setDescription(''); setAssignedTo('Jeff Dillon'); setPriority('Medium'); setDeadline(''); setIsHardDeadline(false); setStatus('Unassigned'); setCategory('Project Related'); setEstimatedHours('0'); setSubTasks([]); setAttachments([]); setNewSubTask(''); setIsEditing(false); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault(); if (!canEdit || !taskName) return;
    const selectedProject = projects.find(p => p.id === projectId);
    const taskData = { name: taskName, projectId: projectId || '', clientId: selectedProject?.clientId || '', description, assignedTo, priority, deadline, isHardDeadline, status, category, estimatedHours: parseFloat(estimatedHours) || 0, subTasks: [...subTasks], attachments, comments: editingId ? tasks.find(t => t.id === editingId)?.comments || [] : [] };
    if (editingId) onUpdateTask(editingId, taskData); else onAddTask(taskData);
    resetForm();
  };

  const handleEdit = (task: Task) => { if (!canEdit) return; setEditingId(task.id); setTaskName(task.name || task.description || ''); setProjectId(task.projectId || ''); setDescription(task.description || ''); setAssignedTo(task.assignedTo); setPriority(task.priority); setDeadline(task.deadline); setIsHardDeadline(!!task.isHardDeadline); setStatus(task.status); setCategory(task.category || 'Project Related'); setEstimatedHours(task.estimatedHours?.toString() || '0'); setSubTasks(task.subTasks || []); setAttachments(task.attachments || []); setIsEditing(true); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const handleShare = async (task: Task) => { 
    if (!user?.id) return; 
    if (!task.shared) onUpdateTask(task.id, { shared: true }); 
    
    const ledgerRoot = dataRootId || user.id;
    const shareLink = `${window.location.origin}/shared-task/${ledgerRoot}/${task.id}`;
    const subject = `Task Assignment: ${task.name || 'Untitled Task'}`;
    
    // Resolve employee email
    const assignedEmployee = allEmployees.find(e => `${e.firstName} ${e.lastName}`.trim() === task.assignedTo);
    
    if (assignedEmployee?.email) {
      toast({ title: "Sending Notification", description: `Delivering task brief to ${assignedEmployee.email}...` });
      
      const emailContent = `
        <div style="font-family: sans-serif; color: #1F2A2E;">
          <h2 style="color: #8E2431;">New Task Assignment</h2>
          <p>You have been assigned a new mission in the Designer's Ink Command Center.</p>
          <div style="background: #f4f4f4; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Task:</strong> ${task.name || 'Untitled'}</p>
            <p><strong>Deadline:</strong> ${task.deadline || '—'}</p>
            <p><strong>Priority:</strong> ${task.priority}</p>
            <p style="margin-top: 10px;">${task.description || ''}</p>
          </div>
          <a href="${shareLink}" style="display: inline-block; background: #8E2431; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">View Shared Task Link</a>
          <p style="font-size: 10px; color: #666; margin-top: 30px;">Designer's Ink Command Center • Professional Ledger</p>
        </div>
      `;

      const result = await sendEmail({
        to: assignedEmployee.email,
        subject,
        html: emailContent
      });

      if (result.success) {
        toast({ title: "Email Sent", description: "Task briefed successfully via Resend." });
      } else {
        toast({ variant: "destructive", title: "Email Failed", description: "Resend error. Falling back to manual compose." });
      }
    }

    // Manual fallback
    const mailtoSubject = encodeURIComponent(subject);
    const mailtoBody = encodeURIComponent(`You have been assigned a new task: "${task.name || task.description}"\n\nYou can view the task and update its status here: ${shareLink}`);
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${mailtoSubject}&body=${mailtoBody}`, '_blank'); 
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, subTaskId?: string) => { if (!canEdit) return; const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (event) => { const dataUrl = event.target?.result as string; const newAttachment: Attachment = { id: Math.random().toString(36).substr(2, 9), name: file.name, size: file.size, type: file.type, url: dataUrl }; if (subTaskId) setSubTasks(prev => prev.map(st => st.id === subTaskId ? { ...st, attachments: [...(st.attachments || []), newAttachment] } : st)); else setAttachments(prev => [...prev, newAttachment]); }; reader.readAsDataURL(file); if (e.target) e.target.value = ''; };

  const removeAttachment = (id: string, subTaskId?: string) => { if (!canEdit) return; if (subTaskId) setSubTasks(prev => prev.map(st => st.id === subTaskId ? { ...st, attachments: st.attachments?.filter(a => a.id !== id) } : st)); else setAttachments(prev => prev.filter(a => a.id !== id)); };

  const addSubTask = () => { if (!canEdit || !newSubTask.trim()) return; setSubTasks(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), text: newSubTask, completed: false, attachments: [] }]); setNewSubTask(''); };

  const toggleSubTask = (id: string) => { if (!canEdit) return; setSubTasks(prev => prev.map(st => st.id === id ? { ...st, completed: !st.completed } : st)); };

  const removeSubTask = (id: string) => { if (!canEdit) return; setSubTasks(prev => prev.filter(st => st.id !== id)); };

  const handleAddComment = () => { if (!canEdit || !activeTaskId || !newComment.trim()) return; const task = tasks.find(t => t.id === activeTaskId); if (!task) return; const comment: Comment = { userName: "Designer", text: newComment, timestamp: new Date().toISOString() }; onUpdateTask(activeTaskId, { comments: [...(task.comments || []), comment] }); setNewComment(''); setIsCommentDialogOpen(false); };

  const getPriorityColor = (p: Priority) => { switch (p) { case 'High': return 'bg-rose-500/10 text-rose-500 border-rose-500/20'; case 'Medium': return 'bg-amber-500/10 text-amber-500 border-amber-500/20'; default: return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'; } };

  const getStatusColor = (s: TaskStatus) => { switch (s) { case 'Completed': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'; case 'Need Review': return 'bg-rose-500/10 text-rose-500 border-rose-500/20'; case 'In Progress': return 'bg-sky-500/10 text-sky-500 border-sky-500/20'; case 'Assigned': return 'bg-purple-500/10 text-purple-500 border-purple-500/20'; default: return 'bg-muted text-muted-foreground'; } };

  const handleSort = (key: SortConfig['key']) => { setSortConfig(current => (current?.key === key) ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }); };

  const sortedTasks = useMemo(() => {
    let items = [...tasks]; const currentFullName = currentEmployee ? `${currentEmployee.firstName} ${currentEmployee.lastName}` : '';
    items.sort((a, b) => { const aIsMe = a.assignedTo === currentFullName; const bIsMe = b.assignedTo === currentFullName; if (aIsMe && !bIsMe) return -1; if (!aIsMe && bIsMe) return 1; if (sortConfig !== null) { let aValue: any = a[sortConfig.key as keyof Task]; let bValue: any = b[sortConfig.key as keyof Task]; if (sortConfig.key === 'projectName') { aValue = projects.find(p => p.id === a.projectId)?.name || ''; bValue = projects.find(p => p.id === b.projectId)?.name || ''; } else if (sortConfig.key === 'clientName') { aValue = clients.find(c => c.id === a.clientId)?.name || ''; bValue = clients.find(c => c.id === b.clientId)?.name || ''; } if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1; if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1; } else { if (!a.deadline && b.deadline) return 1; if (a.deadline && !b.deadline) return -1; if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline); } return 0; });
    return items;
  }, [tasks, sortConfig, projects, clients, currentEmployee]);

  const SortIcon = ({ column }: { column: SortConfig['key'] }) => { if (sortConfig?.key !== column) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-30" />; return sortConfig.direction === 'asc' ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />; };

  const isJeff = useMemo(() => {
    const email = String(currentEmployee?.email || '').toLowerCase().trim();
    if (email === 'jeff@designersink.us') return true;
    const fn = String(currentEmployee?.firstName || '').toLowerCase();
    const ln = String(currentEmployee?.lastName || '').toLowerCase();
    return fn.includes('jeff') && ln.includes('dillon');
  }, [currentEmployee]);

  const myOpenTasks = useMemo(() => {
    const fn = String(currentEmployee?.firstName || '').toLowerCase().trim();
    const ln = String(currentEmployee?.lastName || '').toLowerCase().trim();
    const full = `${fn} ${ln}`.trim();
    if (!fn) return [];
    const mine = tasks.filter(t => t.status !== 'Completed' && String(t.assignedTo || '').toLowerCase().includes(fn) && (full ? String(t.assignedTo || '').toLowerCase().includes(ln) : true));
    return mine.length ? mine : tasks.filter(t => t.status !== 'Completed');
  }, [tasks, currentEmployee]);

  const [cmdHorizonDays, setCmdHorizonDays] = useState(7);
  const [cmdReplaceExisting, setCmdReplaceExisting] = useState(true);
  const [cmdAiLoading, setCmdAiLoading] = useState(false);

  const localDateFromYmd = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number);
    if (!y || !m || !d) return startOfDay(new Date());
    return startOfDay(new Date(y, m - 1, d));
  };

  const runCommandAi = useCallback(async () => {
    const anchor = new Date().toISOString().slice(0, 10);
    const windowStart = localDateFromYmd(anchor);
    const windowEnd = endOfDay(addDays(windowStart, cmdHorizonDays - 1));

    const nonCommandEvents = calendarEvents.filter(e => e.type !== 'CommandBlock');
    const prepBlocks = nonCommandEvents
      .filter(e => e.type !== 'TaskBlock')
      .map(e => {
        const s = parseISO(e.startTime);
        if (isNaN(s.getTime())) return null;
        const ps = subMinutes(s, 30);
        return { startTime: ps.toISOString(), endTime: s.toISOString(), title: `Prep: ${e.title || 'Meeting'}` };
      })
      .filter(Boolean) as { startTime: string; endTime: string; title: string }[];

    const busySlots = [...nonCommandEvents.map(e => ({ startTime: e.startTime, endTime: e.endTime, title: e.title })), ...prepBlocks].slice(0, 220);

    const payloadTasks = myOpenTasks.map(t => ({
      id: t.id,
      name: t.name || t.description?.slice(0, 80),
      description: (t.description || '').slice(0, 500),
      priority: t.priority,
      deadline: t.deadline || '',
      isHardDeadline: !!t.isHardDeadline,
      estimatedHours: t.estimatedHours ?? 0,
      category: t.category || '',
      status: t.status,
    }));

    setCmdAiLoading(true);
    try {
      const res = await fetch('/api/gemini/command-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planningAnchorDate: anchor, horizonDays: cmdHorizonDays, tasks: payloadTasks, busySlots }),
      });
      const raw = await res.text();
      let data: any;
      try { data = JSON.parse(raw); } catch { throw new Error(`AI returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 200)}`); }
      if (!res.ok) throw new Error(String(data?.error || `AI failed (HTTP ${res.status})`));

      const blocks = Array.isArray(data.blocks) ? data.blocks : [];
      if (blocks.length === 0) throw new Error('AI returned 0 blocks');

      if (cmdReplaceExisting) {
        const toRemove = calendarEvents.filter(e => e.type === 'CommandBlock').filter(e => {
          const s = parseISO(e.startTime);
          return !isNaN(s.getTime()) && isWithinInterval(s, { start: windowStart, end: windowEnd });
        });
        toRemove.forEach(e => onDeleteEvent(e.id));
      }

      // Always add prep blocks deterministically.
      prepBlocks.forEach(p => {
        const s = parseISO(p.startTime);
        if (!isNaN(s.getTime()) && isWithinInterval(s, { start: windowStart, end: windowEnd })) {
          onAddEvent({ title: p.title, description: '[Auto-added prep time before meeting — edit as needed]', type: 'CommandBlock', visibility: 'Private', startTime: p.startTime, endTime: p.endTime, aiGenerated: true });
        }
      });

      blocks.forEach((b: any) => {
        const taskId = String(b.taskId || '').trim();
        const task = taskId ? myOpenTasks.find(t => t.id === taskId) : undefined;
        const projName = task?.projectId ? (projects.find(p => p.id === task.projectId)?.name || 'General') : 'General';
        const taskTitle = (task?.name || task?.description || String(b.title || 'Task')).trim();
        const title = task ? `Focus: ${projName} — ${taskTitle}` : String(b.title || 'Block');
        onAddEvent({
          title: title.slice(0, 160),
          description: String(b.notes || ''),
          type: 'CommandBlock',
          visibility: 'Private',
          startTime: String(b.startTime || ''),
          endTime: String(b.endTime || ''),
          taskId: task?.id,
          projectIds: task?.projectId ? [task.projectId] : [],
          clientIds: task?.clientId ? [task.clientId] : [],
          aiGenerated: true,
        });
      });

      toast({ title: 'Command blocks generated', description: 'Blocks added to Command Calendar. Drag to adjust.' });
    } catch (e: any) {
      // If Gemini is slow/unavailable, do a simple offline fill to still produce blocks.
      const msg = String(e?.message || e || 'AI failed');
      const timeout = msg.toLowerCase().includes('timed out') || msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('gateway');
      if (!timeout) {
        toast({ variant: 'destructive', title: 'AI failed', description: msg });
        return;
      }

      const busy: Array<{ start: Date; end: Date }> = [];
      nonCommandEvents.forEach(ev => {
        const s = parseISO(ev.startTime); const en = parseISO(ev.endTime);
        if (!isNaN(s.getTime()) && !isNaN(en.getTime())) { busy.push({ start: s, end: en }); if (ev.type !== 'TaskBlock') busy.push({ start: subMinutes(s, 30), end: s }); }
      });
      const isBusy = (s: Date, en: Date) => busy.some(b => s < b.end && en > b.start);

      if (cmdReplaceExisting) {
        calendarEvents.filter(e => e.type === 'CommandBlock').forEach(e => {
          const s = parseISO(e.startTime);
          if (!isNaN(s.getTime()) && isWithinInterval(s, { start: windowStart, end: windowEnd })) onDeleteEvent(e.id);
        });
      }

      // Admin block 1:30-6 if free
      const day0 = startOfDay(new Date());
      const adminStart = new Date(day0); adminStart.setHours(13, 30, 0, 0);
      const adminEnd = new Date(day0); adminEnd.setHours(18, 0, 0, 0);
      if (!isBusy(adminStart, adminEnd)) {
        onAddEvent({ title: 'Admin focus', description: '[Offline fallback]', type: 'CommandBlock', visibility: 'Private', startTime: adminStart.toISOString(), endTime: adminEnd.toISOString(), aiGenerated: true });
        busy.push({ start: adminStart, end: adminEnd });
      }

      // Fill focus blocks starting 6pm today through 4:30am next day
      let cursor = new Date(day0); cursor.setHours(18, 0, 0, 0);
      const shiftEnd = new Date(day0); shiftEnd.setDate(shiftEnd.getDate() + 1); shiftEnd.setHours(4, 30, 0, 0);
      const queue = [...myOpenTasks];
      while (cursor < shiftEnd && queue.length) {
        while (cursor < shiftEnd && isBusy(cursor, addMinutes(cursor, 15))) cursor = addMinutes(cursor, 15);
        if (cursor >= shiftEnd) break;
        const t = queue[0];
        const projName = t.projectId ? (projects.find(p => p.id === t.projectId)?.name || 'General') : 'General';
        const taskTitle = (t.name || t.description || 'Task').trim();
        const mins = 60;
        const end = addMinutes(cursor, mins);
        if (end <= shiftEnd && !isBusy(cursor, end)) {
          onAddEvent({ title: `Focus: ${projName} — ${taskTitle}`.slice(0, 160), description: '[Offline fallback due to Gemini timeout]', type: 'CommandBlock', visibility: 'Private', startTime: cursor.toISOString(), endTime: end.toISOString(), taskId: t.id, projectIds: t.projectId ? [t.projectId] : [], clientIds: t.clientId ? [t.clientId] : [], aiGenerated: true });
          busy.push({ start: cursor, end });
          queue.shift();
          cursor = end;
        } else cursor = addMinutes(cursor, 15);
      }

      toast({ title: 'Command blocks generated', description: 'Gemini timed out — used offline fallback. Drag to adjust.' });
    } finally {
      setCmdAiLoading(false);
    }
  }, [calendarEvents, cmdHorizonDays, cmdReplaceExisting, myOpenTasks, onAddEvent, onDeleteEvent, projects, toast]);

  return (
    <>
      {showCalendar ? (
      <div className="space-y-6">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h2 className="text-3xl font-headline font-bold text-foreground flex items-center gap-3">
              <CalendarIcon className="h-8 w-8 text-primary" /> Command Calendar
            </h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Schedule and review Command blocks here (Tasks tab only). Each block shows project, task, and a <span className="font-semibold text-foreground">View task</span> link when the block is linked to a task.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {isJeff ? (
              <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-card/30 p-2">
                <Label className="text-[10px] uppercase text-muted-foreground">Horizon</Label>
                <select className="h-9 rounded-md border bg-background px-2 text-sm font-bold" value={cmdHorizonDays} onChange={(e) => setCmdHorizonDays(parseInt(e.target.value, 10) || 7)}>
                  {[3,5,7,10,14].map(d => <option key={d} value={d}>{d} days</option>)}
                </select>
                <div className="flex items-center gap-2">
                  <Checkbox id="cmd-replace-tasks" checked={cmdReplaceExisting} onCheckedChange={(c) => setCmdReplaceExisting(!!c)} />
                  <Label htmlFor="cmd-replace-tasks" className="text-xs cursor-pointer">Replace</Label>
                </div>
                <Button type="button" className="gap-2" disabled={cmdAiLoading} onClick={() => void runCommandAi()}>
                  {cmdAiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Generate
                </Button>
              </div>
            ) : null}
            <Button variant="outline" onClick={() => setShowCalendar(false)}>Back to Task List</Button>
          </div>
        </div>
        <TaskCalendar
          tasks={myOpenTasks}
          linkedTaskLookup={tasks}
          calendarEvents={calendarEvents}
          clients={clients}
          projects={projects}
          onAddEvent={onAddEvent}
          onUpdateEvent={onUpdateEvent}
          onDeleteEvent={onDeleteEvent}
          canEdit={canEdit}
          commandCalendarMode
          onOpenTask={(taskId) => {
            const t = tasks.find((x) => x.id === taskId);
            if (t) setViewingTask(t);
          }}
        />
      </div>
      ) : (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4"><div><h2 className="text-3xl font-headline font-bold text-foreground">Task Management</h2><p className="text-sm text-muted-foreground">Log tasks, track estimates, and manage your schedule.</p></div><Button onClick={() => setShowCalendar(true)} variant="default" className="gap-2"><CalendarIcon className="h-4 w-4" /> Open Command Calendar</Button></div>
      {canEdit && !isEditing && (
        <Card className="border-border/50 shadow-xl overflow-hidden">
          <CardHeader className="bg-muted/50"><CardTitle className="font-headline text-3xl text-accent">Create New Task</CardTitle></CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-2 lg:col-span-2"><Label>Task Name</Label><select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm font-bold" value={taskName} onChange={e => setTaskName(e.target.value)} required><option value="">Select a task...</option>{TASK_NAME_OPTIONS.map(opt => (<option key={opt} value={opt}>{opt}</option>))}</select></div>
              <div className="space-y-2"><Label>Category</Label><select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm font-bold" value={category} onChange={e => setCategory(e.target.value as any)}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
              <div className="space-y-2"><Label>Project (Optional)</Label><div className="flex gap-2"><select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm font-bold" value={projectId} onChange={e => setProjectId(e.target.value)}><option value="">No Project Related</option>{sortedProjects.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}</select><Button type="button" variant="outline" size="icon" onClick={onAddProject}><Plus className="h-4 w-4" /></Button></div></div>
              <div className="space-y-2"><Label>Assign To</Label><select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm font-bold" value={assignedTo} onChange={e => setAssignedTo(e.target.value as any)}>{EMPLOYEES.map(e => <option key={e} value={e}>{e}</option>)}</select></div>
              <div className="space-y-2"><Label>Deadline</Label><Input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} required /><div className="flex items-center space-x-2 pt-1"><Checkbox id="hard-deadline-new" checked={isHardDeadline} onCheckedChange={(checked) => { setIsHardDeadline(!!checked); if (checked) setPriority('High'); }} /><Label htmlFor="hard-deadline-new" className="text-xs font-bold text-rose-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Hard Deadline</Label></div></div>
              <div className="space-y-2"><Label>Priority</Label><select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm font-bold" value={priority} onChange={e => setPriority(e.target.value as any)} disabled={isHardDeadline}>{PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
              <div className="space-y-2"><Label>Estimated Time (Hours / e.g. 1:30)</Label><Input type="text" value={estimatedHours} onChange={e => setEstimatedHours(e.target.value)} onBlur={(e) => setEstimatedHours(parseTimeToDecimal(e.target.value).toFixed(2))} required /></div>
              <div className="space-y-2 lg:col-span-4"><div className="flex justify-between items-center mb-1"><Label>Task Details</Label><Button type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}><Paperclip className="h-3 w-3" /> Attach File</Button><input type="file" ref={fileInputRef} className="hidden" onChange={(e) => handleFileUpload(e)} /></div><Textarea value={description} onChange={e => setDescription(e.target.value)} className="h-20" />{attachments.length > 0 && (<div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 mt-2">{attachments.map(a => (<AttachmentThumbnail key={a.id} attachment={a} showRemove={true} onRemove={() => removeAttachment(a.id)} />))}</div>)}</div>
              <div className="lg:col-span-4 space-y-4"><Label>Sub-Tasks (Detailed Requirements)</Label><div className="flex gap-2"><Input placeholder="Add a custom step..." value={newSubTask} onChange={e => setNewSubTask(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSubTask())} /><Button type="button" variant="outline" size="icon" onClick={addSubTask}><Plus className="h-4 w-4" /></Button></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{subTasks.map(st => (<div key={st.id} className="flex items-center justify-between p-3 rounded-lg border bg-card/50"><div className="flex items-center gap-2"><Checkbox checked={st.completed} onCheckedChange={() => toggleSubTask(st.id)} /><span className={cn("text-xs", st.completed && 'line-through opacity-50')}>{st.text}</span></div><Button type="button" variant="ghost" size="icon" className="text-rose-500 h-8 w-8" onClick={() => removeSubTask(st.id)}><Trash2 className="h-4 w-4" /></Button></div>))}</div></div>
              <div className="lg:col-span-4 flex justify-end"><Button type="submit" className="bg-primary px-8 h-11">Save Task</Button></div>
            </form>
          </CardContent>
        </Card>
      )}
      {isEditing && (
        <Card className="border-primary/50 shadow-xl overflow-hidden ring-2 ring-primary/20">
          <CardHeader className="bg-primary/10 flex flex-row items-center justify-between"><CardTitle className="text-primary font-headline">Edit Task</CardTitle><Button variant="ghost" size="sm" onClick={resetForm}>Cancel</Button></CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-2 lg:col-span-2"><Label>Task Name</Label><select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm font-bold" value={taskName} onChange={e => setTaskName(e.target.value)} required>{TASK_NAME_OPTIONS.map(opt => (<option key={opt} value={opt}>{opt}</option>))}</select></div>
              <div className="space-y-2"><Label>Category</Label><select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm font-bold" value={category} onChange={e => setCategory(e.target.value as any)}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
              <div className="space-y-2"><Label>Assign To</Label><select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm font-bold" value={assignedTo} onChange={e => setAssignedTo(e.target.value as any)}>{EMPLOYEES.map(e => <option key={e} value={e}>{e}</option>)}</select></div>
              <div className="space-y-2"><Label>Deadline</Label><Input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} required /><div className="flex items-center space-x-2 pt-1"><Checkbox id="hard-deadline-edit" checked={isHardDeadline} onCheckedChange={(checked) => { setIsHardDeadline(!!checked); if (checked) setPriority('High'); }} /><Label htmlFor="hard-deadline-edit" className="text-xs font-bold text-rose-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Hard Deadline</Label></div></div>
              <div className="space-y-2"><Label>Priority</Label><select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm font-bold" value={priority} onChange={e => setPriority(e.target.value as any)} disabled={isHardDeadline}>{PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
              <div className="space-y-2"><Label>Status</Label><select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm font-bold" value={status} onChange={e => setStatus(e.target.value as any)}>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
              <div className="space-y-2"><Label>Estimated Time (Hours / e.g. 1:30)</Label><Input type="text" value={estimatedHours} onChange={e => setEstimatedHours(e.target.value)} onBlur={(e) => setEstimatedHours(parseTimeToDecimal(e.target.value).toFixed(2))} /></div>
              <div className="space-y-2 lg:col-span-4"><div className="flex justify-between items-center mb-1"><Label>Task Details</Label><Button type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}><Paperclip className="h-3 w-3" /> Attach File</Button><input type="file" ref={fileInputRef} className="hidden" onChange={(e) => handleFileUpload(e)} /></div><Textarea value={description} onChange={e => setDescription(e.target.value)} className="h-20" />{attachments.length > 0 && (<div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 mt-2">{attachments.map(a => (<AttachmentThumbnail key={a.id} attachment={a} showRemove={true} onRemove={() => removeAttachment(a.id)} />))}</div>)}</div>
              <div className="lg:col-span-4 space-y-4"><Label>Sub-Tasks</Label><div className="flex gap-2"><Input placeholder="Add a step..." value={newSubTask} onChange={e => setNewSubTask(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSubTask())} /><Button type="button" variant="outline" size="icon" onClick={addSubTask}><Plus className="h-4 w-4" /></Button></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{subTasks.map(st => (<div key={st.id} className="flex flex-col p-3 rounded-lg border bg-card/50 gap-3"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Checkbox checked={st.completed} onCheckedChange={() => toggleSubTask(st.id)} /><span className={cn("text-xs", st.completed && 'line-through opacity-50')}>{st.text}</span></div><Button type="button" variant="ghost" size="icon" className="text-rose-500" onClick={() => removeSubTask(st.id)}><Trash2 className="h-3 w-3" /></Button></div></div>))}</div></div>
              <div className="lg:col-span-4 flex justify-end"><Button type="submit" className="bg-primary px-8 h-11">Update Task</Button></div>
            </form>
          </CardContent>
        </Card>
      )}
      <Card className="border-border/40 bg-card/40 backdrop-blur-sm shadow-md overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/15 border-b border-border/40">
              <TableRow className="border-border/30 hover:bg-transparent">
                <TableHead onClick={() => handleSort('updatedAt')} className="cursor-pointer hover:bg-muted/25 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground"><div className="flex items-center">Activity <SortIcon column="updatedAt" /></div></TableHead>
                <TableHead onClick={() => handleSort('projectName')} className="cursor-pointer hover:bg-muted/25 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground"><div className="flex items-center">Project <SortIcon column="projectName" /></div></TableHead>
                <TableHead onClick={() => handleSort('name')} className="cursor-pointer hover:bg-muted/25 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground min-w-[220px]"><div className="flex items-center">Task <SortIcon column="name" /></div></TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Est.</TableHead>
                <TableHead onClick={() => handleSort('assignedTo')} className="cursor-pointer hover:bg-muted/25 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground"><div className="flex items-center">Assignee <SortIcon column="assignedTo" /></div></TableHead>
                <TableHead onClick={() => handleSort('priority')} className="cursor-pointer hover:bg-muted/25 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground"><div className="flex items-center">Priority <SortIcon column="priority" /></div></TableHead>
                <TableHead onClick={() => handleSort('deadline')} className="cursor-pointer hover:bg-muted/25 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground"><div className="flex items-center">Deadline <SortIcon column="deadline" /></div></TableHead>
                <TableHead onClick={() => handleSort('status')} className="cursor-pointer hover:bg-muted/25 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground"><div className="flex items-center">Status <SortIcon column="status" /></div></TableHead>
                <TableHead className="w-24 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTasks.map(task => {
                const isOverdue = task.deadline && isPast(startOfDay(parseISO(task.deadline))) && task.status !== 'Completed';
                const descPreview = (task.description || '').trim();
                const nameInList = Boolean(task.name && (TASK_NAME_OPTIONS as readonly string[]).includes(task.name));
                return (
                  <TableRow key={task.id} className={cn("border-border/30 hover:bg-muted/20 transition-colors group", task.isHardDeadline && "bg-rose-500/[0.06]")}>
                    <TableCell className="py-3 text-xs text-muted-foreground whitespace-nowrap align-top"><Clock className="h-3.5 w-3.5 inline mr-1 opacity-70" /> {new Date(task.updatedAt).toLocaleDateString()}</TableCell>
                    <TableCell className="py-3 align-top"><select className={cn("w-full rounded-md border border-transparent bg-background/40 hover:bg-background/60 hover:border-border/40 focus:border-primary/40 px-2 py-1.5 text-xs font-medium text-foreground transition-all outline-none", (isOverdue || task.isHardDeadline) && "text-rose-600 dark:text-rose-400")} value={task.projectId} onChange={(e) => { const pid = e.target.value; const proj = projects.find(p => p.id === pid); onUpdateTask(task.id, { projectId: pid, clientId: proj?.clientId || '' }); }} disabled={!canEdit}><option value="">No project</option>{sortedProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></TableCell>
                    <TableCell className="py-3 min-w-[200px] max-w-[320px] align-top">
                      <div className="space-y-1.5 px-0.5">
                        <div className="flex items-start gap-2">
                          <select
                            className={cn(
                              'flex-1 min-w-0 rounded-md border border-transparent bg-background/40 hover:bg-background/60 hover:border-border/40 focus:border-primary/40 py-1.5 px-2 text-sm font-medium text-foreground transition-all outline-none',
                              (isOverdue || task.isHardDeadline) && 'text-rose-600 dark:text-rose-400',
                            )}
                            value={nameInList ? task.name : (task.name || '')}
                            onChange={(e) => onUpdateTask(task.id, { name: e.target.value })}
                            disabled={!canEdit}
                          >
                            <option value="">Custom / other…</option>
                            {!nameInList && task.name ? <option value={task.name}>{task.name}</option> : null}
                            {TASK_NAME_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                          {task.isHardDeadline ? <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-500 mt-2" title="Hard deadline" /> : null}
                          {(task.attachments?.length || 0) > 0 || (task.subTasks?.length || 0) > 0 ? (
                            <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-2 opacity-60" title="Has attachments or sub-tasks" />
                          ) : null}
                        </div>
                        {descPreview ? (
                          <p className="text-xs font-normal text-muted-foreground leading-relaxed line-clamp-3 pl-0.5" title={descPreview}>
                            {descPreview}
                          </p>
                        ) : (
                          <p className="text-xs font-normal text-muted-foreground/40 italic pl-0.5">No description</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-3 align-top"><input type="text" className="w-full max-w-[4.5rem] ml-auto block rounded-md border border-transparent bg-background/40 hover:border-border/40 focus:border-primary/40 px-2 py-1.5 text-right text-xs font-medium text-foreground tabular-nums outline-none transition-all" value={task.estimatedHours} onChange={(e) => onUpdateTask(task.id, { estimatedHours: parseFloat(e.target.value) || 0 })} onBlur={(e) => onUpdateTask(task.id, { estimatedHours: parseTimeToDecimal(e.target.value) })} disabled={!canEdit} /></TableCell>
                    <TableCell className="py-3 align-top"><select className={cn("w-full rounded-md border border-transparent bg-background/40 hover:bg-background/60 hover:border-border/40 focus:border-primary/40 px-2 py-1.5 text-xs font-medium text-foreground transition-all outline-none", (isOverdue || task.isHardDeadline) && "text-rose-600 dark:text-rose-400")} value={task.assignedTo} onChange={(e) => onUpdateTask(task.id, { assignedTo: e.target.value as any })} disabled={!canEdit}>{EMPLOYEES.map(e => <option key={e} value={e}>{e}</option>)}</select></TableCell>
                    <TableCell className="py-3 align-top"><select className={cn("w-full rounded-md border border-border/30 bg-background/40 px-2 py-1.5 text-xs font-medium transition-all outline-none", getPriorityColor(task.priority))} value={task.priority} onChange={(e) => onUpdateTask(task.id, { priority: e.target.value as any })} disabled={!canEdit || task.isHardDeadline}>{PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}</select></TableCell>
                    <TableCell className="py-3 align-top"><div className="flex flex-col gap-0.5"><input type="date" className={cn("w-full rounded-md border border-transparent bg-background/40 hover:border-border/40 focus:border-primary/40 px-2 py-1.5 text-xs font-medium text-foreground outline-none transition-all", isOverdue && "text-rose-600 dark:text-rose-400", task.isHardDeadline && !isOverdue && "text-rose-500/90")} value={task.deadline} onChange={(e) => onUpdateTask(task.id, { deadline: e.target.value })} disabled={!canEdit} />{task.isHardDeadline && (<span className="text-[10px] font-medium uppercase tracking-wide text-rose-500 px-1">Hard</span>)}</div></TableCell>
                    <TableCell className="py-3 align-top"><select className={cn("w-full rounded-md border border-border/30 bg-background/40 px-2 py-1.5 text-xs font-medium transition-all outline-none", getStatusColor(task.status))} value={task.status} onChange={(e) => onUpdateTask(task.id, { status: e.target.value as any })} disabled={!canEdit}>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></TableCell>
                    <TableCell className="py-3 align-top"><div className="flex gap-0.5 justify-end flex-wrap"><Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setViewingTask(task)} title="View full task"><Eye className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => handleShare(task)} title="Email assignee a summary and shared link (also opens Gmail compose)"><Send className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500/90 hover:text-rose-600" onClick={() => onDeleteTask(task.id)} disabled={!canEdit} title="Delete task"><Trash2 className="h-4 w-4" /></Button></div></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
      )}
      <Dialog open={!!viewingTask} onOpenChange={(open) => !open && setViewingTask(null)}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto border-border/50 bg-card">{viewingTask && (<div className="space-y-6"><DialogHeader><div className="flex justify-between items-start gap-4"><div className="space-y-1"><Badge variant="outline" className={cn("text-[10px] font-semibold uppercase tracking-wide", getStatusColor(viewingTask.status))}>{viewingTask.status}</Badge><DialogTitle className="font-headline text-2xl sm:text-3xl text-foreground mt-2 leading-tight">{viewingTask.isHardDeadline && <Badge className="bg-rose-500 text-white mr-2">HARD</Badge>}{viewingTask.name || viewingTask.description || 'Task'}</DialogTitle><div className="flex flex-wrap gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1"><UserPlus className="h-3 w-3" /> {viewingTask.assignedTo}</span><span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Due {viewingTask.deadline}</span><span className="flex items-center gap-1"><Badge variant="secondary" className="text-[10px] h-4">{viewingTask.category}</Badge></span></div></div><Badge variant="outline" className={getPriorityColor(viewingTask.priority)}>{viewingTask.priority} Priority</Badge></div></DialogHeader><div className="space-y-4"><div className="space-y-2"><h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Description</h4><p className="text-sm font-normal leading-relaxed text-foreground/90 bg-muted/25 p-4 rounded-xl border border-border/40">{viewingTask.description || 'No description provided.'}</p></div><div className="space-y-3"><div className="flex items-center justify-between"><h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Checklist</h4><span className="text-xs font-medium text-muted-foreground">{viewingTask.subTasks?.filter(s => s.completed).length || 0} / {viewingTask.subTasks?.length || 0} done</span></div><ScrollArea className="h-[300px] pr-4"><div className="grid grid-cols-1 gap-2">{viewingTask.subTasks?.map(st => (<div key={st.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/15 border border-border/30 group"><Checkbox checked={st.completed} onCheckedChange={(checked) => { const newSubTasks = (viewingTask.subTasks || []).map(s => s.id === st.id ? { ...s, completed: !!checked } : s); onUpdateTask(viewingTask.id, { subTasks: newSubTasks }); }} disabled={!canEdit} className="mt-0.5" /><div className="flex-1"><span className={cn("text-sm font-normal transition-all", st.completed ? 'line-through opacity-50 text-muted-foreground' : 'text-foreground')}>{st.text}</span></div></div>))}{(!viewingTask.subTasks || viewingTask.subTasks.length === 0) && (<p className="col-span-full text-xs text-muted-foreground italic py-4 text-center border border-dashed rounded-lg">No sub-tasks logged.</p>)}</div></ScrollArea></div>{viewingTask.attachments?.length > 0 && (<div className="space-y-3"><h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Attachments</h4><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">{viewingTask.attachments.map(a => (<AttachmentThumbnail key={a.id} attachment={a} />))}</div></div>)}</div><DialogFooter className="pt-4 border-t border-border/50"><Button variant="outline" onClick={() => setViewingTask(null)}>Close View</Button><Button onClick={() => { handleEdit(viewingTask); setViewingTask(null); }} className="gap-2"><Pencil className="h-4 w-4" /> Edit Details</Button></DialogFooter></div>)}</DialogContent></Dialog>
      <Dialog open={isCommentDialogOpen} onOpenChange={setIsCommentDialogOpen}><DialogContent className="sm:max-w-[550px]"><DialogHeader><DialogTitle className="font-headline text-2xl">Task Discussion</DialogTitle></DialogHeader><div className="space-y-4 py-4 max-h-[400px] overflow-y-auto">{activeTaskId && tasks.find(t => t.id === activeTaskId)?.comments?.map((c, i) => (<div key={i} className="space-y-1 p-3 rounded-xl bg-muted/30 border border-border"><div className="flex justify-between items-center"><span className="text-xs font-bold text-accent">{c.userName}</span><span className="text-[10px] text-muted-foreground">{new Date(c.timestamp).toLocaleString()}</span></div><p className="text-sm">{c.text}</p></div>))}</div><div className="space-y-2"><Label>New Comment</Label><Textarea value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Type your message..." disabled={!canEdit} /></div><DialogFooter><Button variant="outline" onClick={() => setIsCommentDialogOpen(false)}>Close</Button><Button onClick={handleAddComment} disabled={!newComment.trim() || !canEdit}>Send</Button></DialogFooter></DialogContent></Dialog>
    </>
  );
}

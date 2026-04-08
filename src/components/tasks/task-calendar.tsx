
"use client"

import { useState, useMemo, useCallback } from 'react';
import { CalendarEvent, Task, Client, Project, CalendarEventType, CalendarVisibility, EventLocationType } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronLeft, ChevronRight, Clock, MapPin, Plus, Trash2, GripVertical, Shield, Globe, X, ExternalLink } from 'lucide-react';
import { format, addDays, subDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, parseISO, addHours, startOfMonth, endOfMonth, eachWeekOfInterval, differenceInMinutes, isSameMonth, startOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TaskCalendarProps {
  tasks: Task[];
  calendarEvents: CalendarEvent[];
  clients: Client[];
  projects: Project[];
  onAddEvent: (event: Omit<CalendarEvent, 'id' | 'ownerId'>) => void;
  onUpdateEvent: (id: string, event: Partial<CalendarEvent>) => void;
  onDeleteEvent: (id: string) => void;
  canEdit?: boolean;
  /** Private Command Calendar: only CommandBlock events, full-day grid, defaults to Private. */
  commandCalendarMode?: boolean;
  /** Optional: open linked task details when clicking a block with taskId. */
  onOpenTask?: (taskId: string) => void;
  /** Resolve taskId → task/project labels when the linked task is not in `tasks` (e.g. unscheduled queue only lists my work). */
  linkedTaskLookup?: Task[];
}

type ViewType = 'day' | 'week' | 'month';

const START_HOUR = 6;
const END_HOUR = 22;

/**
 * Command Calendar work window (overnight shift):
 * 12:00 PM (12) through 5:00 AM next day (29).
 */
const COMMAND_START_HOUR = 12;
const COMMAND_END_HOUR = 29;

const PRIORITY_WEIGHTS = { 'High': 3, 'Medium': 2, 'Low': 1 };

const EVENT_TYPES: CalendarEventType[] = ['ClientMeeting', 'CompanyEvent', 'TaskBlock', 'CommandBlock'].sort() as CalendarEventType[];

const parse24hTo12h = (dateStr: string) => {
  const date = parseISO(dateStr);
  const h = date.getHours();
  const m = date.getMinutes();
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return { 
    date: format(date, 'yyyy-MM-dd'),
    hour: hour12.toString(), 
    min: m.toString().padStart(2, '0'), 
    period 
  };
};

const parse12hToISO = (dateStr: string, hour: string, min: string, period: string) => {
  let h = parseInt(hour);
  const m = parseInt(min);
  if (period === 'PM' && h < 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  
  const date = new Date(dateStr + 'T00:00:00');
  date.setHours(h, m);
  return date.toISOString();
};

export function TaskCalendar({
  tasks,
  calendarEvents,
  clients,
  projects,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  canEdit = true,
  commandCalendarMode = false,
  onOpenTask,
  linkedTaskLookup,
}: TaskCalendarProps) {
  const [view, setView] = useState<ViewType>(() => (commandCalendarMode ? 'day' : 'week'));
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();

  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [formDate, setFormDate] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formType, setFormType] = useState<CalendarEventType>('TaskBlock');
  const [formVisibility, setFormVisibility] = useState<CalendarVisibility>('Global');
  const [formLocationType, setFormLocationType] = useState<EventLocationType>('In-Person');
  const [formTaskId, setFormTaskId] = useState('');
  const [formProjectIds, setFormProjectIds] = useState<string[]>([]);
  const [startH, setStartH] = useState('8');
  const [startM, setStartM] = useState('00');
  const [startP, setStartP] = useState('AM');
  const [endH, setEndH] = useState('9');
  const [endM, setEndM] = useState('00');
  const [endP, setEndP] = useState('AM');

  const effectiveStartHour = commandCalendarMode ? COMMAND_START_HOUR : START_HOUR;
  const effectiveEndHour = commandCalendarMode ? COMMAND_END_HOUR : END_HOUR;

  /**
   * In Command Calendar mode we show all events (appointments included) as context,
   * but only CommandBlock events are editable/movable.
   */
  const displayEvents = useMemo(() => calendarEvents, [calendarEvents]);

  const canEditEvent = useCallback(
    (event: CalendarEvent) =>
      !!canEdit && (!commandCalendarMode || event.type === 'CommandBlock'),
    [canEdit, commandCalendarMode],
  );

  const hours = Array.from(
    { length: effectiveEndHour - effectiveStartHour + 1 },
    (_, i) => effectiveStartHour + i,
  );

  const sortedProjects = useMemo(() => [...projects].sort((a, b) => a.name.localeCompare(b.name)), [projects]);

  const sortedTasksForDropdown = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const projA = projects.find(p => p.id === a.projectId)?.name || 'General';
      const projB = projects.find(p => p.id === b.projectId)?.name || 'General';
      const nameA = `${projA}: ${a.name || 'Untitled'}`;
      const nameB = `${projB}: ${b.name || 'Untitled'}`;
      return nameA.localeCompare(nameB);
    });
  }, [tasks, projects]);

  const taskLookupMap = useMemo(() => {
    const src = linkedTaskLookup ?? tasks;
    const m = new Map<string, Task>();
    for (const t of src) m.set(t.id, t);
    return m;
  }, [linkedTaskLookup, tasks]);

  /** Project + task lines for calendar cells; supports AI titles like `Focus: Project — Task`. */
  const getBlockDisplay = useCallback(
    (event: CalendarEvent) => {
      const parseFocusTitle = (title: string) => {
        const m = title.match(/^\s*Focus:\s*(.+?)\s*[—–-]\s*(.+)\s*$/i);
        if (m) return { projectPart: m[1].trim(), taskPart: m[2].trim() };
        return null;
      };

      const isWorkBlock = event.type === 'CommandBlock' || event.type === 'TaskBlock';
      let projectName = '';
      let taskTitle = event.title;
      const tid = String(event.taskId || '').trim();

      if (tid) {
        const task = taskLookupMap.get(tid);
        if (task) {
          projectName = projects.find((p) => p.id === task.projectId)?.name || '';
          taskTitle = (task.name || task.description || '').trim() || event.title;
        } else {
          const parsed = parseFocusTitle(event.title);
          if (parsed) {
            projectName = parsed.projectPart;
            taskTitle = parsed.taskPart;
          }
        }
      } else if (isWorkBlock) {
        const parsed = parseFocusTitle(event.title);
        if (parsed) {
          projectName = parsed.projectPart;
          taskTitle = parsed.taskPart;
        }
      }

      if (!projectName && event.projectIds?.length) {
        projectName = projects.find((p) => p.id === event.projectIds![0])?.name || '';
      }

      return {
        projectName,
        taskTitle,
        linkedTaskId: tid || undefined,
        showViewTask: !!(tid && onOpenTask),
      };
    },
    [commandCalendarMode, onOpenTask, projects, taskLookupMap],
  );

  const days = useMemo(() => {
    if (view === 'day') return [currentDate];
    if (view === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 0 });
      const end = endOfWeek(currentDate, { weekStartsOn: 0 });
      return eachDayOfInterval({ start, end });
    }
    return []; 
  }, [view, currentDate]);

  const scheduledTaskIds = useMemo(() => {
    const src = commandCalendarMode
      ? calendarEvents.filter((e) => e.type === 'CommandBlock')
      : calendarEvents;
    return new Set(src.map((e) => e.taskId).filter(Boolean) as string[]);
  }, [calendarEvents, commandCalendarMode]);

  const sortedUnscheduledTasks = useMemo(() => {
    return tasks
      .filter((t) => t.status !== 'Completed')
      .filter((t) => !scheduledTaskIds.has(t.id))
      .sort((a, b) => {
        if (a.deadline && b.deadline) {
          if (a.deadline !== b.deadline) return a.deadline.localeCompare(b.deadline);
        } else if (a.deadline) return -1;
        else if (b.deadline) return 1;
        const weightA = PRIORITY_WEIGHTS[a.priority as keyof typeof PRIORITY_WEIGHTS] || 0;
        const weightB = PRIORITY_WEIGHTS[b.priority as keyof typeof PRIORITY_WEIGHTS] || 0;
        return weightB - weightA;
      });
  }, [tasks, scheduledTaskIds]);

  const resetForm = (defaults?: Partial<CalendarEvent>) => {
    setEditingEventId(null);
    setFormDate(defaults?.startTime?.split('T')[0] || new Date().toISOString().split('T')[0]);
    setFormTitle('');
    setFormDesc('');
    setFormType(commandCalendarMode ? 'CommandBlock' : 'TaskBlock');
    setFormVisibility(commandCalendarMode ? 'Private' : 'Global');
    setFormLocationType('In-Person');
    setFormTaskId('');
    setFormProjectIds([]);
    setStartH('8'); setStartM('00'); setStartP('AM');
    setEndH('9'); setEndM('00'); setEndP('AM');
  };

  const handlePrev = () => {
    if (view === 'day') setCurrentDate(subDays(currentDate, 1));
    else if (view === 'week') setCurrentDate(subDays(currentDate, 7));
    else setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNext = () => {
    if (view === 'day') setCurrentDate(addDays(currentDate, 1));
    else if (view === 'week') setCurrentDate(addDays(currentDate, 7));
    else setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const onDragStartTask = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'task', id: taskId }));
    e.dataTransfer.effectAllowed = 'copy';
    setIsDragging(true);
  };

  const onDragStartEvent = (e: React.DragEvent, eventId: string) => {
    const ev = displayEvents.find((x) => x.id === eventId);
    if (!ev || !canEditEvent(ev)) return;
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'event', id: eventId }));
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
  };

  const onDragEnd = () => setIsDragging(false);
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };

  const onDrop = (e: React.DragEvent, date: Date, hour: number) => {
    e.preventDefault();
    setIsDragging(false);
    if (!canEdit) return;

    try {
      const dataStr = e.dataTransfer.getData('text/plain');
      if (!dataStr) return;
      const data = JSON.parse(dataStr);
      
      const start = new Date(date);
      start.setHours(hour);
      start.setMinutes(0, 0, 0);

      if (data.type === 'task') {
        const task = tasks.find(t => t.id === data.id);
        if (!task) return;
        const duration = Math.max(task.estimatedHours || 1, 1);
        const end = addHours(start, duration);
        const projName = projects.find((p) => p.id === task.projectId)?.name || 'General';
        const taskTitle = (task.name || task.description || 'Task').trim().slice(0, 120);
        onAddEvent({
          title: `Focus: ${projName} — ${taskTitle}`.slice(0, 200),
          description: task.description,
          type: commandCalendarMode ? 'CommandBlock' : 'TaskBlock',
          visibility: commandCalendarMode ? 'Private' : 'Global',
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          taskId: task.id,
          projectIds: task.projectId ? [task.projectId] : [],
          clientIds: task.clientId ? [task.clientId] : []
        });
        toast({ title: "Task Scheduled" });
      } else if (data.type === 'event') {
        const event = displayEvents.find(ev => ev.id === data.id);
        if (!event) return;
        if (!canEditEvent(event)) return;
        const oldStart = parseISO(event.startTime);
        const oldEnd = parseISO(event.endTime);
        const durationMins = differenceInMinutes(oldEnd, oldStart);
        const newEnd = new Date(start.getTime() + durationMins * 60000);
        onUpdateEvent(event.id, { startTime: start.toISOString(), endTime: newEnd.toISOString() });
        toast({ title: "Event Moved" });
      }
    } catch (err) { console.error(err); }
  };

  const openNewEventDialog = (date: Date, hour: number) => {
    if (!canEdit) return;
    const start = new Date(date);
    start.setHours(hour);
    start.setMinutes(0, 0, 0);
    const end = addHours(start, 1);

    const sParts = parse24hTo12h(start.toISOString());
    const eParts = parse24hTo12h(end.toISOString());

    resetForm({ startTime: start.toISOString() });
    setStartH(sParts.hour); setStartM(sParts.min); setStartP(sParts.period);
    setEndH(eParts.hour); setEndM(eParts.min); setEndP(eParts.period);
    setIsEventDialogOpen(true);
  };

  const handleEditEvent = (event: CalendarEvent) => {
    if (!canEditEvent(event)) return;
    const sParts = parse24hTo12h(event.startTime);
    const eParts = parse24hTo12h(event.endTime);

    setEditingEventId(event.id);
    setFormDate(sParts.date);
    setFormTitle(event.title);
    setFormDesc(event.description || '');
    setFormType(event.type);
    setFormVisibility(event.visibility || 'Global');
    setFormLocationType(event.locationType || 'In-Person');
    setFormTaskId(event.taskId || '');
    setFormProjectIds(event.projectIds || []);
    setStartH(sParts.hour); setStartM(sParts.min); setStartP(sParts.period);
    setEndH(eParts.hour); setEndM(eParts.min); setEndP(eParts.period);
    setIsEventDialogOpen(true);
  };

  const handleTaskClick = (task: Task) => {
    if (!canEdit) return;
    const start = new Date();
    start.setMinutes(0, 0, 0);
    if (!commandCalendarMode) {
      if (start.getHours() < START_HOUR) start.setHours(START_HOUR);
      if (start.getHours() > END_HOUR - 1) {
        start.setDate(start.getDate() + 1);
        start.setHours(START_HOUR);
      }
    }
    const end = addHours(start, Math.max(task.estimatedHours || 1, 1));

    const sParts = parse24hTo12h(start.toISOString());
    const eParts = parse24hTo12h(end.toISOString());

    resetForm({ startTime: start.toISOString() });
    const projName = projects.find((p) => p.id === task.projectId)?.name || 'General';
    const taskTitle = (task.name || task.description || 'Task').trim().slice(0, 120);
    setFormTitle(`Focus: ${projName} — ${taskTitle}`.slice(0, 200));
    setFormDesc(task.description);
    setFormTaskId(task.id);
    setFormProjectIds(task.projectId ? [task.projectId] : []);
    setStartH(sParts.hour); setStartM(sParts.min); setStartP(sParts.period);
    setEndH(eParts.hour); setEndM(eParts.min); setEndP(eParts.period);
    setIsEventDialogOpen(true);
  };

  const handleSaveEvent = (e: React.FormEvent) => {
    e.preventDefault();
    const startTime = parse12hToISO(formDate, startH, startM, startP);
    const endTime = parse12hToISO(formDate, endH, endM, endP);

    const eventData = {
      title: formTitle || 'Untitled Event',
      description: formDesc,
      type: formType,
      visibility: formVisibility,
      locationType: formLocationType,
      startTime,
      endTime,
      taskId: formTaskId || undefined,
      projectIds: formProjectIds,
      clientIds: formProjectIds.map(pid => projects.find(p => p.id === pid)?.clientId).filter(Boolean) as string[]
    };

    if (editingEventId) onUpdateEvent(editingEventId, eventData);
    else onAddEvent(eventData);
    
    setIsEventDialogOpen(false);
  };

  const toggleProjectLink = (pid: string) => {
    setFormProjectIds(prev => 
      prev.includes(pid) ? prev.filter(id => id !== pid) : [...prev, pid]
    );
  };

  const getEventsForDay = (date: Date) => {
    if (!commandCalendarMode) {
      return displayEvents.filter((event) => isSameDay(parseISO(event.startTime), date));
    }
    // In Command Calendar mode, each "day" column represents the overnight work window:
    // date 12:00 PM -> date+1 5:00 AM.
    const windowStart = new Date(date);
    windowStart.setHours(12, 0, 0, 0);
    const windowEnd = new Date(date);
    windowEnd.setDate(windowEnd.getDate() + 1);
    windowEnd.setHours(5, 0, 0, 0);

    return displayEvents.filter((event) => {
      const s = parseISO(event.startTime);
      const e = parseISO(event.endTime);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) return false;
      return s < windowEnd && e > windowStart;
    });
  };

  const getEventStyle = (event: CalendarEvent, day: Date) => {
    const start = parseISO(event.startTime);
    const end = parseISO(event.endTime);
    const startHour = start.getHours();
    const startMin = start.getMinutes();
    const displayStartHour =
      commandCalendarMode && startHour < effectiveStartHour ? startHour + 24 : startHour;
    const top = ((displayStartHour - effectiveStartHour) * 60 + startMin) * (80 / 60);
    const duration = differenceInMinutes(end, start);
    const baseH = duration * (80 / 60);
    const isCmdWork =
      commandCalendarMode && (event.type === 'CommandBlock' || event.type === 'TaskBlock');
    const minH =
      isCmdWork && event.taskId && onOpenTask ? 76 : isCmdWork ? 52 : 30;
    return { top: `${top}px`, height: `${Math.max(baseH, minH)}px`, zIndex: 10 };
  };

  const renderMonthView = () => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    const weeks = eachWeekOfInterval({ start, end });
    return (
      <div className="bg-card/30 rounded-3xl border border-border/50 shadow-2xl overflow-hidden p-1 animate-in fade-in duration-500">
        <div className="grid grid-cols-7 border-b border-border/50 bg-muted/30">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="h-10 flex items-center justify-center text-[10px] uppercase font-bold text-muted-foreground">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-border/20">
          {weeks.map((week, wi) => (
            eachDayOfInterval({ start: week, end: addDays(week, 6) }).map((day, di) => {
              const dayEvents = getEventsForDay(day);
              const isCurrentMonth = isSameMonth(day, currentDate);
              return (
                <div key={day.toISOString()} className={cn("min-h-[120px] bg-card/50 p-2 space-y-1 transition-colors hover:bg-muted/20 cursor-pointer", !isCurrentMonth && "opacity-30", isSameDay(day, new Date()) && "bg-primary/5")} onClick={() => { setCurrentDate(day); setView('day'); }}>
                  <div className="flex justify-between items-center"><span className={cn("text-sm font-bold", isSameDay(day, new Date()) && "text-primary")}>{format(day, 'd')}</span>{dayEvents.length > 0 && <Badge variant="outline" className="text-[8px] h-4">{dayEvents.length}</Badge>}</div>
                  <div className="space-y-1 overflow-hidden max-h-[80px]">
                    {dayEvents.slice(0, 3).map(e => {
                      const d = getBlockDisplay(e);
                      const work = e.type === 'CommandBlock' || e.type === 'TaskBlock';
                      return (
                        <div key={e.id} className={cn(
                          "text-[8px] px-1 py-0.5 rounded border-l-2 flex flex-col gap-0.5 min-w-0", 
                          e.type === 'CommandBlock'
                            ? 'bg-violet-500/15 border-violet-400'
                            : e.type === 'TaskBlock'
                              ? 'bg-primary/10 border-primary'
                              : 'bg-accent/10 border-accent'
                        )}>
                          <div className="flex items-center gap-1 min-w-0">
                            {e.visibility === 'Private' && <Shield className="h-2 w-2 shrink-0" />}
                            {work && d.projectName ? (
                              <span className="truncate font-black text-[7px] opacity-90">{d.projectName}</span>
                            ) : null}
                          </div>
                          <span className="truncate font-bold leading-tight">{d.taskTitle}</span>
                        </div>
                      );
                    })}
                    {dayEvents.length > 3 && <div className="text-[8px] text-muted-foreground">+{dayEvents.length - 3} more</div>}
                  </div>
                </div>
              );
            })
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <div className="lg:col-span-1 space-y-6">
        <Card className="border-border/50 shadow-xl overflow-hidden bg-card/30">
          <CardHeader className="py-4"><CardTitle className="text-sm font-headline flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /> {commandCalendarMode ? 'Unscheduled (Command)' : 'Unscheduled Queue'}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[600px] overflow-y-auto px-4 pb-4 space-y-3">
              <p className="text-[10px] text-muted-foreground italic leading-relaxed mb-4">Drag a task to the calendar or click one to manually assign a date.</p>
              {sortedUnscheduledTasks.length === 0 && (<p className="text-center py-10 text-[10px] text-muted-foreground italic">No tasks in queue.</p>)}
              {sortedUnscheduledTasks.map(task => {
                const proj = projects.find(p => p.id === task.projectId);
                return (
                  <div key={task.id} draggable="true" onDragStart={(e) => onDragStartTask(e, task.id)} onDragEnd={onDragEnd} onClick={() => handleTaskClick(task)} className="p-3 rounded-xl bg-muted/20 border border-border/50 group cursor-pointer active:scale-[0.98] hover:border-primary/50 transition-all select-none">
                    <div className="flex items-start justify-between"><div className="space-y-1"><div className="text-[8px] text-accent uppercase font-bold">{proj?.name || 'No Project'}</div><div className="text-xs font-bold leading-tight">{task.name || task.description}</div></div><GripVertical className="h-3 w-3 text-muted-foreground opacity-30 cursor-grab active:cursor-grabbing" /></div>
                    <div className="flex justify-between items-center mt-2 border-t border-border/20 pt-2"><div className="flex flex-col gap-0.5"><span className="text-[10px] text-muted-foreground">{task.estimatedHours || 0}h est.</span>{task.deadline && (<span className="text-[8px] text-rose-400 font-bold uppercase flex items-center gap-1"><Clock className="h-2 w-2" /> Due: {task.deadline}</span>)}</div><Badge variant="outline" className="text-[8px] h-4">{task.priority}</Badge></div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-3 space-y-6">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card/30 p-4 rounded-2xl border border-border/50">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-headline font-bold text-white">
              {commandCalendarMode ? 'Command — ' : ''}
              {format(currentDate, view === 'month' ? 'MMMM yyyy' : 'MMMM d, yyyy')}
            </h2>
            <div className="flex bg-muted/50 rounded-lg p-1 border border-border/50">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrev}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="ghost" size="sm" className="px-3" onClick={() => setCurrentDate(new Date())}>Today</Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNext}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="flex bg-muted/50 rounded-lg p-1 border border-border/50">{(['day', 'week', 'month'] as ViewType[]).map(v => (<Button key={v} variant={view === v ? 'default' : 'ghost'} size="sm" className="capitalize px-4" onClick={() => setView(v)}>{v}</Button>))}</div>
        </header>

        {view !== 'month' ? (
          <div className="bg-card/30 rounded-3xl border border-border/50 shadow-2xl overflow-hidden relative">
            <div className="grid" style={{ gridTemplateColumns: `80px repeat(${days.length}, 1fr)` }}>
              <div className="h-12 border-b border-r border-border/50 flex items-center justify-center text-[10px] uppercase font-bold text-muted-foreground">Time</div>
              {days.map(day => (<div key={day.toISOString()} className={cn("h-12 border-b border-border/50 flex flex-col items-center justify-center", isSameDay(day, new Date()) && "bg-primary/5")}><span className="text-[10px] uppercase font-bold text-muted-foreground">{format(day, 'EEE')}</span><span className={cn("text-lg font-headline font-bold", isSameDay(day, new Date()) && "text-primary")}>{format(day, 'd')}</span></div>))}
            </div>
            <div className="relative overflow-y-auto max-h-[700px] scrollbar-thin scrollbar-thumb-primary/20">
              <div className="grid relative" style={{ gridTemplateColumns: `80px repeat(${days.length}, 1fr)` }}>
                <div className="space-y-0">
                  {hours.map(h => (
                    <div key={h} className="h-20 border-r border-b border-border/50 flex items-start justify-center pt-2">
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {format(addHours(startOfDay(new Date()), h), 'h a')}
                      </span>
                    </div>
                  ))}
                </div>
                {days.map(day => (
                  <div key={day.toISOString()} className="relative border-r border-border/20 last:border-r-0">
                    <div className="h-full w-full" onDragOver={onDragOver} onDragEnter={(e) => e.preventDefault()}>
                      {hours.map(h => (<div key={h} className="h-20 border-b border-border/10 cursor-cell hover:bg-primary/5 transition-colors" onDrop={(e) => onDrop(e, day, h)} onClick={() => openNewEventDialog(day, h)} />))}
                    </div>
                    {getEventsForDay(day).map(event => {
                      const eventEditable = canEditEvent(event);
                      const disp = getBlockDisplay(event);
                      const isWork = event.type === 'CommandBlock' || event.type === 'TaskBlock';
                      return (
                        <div 
                          key={event.id} 
                          draggable={eventEditable} 
                          onDragStart={(e) => onDragStartEvent(e, event.id)} 
                          onDragEnd={onDragEnd} 
                          className={cn(
                            "absolute left-1 right-1 rounded-xl p-2 text-[10px] overflow-y-auto overflow-x-hidden shadow-lg border-l-4 transition-all hover:scale-[1.02] cursor-pointer", 
                            event.type === 'CommandBlock'
                              ? 'bg-violet-500/25 border-violet-500 text-foreground dark:border-violet-400 dark:bg-violet-500/20 dark:text-white'
                              : event.type === 'TaskBlock'
                                ? 'bg-primary/20 border-primary text-foreground dark:text-white'
                                : 'bg-accent/20 border-accent text-accent-foreground',
                            !eventEditable && commandCalendarMode && "cursor-default opacity-80",
                            isDragging && "pointer-events-none opacity-50"
                          )} 
                          style={getEventStyle(event, day)} 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            handleEditEvent(event); 
                          }}
                        >
                          <div className="flex items-start gap-1">
                            {event.visibility === 'Private' && <Shield className="h-3 w-3 shrink-0 mt-0.5 opacity-90" />}
                            {isWork ? <Clock className="h-3 w-3 shrink-0 mt-0.5 opacity-90" /> : <MapPin className="h-3 w-3 shrink-0 mt-0.5 opacity-90" />}
                            <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                              {isWork && disp.projectName ? (
                                <span className="text-[8px] uppercase tracking-wide font-black leading-tight line-clamp-1 text-violet-950/90 dark:text-white/90">
                                  {disp.projectName}
                                </span>
                              ) : null}
                              <span className="font-bold text-[10px] leading-snug line-clamp-4 text-foreground">{disp.taskTitle}</span>
                            </div>
                          </div>
                          <div className="opacity-80 mt-1 text-[9px] tabular-nums text-muted-foreground dark:opacity-75">
                            {format(parseISO(event.startTime), 'h:mm a')} – {format(parseISO(event.endTime), 'h:mm a')}
                          </div>
                          {disp.showViewTask && disp.linkedTaskId ? (
                            <button
                              type="button"
                              className="mt-1 flex items-center gap-1 w-full text-[9px] font-bold text-violet-700 underline underline-offset-2 hover:text-violet-900 dark:text-violet-100 dark:hover:text-white text-left"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenTask?.(disp.linkedTaskId!);
                              }}
                            >
                              <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-90" />
                              View task
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : renderMonthView()}
      </div>

      <Dialog open={isEventDialogOpen} onOpenChange={setIsEventDialogOpen}>
        <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-headline text-2xl">{editingEventId ? 'Edit Block' : 'Schedule Block'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSaveEvent} className="space-y-6 py-4">
            <div className="space-y-2"><Label>Event Title</Label><Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="e.g. Design Phase A Focus" required /></div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Block Type</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-bold" value={formType} onChange={e => setFormType(e.target.value as CalendarEventType)} disabled={commandCalendarMode}>
                {(commandCalendarMode ? (['CommandBlock'] as CalendarEventType[]) : EVENT_TYPES).map(t => (
                  <option key={t} value={t}>{t === 'TaskBlock' ? 'Task Work Block' : t === 'ClientMeeting' ? 'Client Meeting' : t === 'CommandBlock' ? 'Command (private)' : 'Company Event'}</option>
                ))}
              </select></div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold">Location Type</Label>
                <div className="flex flex-wrap gap-1">
                  {(['In-Person', 'Online', 'On-Site'] as EventLocationType[]).map(type => (
                    <Button
                      key={type}
                      type="button"
                      variant={formLocationType === type ? 'default' : 'outline'}
                      size="sm"
                      className="px-2 h-8 text-[10px]"
                      onClick={() => setFormLocationType(type)}
                    >
                      {type}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Link to Specific Task</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-bold" value={formTaskId} onChange={e => setFormTaskId(e.target.value)}><option value="">No Task Linked</option>{sortedTasksForDropdown.map(t => (<option key={t.id} value={t.id}>{projects.find(p => p.id === t.projectId)?.name || 'General'}: {t.name || 'Untitled Task'}</option>))}</select></div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold">Visibility</Label>
                <div className="flex gap-2">
                  <Button type="button" variant={formVisibility === 'Global' ? 'default' : 'outline'} size="sm" className="flex-1 gap-1.5" onClick={() => setFormVisibility('Global')}><Globe className="h-3 w-3" /> Global</Button>
                  <Button type="button" variant={formVisibility === 'Private' ? 'default' : 'outline'} size="sm" className="flex-1 gap-1.5" onClick={() => setFormVisibility('Private')}><Shield className="h-3 w-3" /> Private</Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold">Link Multiple Projects (Audit Trail)</Label>
              <ScrollArea className="h-32 border border-border/50 rounded-lg p-3 bg-muted/10">
                <div className="grid grid-cols-1 gap-2">
                  {sortedProjects.map(p => (
                    <div key={p.id} className="flex items-center gap-2">
                      <Checkbox 
                        id={`link-proj-cal-${p.id}`} 
                        checked={formProjectIds.includes(p.id)}
                        onCheckedChange={() => toggleProjectLink(p.id)}
                      />
                      <Label htmlFor={`link-proj-cal-${p.id}`} className="text-xs cursor-pointer truncate">
                        {p.name}
                      </Label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <p className="text-[10px] text-muted-foreground italic">Linked projects will have an automatic entry created in their Project Notes.</p>
            </div>

            <div className="space-y-2"><Label>Date</Label><Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} required /></div>
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-2"><Label className="text-[10px] uppercase font-bold">Start Time</Label>
                <div className="flex items-center gap-1.5">
                  <Input className="w-14 h-9 text-center font-bold" value={startH} onChange={e => setStartH(e.target.value)} />
                  <span className="font-bold">:</span>
                  <Input className="w-14 h-9 text-center font-bold" value={startM} onChange={e => setStartM(e.target.value)} />
                  <select className="h-9 rounded-md border bg-background px-1 text-xs font-bold" value={startP} onChange={e => setStartP(e.target.value)}><option value="AM">AM</option><option value="PM">PM</option></select>
                </div>
              </div>
              <div className="space-y-2"><Label className="text-[10px] uppercase font-bold">End Time</Label>
                <div className="flex items-center gap-1.5">
                  <Input className="w-14 h-9 text-center font-bold" value={endH} onChange={e => setEndH(e.target.value)} />
                  <span className="font-bold">:</span>
                  <Input className="w-14 h-9 text-center font-bold" value={endM} onChange={e => setEndM(e.target.value)} />
                  <select className="h-9 rounded-md border bg-background px-1 text-xs font-bold" value={endP} onChange={e => setEndP(e.target.value)}><option value="AM">AM</option><option value="PM">PM</option></select>
                </div>
              </div>
            </div>
            <div className="space-y-2"><Label>Description / Notes</Label><Textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} className="h-20" /></div>
            
            <DialogFooter className="flex justify-between items-center sm:justify-between border-t pt-6">
              {editingEventId ? (
                <Button 
                  type="button" 
                  variant="ghost" 
                  className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10" 
                  onClick={() => { onDeleteEvent(editingEventId); setIsEventDialogOpen(false); }}
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </Button>
              ) : <div />}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setIsEventDialogOpen(false)}>Cancel</Button>
                <Button type="submit" className="bg-primary shadow-lg">{editingEventId ? 'Update' : 'Schedule Block'}</Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

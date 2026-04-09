
"use client"

import { use, useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useDoc, useMemoFirebase, useFirestore, useCollection, updateDocumentNonBlocking, setDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { Project, Client, ProjectNote, Task, BillableEntry, PrintEntry, InvoiceStatus, Designer, PaperSize, EmployeeName, Priority, TaskStatus, TaskCategory, DiscountType, Attachment } from '@/lib/types';
import { doc, collection, query, orderBy, where } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, ArrowLeft, Clock, MapPin, UserCircle, HardHat, ListTodo, MessageSquare, DollarSign, ExternalLink, CheckCircle2, Building2, Users, Check, Pencil, Trash2, Plus, Save, Globe, AlertTriangle, Navigation, Paperclip, X, FileText } from 'lucide-react';
import { format, parseISO, isPast, startOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { getEffectiveInvoiceStatus } from '@/lib/invoice-status';
import { useToast } from '@/hooks/use-toast';
import Map, { Marker, NavigationControl } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import Image from 'next/image';
import { SiteAnalysisDialog } from '@/components/projects/site-analysis-dialog';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

async function geocodeAddress(address: string) {
  try {
    if (!MAPBOX_TOKEN) return null;
    const gpsMatch = address.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
    if (gpsMatch) return { lat: parseFloat(gpsMatch[1]), lng: parseFloat(gpsMatch[2]) };
    const resp = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&limit=1`);
    const data = await resp.json();
    if (data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].center;
      return { lat, lng };
    }
  } catch (e) { console.error("Geocoding failed", e); }
  return null;
}

const EMPLOYEES: EmployeeName[] = ["Chris Fleming", "Jeff Dillon", "Jorrie Holly", "Kevin Walthall", "Sarah VandeBurgh", "Tammi Dillon"].sort() as EmployeeName[];
const PRIORITIES: Priority[] = ["High", "Low", "Medium"].sort() as Priority[];
const STATUSES: TaskStatus[] = ["Assigned", "Completed", "In Progress", "Need Review", "Unassigned"].sort() as TaskStatus[];
const DESIGNERS: Designer[] = ["Jeff Dillon", "Kevin Walthall"].sort() as Designer[];
const INVOICE_STATUSES: InvoiceStatus[] = ["Invoice Sent", "Not Sent", "Paid", "Past Due"];
const TASK_NAME_OPTIONS = [
  "3D Modeling", "Client Changes", "Construction Documents", "Follow Up with Client", 
  "Initial Layout", "Miscellaneous", "Onboarding", "Print Request", "Return E-Mail", 
  "Return Phone Call", "Review Work", "Schedule Meeting with Client"
].sort();

const mapBillableData = (e: any) => {
  const hours = Number(e.hours ?? e.billableHours ?? e.hoursWorked ?? e.qty ?? 0);
  const lateFee = Number(e.lateFee ?? 0);
  const storedTotal = Number(e.total ?? e.amount ?? 0);
  let rate = Number(e.rate ?? e.hourlyRate ?? 0);
  if (rate === 0 && storedTotal > 0 && hours > 0) rate = (storedTotal - lateFee) / hours;
  const total = storedTotal > 0 ? storedTotal : (hours * rate) + lateFee;
  return { ...e, hours, rate, total, status: e.status || 'Not Sent', date: e.date || e.createdAt || new Date().toISOString() };
};

const mapPrintData = (e: any) => {
  const sheets = Number(e.sheets ?? e.quantity ?? e.qty ?? 0);
  const storedTotal = Number(e.total ?? e.amount ?? 0);
  const lateFee = Number(e.lateFee ?? 0);
  let rate = Number(e.rate ?? e.costPerSheet ?? 0);
  if (rate === 0 && storedTotal > 0 && sheets > 0) rate = (storedTotal - lateFee) / sheets;
  const total = storedTotal > 0 ? storedTotal : (rate * sheets) + lateFee;
  return { ...e, sheets, rate, total, status: e.status || 'Not Sent', date: e.date || e.createdAt || new Date().toISOString(), type: 'Job' };
};

const isValidDate = (d: any) => d instanceof Date && !isNaN(d.getTime());

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

function AttachmentThumbnail({ attachment, onRemove }: { attachment: Attachment, onRemove?: () => void }) {
  const isImage = attachment.type.startsWith('image/');
  return (
    <div className="relative group">
      <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="block w-full h-12 rounded-lg border border-border/50 bg-muted/20 overflow-hidden hover:border-primary/50 transition-all">
        {isImage ? (
          <Image src={attachment.url} alt={attachment.name} fill unoptimized className="object-cover" />
        ) : (
          <div className="flex items-center justify-center h-full"><FileText className="h-4 w-4 text-primary/40" /></div>
        )}
      </a>
      {onRemove && (
        <button onClick={onRemove} className="absolute -top-1 -right-1 h-4 w-4 bg-rose-500 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"><X className="h-2 w-2" /></button>
      )}
    </div>
  );
}

export default function ProjectDashboardPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const router = useRouter();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [sessionEmployeeId, setSessionEmployeeId] = useState<string | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  
  const [isProjectEditing, setIsProjectEditing] = useState(false);
  const [projectForm, setProjectForm] = useState({ address: '', constructionCompany: '', lat: '', lng: '' });

  const [isTaskEditing, setIsTaskEditing] = useState(false);
  const [taskForm, setTaskForm] = useState<Partial<Task>>({});

  const [isAddTaskDialogOpen, setIsTaskAddDialogOpen] = useState(false);
  const [isNoteAddDialogOpen, setIsNoteAddDialogOpen] = useState(false);
  const [isAddBillableDialogOpen, setIsAddBillableDialogOpen] = useState(false);
  const [isAddPrintDialogOpen, setIsAddPrintDialogOpen] = useState(false);
  const [isSiteAnalysisOpen, setIsSiteAnalysisOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('di_ledger_session_employee_id');
    if (saved) setSessionEmployeeId(saved);
  }, []);

  const employeeRef = useMemoFirebase(() => 
    sessionEmployeeId ? doc(firestore, 'employees', sessionEmployeeId) : null
  , [firestore, sessionEmployeeId]);
  const { data: myEmployee } = useDoc<any>(employeeRef);

  const dataRootId = useMemo(() => {
    if (!sessionEmployeeId) return null;
    return myEmployee?.bossId || sessionEmployeeId;
  }, [sessionEmployeeId, myEmployee]);

  const projectRef = useMemoFirebase(() => 
    dataRootId ? doc(firestore, 'employees', dataRootId, 'projects', projectId) : null
  , [firestore, dataRootId, projectId]);
  const { data: project, isLoading: isProjectLoading } = useDoc<Project>(projectRef);

  useEffect(() => {
    if (project) {
      setProjectForm({ address: project.address || '', constructionCompany: project.constructionCompany || '', lat: project.lat?.toString() || '', lng: project.lng?.toString() || '' });
    }
  }, [project]);

  const clientRef = useMemoFirebase(() => 
    (dataRootId && project?.clientId) ? doc(firestore, 'employees', dataRootId, 'clients', project.clientId) : null
  , [firestore, dataRootId, project?.clientId]);
  const { data: client } = useDoc<Client>(clientRef);

  const notesQuery = useMemoFirebase(() => 
    dataRootId ? query(collection(firestore, 'employees', dataRootId, 'projects', projectId, 'notes'), orderBy('createdAt', 'desc')) : null
  , [firestore, dataRootId, projectId]);
  const { data: notes } = useCollection<ProjectNote>(notesQuery);

  const tasksQuery = useMemoFirebase(() => 
    dataRootId ? query(collection(firestore, 'employees', dataRootId, 'tasks'), where('projectId', '==', projectId)) : null
  , [firestore, dataRootId, projectId]);
  const { data: tasks } = useCollection<Task>(tasksQuery);

  const billableQuery = useMemoFirebase(() => 
    dataRootId ? query(collection(firestore, 'employees', dataRootId, 'billable_hour_entries'), where('projectId', '==', projectId)) : null
  , [firestore, dataRootId, projectId]);
  const { data: billableEntriesRaw } = useCollection<any>(billableQuery);

  const printQuery = useMemoFirebase(() => 
    dataRootId ? query(collection(firestore, 'employees', dataRootId, 'print_job_entries'), where('projectId', '==', projectId)) : null
  , [firestore, dataRootId, projectId]);
  const { data: printEntriesRaw } = useCollection<any>(printQuery);

  const billableEntries = useMemo(() => (billableEntriesRaw || []).map(mapBillableData), [billableEntriesRaw]);
  const printEntries = useMemo(() => (printEntriesRaw || []).map(mapPrintData), [printEntriesRaw]);

  const hourTotals = useMemo(() => {
    const totals: Record<InvoiceStatus, number> = { 'Paid': 0, 'Invoice Sent': 0, 'Not Sent': 0, 'Past Due': 0 };
    billableEntries.forEach(e => {
      const status = getEffectiveInvoiceStatus(e);
      if (totals[status] !== undefined) totals[status] += Number(e.hours || 0);
    });
    return totals;
  }, [billableEntries]);

  const assignedEmployees = useMemo(() => {
    const team = new Set<string>();
    if (project?.designer) team.add(project.designer);
    if (tasks) tasks.forEach(t => { if (t.assignedTo) team.add(t.assignedTo); });
    [...billableEntries, ...printEntries].forEach(e => { if (e.designer) team.add(e.designer); });
    return Array.from(team).filter(Boolean).sort();
  }, [project, tasks, billableEntries, printEntries]);

  const lastActivityDate = useMemo(() => {
    const dates: number[] = [];
    const pushDate = (dateStr?: string | null) => { if (!dateStr) return; try { const d = new Date(dateStr); if (isValidDate(d)) dates.push(d.getTime()); } catch (e) {} };
    if (project?.lastStatusUpdate) pushDate(project.lastStatusUpdate);
    if (notes?.length) notes.forEach(n => pushDate(n.createdAt));
    if (tasks?.length) tasks.forEach(t => pushDate(t.updatedAt));
    if (billableEntries.length) billableEntries.forEach(e => pushDate(e.date));
    if (printEntries.length) printEntries.forEach(e => pushDate(e.date));
    return dates.length === 0 ? null : new Date(Math.max(...dates));
  }, [project, notes, tasks, billableEntries, printEntries]);

  const handleUpdateProjectDetails = async () => {
    if (!project || !dataRootId) return;
    let finalLat = parseFloat(projectForm.lat); let finalLng = parseFloat(projectForm.lng);
    const needsGeocode = projectForm.address.trim() && (isNaN(finalLat) || isNaN(finalLng) || projectForm.address !== project.address);
    if (needsGeocode) { setIsGeocoding(true); const coords = await geocodeAddress(projectForm.address); if (coords) { finalLat = coords.lat; finalLng = coords.lng; } setIsGeocoding(false); }
    updateDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'projects', projectId), { ...projectForm, lat: isNaN(finalLat) ? undefined : finalLat, lng: isNaN(finalLng) ? undefined : finalLng });
    setIsProjectEditing(false); toast({ title: "Site Synchronized" });
  };

  const handleSaveTaskDetails = () => {
    if (!taskForm.id || !dataRootId) return;
    updateDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'tasks', taskForm.id), { ...taskForm, updatedAt: new Date().toISOString() });
    setIsTaskEditing(false); setViewingTask(null); toast({ title: "Task Updated" });
  };

  const toggleSubTaskInDialog = (taskId: string, subTaskId: string, completed: boolean) => {
    if (!dataRootId) return;
    const task = tasks?.find(t => t.id === taskId);
    if (!task) return;
    const currentSubTasks = task.subTasks || [];
    const newSubTasks = currentSubTasks.map(st => st.id === subTaskId ? { ...st, completed } : st);
    updateDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'tasks', taskId), { subTasks: newSubTasks, updatedAt: new Date().toISOString() });
    if (viewingTask?.id === taskId) setViewingTask({ ...viewingTask, subTasks: newSubTasks });
  };

  if (isProjectLoading || !dataRootId) return (<div className="min-h-screen flex items-center justify-center bg-background"><div className="flex flex-col items-center gap-4"><Loader2 className="h-10 w-10 animate-spin text-primary" /><p className="text-sm font-bold animate-pulse">Syncing Site Intelligence...</p></div></div>);
  if (!project) return (<div className="min-h-screen flex flex-col items-center justify-center bg-background p-6"><HardHat className="h-16 w-16 text-muted-foreground/20 mb-4" /><h2 className="text-2xl font-headline font-bold text-rose-500 mb-2">Registry Mismatch</h2><p className="text-sm text-muted-foreground mb-6">This project record was not found in the firm database.</p><Button onClick={() => router.push('/')} variant="outline"><ArrowLeft className="h-4 w-4 mr-2" /> Return to Dashboard</Button></div>);

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <header className="border-b border-border/40 bg-card/30 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1800px] mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4"><Button variant="ghost" size="icon" onClick={() => router.push('/')} className="rounded-full"><ArrowLeft className="h-5 w-5" /></Button><div><h1 className="text-2xl font-headline font-bold text-white flex items-center gap-2">{project.name}</h1><div className="flex items-center gap-3 mt-0.5"><p className="text-[10px] text-accent font-bold uppercase tracking-widest">{client?.name || 'Assigned Client'}</p><div className="h-1 w-1 rounded-full bg-border" /><Badge variant="outline" className="h-4 text-[8px] bg-primary/5 border-primary/20 text-primary uppercase font-bold">{project.status || 'Active'}</Badge></div></div></div>
          <div className="flex items-center gap-6">
            <div className="text-right"><p className="text-[9px] uppercase font-bold text-muted-foreground tracking-widest">Registered</p><p className="text-xs font-bold text-white">{project.createdAt ? format(new Date(project.createdAt), 'MMM d, yyyy') : '—'}</p></div>
            <div className="h-8 w-px bg-border/50" />
            <div className="text-right"><p className="text-[9px] uppercase font-bold text-muted-foreground tracking-widest">Last Activity</p><p className="text-xs font-bold text-accent">{isValidDate(lastActivityDate) ? format(lastActivityDate!, 'MMM d, h:mm a') : 'Recently Registered'}</p></div>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={!project.address?.trim()}
              onClick={() => setIsSiteAnalysisOpen(true)}
              title={
                project.address?.trim()
                  ? 'Assessor, GIS, zoning, codes, utilities (Perplexity research)'
                  : 'Add a site address under Site Intelligence first'
              }
            >
              <Globe className="h-4 w-4" /> Site analysis
            </Button>
            <Button size="sm" className="bg-primary shadow-lg shadow-primary/20 gap-2" onClick={() => router.push(`/projects/${projectId}/checklist`)}>
              <CheckCircle2 className="h-4 w-4" /> Checklist
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-[1800px] mx-auto px-6 py-10 space-y-10">
        <Card className="border-border/50 shadow-xl bg-card/30 overflow-hidden">
          <CardHeader className="bg-muted/30 border-b border-border/50 py-4 flex flex-row items-center justify-between"><CardTitle className="text-lg font-headline flex items-center gap-2 text-white"><HardHat className="h-5 w-5 text-accent" /> Site Intelligence</CardTitle><Button variant="outline" size="sm" className="h-8 gap-2" onClick={() => setIsProjectEditing(true)}><Pencil className="h-3 w-3" /> Edit Details</Button></CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-1 lg:grid-cols-12">
              <div className="lg:col-span-4 p-8 space-y-8 border-r border-border/50"><div className="space-y-6"><div className="flex items-start gap-4"><div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center shrink-0"><Building2 className="h-5 w-5 text-primary" /></div><div><p className="text-[10px] uppercase font-bold text-muted-foreground">Contractor</p><p className="text-sm font-bold text-white">{project.constructionCompany || 'Not Assigned'}</p></div></div><div className="flex items-start gap-4"><div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center shrink-0"><MapPin className="h-5 w-5 text-accent" /></div><div><p className="text-[10px] uppercase font-bold text-muted-foreground">Address</p>{project.address ? <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(project.address)}`} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-white hover:text-primary hover:underline transition-all flex items-center gap-1.5">{project.address} <ExternalLink className="h-3 w-3 opacity-50" /></a> : <p className="text-sm font-bold text-white">Pending</p>}</div></div></div><div className="bg-background/40 rounded-2xl border border-border/50 p-6"><div className="flex items-center gap-2 mb-4"><Users className="h-4 w-4 text-primary" /><p className="text-[10px] uppercase font-bold text-muted-foreground">Lead Designer</p></div><div className="flex flex-wrap gap-2">{assignedEmployees.length === 0 ? <p className="text-xs text-muted-foreground italic">No staff assigned.</p> : assignedEmployees.map(name => <Badge key={name} variant="secondary" className="bg-background/50 border-border/50 text-[10px] py-1.5 px-4 font-bold">{name}</Badge>)}</div></div></div>
              <div className="lg:col-span-8 h-[400px] lg:h-auto relative bg-black/20">{project.lat && project.lng ? (<Map initialViewState={{ latitude: project.lat, longitude: project.lng, zoom: 15 }} mapboxAccessToken={MAPBOX_TOKEN} mapStyle="mapbox://styles/mapbox/dark-v11" style={{ width: '100%', height: '100%' }}><NavigationControl position="top-right" /><Marker latitude={project.lat} longitude={project.lng} anchor="bottom"><div className="p-2 rounded-full bg-background border-2 border-primary shadow-xl ring-4 ring-primary/20"><MapPin className="h-6 w-6 text-primary" /></div></Marker></Map>) : <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4"><div className="h-16 w-16 rounded-full bg-muted/20 flex items-center justify-center"><Navigation className="h-8 w-8 text-muted-foreground/40" /></div><div className="space-y-1"><h4 className="font-bold text-white/50 uppercase tracking-widest text-sm">Site Mapping Offline</h4><p className="text-xs text-muted-foreground max-w-xs">Provide a valid address to enable GPS plotting.</p></div></div>}</div>
            </div>
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="space-y-4"><div className="flex items-center justify-between px-2"><h3 className="font-headline text-xl text-white flex items-center gap-2"><ListTodo className="h-5 w-5 text-primary" /> Pending Tasks</h3><div className="flex items-center gap-2"><Badge variant="outline" className="bg-muted/30 text-[10px]">{tasks?.filter(t => t.status !== 'Completed').length || 0}</Badge><Button size="icon" variant="ghost" className="h-7 w-7 bg-primary/10 text-primary hover:bg-primary/20 rounded-full" onClick={() => setIsTaskAddDialogOpen(true)}><Plus className="h-4 w-4" /></Button></div></div><ScrollArea className="h-[600px] pr-4"><div className="space-y-4">{tasks?.filter(t => t.status !== 'Completed').length === 0 ? <div className="text-center py-20 bg-muted/10 rounded-2xl border border-dashed border-border/50 text-xs text-muted-foreground italic">No active tasks logged.</div> : tasks?.filter(t => t.status !== 'Completed').map(task => { const isOverdue = task.deadline && isPast(startOfDay(parseISO(task.deadline))) && task.status !== 'Completed'; return (<Card key={task.id} onClick={() => { setViewingTask(task); setTaskForm(task); }} className={cn("bg-card/30 border-border/50 hover:border-primary/30 transition-all group cursor-pointer", isOverdue && "border-rose-500/20 bg-rose-500/5")}><CardContent className="p-4 space-y-3"><div className="flex justify-between items-start"><h4 className={cn("font-bold text-sm text-white group-hover:text-primary transition-colors line-clamp-2", isOverdue && "text-rose-500")}>{task.name || task.description}</h4><Badge variant="outline" className={cn("text-[8px] uppercase", task.priority === 'High' ? 'border-rose-500/30 text-rose-500' : 'border-muted text-muted-foreground')}>{task.priority}</Badge></div><div className="flex items-center justify-between border-t border-border/20 pt-3"><div className={cn("flex items-center gap-2 text-[10px]", isOverdue ? "text-rose-500 font-bold" : "text-muted-foreground")}><Clock className="h-3 w-3" /> {task.deadline || '—'}</div><div className="flex items-center gap-2">{task.subTasks?.length > 0 && <span className="text-[8px] font-black text-muted-foreground uppercase">{task.subTasks.filter(s => s.completed).length}/{task.subTasks.length} DONE</span>}<span className="text-[10px] font-bold text-accent">{task.assignedTo}</span><Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-50" /></div></div></CardContent></Card>); })}</div></ScrollArea></div>
          <div className="space-y-4"><div className="flex items-center justify-between px-2"><h3 className="font-headline text-xl text-white flex items-center gap-2"><MessageSquare className="h-5 w-5 text-accent" /> Activity Log</h3><div className="flex items-center gap-2"><Badge variant="outline" className="bg-muted/30 text-[10px]">{notes?.length || 0}</Badge><Button size="icon" variant="ghost" className="h-7 w-7 bg-accent/10 text-accent hover:bg-accent/20 rounded-full" onClick={() => setIsNoteAddDialogOpen(true)}><Plus className="h-4 w-4" /></Button></div></div><ScrollArea className="h-[600px] pr-4"><div className="space-y-4">{notes?.length === 0 ? <div className="text-center py-20 bg-muted/10 rounded-2xl border border-dashed border-border/50 text-xs text-muted-foreground italic">No history recorded yet.</div> : notes?.map(note => (<Card key={note.id} className="bg-card/30 border-border/50 hover:border-accent/30 transition-all"><CardContent className="p-4 space-y-2"><div className="flex justify-between items-center text-[9px] uppercase font-black tracking-widest text-muted-foreground"><span>{note.authorName}</span><span>{note.createdAt ? format(new Date(note.createdAt), 'MMM d, h:mm a') : '—'}</span></div><p className="text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap">{note.text}</p>{note.attachments && note.attachments.length > 0 && (<div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-border/20">{note.attachments.map(a => <AttachmentThumbnail key={a.id} attachment={a} />)}</div>)}</CardContent></Card>))}</div></ScrollArea></div>
          <div className="space-y-4"><div className="flex items-center justify-between px-2"><h3 className="font-headline text-xl text-white flex items-center gap-2"><DollarSign className="h-5 w-5 text-emerald-500" /> Project Ledger</h3><div className="flex items-center gap-2"><Badge variant="outline" className="bg-muted/30 text-[10px]">{billableEntries.length + printEntries.length}</Badge><div className="flex gap-1"><Button size="icon" variant="ghost" className="h-7 w-7 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 rounded-full" onClick={() => setIsAddBillableDialogOpen(true)} title="Log Hours"><Clock className="h-4 w-4" /></Button><Button size="icon" variant="ghost" className="h-7 w-7 bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 rounded-full" onClick={() => setIsAddPrintDialogOpen(true)} title="Log Prints"><Plus className="h-4 w-4" /></Button></div></div></div><div className="grid grid-cols-2 gap-2 mb-2 px-2">{Object.entries(hourTotals).map(([status, total]) => (<div key={status} className="bg-card/40 p-2.5 rounded-xl border border-border/50 flex flex-col justify-between h-16 shadow-sm"><p className="text-[8px] uppercase font-black text-muted-foreground leading-none tracking-widest">{status}</p><div className="flex items-baseline justify-between"><p className={cn("text-lg font-headline font-bold tabular-nums", status === 'Paid' ? 'text-emerald-500' : status === 'Past Due' ? 'text-rose-500' : status === 'Invoice Sent' ? 'text-sky-500' : 'text-amber-500')}>{total.toFixed(1)}<span className="text-[10px] ml-0.5 opacity-70">h</span></p><div className={cn("h-1.5 w-1.5 rounded-full", status === 'Paid' ? 'bg-emerald-500' : status === 'Past Due' ? 'bg-rose-500' : status === 'Invoice Sent' ? 'bg-sky-500' : 'bg-amber-500')} /></div></div>))}</div><ScrollArea className="h-[480px] pr-4"><div className="space-y-4">{[...billableEntries, ...printEntries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(entry => { const effStatus = getEffectiveInvoiceStatus(entry); const isPastDue = effStatus === 'Past Due'; const isPaid = effStatus === 'Paid'; return (<Card key={entry.id} onClick={() => { if ('hours' in entry) router.push(`/?tab=billing&billableId=${encodeURIComponent((entry as BillableEntry).id)}`); else router.push('/?tab=billing'); }} className={cn("bg-card/30 border-border/50 hover:border-emerald-500/30 cursor-pointer", isPastDue && "border-rose-500/20 bg-rose-500/5", isPaid && "border-emerald-500/20 bg-emerald-500/5 opacity-80")}><CardContent className="p-4 space-y-2"><div className="flex justify-between items-start"><div className="space-y-0.5"><p className={cn("text-xs font-bold", isPastDue ? "text-rose-500" : "text-white")}>{'hours' in entry ? `${entry.hours.toFixed(2)}h - Service` : `${entry.sheets} Sheets - Print`}</p><p className="text-[10px] text-muted-foreground">{entry.date ? format(new Date(entry.date), 'MMM d, yyyy') : '—'}</p></div><Badge variant="outline" className={cn("text-[8px] uppercase font-bold", isPastDue ? "border-rose-500 text-rose-500 animate-pulse" : isPaid ? "border-emerald-500 text-emerald-500" : "border-muted text-muted-foreground")}>{effStatus}</Badge></div><div className="flex justify-between items-end border-t border-border/20 pt-2"><span className="text-[10px] text-muted-foreground">{entry.designer}</span><div className="flex items-center gap-2">{!isPaid && <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-500 hover:bg-emerald-500/10" onClick={(e) => { e.stopPropagation(); const path = 'hours' in entry ? 'billable_hour_entries' : 'print_job_entries'; if (dataRootId) updateDocumentNonBlocking(doc(firestore, 'employees', dataRootId, path, entry.id), { status: 'Paid' }); }} title="Mark as Paid"><Check className="h-4 w-4" /></Button>}<span className={cn("text-sm font-bold tabular-nums", isPastDue ? "text-rose-500" : isPaid ? "text-emerald-500" : "text-emerald-400")}>${Number(entry.total || 0).toFixed(2)}</span></div></div></CardContent></Card>); })}{(billableEntries.length === 0 && printEntries.length === 0) && <div className="text-center py-20 bg-muted/10 rounded-2xl border border-dashed border-border/50 text-xs text-muted-foreground">No ledger entries recorded.</div>}</div></ScrollArea></div>
        </div>
      </main>
      <QuickTaskDialog open={isAddTaskDialogOpen} onOpenChange={setIsTaskAddDialogOpen} projectId={projectId} clientId={project.clientId} designer={project.designer || 'Jeff Dillon'} dataRootId={dataRootId} />
      <QuickNoteDialog open={isNoteAddDialogOpen} onOpenChange={setIsNoteAddDialogOpen} projectId={projectId} authorName={`${myEmployee?.firstName} ${myEmployee?.lastName}`} dataRootId={dataRootId} />
      <QuickBillableDialog open={isAddBillableDialogOpen} onOpenChange={setIsAddBillableDialogOpen} projectId={projectId} clientId={project.clientId} designer={project.designer || 'Jeff Dillon'} dataRootId={dataRootId} hourlyRate={project.hourlyRate} project={project} client={client ?? null} />
      <QuickPrintDialog open={isAddPrintDialogOpen} onOpenChange={setIsAddPrintDialogOpen} projectId={projectId} clientId={project.clientId} designer={project.designer || 'Jeff Dillon'} dataRootId={dataRootId} />
      <SiteAnalysisDialog
        open={isSiteAnalysisOpen}
        onOpenChange={setIsSiteAnalysisOpen}
        address={project.address || ''}
        projectName={project.name || ''}
      />
      <Dialog open={!!viewingTask} onOpenChange={(open) => { if (!open) { setViewingTask(null); setIsTaskEditing(false); } }}><DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">{viewingTask && (<div className="space-y-6"><DialogHeader><div className="flex justify-between items-start gap-4"><div className="space-y-1"><Badge variant="outline" className={cn("text-[10px] font-bold uppercase", viewingTask.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted')}>{viewingTask.status}</Badge>{isTaskEditing ? (<><DialogTitle className="sr-only">Edit task details</DialogTitle><Input className="text-2xl font-headline font-bold mt-2" value={taskForm.name || ''} onChange={e => setTaskForm({...taskForm, name: e.target.value})} /></>) : <DialogTitle className="font-headline text-3xl text-white mt-2">{viewingTask.name || viewingTask.description}</DialogTitle>}<div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-2"><span className="flex items-center gap-1"><Users className="h-3 w-3" /> {viewingTask.assignedTo}</span><span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Due {viewingTask.deadline}</span></div></div>{!isTaskEditing && <Button variant="outline" size="sm" onClick={() => { setTaskForm(viewingTask); setIsTaskEditing(true); }}><Pencil className="h-3 w-3 mr-2" /> Edit</Button>}</div></DialogHeader>{isTaskEditing ? (<div className="space-y-4 py-4 border-t border-border/50"><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Assignee</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={taskForm.assignedTo} onChange={e => setTaskForm({...taskForm, assignedTo: e.target.value as EmployeeName})}>{EMPLOYEES.map(e => <option key={e} value={e}>{e}</option>)}</select></div><div className="space-y-2"><Label>Priority</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={taskForm.priority} onChange={e => setTaskForm({...taskForm, priority: e.target.value as Priority})}>{PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}</select></div><div className="space-y-2"><Label>Deadline</Label><Input type="date" value={taskForm.deadline} onChange={e => setTaskForm({...taskForm, deadline: e.target.value})} /></div><div className="space-y-2"><Label>Status</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={taskForm.status} onChange={e => setTaskForm({...taskForm, status: e.target.value as TaskStatus})}>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div></div><div className="space-y-2"><Label>Description</Label><Textarea className="min-h-[100px]" value={taskForm.description || ''} onChange={e => setTaskForm({...taskForm, description: e.target.value})} /></div></div>) : (<div className="space-y-4"><div className="space-y-2"><h4 className="text-sm font-bold uppercase tracking-widest text-accent">Description</h4><p className="text-sm leading-relaxed text-foreground/90 bg-muted/20 p-4 rounded-xl border border-border/50">{viewingTask.description || 'No description provided.'}</p></div><div className="space-y-3"><div className="flex items-center justify-between"><h4 className="text-sm font-bold uppercase tracking-widest text-accent">Checklist</h4><span className="text-[10px] font-bold text-muted-foreground uppercase">{viewingTask.subTasks?.filter(s => s.completed).length || 0} / {viewingTask.subTasks?.length || 0} Complete</span></div><div className="grid grid-cols-1 md:grid-cols-2 gap-2">{viewingTask.subTasks?.map(st => (<div key={st.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/10 border border-border/30 group"><Checkbox checked={st.completed} onCheckedChange={(checked) => toggleSubTaskInDialog(viewingTask.id, st.id, !!checked)} className="mt-0.5" /><div className="flex-1"><span className={cn("text-xs transition-all", st.completed ? 'line-through opacity-50' : 'text-white font-medium')}>{st.text}</span></div></div>))}</div></div>{viewingTask.attachments && viewingTask.attachments.length > 0 && (<div className="space-y-2"><h4 className="text-sm font-bold uppercase tracking-widest text-accent">Attachments</h4><div className="grid grid-cols-4 gap-2">{viewingTask.attachments.map(a => <AttachmentThumbnail key={a.id} attachment={a} />)}</div></div>)}</div>)}<DialogFooter className="pt-4 border-t border-border/50"><Button variant="outline" onClick={() => { setViewingTask(null); setIsTaskEditing(false); }}>Close</Button>{isTaskEditing ? <Button onClick={handleSaveTaskDetails} className="bg-primary gap-2"><Save className="h-4 w-4" /> Save</Button> : <Button onClick={() => { if (dataRootId) { const status = viewingTask.status === 'Completed' ? 'In Progress' : 'Completed'; updateDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'tasks', viewingTask.id), { status, updatedAt: new Date().toISOString() }); setViewingTask(null); } }}>{viewingTask.status === 'Completed' ? 'Re-open' : 'Complete'}</Button>}</DialogFooter></div>)}</DialogContent></Dialog>
      <Dialog open={isProjectEditing} onOpenChange={setIsProjectEditing}><DialogContent className="sm:max-w-[500px]"><DialogHeader><DialogTitle className="font-headline text-2xl">Site Intelligence</DialogTitle><DialogDescription>Update field-specific site data.</DialogDescription></DialogHeader><div className="space-y-4 py-4"><div className="space-y-2"><Label>Contractor</Label><Input value={projectForm.constructionCompany} onChange={e => setProjectForm({...projectForm, constructionCompany: e.target.value})} /></div><div className="space-y-2"><Label>Site Address</Label><Input placeholder="123 Example St, Stillwater, OK" value={projectForm.address} onChange={e => setProjectForm({...projectForm, address: e.target.value})} /></div><div className="grid grid-cols-2 gap-4 bg-muted/20 p-4 rounded-xl border"><div className="space-y-1"><Label className="text-[10px] uppercase font-bold">Latitude</Label><Input type="number" step="any" value={projectForm.lat} onChange={e => setProjectForm({...projectForm, lat: e.target.value})} /></div><div className="space-y-1"><Label className="text-[10px] uppercase font-bold">Longitude</Label><Input type="number" step="any" value={projectForm.lng} onChange={e => setProjectForm({...projectForm, lng: e.target.value})} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setIsProjectEditing(false)}>Cancel</Button><Button onClick={handleUpdateProjectDetails} className="bg-primary" disabled={isGeocoding}>{isGeocoding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : 'Save Changes'}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function QuickTaskDialog({ open, onOpenChange, projectId, clientId, designer, dataRootId }: { open: boolean, onOpenChange: (o: boolean) => void, projectId: string, clientId: string, designer: Designer, dataRootId: string | null }) {
  const firestore = useFirestore(); const { toast } = useToast();
  const [name, setName] = useState(''); const [desc, setDesc] = useState(''); const [deadline, setDeadline] = useState(''); const [priority, setPriority] = useState<Priority>('Medium');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setAttachments(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), name: file.name, size: file.size, type: file.type, url: dataUrl }]);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => { if (!dataRootId || !name) return; const ref = doc(collection(firestore, 'employees', dataRootId, 'tasks')); setDocumentNonBlocking(ref, { id: ref.id, name, description: desc, projectId, clientId, deadline, priority, status: 'Assigned', assignedTo: designer, subTasks: [], attachments, comments: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true }); toast({ title: "Task Logged" }); onOpenChange(false); setName(''); setDesc(''); setDeadline(''); setAttachments([]); };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader><DialogTitle>Quick Task</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2"><Label>Action Type</Label><select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm font-bold" value={name} onChange={e => setName(e.target.value)}><option value="">Select...</option>{TASK_NAME_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
          <div className="space-y-2"><Label>Deadline</Label><Input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} /></div>
          <div className="space-y-2"><Label>Requirements</Label><Textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="What needs to be done?" /></div>
          <div className="space-y-2">
            <div className="flex justify-between items-center"><Label>Attachments</Label><Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}><Paperclip className="h-3 w-3 mr-1" /> Add</Button></div>
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
            <div className="grid grid-cols-4 gap-2">{attachments.map(a => <AttachmentThumbnail key={a.id} attachment={a} onRemove={() => setAttachments(prev => prev.filter(x => x.id !== a.id))} />)}</div>
          </div>
        </div>
        <DialogFooter><Button onClick={handleSave} className="bg-primary w-full">Launch Task</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuickNoteDialog({ open, onOpenChange, projectId, authorName, dataRootId }: { open: boolean, onOpenChange: (o: boolean) => void, projectId: string, authorName: string, dataRootId: string | null }) {
  const firestore = useFirestore(); const { toast } = useToast();
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setAttachments(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), name: file.name, size: file.size, type: file.type, url: dataUrl }]);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => { if (!dataRootId || !text.trim()) return; const ref = doc(collection(firestore, 'employees', dataRootId, 'projects', projectId, 'notes')); setDocumentNonBlocking(ref, { id: ref.id, projectId, text, authorName, authorId: 'manual', createdAt: new Date().toISOString(), attachments }, { merge: true }); toast({ title: "Activity Recorded" }); onOpenChange(false); setText(''); setAttachments([]); };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader><DialogTitle>Log Activity</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2"><Label>Update Text</Label><Textarea value={text} onChange={e => setText(e.target.value)} placeholder="Record site details or project updates..." className="h-32" /></div>
          <div className="space-y-2">
            <div className="flex justify-between items-center"><Label>Attachments</Label><Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}><Paperclip className="h-3 w-3 mr-1" /> Add File</Button></div>
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
            <div className="grid grid-cols-4 gap-2">{attachments.map(a => <AttachmentThumbnail key={a.id} attachment={a} onRemove={() => setAttachments(prev => prev.filter(x => x.id !== a.id))} />)}</div>
          </div>
        </div>
        <DialogFooter><Button onClick={handleSave} className="bg-primary w-full">Save to Log</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function resolveQuickBillableDiscount(project: Project, client: Client | null): DiscountType {
  if (project.hasHourlyDiscount) return 'Contractor';
  const de = client?.discountEligibility;
  if (de === 'First Responder') return 'First Responder';
  if (de === 'Military') return 'Military';
  if (de === 'Home & Garden Show') return 'Home & Garden Show';
  if (de === 'Repeat Client') return 'Repeat Client';
  return 'None';
}

function QuickBillableDialog({ open, onOpenChange, projectId, clientId, designer, dataRootId, hourlyRate, project, client }: { open: boolean, onOpenChange: (o: boolean) => void, projectId: string, clientId: string, designer: Designer, dataRootId: string | null, hourlyRate?: number, project: Project, client: Client | null }) {
  const firestore = useFirestore(); const { toast } = useToast();
  const [hours, setHours] = useState(''); const [desc, setDesc] = useState('');
  const baseRate = hourlyRate != null && hourlyRate > 0 ? hourlyRate : 125;
  const discount = resolveQuickBillableDiscount(project, client);
  const effectiveRate = discount !== 'None' ? Math.max(0, baseRate - 15) : baseRate;
  const handleHoursBlur = () => { const decimalValue = parseTimeToDecimal(hours); setHours(decimalValue ? decimalValue.toFixed(2) : ''); };
  const handleSave = () => {
    if (!dataRootId || !hours.trim()) return;
    const h = parseTimeToDecimal(hours);
    if (h <= 0) return;
    const dateStr = new Date().toISOString().slice(0, 10);
    const lineLabel = desc.trim() || 'Work logged';
    const lineItems = [{ id: `line-${Date.now()}`, date: dateStr, hours: h, description: lineLabel }];
    const combinedDescription = `- ${dateStr} | ${h.toFixed(2)}h | ${lineLabel}`;
    const total = h * effectiveRate;
    const ref = doc(collection(firestore, 'employees', dataRootId, 'billable_hour_entries'));
    setDocumentNonBlocking(ref, {
      id: ref.id,
      projectId,
      clientId,
      hours: h,
      rate: effectiveRate,
      total,
      description: combinedDescription,
      designer,
      status: 'Not Sent',
      date: dateStr,
      discount,
      lateFee: 0,
      lineItems,
    }, { merge: true });
    toast({ title: "Hours Logged" });
    onOpenChange(false);
    setHours('');
    setDesc('');
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader><DialogTitle>Log Billable Hours</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Hours (e.g. 1:30)</Label><Input type="text" value={hours} onChange={e => setHours(e.target.value)} onBlur={handleHoursBlur} /></div>
            <div className="space-y-2"><Label>Base rate ($)</Label><Input value={String(baseRate)} disabled /></div>
          </div>
          {discount !== 'None' && (
            <p className="text-xs text-muted-foreground">
              Discount: <span className="font-semibold text-foreground">{discount}</span>
              {' — '}
              billing at <span className="font-semibold text-accent">${effectiveRate.toFixed(2)}/hr</span> ($15 off base)
            </p>
          )}
          <div className="space-y-2"><Label>Work Performed</Label><Textarea value={desc} onChange={e => setDesc(e.target.value)} /></div>
        </div>
        <DialogFooter><Button onClick={handleSave} className="bg-primary">Record Entry</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuickPrintDialog({ open, onOpenChange, projectId, clientId, designer, dataRootId }: { open: boolean, onOpenChange: (o: boolean) => void, projectId: string, clientId: string, designer: Designer, dataRootId: string | null }) {
  const firestore = useFirestore(); const { toast } = useToast();
  const [sheets, setSheets] = useState(''); const [size, setSize] = useState<PaperSize>('36"X24"');
  const handleSave = () => { if (!dataRootId || !sheets) return; const qty = parseInt(sheets); const rate = size === '48"X36"' ? 6.25 : 4.25; const ref = doc(collection(firestore, 'employees', dataRootId, 'print_job_entries')); setDocumentNonBlocking(ref, { id: ref.id, projectId, clientId, sheets: qty, rate, total: qty * rate, description: `${qty} Sheets - ${size}`, designer, status: 'Not Sent', date: new Date().toISOString(), paperSize: size, type: 'Job', lateFee: 0 }, { merge: true }); toast({ title: "Print Job Logged" }); onOpenChange(false); setSheets(''); };
  return (<Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-[425px]"><DialogHeader><DialogTitle>Log Print Job</DialogTitle></DialogHeader><div className="space-y-4 py-4"><div className="space-y-2"><Label>Sheet Quantity</Label><Input type="number" value={sheets} onChange={e => setSheets(e.target.value)} /></div><div className="space-y-2"><Label>Paper Size</Label><select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm font-bold" value={size} onChange={e => setSize(e.target.value as any)}><option value='36"X24"'>36" X 24"</option><option value='48"X36"'>48" X 36"</option></select></div></div><DialogFooter><Button onClick={handleSave} className="bg-primary">Record Job</Button></DialogFooter></DialogContent></Dialog>);
}

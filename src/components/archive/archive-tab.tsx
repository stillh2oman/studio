
"use client"

import { useState, useMemo } from 'react';
import { Client, Project, BillableEntry, PrintEntry, Task, InvoiceStatus, Designer, EmployeeName, Priority, TaskStatus, TaskCategory, PaperSize, ProjectNote } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Clock, Pencil, Trash2, Shield, Check, Eye, MessageSquare, MapPin, Building2, ArrowUpDown, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { ProjectNotes } from '@/components/projects/project-notes';
import { useCollection, useMemoFirebase, useFirestore } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';

type SortConfig<T> = { key: keyof T | string; direction: 'asc' | 'desc' } | null;

interface ArchiveTabProps {
  clients: Client[];
  projects: Project[];
  billableEntries: BillableEntry[];
  printEntries: PrintEntry[];
  taskEntries: Task[];
  onUpdateBillable: (id: string, entry: Partial<BillableEntry>) => void;
  onDeleteBillable: (id: string) => void;
  onUpdatePrint: (id: string, entry: Partial<PrintEntry>) => void;
  onDeletePrint: (id: string) => void;
  onUpdateTask: (id: string, task: Partial<Task>) => void;
  onDeleteTask: (id: string) => void;
  onRestoreBillable: (id: string) => void;
  onRestorePrint: (id: string) => void;
  onRestoreTask: (id: string) => void;
  onRestoreProject: (id: string) => void;
  canEdit?: boolean;
}

const formatSafeDate = (dateStr?: string | null) => {
  if (!dateStr) return '—';
  try {
    if (dateStr.includes('T')) return format(parseISO(dateStr), 'MMM d, yy');
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0]);
      const m = parseInt(parts[1]);
      const d = parseInt(parts[2]);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        return format(new Date(y, m - 1, d), 'MMM d, yy');
      }
    }
    return dateStr;
  } catch (e) {
    return dateStr || '—';
  }
};

export function ArchiveTab({ 
  clients = [], 
  projects = [], 
  billableEntries = [], 
  printEntries = [], 
  taskEntries = [],
  onUpdateBillable,
  onDeleteBillable,
  onUpdatePrint,
  onDeletePrint,
  onUpdateTask,
  onDeleteTask,
  onRestoreBillable,
  onRestorePrint,
  onRestoreTask,
  onRestoreProject,
  canEdit = true
}: ArchiveTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const firestore = useFirestore();
  
  const [billableSort, setBillableSort] = useState<SortConfig<BillableEntry>>(null);
  const [printSort, setPrintSort] = useState<SortConfig<PrintEntry>>(null);
  const [taskSort, setTaskSort] = useState<SortConfig<Task>>(null);
  const [projectSort, setProjectSort] = useState<SortConfig<Project>>(null);

  const [editingBillable, setEditingBillable] = useState<BillableEntry | null>(null);
  const [editingPrint, setEditingPrint] = useState<PrintEntry | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [viewingProject, setViewingProject] = useState<Project | null>(null);

  const filteredBillables = useMemo(() => {
    let items = (billableEntries || []).filter(e => {
      const client = clients.find(c => c.id === e.clientId);
      const project = projects.find(p => p.id === e.projectId);
      const searchStr = `${client?.name || (e as any).clientName || ''} ${project?.name || (e as any).projectName || ''} ${e.description || ''} ${e.designer || ''}`.toLowerCase();
      return searchStr.includes(searchQuery.toLowerCase());
    });

    if (billableSort) {
      items.sort((a, b) => {
        let aVal: any = a[billableSort.key as keyof BillableEntry];
        let bVal: any = b[billableSort.key as keyof BillableEntry];
        if (billableSort.key === 'projectName') {
          aVal = projects.find(p => p.id === a.projectId)?.name || '';
          bVal = projects.find(p => p.id === b.projectId)?.name || '';
        }
        if (aVal < bVal) return billableSort.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return billableSort.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return items;
  }, [billableEntries, searchQuery, clients, projects, billableSort]);

  const filteredPrints = useMemo(() => {
    let items = (printEntries || []).filter(e => {
      const client = clients.find(c => c.id === e.clientId);
      const project = projects.find(p => p.id === e.projectId);
      const searchStr = `${client?.name || (e as any).clientName || ''} ${project?.name || (e as any).projectName || ''} ${e.paperSize || ''} ${e.designer || ''}`.toLowerCase();
      return searchStr.includes(searchQuery.toLowerCase());
    });

    if (printSort) {
      items.sort((a, b) => {
        let aVal: any = a[printSort.key as keyof PrintEntry];
        let bVal: any = b[printSort.key as keyof PrintEntry];
        if (printSort.key === 'projectName') {
          aVal = projects.find(p => p.id === a.projectId)?.name || '';
          bVal = projects.find(p => p.id === b.projectId)?.name || '';
        }
        if (aVal < bVal) return printSort.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return printSort.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return items;
  }, [printEntries, searchQuery, clients, projects, printSort]);

  const filteredTasks = useMemo(() => {
    let items = (taskEntries || []).filter(e => {
      const client = clients.find(c => c.id === e.clientId);
      const project = projects.find(p => p.id === e.projectId);
      const searchStr = `${client?.name || ''} ${project?.name || ''} ${e.description || ''} ${e.assignedTo || ''}`.toLowerCase();
      return searchStr.includes(searchQuery.toLowerCase());
    });

    if (taskSort) {
      items.sort((a, b) => {
        let aVal: any = a[taskSort.key as keyof Task];
        let bVal: any = b[taskSort.key as keyof Task];
        if (taskSort.key === 'projectName') {
          aVal = projects.find(p => p.id === a.projectId)?.name || '';
          bVal = projects.find(p => p.id === b.projectId)?.name || '';
        }
        if (aVal < bVal) return taskSort.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return taskSort.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return items;
  }, [taskEntries, searchQuery, clients, projects, taskSort]);

  const filteredProjects = useMemo(() => {
    let items = projects.filter(p => (p.status === 'Archived' || p.isArchived) && (
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      clients.find(c => c.id === p.clientId)?.name.toLowerCase().includes(searchQuery.toLowerCase())
    ));

    if (projectSort) {
      items.sort((a, b) => {
        let aVal: any = a[projectSort.key as keyof Project];
        let bVal: any = b[projectSort.key as keyof Project];
        if (projectSort.key === 'clientName') {
          aVal = clients.find(c => c.id === a.clientId)?.name || '';
          bVal = clients.find(c => c.id === b.clientId)?.name || '';
        }
        if (aVal < bVal) return projectSort.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return projectSort.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return items;
  }, [projects, searchQuery, clients, projectSort]);

  const SortIcon = ({ config, column }: { config: SortConfig<any>, column: string }) => {
    if (config?.key !== column) return <ArrowUpDown className="ml-2 h-3.5 w-3.5 opacity-30" />;
    return config.direction === 'asc' ? <ChevronUp className="ml-2 h-3.5 w-3.5 text-primary" /> : <ChevronDown className="ml-2 h-3.5 w-3.5 text-primary" />;
  };

  const handleBillableSort = (key: string) => setBillableSort(prev => (prev?.key === key && prev.direction === 'asc') ? { key, direction: 'desc' } : { key, direction: 'asc' });
  const handlePrintSort = (key: string) => setPrintSort(prev => (prev?.key === key && prev.direction === 'asc') ? { key, direction: 'desc' } : { key, direction: 'asc' });
  const handleTaskSort = (key: string) => setTaskSort(prev => (prev?.key === key && prev.direction === 'asc') ? { key, direction: 'desc' } : { key, direction: 'asc' });
  const handleProjectSort = (key: string) => setProjectSort(prev => (prev?.key === key && prev.direction === 'asc') ? { key, direction: 'desc' } : { key, direction: 'asc' });

  // Handle Project Notes for archived projects
  const sessionEmployeeId = typeof window !== 'undefined' ? localStorage.getItem('di_ledger_session_employee_id') : null;
  const dataRootId = sessionEmployeeId; 

  const notesQuery = useMemoFirebase(() => {
    if (!dataRootId || !viewingProject) return null;
    return query(
      collection(firestore, 'employees', dataRootId, 'projects', viewingProject.id, 'notes'),
      orderBy('createdAt', 'desc')
    );
  }, [firestore, dataRootId, viewingProject]);

  const { data: archivedNotes } = useCollection<ProjectNote>(notesQuery);

  return (
    <div className="space-y-6">
      {!canEdit && (
        <Alert className="bg-muted/30 border-dashed border-border/50">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <AlertTitle>Read-Only Access</AlertTitle>
          <div className="text-xs text-muted-foreground">You can browse archives, but modification is restricted.</div>
        </Alert>
      )}

      <Card className="border-border/50 shadow-xl overflow-hidden">
        <CardHeader className="bg-muted/50">
          <CardTitle className="font-headline text-3xl text-accent flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            Record Archive
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search archives..." 
                className="pl-10" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <Tabs defaultValue="billable_archive">
            <TabsList className="mb-6 h-auto flex-wrap justify-start">
              <TabsTrigger value="billable_archive">Billable Hours</TabsTrigger>
              <TabsTrigger value="print_archive">Print Jobs</TabsTrigger>
              <TabsTrigger value="task_archive">Completed Tasks</TabsTrigger>
              <TabsTrigger value="project_archive">Archived Projects</TabsTrigger>
            </TabsList>

            <TabsContent value="billable_archive" className="m-0">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleBillableSort('date')}>
                      <div className="flex items-center">Date <SortIcon config={billableSort} column="date" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleBillableSort('projectName')}>
                      <div className="flex items-center">Project / Client <SortIcon config={billableSort} column="projectName" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleBillableSort('designer')}>
                      <div className="flex items-center">Designer <SortIcon config={billableSort} column="designer" /></div>
                    </TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-muted/80" onClick={() => handleBillableSort('hours')}>
                      <div className="flex items-center justify-end">Hours <SortIcon config={billableSort} column="hours" /></div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-muted/80" onClick={() => handleBillableSort('rate')}>
                      <div className="flex items-center justify-end">Rate <SortIcon config={billableSort} column="rate" /></div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-muted/80" onClick={() => handleBillableSort('total')}>
                      <div className="flex items-center justify-end">Total <SortIcon config={billableSort} column="total" /></div>
                    </TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBillables.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center h-24 text-muted-foreground">No archived billable records found.</TableCell>
                    </TableRow>
                  ) : (
                    filteredBillables.map(entry => {
                      const proj = projects.find(p => p.id === entry.projectId);
                      const cli = clients.find(c => c.id === entry.clientId);
                      const isPastDue = entry.status === 'Past Due';
                      return (
                        <TableRow key={entry.id}>
                          <TableCell className={cn("text-xs whitespace-nowrap", isPastDue ? "text-rose-500 font-bold" : "text-muted-foreground")}>
                            {formatSafeDate(entry.date)}
                          </TableCell>
                          <TableCell>
                            <div className={cn("font-medium", isPastDue ? "text-rose-500 font-black" : "text-foreground")}>{proj?.name || (entry as any).projectName || (entry as any).project || 'Unknown Project'}</div>
                            <div className="text-xs text-muted-foreground">{cli?.name || (entry as any).clientName || (entry as any).client || 'Unknown Client'}</div>
                          </TableCell>
                          <TableCell className={cn("text-xs", isPastDue && "text-rose-500")}>{entry.designer}</TableCell>
                          <TableCell className={cn("max-w-xs truncate", isPastDue && "text-rose-500")} title={entry.description}>
                            {entry.description || "—"}
                          </TableCell>
                          <TableCell className={cn("text-right tabular-nums", isPastDue && "text-rose-500")}>{entry.hours.toFixed(2)}</TableCell>
                          <TableCell className={cn("text-right tabular-nums", isPastDue && "text-rose-500")}>${entry.rate.toFixed(2)}</TableCell>
                          <TableCell className={cn("text-right font-bold tabular-nums", isPastDue ? "text-rose-500" : "text-accent")}>
                            ${(entry.total || 0).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="icon" onClick={() => onRestoreBillable(entry.id)} disabled={!canEdit} title="Restore to active billable hours">
                                <RotateCcw className="h-4 w-4 text-emerald-400" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setEditingBillable(entry)} disabled={!canEdit}><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-rose-500" onClick={() => onDeleteBillable(entry.id)} disabled={!canEdit}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="print_archive" className="m-0">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handlePrintSort('date')}>
                      <div className="flex items-center">Date <SortIcon config={printSort} column="date" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handlePrintSort('projectName')}>
                      <div className="flex items-center">Project / Client <SortIcon config={printSort} column="projectName" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handlePrintSort('designer')}>
                      <div className="flex items-center">Designer <SortIcon config={printSort} column="designer" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handlePrintSort('paperSize')}>
                      <div className="flex items-center">Size <SortIcon config={printSort} column="paperSize" /></div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-muted/80" onClick={() => handlePrintSort('rate')}>
                      <div className="flex items-center justify-end">Rate <SortIcon config={printSort} column="rate" /></div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-muted/80" onClick={() => handlePrintSort('sheets')}>
                      <div className="flex items-center justify-end">Sheets <SortIcon config={printSort} column="sheets" /></div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-muted/80" onClick={() => handlePrintSort('total')}>
                      <div className="flex items-center justify-end">Total <SortIcon config={printSort} column="total" /></div>
                    </TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPrints.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center h-24 text-muted-foreground">No archived print records found.</TableCell>
                    </TableRow>
                  ) : (
                    filteredPrints.map(entry => {
                      const proj = projects.find(p => p.id === entry.projectId);
                      const cli = clients.find(c => c.id === entry.clientId);
                      const isPastDue = entry.status === 'Past Due';
                      return (
                        <TableRow key={entry.id}>
                          <TableCell className={cn("text-xs whitespace-nowrap", isPastDue ? "text-rose-500 font-bold" : "text-muted-foreground")}>
                            {formatSafeDate(entry.date)}
                          </TableCell>
                          <TableCell>
                            <div className={cn("font-medium", isPastDue ? "text-rose-500 font-black" : "text-foreground")}>{proj?.name || (entry as any).projectName || (entry as any).project || 'Unknown Project'}</div>
                            <div className="text-xs text-muted-foreground">{cli?.name || (entry as any).clientName || (entry as any).client || 'Unknown Client'}</div>
                          </TableCell>
                          <TableCell className={cn("text-xs", isPastDue && "text-rose-500")}>{entry.designer}</TableCell>
                          <TableCell className={cn(isPastDue ? "text-rose-500" : "text-accent font-bold")}>{entry.paperSize}</TableCell>
                          <TableCell className={cn("text-right tabular-nums", isPastDue && "text-rose-500")}>${entry.rate.toFixed(2)}</TableCell>
                          <TableCell className={cn("text-right tabular-nums", isPastDue && "text-rose-500")}>{entry.sheets}</TableCell>
                          <TableCell className={cn("text-right font-bold tabular-nums", isPastDue ? "text-rose-500" : "text-accent")}>
                            ${(entry.total || 0).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="icon" onClick={() => onRestorePrint(entry.id)} disabled={!canEdit} title="Restore to active print jobs">
                                <RotateCcw className="h-4 w-4 text-emerald-400" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setEditingPrint(entry)} disabled={!canEdit}><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-rose-500" onClick={() => onDeletePrint(entry.id)} disabled={!canEdit}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="task_archive" className="m-0">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleTaskSort('updatedAt')}>
                      <div className="flex items-center">Completed On <SortIcon config={taskSort} column="updatedAt" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleTaskSort('projectName')}>
                      <div className="flex items-center">Project / Client <SortIcon config={taskSort} column="projectName" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleTaskSort('assignedTo')}>
                      <div className="flex items-center">Assignee <SortIcon config={taskSort} column="assignedTo" /></div>
                    </TableHead>
                    <TableHead>Task Description</TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleTaskSort('priority')}>
                      <div className="flex items-center">Priority <SortIcon config={taskSort} column="priority" /></div>
                    </TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTasks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">No archived tasks found.</TableCell>
                    </TableRow>
                  ) : (
                    filteredTasks.map(task => {
                      const proj = projects.find(p => p.id === task.projectId);
                      const cli = clients.find(c => c.id === task.clientId);
                      return (
                        <TableRow key={task.id}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            <div className="flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date(task.updatedAt).toLocaleDateString()}</div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{proj?.name || 'No Project'}</div>
                            <div className="text-xs text-muted-foreground">{cli?.name || 'No Client'}</div>
                          </TableCell>
                          <TableCell className="text-xs">{task.assignedTo}</TableCell>
                          <TableCell className="max-w-xs truncate" title={task.description}>
                            {task.description}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{task.priority}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="icon" onClick={() => onRestoreTask(task.id)} disabled={!canEdit} title="Restore to active tasks">
                                <RotateCcw className="h-4 w-4 text-emerald-400" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setEditingTask(task)} disabled={!canEdit}><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-rose-500" onClick={() => onDeleteTask(task.id)} disabled={!canEdit}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="project_archive" className="m-0">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleProjectSort('name')}>
                      <div className="flex items-center">Project Name <SortIcon config={projectSort} column="name" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleProjectSort('clientName')}>
                      <div className="flex items-center">Client <SortIcon config={projectSort} column="clientName" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleProjectSort('designer')}>
                      <div className="flex items-center">Designer <SortIcon config={projectSort} column="designer" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleProjectSort('address')}>
                      <div className="flex items-center">Location <SortIcon config={projectSort} column="address" /></div>
                    </TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProjects.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center h-24 text-muted-foreground italic">No archived projects found.</TableCell>
                    </TableRow>
                  ) : (
                    filteredProjects.map(project => (
                      <TableRow key={project.id}>
                        <TableCell className="font-bold text-white">{project.name}</TableCell>
                        <TableCell className="text-sm">{clients.find(c => c.id === project.clientId)?.name || '—'}</TableCell>
                        <TableCell className="text-xs">{project.designer}</TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">{project.address || '—'}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" onClick={() => onRestoreProject(project.id)} disabled={!canEdit} title="Restore to active projects">
                              <RotateCcw className="h-4 w-4 text-emerald-400" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setViewingProject(project)} title="View Logged Notes">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={!!viewingProject} onOpenChange={(open) => !open && setViewingProject(null)}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          {viewingProject && (
            <div className="space-y-6">
              <DialogHeader>
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                    <MessageSquare className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <DialogTitle className="text-2xl font-headline text-white">{viewingProject.name}</DialogTitle>
                    <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {viewingProject.address || 'Site records'}</span>
                      <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {viewingProject.constructionCompany || 'Builder records'}</span>
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <div className="py-4 border-t border-border/50">
                <ProjectNotes 
                  projectId={viewingProject.id}
                  notes={archivedNotes || []}
                  onAddNote={() => {}} 
                  onUpdateNote={() => {}}
                  onDeleteNote={() => {}}
                  canEdit={false} 
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setViewingProject(null)}>Close Archive View</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

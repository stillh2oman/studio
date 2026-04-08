"use client"

import { useState, useMemo, useEffect } from 'react';
import { Client, Project, BillableEntry, DiscountType, InvoiceStatus, Designer } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { NoteHelper } from '@/components/shared/note-helper';
import { Plus, Pencil, Trash2, Percent, DollarSign, Check, ArrowUpDown, ChevronUp, ChevronDown, Clock, AlertCircle, FileCheck, Send, Ruler, Calculator, TrendingUp, AlertTriangle } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { getEffectiveInvoiceStatus } from '@/lib/invoice-status';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type SortConfig = { key: keyof BillableEntry | 'projectName' | 'clientName'; direction: 'asc' | 'desc' } | null;
type BillingLineItem = { id: string; date: string; hoursInput: string; description: string };

interface BillableHoursTabProps {
  clients: Client[];
  projects: Project[];
  entries: BillableEntry[];
  archivedEntries: BillableEntry[];
  onAddEntry: (entry: Omit<BillableEntry, 'id'>) => void;
  onUpdateEntry: (id: string, entry: Partial<BillableEntry>) => void;
  onDeleteEntry: (id: string) => void;
  onUpdateStatus: (id: string, status: InvoiceStatus) => void;
  onAddProject: () => void;
  onUpdateProject: (id: string, data: Partial<Project>) => void;
  canEdit?: boolean;
}

const DESIGNERS: Designer[] = ["Jeff Dillon", "Kevin Walthall"].sort() as Designer[];
const STATUSES: InvoiceStatus[] = ["Invoice Sent", "Not Sent", "Paid", "Past Due"].sort() as InvoiceStatus[];
const DISCOUNTS: DiscountType[] = ["Contractor", "First Responder", "Home & Garden Show", "Military", "None", "Repeat Client"].sort() as DiscountType[];

const formatSafeDate = (dateStr?: string | null) => {
  if (!dateStr) return '—';
  try {
    if (dateStr.includes('T')) return format(parseISO(dateStr), 'MMM d, yy');
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0]);
      const m = parseInt(parts[1]);
      const d = parseInt(parts[2]);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return format(new Date(y, m - 1, d), 'MMM d, yy');
    }
    return dateStr;
  } catch (e) { return dateStr || '—'; }
};

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

export function BillableHoursTab({ 
  clients, 
  projects, 
  entries, 
  archivedEntries = [],
  onAddEntry, 
  onUpdateEntry, 
  onDeleteEntry, 
  onUpdateStatus, 
  onAddProject, 
  onUpdateProject,
  canEdit = true 
}: BillableHoursTabProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState('');
  const [lineItems, setLineItems] = useState<BillingLineItem[]>([
    { id: 'line-1', date: new Date().toISOString().slice(0, 10), hoursInput: '', description: '' }
  ]);
  const [rate, setRate] = useState('');
  const [sqFtInput, setSqFtInput] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<InvoiceStatus>('Not Sent');
  const [designer, setDesigner] = useState<Designer>('Jeff Dillon');
  const [discount, setDiscount] = useState<DiscountType>('None');
  const [sentDate, setSentDate] = useState('');
  const [lateFeeAmount, setLateFeeAmount] = useState(0);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  const sortedProjects = useMemo(() => [...projects].sort((a, b) => a.name.localeCompare(b.name)), [projects]);
  const selectedProject = useMemo(() => projects.find(p => p.id === projectId), [projectId, projects]);

  useEffect(() => {
    if (selectedProject) {
      if (selectedProject.hourlyRate) setRate(selectedProject.hourlyRate.toString());
      if (selectedProject.currentHeatedSqFt) setSqFtInput(selectedProject.currentHeatedSqFt.toString());
      else setSqFtInput('');
    }
  }, [selectedProject]);

  const budgetStats = useMemo(() => {
    if (!selectedProject) return null;
    const sqFt = parseFloat(sqFtInput) || selectedProject.currentHeatedSqFt || 0;
    const totalBudget = sqFt * 1.50;
    const allRelevantEntries = [...entries, ...archivedEntries].filter(e => e.projectId === projectId);
    const totalBilled = allRelevantEntries.reduce((sum, e) => sum + (Number(e.total) || 0), 0);
    const remainingBudget = totalBudget - totalBilled;
    const percentBilled = totalBudget > 0 ? (totalBilled / totalBudget) * 100 : 0;
    return { totalBudget, totalBilled, remainingBudget, percentBilled, sqFt };
  }, [selectedProject, projectId, entries, archivedEntries, sqFtInput]);

  const runningTotals = useMemo(() => {
    const totals = {
      'Invoice Sent': 0,
      'Not Sent': 0,
      'Past Due': 0
    };
    entries.forEach(e => {
      const effStatus = getEffectiveInvoiceStatus(e);
      if (effStatus !== 'Paid' && totals[effStatus] !== undefined) {
        totals[effStatus] += Number(e.total) || 0;
      }
    });
    return totals;
  }, [entries]);

  const sortedEntries = useMemo(() => {
    let items = [...entries];
    if (sortConfig !== null) {
      items.sort((a, b) => {
        let aVal: any = a[sortConfig.key as keyof BillableEntry];
        let bVal: any = b[sortConfig.key as keyof BillableEntry];
        if (sortConfig.key === 'projectName') {
          aVal = projects.find(p => p.id === a.projectId)?.name || '';
          bVal = projects.find(p => p.id === b.projectId)?.name || '';
        } else if (sortConfig.key === 'clientName') {
          aVal = clients.find(c => c.id === a.clientId)?.name || '';
          bVal = clients.find(c => c.id === b.clientId)?.name || '';
        }
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    return items;
  }, [entries, sortConfig, projects, clients]);

  const currentHours = useMemo(
    () => lineItems.reduce((sum, item) => sum + parseTimeToDecimal(item.hoursInput), 0),
    [lineItems]
  );
  const effectiveRate = useMemo(() => {
    const baseRate = parseFloat(rate) || 0;
    return discount !== 'None' ? Math.max(0, baseRate - 15) : baseRate;
  }, [rate, discount]);
  const currentTotal = useMemo(() => (currentHours * effectiveRate) + lateFeeAmount, [currentHours, effectiveRate, lateFeeAmount]);

  const handleHoursBlur = (id: string) => {
    setLineItems(prev =>
      prev.map(item => {
        if (item.id !== id) return item;
        const decimalValue = parseTimeToDecimal(item.hoursInput);
        return { ...item, hoursInput: decimalValue ? decimalValue.toFixed(2) : '' };
      })
    );
  };

  const handleAddLateFee = () => {
    const base = currentHours * effectiveRate;
    setLateFeeAmount(base * 0.03);
  };

  const addLineItem = () => {
    setLineItems(prev => [
      ...prev,
      { id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, date: new Date().toISOString().slice(0, 10), hoursInput: '', description: '' }
    ]);
  };

  const removeLineItem = (id: string) => {
    setLineItems(prev => (prev.length > 1 ? prev.filter(item => item.id !== id) : prev));
  };

  const updateLineItem = (id: string, patch: Partial<BillingLineItem>) => {
    setLineItems(prev => prev.map(item => (item.id === id ? { ...item, ...patch } : item)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !projectId || !rate) return;
    const validLines = lineItems.filter(item => parseTimeToDecimal(item.hoursInput) > 0 || item.description.trim() || item.date);
    const lineHoursTotal = validLines.reduce((sum, item) => sum + parseTimeToDecimal(item.hoursInput), 0);
    if (lineHoursTotal <= 0) return;

    const normalizedLineItems = validLines.map(item => ({
      id: item.id,
      date: item.date || new Date().toISOString().slice(0, 10),
      hours: parseTimeToDecimal(item.hoursInput),
      description: item.description.trim(),
    }));

    const combinedDescription = normalizedLineItems
      .map(line => `- ${line.date} | ${line.hours.toFixed(2)}h | ${line.description || 'Work logged'}`)
      .join('\n');

    const primaryDate = normalizedLineItems[0]?.date || new Date().toISOString().slice(0, 10);

    const entryData = { 
      projectId, 
      clientId: projects.find(p => p.id === projectId)?.clientId || '', 
      hours: lineHoursTotal, 
      rate: effectiveRate, 
      lateFee: lateFeeAmount, 
      total: (lineHoursTotal * effectiveRate) + lateFeeAmount, 
      description: combinedDescription, 
      discount, 
      status, 
      designer, 
      sentDate: sentDate || null,
      lineItems: normalizedLineItems,
      date: primaryDate
    };
    if (editingId) onUpdateEntry(editingId, entryData);
    else onAddEntry(entryData);
    const newSqFt = parseFloat(sqFtInput);
    if (!isNaN(newSqFt) && newSqFt !== selectedProject?.currentHeatedSqFt) {
      onUpdateProject(projectId, { currentHeatedSqFt: newSqFt });
    }
    resetForm();
  };

  const resetForm = () => { 
    setEditingId(null); setProjectId(''); setRate(''); setSqFtInput(''); setDescription(''); setStatus('Not Sent'); setDiscount('None'); setSentDate(''); setLateFeeAmount(0);
    setLineItems([{ id: 'line-1', date: new Date().toISOString().slice(0, 10), hoursInput: '', description: '' }]);
  };

  const handleEdit = (entry: BillableEntry) => {
    const proj = projects.find(p => p.id === entry.projectId);
    setEditingId(entry.id); 
    setProjectId(entry.projectId); 
    const existingLines = Array.isArray((entry as any).lineItems) && (entry as any).lineItems.length
      ? (entry as any).lineItems.map((line: any, idx: number) => ({
          id: line.id || `line-edit-${idx}`,
          date: String(line.date || entry.date || '').slice(0, 10),
          hoursInput: String(line.hours ?? ''),
          description: String(line.description || ''),
        }))
      : [{ id: 'line-edit-1', date: String(entry.date || '').slice(0, 10), hoursInput: String(entry.hours || ''), description: entry.description || '' }];
    setLineItems(existingLines);
    const restoredBaseRate = entry.discount !== 'None' ? entry.rate + 15 : entry.rate;
    setRate(restoredBaseRate.toString()); 
    setSqFtInput(proj?.currentHeatedSqFt?.toString() || ''); 
    setDescription(entry.description || ''); 
    setStatus(entry.status); 
    setDesigner(entry.designer); 
    setDiscount(entry.discount || 'None'); 
    setSentDate(entry.sentDate || ''); 
    setLateFeeAmount(entry.lateFee || 0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSort = (key: string) => { setSortConfig(prev => (prev?.key === key && prev.direction === 'asc') ? { key, direction: 'desc' } : { key, direction: 'asc' }); };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig?.key !== column) return <ArrowUpDown className="ml-2 h-3 w-3 opacity-30" />;
    return sortConfig.direction === 'asc' ? <ChevronUp className="ml-2 h-3 w-3 text-primary" /> : <ChevronDown className="ml-2 h-3 w-3 text-primary" />;
  };

  return (
    <div className="space-y-8">
      {/* Running Totals Summary - Hiding Paid Revenue */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border/50 bg-card/30 p-4 hover:border-primary/30 transition-all">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
              <Clock className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">Pending (Not Sent)</p>
              <p className="text-xl font-bold text-white">${runningTotals['Not Sent'].toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </Card>
        <Card className="border-border/50 bg-card/30 p-4 hover:border-primary/30 transition-all">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-sky-500/10 flex items-center justify-center border border-sky-500/20">
              <Send className="h-5 w-5 text-sky-500" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">Invoiced (Sent)</p>
              <p className="text-xl font-bold text-white">${runningTotals['Invoice Sent'].toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </Card>
        <Card className="border-border/50 bg-rose-500/5 p-4 border-rose-500/20 hover:bg-rose-500/10 transition-all">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
              <AlertCircle className="h-5 w-5 text-rose-500" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-black text-rose-500 tracking-widest">Past Due (Auto-Triaged)</p>
              <p className="text-xl font-bold text-rose-500">${runningTotals['Past Due'].toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </Card>
      </div>

      {projectId && budgetStats && (
        <Card className="border-border/50 bg-card/30 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
          <CardHeader className="bg-indigo-500/10 border-b border-indigo-500/20 py-4 flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <Calculator className="h-5 w-5 text-indigo-400" />
              <div>
                <CardTitle className="text-sm font-headline uppercase tracking-widest text-indigo-400">Project Fee Management</CardTitle>
                <p className="text-[10px] text-muted-foreground font-bold uppercase">{selectedProject?.name} • {budgetStats.sqFt.toLocaleString()} SQ. FT.</p>
              </div>
            </div>
            <Badge variant="outline" className="bg-indigo-500/5 text-indigo-400 border-indigo-500/20 text-[10px] font-black tracking-widest">RATE: $1.50/FT</Badge>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <span className="text-[9px] uppercase font-black text-muted-foreground tracking-widest">Total Project Fee Budget</span>
                    <p className="text-3xl font-headline font-bold text-white">${budgetStats.totalBudget.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-bold uppercase">
                    <span className="text-muted-foreground">Progress</span>
                    <span className={cn(budgetStats.percentBilled > 90 ? "text-rose-500" : "text-indigo-400")}>{budgetStats.percentBilled.toFixed(1)}%</span>
                  </div>
                  <Progress value={budgetStats.percentBilled} className="h-2 bg-muted border border-border/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 col-span-2">
                <div className="bg-emerald-500/5 p-4 rounded-xl border border-emerald-500/10 flex flex-col justify-between">
                  <span className="text-[9px] uppercase font-black text-emerald-500 tracking-widest mb-2 flex items-center gap-1.5"><TrendingUp className="h-3 w-3" /> Total Billed to Date</span>
                  <p className="text-2xl font-bold text-white tabular-nums">${budgetStats.totalBilled.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  <p className="text-[8px] text-muted-foreground mt-1 uppercase font-bold italic">Includes all archived entries</p>
                </div>
                <div className="bg-accent/5 p-4 rounded-xl border border-accent/10 flex flex-col justify-between">
                  <span className="text-[9px] uppercase font-black text-accent tracking-widest mb-2 flex items-center gap-1.5"><DollarSign className="h-3 w-3" /> Remaining Cap</span>
                  <p className={cn("text-2xl font-bold tabular-nums", budgetStats.remainingBudget < 0 ? "text-rose-500" : "text-white")}>
                    ${budgetStats.remainingBudget.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-[8px] text-muted-foreground mt-1 uppercase font-bold italic">Balance before completion</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {canEdit && (
        <Card className="border-border/50 shadow-xl overflow-hidden bg-card/50">
          <CardHeader className="bg-muted/30"><CardTitle className="text-2xl font-headline text-accent">{editingId ? 'Edit Billable Entry' : 'Log Billable Hours'}</CardTitle></CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="col-span-2 space-y-2"><Label>Project & Client</Label><div className="flex gap-2"><select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm font-bold shadow-inner focus:ring-2 focus:ring-primary outline-none transition-all" value={projectId} onChange={e => setProjectId(e.target.value)} required><option value="">Select Project...</option>{sortedProjects.map(p => { const cli = clients.find(c => c.id === p.clientId); return <option key={p.id} value={p.id}>{p.name} ({cli?.name || 'No Client'})</option>; })}</select><Button type="button" variant="outline" size="icon" onClick={onAddProject}><Plus className="h-4 w-4" /></Button></div></div>
                <div className="space-y-2"><Label>Designer</Label><select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm font-bold" value={designer} onChange={e => setDesigner(e.target.value as any)}>{DESIGNERS.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
                <div className="space-y-2"><Label>Invoice Status</Label><select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm font-bold" value={status} onChange={e => setStatus(e.target.value as any)}>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                <div className="space-y-2"><Label>Base Hourly Rate ($)</Label><Input value={rate} onChange={e => setRate(e.target.value)} type="number" step="0.01" required /></div>
                <div className="space-y-2"><Label className="text-indigo-400 flex items-center gap-1.5"><Ruler className="h-3.5 w-3.5" /> Heated Sq Ft (to Frame)</Label><Input value={sqFtInput} onChange={e => setSqFtInput(e.target.value)} type="number" step="0.01" placeholder="0.00" /></div>
                <div className="space-y-2">
                  <Label>Discount Selection</Label>
                  <select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm font-bold shadow-inner focus:ring-2 focus:ring-primary outline-none transition-all" value={discount} onChange={e => setDiscount(e.target.value as any)}>{DISCOUNTS.map(d => <option key={d} value={d}>{d}</option>)}</select>
                  {discount !== 'None' && (
                    <div className="flex flex-col gap-1 mt-2 p-2 rounded-lg bg-accent/10 border border-accent/20">
                      <div className="flex justify-between items-center"><span className="text-[8px] font-black uppercase text-accent">Professional Discount</span><span className="text-[10px] font-bold text-white">-$15.00/hr</span></div>
                      <div className="flex justify-between items-center border-t border-accent/10 pt-1 mt-1"><span className="text-[8px] font-black uppercase text-muted-foreground">Effective Rate</span><span className="text-xs font-black text-white">${effectiveRate.toFixed(2)}</span></div>
                    </div>
                  )}
                </div>
                <div className="space-y-2"><Label>Invoice Sent Date</Label><Input type="date" value={sentDate} onChange={e => setSentDate(e.target.value)} /></div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label>Billing Line Items (Date, Hours, Work Description)</Label>
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={addLineItem}>
                    <Plus className="h-3.5 w-3.5" /> Add Item
                  </Button>
                </div>
                {lineItems.map((item, idx) => (
                  <div key={item.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 border border-border/50 rounded-lg p-3 bg-background/30">
                    <div className="md:col-span-3 space-y-1">
                      <Label className="text-[10px] uppercase">Date</Label>
                      <Input type="date" value={item.date} onChange={e => updateLineItem(item.id, { date: e.target.value })} />
                    </div>
                    <div className="md:col-span-2 space-y-1">
                      <Label className="text-[10px] uppercase">Hours</Label>
                      <Input value={item.hoursInput} onChange={e => updateLineItem(item.id, { hoursInput: e.target.value })} onBlur={() => handleHoursBlur(item.id)} placeholder="0.00" />
                    </div>
                    <div className="md:col-span-6 space-y-1">
                      <div className="flex justify-between items-center">
                        <Label className="text-[10px] uppercase">Work Description</Label>
                        {idx === lineItems.length - 1 ? <NoteHelper onDescriptionGenerated={(text) => updateLineItem(item.id, { description: text })} /> : null}
                      </div>
                      <Textarea value={item.description} onChange={e => updateLineItem(item.id, { description: e.target.value })} placeholder="Details about work completed..." className="h-20 bg-background/50" />
                    </div>
                    <div className="md:col-span-1 flex items-end justify-end">
                      <Button type="button" variant="ghost" size="icon" className="text-rose-500" onClick={() => removeLineItem(item.id)} disabled={lineItems.length === 1}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-end border-t border-border/50 pt-4"><div className="space-y-2"><div className="flex items-center gap-4"><Button type="button" variant="outline" size="sm" className="gap-2 text-rose-400 border-rose-400/20 hover:bg-rose-400/10" onClick={handleAddLateFee}><Percent className="h-3 w-3" /> Add 3% Late Fee</Button>{lateFeeAmount > 0 && <span className="text-xs font-bold text-rose-400">Late Fee: +${lateFeeAmount.toFixed(2)}</span>}</div><div className="text-2xl font-headline font-bold text-white">Total: <span className="text-accent">${currentTotal.toFixed(2)}</span></div></div><div className="flex gap-3">{editingId && <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>}<Button type="submit" className="px-10 h-12 text-lg font-bold shadow-lg shadow-primary/20">{editingId ? 'Update Entry' : 'Log Entry'}</Button></div></div>
            </form>
          </CardContent>
        </Card>
      )}
      <Card className="border-border/50 shadow-lg overflow-hidden bg-card/50">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/20">
              <TableRow>
                <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('date')}><div className="flex items-center">Date <SortIcon column="date" /></div></TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('projectName')}><div className="flex items-center">Project <SortIcon column="projectName" /></div></TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('designer')}><div className="flex items-center">Designer <SortIcon column="designer" /></div></TableHead>
                <TableHead className="text-right cursor-pointer hover:bg-muted/80" onClick={() => handleSort('hours')}><div className="flex items-center justify-end">Hours <SortIcon column="hours" /></div></TableHead>
                <TableHead className="text-right cursor-pointer hover:bg-muted/80" onClick={() => handleSort('rate')}><div className="flex items-center justify-end">Rate <SortIcon column="rate" /></div></TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('status')}><div className="flex items-center">Status <SortIcon column="status" /></div></TableHead>
                <TableHead className="text-right cursor-pointer hover:bg-muted/80" onClick={() => handleSort('total')}><div className="flex items-center justify-end">Total <SortIcon column="total" /></div></TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedEntries.length === 0 ? (<TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground italic">No billable hours recorded yet.</TableCell></TableRow>) : (
                sortedEntries.map(e => {
                  const proj = projects.find(p => p.id === e.projectId);
                  const cli = clients.find(c => c.id === e.clientId);
                  const effStatus = getEffectiveInvoiceStatus(e);
                  const entryDate = e.date ? parseISO(e.date) : new Date();
                  const daysOld = differenceInDays(new Date(), entryDate);
                  const isPastDue = effStatus === 'Past Due';
                  const needsLateFee = daysOld > 30 && e.status !== 'Paid';
                  
                  const displayProject = proj?.name || (e as any).projectName || (e as any).project || 'Unknown Project';
                  const displayClient = cli?.name || (e as any).clientName || (e as any).client || 'Unknown Client';
                  
                  return (
                    <TableRow key={e.id} className={cn(isPastDue && "bg-rose-500/5")}>
                      <TableCell className={cn("text-xs font-bold whitespace-nowrap", isPastDue && "text-rose-500")}>{formatSafeDate(e.date)}</TableCell>
                      <TableCell className="font-bold">
                        <div className="flex items-center gap-2">
                          <div className={cn("text-white", isPastDue && "text-rose-500")}>{displayProject}</div>
                          {needsLateFee && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <AlertTriangle className="h-3.5 w-3.5 text-rose-500 animate-pulse" />
                                </TooltipTrigger>
                                <TooltipContent className="bg-rose-600 text-white border-none text-[10px] font-black uppercase">
                                  Action Required: Add Late Fee (&gt;30 Days)
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{displayClient}</div>
                      </TableCell>
                      <TableCell className={cn("text-xs", isPastDue && "text-rose-500")}>{e.designer}</TableCell>
                      <TableCell className={cn("text-right tabular-nums text-xs", isPastDue && "text-rose-500")}>{(Number(e.hours) || 0).toFixed(2)}h</TableCell>
                      <TableCell className={cn("text-right tabular-nums text-xs", isPastDue && "text-rose-500")}>${(Number(e.rate) || 0).toFixed(2)}</TableCell>
                      <TableCell><span className={cn("text-[10px] font-bold uppercase", isPastDue ? "text-rose-500" : "text-foreground")}>{effStatus}</span></TableCell>
                      <TableCell className={cn("text-right font-bold tabular-nums", isPastDue ? "text-rose-500" : "text-accent")}>${(Number(e.total) || 0).toFixed(2)}</TableCell>
                      <TableCell><div className="flex gap-1 justify-end">{e.status !== 'Paid' && (<Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-500 hover:bg-emerald-500/10" onClick={() => onUpdateStatus(e.id, 'Paid')} title="Mark as Paid" disabled={!canEdit}><Check className="h-4 w-4" /></Button>)}<Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(e)} disabled={!canEdit}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500" onClick={() => onDeleteEntry(e.id)} disabled={!canEdit}><Trash2 className="h-4 w-4" /></Button></div></TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

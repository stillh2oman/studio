"use client"

import { useState, useMemo, useEffect } from 'react';
import { Client, Project, PrintEntry, PaperSize, InvoiceStatus, Designer } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Plus, CheckCircle, Pencil, Trash2, Shield, Printer, DollarSign, Calendar, Check, ArrowUpDown, ChevronUp, ChevronDown, Clock, Send, AlertCircle, FileCheck, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format, parseISO, differenceInDays } from 'date-fns';
import { getEffectiveInvoiceStatus } from '@/lib/invoice-status';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type SortConfig = { key: keyof PrintEntry | 'projectName' | 'clientName'; direction: 'asc' | 'desc' } | null;

interface PrintingTabProps {
  clients: Client[];
  projects: Project[];
  entries: PrintEntry[];
  onAddEntry: (entry: Omit<PrintEntry, 'id'>) => void;
  onUpdateEntry: (id: string, entry: Partial<PrintEntry>) => void;
  onDeleteEntry: (id: string) => void;
  onUpdateStatus: (id: string, status: InvoiceStatus) => void;
  onAddProject: () => void;
  onAddClient: () => void;
  canEdit?: boolean;
}

const PAPER_SIZES: PaperSize[] = ['36"X24"', '48"X36"'].sort() as PaperSize[];
const STATUSES: InvoiceStatus[] = ["Invoice Sent", "Not Sent", "Paid", "Past Due"].sort() as InvoiceStatus[];
const DESIGNERS: Designer[] = ["Jeff Dillon", "Kevin Walthall"].sort() as Designer[];

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

export function PrintingTab({ 
  clients = [], 
  projects = [], 
  entries = [], 
  onAddEntry, 
  onUpdateEntry,
  onDeleteEntry,
  onUpdateStatus, 
  onAddProject, 
  onAddClient,
  canEdit = true
}: PrintingTabProps) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState('');
  const [productionDate, setProductionDate] = useState(new Date().toISOString().split('T')[0]);
  const [paperSize, setPaperSize] = useState<PaperSize>('36"X24"');
  const [description, setDescription] = useState('');
  const [rate, setRate] = useState('4.25');
  const [sheets, setSheets] = useState('');
  const [lateFee, setLateFee] = useState('0');
  const [status, setStatus] = useState<InvoiceStatus>('Not Sent');
  const [designer, setDesigner] = useState<Designer>('Jeff Dillon');
  const [sentDate, setSentDate] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  const sortedProjects = useMemo(() => [...(projects || [])].sort((a, b) => (a.name || '').localeCompare(b.name || '')), [projects]);

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
    if (sortConfig) {
      items.sort((a, b) => {
        let aVal: any = a[sortConfig.key as keyof PrintEntry];
        let bVal: any = b[sortConfig.key as keyof PrintEntry];
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

  const handlePaperSizeChange = (size: PaperSize) => {
    setPaperSize(size);
    if (size === '36"X24"') setRate('4.25');
    else if (size === '48"X36"') setRate('6.25');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !projectId) return;
    const parsedSheets = parseInt(sheets);
    if (!sheets || isNaN(parsedSheets) || parsedSheets < 0) return;
    const parsedRate = parseFloat(rate) || 0;
    const parsedLateFee = parseFloat(lateFee) || 0;
    const calculatedTotal = (parsedRate * parsedSheets) + parsedLateFee;
    const proj = sortedProjects.find(p => p.id === projectId);
    const entryData = {
      projectId, clientId: proj?.clientId || '', paperSize, description, rate: parsedRate, sheets: parsedSheets, lateFee: parsedLateFee, total: calculatedTotal, status, designer, sentDate: sentDate || null, date: productionDate, type: 'Job' as const
    };
    if (editingId) onUpdateEntry(editingId, entryData);
    else onAddEntry(entryData);
    resetForm();
  };

  const resetForm = () => {
    setEditingId(null); setProjectId(''); setProductionDate(new Date().toISOString().split('T')[0]); setDescription(''); setRate('4.25'); setPaperSize('36"X24"'); setSheets(''); setLateFee('0'); setStatus('Not Sent'); setSentDate('');
  };

  const handleEdit = (entry: PrintEntry) => {
    if (!canEdit) return;
    setEditingId(entry.id); setProjectId(entry.projectId || ''); setProductionDate(entry.date?.split('T')[0] || new Date().toISOString().split('T')[0]); setPaperSize(entry.paperSize || '36"X24"'); setDescription(entry.description || ''); setRate(entry.rate?.toString() || (entry.paperSize === '48"X36"' ? '6.25' : '4.25')); setSheets(entry.sheets?.toString() || ''); setLateFee(entry.lateFee?.toString() || '0'); setStatus(entry.status); setDesigner(entry.designer); setSentDate(entry.sentDate || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSort = (key: keyof PrintEntry | 'projectName' | 'clientName') => {
    setSortConfig((prev) =>
      prev?.key === key && prev.direction === 'asc' ? { key, direction: 'desc' } : { key, direction: 'asc' },
    );
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig?.key !== column) return <ArrowUpDown className="ml-2 h-3.5 w-3.5 opacity-30" />;
    return sortConfig.direction === 'asc' ? <ChevronUp className="ml-2 h-3.5 w-3.5 text-primary" /> : <ChevronDown className="ml-2 h-3.5 w-3.5 text-primary" />;
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
              <p className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">Pending Prints</p>
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
              <p className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">Sent to Client</p>
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

      {canEdit ? (
        <Card className="border-border/50 shadow-xl overflow-hidden bg-card/50">
          <CardHeader className="bg-muted/50">
            <CardTitle className="font-headline text-3xl text-accent flex items-center gap-2"><Printer className="h-6 w-6" /> {editingId ? 'Modify Record' : 'Log Print Job'}</CardTitle>
            <CardDescription>Record client print sets and architectural production sets.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="space-y-2 lg:col-span-2"><Label>Project Context</Label><div className="flex gap-2"><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-bold shadow-inner focus:ring-2 focus:ring-primary outline-none transition-all" value={projectId} onChange={e => setProjectId(e.target.value)} required><option value="">Select a Project...</option>{sortedProjects.map(p => { const client = clients?.find(c => c.id === p.clientId); return <option key={p.id} value={p.id}>{p.name} ({client?.name || 'No Client'})</option>; })}</select><Button type="button" variant="outline" size="icon" onClick={onAddProject} title="Add Missing Project">+</Button></div></div>
                <div className="space-y-2"><Label>Designer</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-bold shadow-inner focus:ring-2 focus:ring-primary outline-none transition-all" value={designer} onChange={e => setDesigner(e.target.value as Designer)}>{DESIGNERS.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
                <div className="space-y-2"><Label>Invoice Status</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-bold shadow-inner focus:ring-2 focus:ring-primary outline-none transition-all" value={status} onChange={e => setStatus(e.target.value as InvoiceStatus)}>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                <div className="space-y-2"><Label>Paper Size</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-bold shadow-inner focus:ring-2 focus:ring-primary outline-none transition-all" value={paperSize} onChange={e => handlePaperSizeChange(e.target.value as PaperSize)}>{PAPER_SIZES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                <div className="space-y-2"><Label>Rate / Sheet ($)</Label><Input type="number" step="0.01" value={rate} onChange={e => setRate(e.target.value)} /></div>
                <div className="space-y-2"><Label>Total Sheets</Label><Input type="number" value={sheets} onChange={e => setSheets(e.target.value)} placeholder="0" required /></div>
                <div className="space-y-2"><Label>Date of Production</Label><Input type="date" value={productionDate} onChange={e => setProductionDate(e.target.value)} required /></div>
              </div>
              <div className="space-y-2"><Label>Log Details (Items Printed)</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. 5x Floor Plans, 2x Electrical, 1x Site Plan" className="h-20 bg-background/50" /></div>
              <div className="flex justify-between items-end border-t border-border/50 pt-4"><div className="space-y-1"><p className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">Estimated Value</p><div className="text-3xl font-headline font-bold text-white">Total: <span className="text-accent">${((parseFloat(rate || '0') * (parseInt(sheets || '0') || 0)) + parseFloat(lateFee || '0')).toFixed(2)}</span></div></div><div className="flex gap-3">{editingId && <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>}<Button type="submit" className="bg-primary hover:bg-primary/90 px-10 h-12 font-bold text-lg shadow-lg">{editingId ? 'Update Entry' : 'Log Print Job'}</Button></div></div>
            </form>
          </CardContent>
        </Card>
      ) : <Alert className="bg-muted/30 border-dashed border-border/50"><Shield className="h-4 w-4 text-muted-foreground" /><AlertTitle>Read-Only Database</AlertTitle></Alert>}

      <Card className="border-border/50 shadow-lg overflow-hidden bg-card/50">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('date')}><div className="flex items-center">Date <SortIcon column="date" /></div></TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('projectName')}><div className="flex items-center">Project / Account <SortIcon column="projectName" /></div></TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('designer')}><div className="flex items-center">Designer <SortIcon column="designer" /></div></TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('paperSize')}><div className="flex items-center">Size <SortIcon column="paperSize" /></div></TableHead>
                <TableHead className="text-right cursor-pointer hover:bg-muted/80" onClick={() => handleSort('sheets')}><div className="flex items-center justify-end">Qty <SortIcon column="sheets" /></div></TableHead>
                <TableHead className="text-right cursor-pointer hover:bg-muted/80" onClick={() => handleSort('total')}><div className="flex items-center justify-end">Value <SortIcon column="total" /></div></TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('status')}><div className="flex items-center">Status <SortIcon column="status" /></div></TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedEntries.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center h-24 text-muted-foreground">No records found in active registry.</TableCell></TableRow> : sortedEntries.map(entry => {
                const proj = projects?.find(p => p.id === entry.projectId);
                const cli = clients?.find(c => c.id === entry.clientId);
                const effStatus = getEffectiveInvoiceStatus(entry);
                const entryDate = entry.date ? parseISO(entry.date) : new Date();
                const daysOld = differenceInDays(new Date(), entryDate);
                const isPastDue = effStatus === 'Past Due';
                const needsLateFee = daysOld > 30 && entry.status !== 'Paid';
                const displayProject = proj?.name || (entry as any).projectName || (entry as any).project || 'Direct Billing';
                const displayClient = cli?.name || (entry as any).clientName || (entry as any).client || '—';
                return (
                  <TableRow key={entry.id} className={cn("hover:bg-muted/30 transition-colors", isPastDue && "bg-rose-500/5")}>
                    <TableCell className={cn("text-xs font-mono", isPastDue ? "text-rose-500" : "text-muted-foreground")}>{formatSafeDate(entry.date)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={cn("font-bold text-sm", isPastDue ? "text-rose-500" : "text-white")}>{displayProject}</div>
                        {needsLateFee && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger><AlertTriangle className="h-3.5 w-3.5 text-rose-500 animate-pulse" /></TooltipTrigger>
                              <TooltipContent className="bg-rose-600 text-white border-none text-[10px] font-black uppercase">Action Required: Add Late Fee (&gt;30 Days)</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">{displayClient}</div>
                    </TableCell>
                    <TableCell className={cn("text-xs", isPastDue && "text-rose-500")}>{entry.designer}</TableCell>
                    <TableCell className={cn("text-xs font-bold", isPastDue ? "text-rose-500" : "text-accent")}>{entry.paperSize}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", isPastDue && "text-rose-500")}>{entry.sheets}</TableCell>
                    <TableCell className={cn("text-right tabular-nums font-bold", isPastDue ? "text-rose-500" : "text-emerald-400")}>${(Number(entry.total) || 0).toFixed(2)}</TableCell>
                    <TableCell><Badge variant="outline" className={cn("text-[10px] uppercase font-black", isPastDue ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' : 'bg-sky-500/10 text-sky-500 border-sky-500/20')}>{effStatus}</Badge></TableCell>
                    <TableCell><div className="flex gap-1 justify-end">{entry.status !== 'Paid' && <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-500 hover:bg-emerald-500/10" onClick={() => onUpdateStatus(entry.id, 'Paid')} title="Mark as Paid" disabled={!canEdit}><Check className="h-4 w-4" /></Button>}<Button variant="ghost" size="icon" onClick={() => handleEdit(entry)} disabled={!canEdit}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500" onClick={() => onDeleteEntry(entry.id)} disabled={!canEdit} title="Delete"><Trash2 className="h-4 w-4" /></Button></div></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

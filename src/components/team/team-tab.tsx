
"use client"

import { useState, useMemo, useRef, useEffect } from 'react';
import { Collaborator, CollaboratorPermissions, AccessLevel, Employee, PayrollEntry, MonthlyCost, MonthlyIncome, LeaveBank, FirmShortLink } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Share2, Trash2, Shield, Info, Link as LinkIcon, Check, UserPlus, Pencil, Lock, Eye, EyeOff, Settings2, UserCheck, Mail, DatabaseBackup, Loader2, Users, BarChart4, Copy, Upload, ShieldAlert, CheckCircle2, Siren, Globe, RefreshCw, Save, Download, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useFirestore, setDocumentNonBlocking, deleteDocumentNonBlocking, useUser } from '@/firebase';
import { doc, collection } from 'firebase/firestore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfitabilityTab } from '@/components/profitability/profitability-tab';
import { useLedgerData } from '@/hooks/use-ledger-data';
import { fetchCloudSnapshot } from '@/services/restore';

type SortConfig = { key: keyof Employee; direction: 'asc' | 'desc' } | null;

interface TeamTabProps {
  collaborators: Collaborator[];
  allEmployees?: Employee[];
  onUpdatePermissions: (collabId: string, permissions: CollaboratorPermissions) => void;
  onRevoke: (collabId: string) => void;
  ownerUid: string;
  isOwner: boolean;
  rawData?: any;
  restoreData?: (data: any) => Promise<void>;
  payroll: PayrollEntry[];
  costs: MonthlyCost[];
  income: MonthlyIncome[];
  leaveBanks: LeaveBank[];
  onAddPayroll: (entry: Omit<PayrollEntry, 'id'>) => void;
  onDeletePayroll: (id: string) => void;
  onAddCost: (cost: Omit<MonthlyCost, 'id'>) => void;
  onDeleteCost: (id: string) => void;
  onAddIncome: (inc: Omit<MonthlyIncome, 'id'>) => void;
  onDeleteIncome: (id: string) => void;
  onUpdateLeaveBank: (empId: string, bank: Partial<LeaveBank>) => void;
  canEditProfitability?: boolean;
  isBoss?: boolean;
}

const DEFAULT_PERMISSIONS: CollaboratorPermissions = {
  billable: 'none',
  printing: 'none',
  tasks: 'write',
  plans: 'read',
  templates: 'read',
  ai_prompts: 'read',
  profitability: 'none',
  status: 'write',
  notes: 'write',
  projects_db: 'write',
  clients: 'read',
  archive: 'read',
  reports: 'none',
  calculator: 'read',
  timesheets: 'write',
  supplies: 'write'
};

const PERMISSION_LABELS: Record<keyof CollaboratorPermissions, string> = {
  billable: 'Billable Hours (Billing Tab)',
  printing: 'Print Jobs (Billing Tab)',
  status: 'Project Pipeline',
  notes: 'Project Notes',
  projects_db: 'Project Database',
  clients: 'Client Database',
  plans: 'Plan Database',
  tasks: 'Task Management',
  profitability: 'Profitability Analytics',
  calculator: 'Toolset & Vault',
  templates: 'Templates',
  ai_prompts: 'Prompt Library (Text Templates)',
  archive: 'Record Archive',
  reports: 'Summary Reports',
  timesheets: 'Employee Timesheets',
  supplies: 'Groceries & Supplies'
};

export function TeamTab({ 
  collaborators = [], 
  allEmployees = [], 
  ownerUid, 
  isOwner,
  rawData,
  restoreData,
  payroll = [],
  costs = [],
  income = [],
  leaveBanks = [],
  onAddPayroll,
  onDeletePayroll,
  onAddCost,
  onDeleteCost,
  onAddIncome,
  onDeleteIncome,
  onUpdateLeaveBank,
  canEditProfitability = true,
  isBoss = false
}: TeamTabProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isEmployeeDialogOpen, setIsEmployeeDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showSSN, setShowSSN] = useState<{ [key: string]: boolean }>({});
  const [isRestoring, setIsRestoring] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  const { addEmployee, updateEmployee, deleteEmployee } = useLedgerData();

  const sortedEmployees = useMemo(() => {
    let items = [...(allEmployees || [])];
    if (sortConfig) {
      items.sort((a, b) => {
        const aVal = String(a[sortConfig.key] || '');
        const bVal = String(b[sortConfig.key] || '');
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      items.sort((a, b) => {
        const nameA = ((a.firstName || '') + (a.lastName || '')).toLowerCase();
        const nameB = ((b.firstName || '') + (b.lastName || '')).toLowerCase();
        return nameA.localeCompare(nameB);
      });
    }
    return items;
  }, [allEmployees, sortConfig]);

  const handleSort = (key: keyof Employee) => {
    setSortConfig(prev => (prev?.key === key && prev.direction === 'asc') ? { key, direction: 'desc' } : { key, direction: 'asc' });
  };

  const SortIcon = ({ column }: { column: keyof Employee }) => {
    if (sortConfig?.key !== column) return <ArrowUpDown className="ml-2 h-3.5 w-3.5 opacity-30" />;
    return sortConfig.direction === 'asc' ? <ChevronUp className="ml-2 h-3.5 w-3.5 text-primary" /> : <ChevronDown className="ml-2 h-3.5 w-3.5 text-primary" />;
  };

  const handleCloudRestore = async () => {
    if (!restoreData) return;
    setIsRestoring(true);
    toast({ title: "Nuclear Sync Active", description: "Downloading March 15th binary stream..." });
    try {
      const data = await fetchCloudSnapshot();
      await restoreData(data);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Cloud Sync Failed", description: err.message });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleManualRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !restoreData) return;
    setIsRestoring(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        await restoreData(json);
      } catch (err) {
        setIsRestoring(false);
        toast({ variant: "destructive", title: "Restore Failed" });
      }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = '';
  };

  const handleDownloadBackup = () => {
    if (!rawData) {
      toast({ variant: "destructive", title: "Backup Failed", description: "No data available to export." });
      return;
    }
    try {
      const jsonString = JSON.stringify(rawData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().split('T')[0];
      link.href = url; link.download = `DI-LEDGER-BACKUP-${timestamp}.json`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({ title: "Backup Successful" });
    } catch (err) {
      toast({ variant: "destructive", title: "Export Error" });
    }
  };

  if (!isOwner) {
    return (
      <Card className="border-border/50 bg-card/30">
        <CardContent className="flex flex-col items-center justify-center py-20 space-y-4">
          <Shield className="h-12 w-12 text-muted-foreground opacity-20" />
          <h2 className="text-xl font-headline font-bold">Access Denied</h2>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div><h2 className="text-4xl font-headline font-bold text-white">Firm Command</h2><p className="text-muted-foreground text-sm">Secure database for PII, Access Codes, and System Maintenance.</p></div>
        <Button onClick={() => { setEditingEmployee(null); setIsEmployeeDialogOpen(true); }} className="gap-2 bg-accent text-accent-foreground"><UserPlus className="h-4 w-4" /> Add Staff</Button>
      </div>

      <Tabs defaultValue="staff" className="space-y-6">
        <TabsList className="bg-card border border-border/50 p-1 rounded-xl">
          <TabsTrigger value="staff" className="px-8 gap-2"><Users className="h-4 w-4" /> Staff Database</TabsTrigger>
          <TabsTrigger value="profit" className="px-8 gap-2"><BarChart4 className="h-4 w-4" /> Profit Tab</TabsTrigger>
          <TabsTrigger value="maintenance" className="px-8 gap-2"><Settings2 className="h-4 w-4" /> Maintenance</TabsTrigger>
        </TabsList>

        <TabsContent value="staff">
          <Card className="border-border/50 shadow-xl overflow-hidden bg-card/30">
            <CardHeader className="bg-muted/50 border-b border-border/50"><CardTitle className="font-headline text-2xl text-accent flex items-center gap-2">Access Control</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('firstName')}>
                      <div className="flex items-center">Employee <SortIcon column="firstName" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('username')}>
                      <div className="flex items-center">Credentials <SortIcon column="username" /></div>
                    </TableHead>
                    <TableHead>SSN</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedEmployees.length === 0 ? (<TableRow><TableCell colSpan={4} className="text-center h-24 text-muted-foreground italic">No staff members registered.</TableCell></TableRow>) : (
                    sortedEmployees.map((staff) => (
                      <TableRow key={staff.id}>
                        <TableCell><div className="flex items-center gap-2"><div className="font-bold">{staff.firstName || 'Unknown'} {staff.lastName || ''}</div>{staff.id === ownerUid && <Badge className="bg-primary/20 text-primary border-primary/30 h-4 text-[8px] px-1 py-0">BOSS</Badge>}</div></TableCell>
                        <TableCell><div className="text-[10px]">User: {staff.username || '—'}</div></TableCell>
                        <TableCell><div className="flex items-center gap-2"><code className="text-xs">{showSSN[staff.id] ? staff.ssn : '•••-••-••••'}</code><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowSSN(p => ({...p, [staff.id]: !p[staff.id]}))}>{showSSN[staff.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}</Button></div></TableCell>
                        <TableCell><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => { setEditingEmployee(staff); setIsEmployeeDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-rose-500" disabled={staff.id === ownerUid} onClick={() => { if (confirm(`Remove staff member ${staff.firstName}?`)) deleteEmployee(staff.id); }}><Trash2 className="h-4 w-4" /></Button></div></TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profit">
          <ProfitabilityTab employees={allEmployees} payroll={payroll} costs={costs} income={income} leaveBanks={leaveBanks} onAddPayroll={onAddPayroll} onDeletePayroll={onDeletePayroll} onAddCost={onAddCost} onDeleteCost={onDeleteCost} onAddIncome={onAddIncome} onDeleteIncome={onDeleteIncome} onUpdateLeaveBank={onUpdateLeaveBank} canEdit={canEditProfitability} isBoss={isBoss} />
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-border/50 shadow-xl overflow-hidden bg-card/30"><CardHeader className="bg-primary/10 border-b border-primary/20"><CardTitle className="text-xl flex items-center gap-2 text-primary"><Download className="h-5 w-5" /> Local Data Backup</CardTitle></CardHeader><CardContent className="pt-6 space-y-4"><p className="text-xs text-muted-foreground leading-relaxed">Export firm ledger to JSON.</p><Button onClick={handleDownloadBackup} className="w-full h-14 text-lg font-bold bg-secondary gap-3"><Download className="h-5 w-5" /> Download .json Backup</Button></CardContent></Card>
            <Card className="border-border/50 shadow-xl overflow-hidden bg-card/30"><CardHeader className="bg-primary/10 border-b border-primary/20"><CardTitle className="text-xl flex items-center gap-2 text-primary"><DatabaseBackup className="h-5 w-5" /> Cloud Snapshot (March 15th)</CardTitle></CardHeader><CardContent className="pt-6 space-y-4"><p className="text-xs text-muted-foreground leading-relaxed">Direct binary sync from March 15th Dropbox backup.</p><Button onClick={handleCloudRestore} disabled={isRestoring} className="w-full h-14 text-lg font-bold bg-primary hover:bg-primary/90 gap-3">{isRestoring ? <Loader2 className="h-5 w-5 animate-spin" /> : <Globe className="h-5 w-5" />} Restore from Cloud Link</Button></CardContent></Card>
            <Card className="border-border/50 shadow-xl overflow-hidden bg-card/30"><CardHeader className="bg-emerald-500/10 border-b border-emerald-500/20"><CardTitle className="text-xl flex items-center gap-2 text-emerald-500"><Upload className="h-5 w-5" /> Manual Restore File</CardTitle></CardHeader><CardContent className="pt-6 space-y-4"><p className="text-xs text-muted-foreground leading-relaxed">Upload a local .json restore point.</p><Button variant="outline" className="w-full h-14 gap-3 border-emerald-500/30 text-emerald-500 font-bold" onClick={() => restoreInputRef.current?.click()} disabled={isRestoring}><Upload className="h-5 w-5" /> Select Local JSON</Button><input type="file" ref={restoreInputRef} className="hidden" accept=".json" onChange={handleManualRestore} /></CardContent></Card>
            <Card className="border-rose-500/30 shadow-xl overflow-hidden bg-rose-500/5"><CardHeader className="bg-rose-500/10 border-b border-rose-500/20"><CardTitle className="text-xl flex items-center gap-2 text-rose-500"><Siren className="h-5 w-5" /> Emergency Protocol Test</CardTitle></CardHeader><CardContent className="pt-6 space-y-4"><p className="text-xs text-muted-foreground leading-relaxed">Trigger a simulated Tornado Warning.</p><Button onClick={() => window.dispatchEvent(new CustomEvent('simulate-emergency-alert'))} variant="outline" className="w-full h-14 gap-3 border-rose-500/30 text-rose-500 font-bold"><Siren className="h-5 w-5" /> Simulate Alert & Siren</Button></CardContent></Card>
          </div>
        </TabsContent>
      </Tabs>

      <EmployeeDialog open={isEmployeeDialogOpen} onOpenChange={setIsEmployeeDialogOpen} initialData={editingEmployee} onSave={(data) => { if (editingEmployee) updateEmployee(editingEmployee.id, data); else addEmployee(data); setIsEmployeeDialogOpen(false); }} />
    </div>
  );
}

function EmployeeDialog({ open, onOpenChange, initialData, onSave }: { open: boolean, onOpenChange: (open: boolean) => void, initialData: Employee | null, onSave: (data: any) => void }) {
  const [form, setForm] = useState<Partial<Employee>>({ firstName: '', lastName: '', email: '', username: '', password: '', ssn: '', permissions: { ...DEFAULT_PERMISSIONS } });
  useEffect(() => { if (initialData) setForm({ ...initialData, permissions: initialData.permissions || { ...DEFAULT_PERMISSIONS } }); else setForm({ firstName: '', lastName: '', email: '', username: '', password: '', ssn: '', permissions: { ...DEFAULT_PERMISSIONS } }); }, [initialData, open]);
  const updatePermission = (key: keyof CollaboratorPermissions, level: AccessLevel) => { setForm(prev => ({ ...prev, permissions: { ...(prev.permissions || DEFAULT_PERMISSIONS), [key]: level } })); };
  return (<Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-[700px] h-[90vh] flex flex-col p-0 overflow-hidden"><DialogHeader className="p-6 bg-muted/30 border-b shrink-0"><DialogTitle className="text-2xl font-headline">{initialData ? 'Modify Staff Record' : 'Register New Employee'}</DialogTitle></DialogHeader><form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="flex-1 flex flex-col overflow-hidden"><ScrollArea className="flex-1"><div className="p-6 space-y-8 pb-10"><section className="space-y-4"><h4 className="text-sm font-black uppercase text-primary">Personal Details</h4><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>First Name</Label><Input value={form.firstName || ''} onChange={e => setForm({...form, firstName: e.target.value})} required /></div><div className="space-y-2"><Label>Last Name</Label><Input value={form.lastName || ''} onChange={e => setForm({...form, lastName: e.target.value})} required /></div><div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} required /></div><div className="space-y-2"><Label>SSN</Label><Input value={form.ssn || ''} onChange={e => setForm({...form, ssn: e.target.value})} placeholder="000-00-0000" /></div></div></section><section className="space-y-4"><h4 className="text-sm font-black uppercase text-accent">Credentials</h4><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Username</Label><Input value={form.username || ''} onChange={e => setForm({...form, username: e.target.value})} required /></div><div className="space-y-2"><Label>Password</Label><Input type="text" value={form.password || ''} onChange={e => setForm({...form, password: e.target.value})} required /></div></div></section><section className="space-y-4"><h4 className="text-sm font-black uppercase text-emerald-500">Permissions</h4><div className="grid grid-cols-1 gap-2">{(Object.keys(DEFAULT_PERMISSIONS) as Array<keyof CollaboratorPermissions>).map((key) => (<div key={key} className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border"><Label className="text-xs font-bold text-white">{PERMISSION_LABELS[key] || key}</Label><div className="flex bg-background/50 rounded-lg p-1 border gap-1">{(['none', 'read', 'write'] as AccessLevel[]).map((level) => (<button key={level} type="button" onClick={() => updatePermission(key, level)} className={cn("text-[10px] px-3 py-1 rounded-md font-bold uppercase transition-all", (form.permissions?.[key] || 'none') === level ? "bg-primary text-white" : "text-muted-foreground")}>{level}</button>))}</div></div>))}</div></section></div></ScrollArea><DialogFooter className="p-6 bg-muted/30 border-t shrink-0"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" className="bg-primary px-10 h-12 text-lg font-bold">Save Staff Record</Button></DialogFooter></form></DialogContent></Dialog>);
}


"use client"

import { useState, useMemo, useEffect } from 'react';
import { Employee, PayrollEntry, MonthlyCost, MonthlyIncome, LeaveBank } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, DollarSign, TrendingUp, TrendingDown, ShieldAlert, BarChart3, Calculator, Loader2, Shield, Save, Palmtree, Gift, UserCog, RefreshCw, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';

interface ProfitabilityTabProps {
  employees: Employee[];
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
  canEdit?: boolean;
  isBoss?: boolean;
}

export function ProfitabilityTab({ 
  employees = [], payroll = [], costs = [], income = [], leaveBanks = [],
  onAddPayroll, onDeletePayroll, 
  onAddCost, onDeleteCost, 
  onAddIncome, onDeleteIncome,
  onUpdateLeaveBank,
  canEdit = true,
  isBoss = false
}: ProfitabilityTabProps) {
  const { toast } = useToast();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [payrollAmount, setPayrollAmount] = useState('');
  const [payrollDate, setPayrollDate] = useState('');
  const [costMonth, setCostMonth] = useState('');
  const [insurance, setInsurance] = useState('');
  const [taxes, setTaxes] = useState('');
  const [otherCost, setOtherCost] = useState('');
  const [incomeMonth, setIncomeMonth] = useState('');
  const [billedHours, setBilledHours] = useState('');
  const [totalIncome, setTotalIncome] = useState('');
  const [adjustPto, setAdjustPto] = useState('');
  const [adjustHoliday, setAdjustHoliday] = useState('');

  useEffect(() => {
    const now = new Date();
    setPayrollDate(now.toISOString().split('T')[0]);
    setCostMonth(now.toISOString().slice(0, 7));
    setIncomeMonth(now.toISOString().slice(0, 7));
  }, []);

  const safeNum = (val: any): number => {
    const n = Number(val);
    return isNaN(n) ? 0 : n;
  };

  const filteredEmployees = useMemo(() => {
    return [...(employees || [])]
      .filter(emp => {
        const first = (emp.firstName || '').toLowerCase();
        const last = (emp.lastName || '').toLowerCase();
        return !(first.includes('tammi') && last.includes('dillon'));
      })
      .sort((a, b) => {
        const nameA = ((a.firstName || '') + (a.lastName || '')).toLowerCase();
        const nameB = ((b.firstName || '') + (b.lastName || '')).toLowerCase();
        return nameA.localeCompare(nameB);
      });
  }, [employees]);

  const designersForLeave = useMemo(() => {
    const targetNames = ["sarah", "chris"];
    return (employees || []).filter(e => {
      const first = (e.firstName || '').toLowerCase();
      return targetNames.some(target => first.includes(target));
    }).sort((a, b) => {
      const nameA = ((a.firstName || '') + (a.lastName || '')).toLowerCase();
      const nameB = ((b.firstName || '') + (b.lastName || '')).toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [employees]);

  const employeeStats = useMemo(() => {
    if (!filteredEmployees || filteredEmployees.length === 0) return [];
    return filteredEmployees.map(emp => {
      const empPayroll = (payroll || []).filter(p => p.employeeId === emp.id);
      const empCosts = (costs || []).filter(c => c.employeeId === emp.id);
      const empIncome = (income || []).filter(i => i.employeeId === emp.id);
      const totalPayroll = empPayroll.reduce((acc, p) => acc + safeNum(p.amount), 0);
      const totalOverhead = empCosts.reduce((acc, c) => acc + safeNum(c.insurance) + safeNum(c.taxes) + safeNum(c.other), 0);
      const totalRevenue = empIncome.reduce((acc, i) => acc + safeNum(i.totalIncome), 0);
      const totalHours = empIncome.reduce((acc, i) => acc + safeNum(i.billedHours), 0);
      const totalCost = totalPayroll + totalOverhead;
      const lifetimeProfit = totalRevenue - totalCost;
      return { id: emp.id, name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'Unnamed Staff', totalCost, totalRevenue, lifetimeProfit, totalHours };
    });
  }, [filteredEmployees, payroll, costs, income]);

  const handleAddPayroll = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !selectedEmployeeId || !payrollAmount || !payrollDate) return;
    onAddPayroll({ employeeId: selectedEmployeeId, amount: safeNum(payrollAmount), date: payrollDate });
    setPayrollAmount('');
  };

  const handleAddCost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !selectedEmployeeId || !costMonth) return;
    onAddCost({ employeeId: selectedEmployeeId, month: costMonth, insurance: safeNum(insurance), taxes: safeNum(taxes), other: safeNum(otherCost) });
    setInsurance(''); setTaxes(''); setOtherCost('');
  };

  const handleAddIncome = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !selectedEmployeeId || !incomeMonth) return;
    onAddIncome({ employeeId: selectedEmployeeId, month: incomeMonth, billedHours: safeNum(billedHours), totalIncome: safeNum(totalIncome) });
    setBilledHours(''); setTotalIncome('');
  };

  const handleUpdateBank = (empId: string) => {
    if (!isBoss) return;
    
    const updates: Partial<LeaveBank> = {};
    if (adjustPto !== '') updates.ptoHours = Number(adjustPto);
    if (adjustHoliday !== '') updates.holidayHours = Number(adjustHoliday);

    if (Object.keys(updates).length === 0) return;

    onUpdateLeaveBank(empId, updates);
    setAdjustPto(''); 
    setAdjustHoliday('');
    toast({ title: "Leave bank adjustments synchronized" });
  };

  const currentEmpStats = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return employeeStats.find(s => s.id === selectedEmployeeId) || null;
  }, [employeeStats, selectedEmployeeId]);

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end bg-card/30 p-8 rounded-3xl border border-border/50 gap-6">
        <div className="space-y-1">
          <h2 className="text-4xl font-headline font-bold text-white flex items-center gap-3">
            <DollarSign className="h-10 w-10 text-emerald-500" /> Profitability Command
          </h2>
          <p className="text-muted-foreground text-sm uppercase tracking-widest font-semibold">Financial Intelligence Dashboard</p>
        </div>
        
        <div className="flex flex-col md:flex-row gap-6 items-start md:items-end">
          <div className="w-full md:w-72 space-y-2">
            <Label className="text-[10px] uppercase block font-bold text-muted-foreground ml-1">Staff Member Detail</Label>
            <select 
              className="flex h-12 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm font-bold shadow-inner focus:ring-2 focus:ring-primary outline-none transition-all"
              value={selectedEmployeeId}
              onChange={e => setSelectedEmployeeId(e.target.value)}
            >
              <option value="">Filter Summary by Staff...</option>
              {filteredEmployees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
            </select>
          </div>
        </div>
      </header>

      {!canEdit && (
        <Alert className="bg-muted/30 border-dashed border-border/50">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <AlertTitle>Read-Only Access</AlertTitle>
          <div className="text-xs text-muted-foreground">You can view profitability analytics, but modifications are restricted.</div>
        </Alert>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-8">
          <Card className="border-border/50 shadow-2xl overflow-hidden bg-card/50 backdrop-blur-sm">
            <CardHeader className="bg-muted/50 border-b border-border/50">
              <CardTitle className="font-headline text-2xl flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-accent" /> Firm-Wide Performance Summary
              </CardTitle>
              <CardDescription>Consolidated lifetime profit/loss per designer based on logged records.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Staff Member</TableHead>
                    <TableHead className="text-right">Total Hours</TableHead>
                    <TableHead className="text-right">Total Overhead</TableHead>
                    <TableHead className="text-right">Total Revenue</TableHead>
                    <TableHead className="text-right">Lifetime Profit/Loss</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employeeStats.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center h-32 text-muted-foreground italic"><div className="flex flex-col items-center gap-2"><Loader2 className="h-5 w-5 animate-spin text-primary" /><span>Synchronizing employee database...</span></div></TableCell></TableRow>
                  ) : employeeStats.map(stat => (
                    <TableRow key={stat.id} className={cn(selectedEmployeeId === stat.id && "bg-primary/5")}>
                      <TableCell className="font-bold">{stat.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{safeNum(stat.totalHours).toFixed(1)}</TableCell>
                      <TableCell className="text-right tabular-nums text-rose-400">-${safeNum(stat.totalCost).toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-400">+${safeNum(stat.totalRevenue).toLocaleString()}</TableCell>
                      <TableCell className="text-right"><div className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold tabular-nums", safeNum(stat.lifetimeProfit) >= 0 ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border border-rose-500/20")}>{safeNum(stat.lifetimeProfit) >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />} ${Math.abs(safeNum(stat.lifetimeProfit)).toLocaleString()}</div></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {selectedEmployeeId && (
            <Tabs defaultValue="payroll" className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
              <TabsList className="bg-card border border-border/50 p-1 rounded-xl">
                <TabsTrigger value="payroll" className="rounded-lg px-6 h-10">Payroll Log</TabsTrigger>
                <TabsTrigger value="costs" className="rounded-lg px-6 h-10">Fixed Overhead</TabsTrigger>
                <TabsTrigger value="income" className="rounded-lg px-6 h-10">Revenue Entry</TabsTrigger>
              </TabsList>
              <TabsContent value="payroll"><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><Card className="border-border/50 bg-card/30"><CardHeader><CardTitle className="text-lg">Add Pay Period</CardTitle></CardHeader><CardContent><form onSubmit={handleAddPayroll} className="space-y-4"><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Period End Date</Label><Input type="date" value={payrollDate} onChange={e => setPayrollDate(e.target.value)} required /></div><div className="space-y-2"><Label>Net Pay ($)</Label><Input type="number" step="0.01" value={payrollAmount} onChange={e => setPayrollAmount(e.target.value)} placeholder="0.00" required /></div></div><Button type="submit" className="w-full gap-2"><Plus className="h-4 w-4" /> Log Bi-Weekly Pay</Button></form></CardContent></Card><Card className="border-border/50 bg-card/30"><CardHeader><CardTitle className="text-lg">Recent Payroll</CardTitle></CardHeader><CardContent className="p-0"><div className="max-h-[300px] overflow-auto"><Table><TableBody>{payroll.filter(p => p.employeeId === selectedEmployeeId).length === 0 && (<TableRow><TableCell className="text-center py-8 text-muted-foreground italic">No payroll entries found.</TableCell></TableRow>)}{payroll.filter(p => p.employeeId === selectedEmployeeId).map(p => (<TableRow key={p.id}><TableCell className="text-xs">{p.date ? new Date(p.date).toLocaleDateString() : '—'}</TableCell><TableCell className="font-bold text-rose-400">-${safeNum(p.amount).toLocaleString()}</TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => onDeletePayroll(p.id)} className="text-rose-500 h-8 w-8"><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>))}</TableBody></Table></div></CardContent></Card></div></TabsContent>
              <TabsContent value="costs"><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><Card className="border-border/50 bg-card/30"><CardHeader><CardTitle className="text-lg">Monthly Fixed Overhead</CardTitle></CardHeader><CardContent><form onSubmit={handleAddCost} className="space-y-4"><div className="space-y-2"><Label>Month</Label><Input type="month" value={costMonth} onChange={e => setCostMonth(e.target.value)} required /></div><div className="grid grid-cols-3 gap-2"><div className="space-y-1"><Label className="text-[10px]">Insurance</Label><Input type="number" step="0.01" value={insurance} onChange={e => setInsurance(e.target.value)} placeholder="0" /></div><div className="space-y-1"><Label className="text-[10px]">Taxes</Label><Input type="number" step="0.01" value={taxes} onChange={e => setTaxes(e.target.value)} placeholder="0" /></div><div className="space-y-1"><Label className="text-[10px]">Other</Label><Input type="number" step="0.01" value={otherCost} onChange={e => setOtherCost(e.target.value)} placeholder="0" /></div></div><Button type="submit" className="w-full gap-2 bg-secondary hover:bg-secondary/80"><Plus className="h-4 w-4" /> Save Monthly Fixed Costs</Button></form></CardContent></Card><Card className="border-border/50 bg-card/30"><CardHeader><CardTitle className="text-lg">Cost History</CardTitle></CardHeader><CardContent className="p-0"><div className="max-h-[300px] overflow-auto"><Table><TableBody>{costs.filter(c => c.employeeId === selectedEmployeeId).length === 0 && (<TableRow><TableCell className="text-center py-8 text-muted-foreground italic">No cost entries found.</TableCell></TableRow>)}{costs.filter(c => c.employeeId === selectedEmployeeId).map(c => (<TableRow key={c.id}><TableCell className="text-xs font-bold">{c.month}</TableCell><TableCell className="text-xs"><div className="text-[10px] text-muted-foreground">Ins: ${safeNum(c.insurance)} | Tax: ${safeNum(c.taxes)} | Other: ${safeNum(c.other)}</div><div className="font-bold text-rose-400">Total: -${(safeNum(c.insurance) + safeNum(c.taxes) + safeNum(c.other)).toLocaleString()}</div></TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => onDeleteCost(c.id)} className="text-rose-500 h-8 w-8"><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>))}</TableBody></Table></div></CardContent></Card></div></TabsContent>
              <TabsContent value="income"><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><Card className="border-border/50 bg-card/30"><CardHeader><CardTitle className="text-lg">Monthly Revenue Entry</CardTitle></CardHeader><CardContent><form onSubmit={handleAddIncome} className="space-y-4"><div className="space-y-2"><Label>Month</Label><Input type="month" value={incomeMonth} onChange={e => setIncomeMonth(e.target.value)} required /></div><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Billed Hours</Label><Input type="number" step="0.1" value={billedHours} onChange={e => setBilledHours(e.target.value)} placeholder="0.0" required /></div><div className="space-y-2"><Label>Total Income ($)</Label><Input type="number" step="0.01" value={totalIncome} onChange={e => setTotalIncome(e.target.value)} placeholder="0.00" required /></div></div><Button type="submit" className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-4 w-4" /> Record Revenue</Button></form></CardContent></Card><Card className="border-border/50 bg-card/30"><CardHeader><CardTitle className="text-lg">Revenue History</CardTitle></CardHeader><CardContent className="p-0"><div className="max-h-[300px] overflow-auto"><Table><TableBody>{income.filter(i => i.employeeId === selectedEmployeeId).length === 0 && (<TableRow><TableCell className="text-center py-8 text-muted-foreground italic">No revenue entries found.</TableCell></TableRow>)}{income.filter(i => i.employeeId === selectedEmployeeId).map(i => (<TableRow key={i.id}><TableCell className="text-xs font-bold">{i.month}</TableCell><TableCell className="text-xs"><div className="text-[10px] text-muted-foreground">{safeNum(i.billedHours)} Hours Billed</div><div className="font-bold text-emerald-400">+${safeNum(i.totalIncome).toLocaleString()}</div></TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => onDeleteIncome(i.id)} className="text-rose-500 h-8 w-8"><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>))}</TableBody></Table></div></CardContent></Card></div></TabsContent>
            </Tabs>
          )}

          {isBoss && (
            <Card className="border-border/50 bg-card/50 shadow-xl overflow-hidden mt-8">
              <CardHeader className="bg-accent/10 border-b border-border/50"><CardTitle className="text-2xl font-headline flex items-center gap-3"><UserCog className="h-6 w-6 text-accent" /> Annual Leave Bank Administration</CardTitle><CardDescription>Manage manual usage adjustments. Start point is 80h/year. Used hours from timesheets are added automatically.</CardDescription></CardHeader>
              <CardContent className="pt-6"><div className="grid grid-cols-1 md:grid-cols-3 gap-6">{designersForLeave.map(designer => { const bank = leaveBanks.find(b => b.employeeId === designer.id); return (<Card key={designer.id} className="bg-muted/20 border border-border/50 p-4 space-y-4"><div className="space-y-1"><h4 className="font-bold text-white">{designer.firstName} {designer.lastName}</h4><div className="flex gap-4 text-[10px] uppercase font-bold text-muted-foreground"><span>Initial Used PTO: {bank?.ptoHours || 0}h</span><span>Initial Used Holiday: {bank?.holidayHours || 0}h</span></div></div><div className="grid grid-cols-2 gap-2"><div className="space-y-1"><Label className="text-[10px] uppercase">Add Initial Used PTO</Label><Input type="number" className="h-8 text-xs" placeholder={bank?.ptoHours.toString() || '0'} value={adjustPto} onChange={e => setAdjustPto(e.target.value)} /></div><div className="space-y-1"><Label className="text-[10px] uppercase">Add Initial Used Holiday</Label><Input type="number" className="h-8 text-xs" placeholder={bank?.holidayHours.toString() || '0'} value={adjustHoliday} onChange={e => setAdjustHoliday(e.target.value)} /></div></div><Button size="sm" className="w-full gap-2 bg-accent text-accent-foreground" onClick={() => handleUpdateBank(designer.id)}><Save className="h-3 w-3" /> Update Initial Used</Button></Card>); })}</div></CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-8">
          <Card className="border-border/50 bg-card/50 shadow-xl overflow-hidden">
            <CardHeader className="bg-primary/10 border-b border-border/50"><CardTitle className="text-lg flex items-center gap-2"><Calculator className="h-5 w-5 text-primary" /> Profitability Metrics</CardTitle></CardHeader>
            <CardContent className="pt-6 space-y-6">
              {!selectedEmployeeId ? (<div className="text-center py-10 text-muted-foreground italic"><ShieldAlert className="h-10 w-10 mx-auto opacity-20 mb-4" />Select an employee to see detailed cost vs. income breakdown.</div>) : (
                <div className="space-y-6">
                  <div className="p-6 rounded-2xl bg-muted/30 border border-border/50 text-center space-y-2"><span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Designer Net Value</span><div className={cn("text-4xl font-headline font-bold", safeNum(currentEmpStats?.lifetimeProfit) >= 0 ? "text-emerald-500" : "text-rose-500")}>${Math.abs(safeNum(currentEmpStats?.lifetimeProfit || 0)).toLocaleString()}</div></div>
                  <div className="grid grid-cols-2 gap-4"><div className="bg-rose-500/5 p-4 rounded-xl border border-rose-500/10"><span className="text-[8px] uppercase tracking-wider text-rose-400 block mb-1 font-bold">Total Overhead</span><div className="text-lg font-bold text-rose-500">${safeNum(currentEmpStats?.totalCost || 0).toLocaleString()}</div></div><div className="bg-emerald-500/5 p-4 rounded-xl border border-emerald-500/10"><span className="text-[8px] uppercase tracking-wider text-emerald-400 block mb-1 font-bold">Total Revenue</span><div className="text-lg font-bold text-emerald-500">${safeNum(currentEmpStats?.totalRevenue || 0).toLocaleString()}</div></div></div>
                  <div className="space-y-4 pt-4 border-t border-border/50"><div className="flex justify-between items-center"><span className="text-xs text-muted-foreground">Hours Worked</span><span className="font-bold text-white">{safeNum(currentEmpStats?.totalHours || 0).toFixed(1)}</span></div><div className="flex justify-between items-center"><span className="text-xs text-muted-foreground">Effective Hourly Margin</span><span className="font-bold text-accent">${(safeNum(currentEmpStats?.lifetimeProfit || 0) / (safeNum(currentEmpStats?.totalHours) || 1)).toFixed(2)} /hr</span></div></div>
                </div>
              )}
            </CardContent>
          </Card>
          <Alert className="bg-accent/5 border-accent/20"><ShieldAlert className="h-4 w-4 text-accent" /><div className="text-[10px] text-muted-foreground leading-relaxed mt-1">Access to this financial intelligence is strictly managed via assigned permissions.</div></Alert>
        </div>
      </div>
    </div>
  );
}

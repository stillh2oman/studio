"use client"

import { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Calculator, Clock, Hash, History, Trash2, Delete, Divide, X, Minus, Plus, Equal, 
  Ruler, Triangle, Layers, BookOpen, Lock, Save, Pencil, ShoppingCart, Library, 
  CheckCircle2, Hammer, Droplets, LayoutTemplate, Box, Square as SquareIcon, MoveUpRight,
  Construction,
  ScanLine
} from 'lucide-react';
import { useLedgerData } from '@/hooks/use-ledger-data';
import { TextTemplate } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { PromptLibraryTab } from '@/components/prompt-library/prompt-library-tab';
import { SuppliesTab } from './supplies-tab';
import { ReferenceLibraryTab } from './reference-library-tab';
import { ProjectChecklistsTab } from './project-checklists-tab';
import { PlanReviewTab } from '@/components/plan-review/plan-review-tab';

type CalcHistoryItem = {
  id: string;
  expression: string;
  result: string;
  type: 'standard' | 'fraction' | 'time' | 'pitch' | 'stair' | 'concrete' | 'studs' | 'baluster' | 'lumber' | 'triangle' | 'squaring';
};

interface ToolsetTabProps {
  templates: TextTemplate[];
  onAddTemplate: (template: Omit<TextTemplate, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateTemplate: (id: string, template: Partial<TextTemplate>) => void;
  onDeleteTemplate: (id: string) => void;
  canEditTemplates?: boolean;
}

export function CalculatorTab({ templates, onAddTemplate, onUpdateTemplate, onDeleteTemplate, canEditTemplates = true }: ToolsetTabProps) {
  const [display, setDisplay] = useState('0');
  const [expression, setExpression] = useState('');
  const [calcHistory, setCalcHistory] = useState<CalcHistoryItem[]>([]);
  const { toast } = useToast();
  
  const [sessionEmployeeId, setSessionEmployeeId] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('di_ledger_session_employee_id');
    if (saved) setSessionEmployeeId(saved);
  }, []);

  const { 
    passwordVault, addPassword, updatePassword, deletePassword, 
    supplies, addSupplyItem, deleteSupplyItem, referenceLibrary, 
    addReferenceDoc, updateReferenceDoc, deleteReferenceDoc, permissions 
  } = useLedgerData(sessionEmployeeId);

  const [editingVaultId, setEditingVaultId] = useState<string | null>(null);
  const [vaultForm, setVaultForm] = useState({ website: '', username: '', password: '', notes: '' });

  const seedVaultFromScreenshot = () => {
    const existing = new Set((passwordVault || []).map(v => (v.website || '').toLowerCase().trim()));
    const entries = [
      { website: 'Dropbox', username: 'jeff@designersink.us', password: 'VERIFY_FROM_SCREENSHOT', notes: 'Storage' },
      { website: 'Connectteam', username: 'Your Phone Number', password: 'Sand Code', notes: 'Time Sheet' },
      { website: 'Chief Architect', username: 'jeff@designersink.us', password: 'VERIFY_FROM_SCREENSHOT', notes: 'Software' },
      { website: 'Kuula', username: 'DesignersInk', password: 'VERIFY_FROM_SCREENSHOT', notes: 'Software' },
      { website: 'Chief Tutor', username: 'jeff@designersink.us', password: 'VERIFY_FROM_SCREENSHOT', notes: 'Software' },
      { website: 'Honeybook', username: 'jeff@designersink.us', password: 'honeybook2176', notes: 'Project Management' },
      { website: 'NVIDIA', username: 'jeff@designersink.us', password: 'VERIFY_FROM_SCREENSHOT', notes: 'Driver Update' },
      { website: 'Remarkable', username: 'jeff@designersink.us', password: 'VERIFY_FROM_SCREENSHOT', notes: '' },
      { website: 'Weebly', username: 'jeff@designersink.us', password: 'aeccly2724', notes: '' },
      { website: 'Reolink Cameras', username: 'Admin', password: 'VERIFY_FROM_SCREENSHOT', notes: 'Security Cameras | All Far Site Pro Jeff' },
      { website: 'Notion', username: 'jeff@designersink.us', password: 'bossink1274', notes: 'Project Management' },
      { website: 'AIBD', username: 'jeff@designersink.us', password: 'AIBDmember2724', notes: 'Organization' },
      { website: 'Tawk.to', username: 'jeff@designersink.us', password: 'Tawk1274', notes: 'Instant Messenger' },
    ];

    let added = 0;
    for (const entry of entries) {
      if (existing.has(entry.website.toLowerCase())) continue;
      addPassword(entry);
      added++;
    }

    toast({
      title: added > 0 ? 'Vault entries added' : 'No new entries added',
      description: added > 0
        ? `${added} items were added. Update any password marked VERIFY_FROM_SCREENSHOT.`
        : 'Those websites already exist in your vault.',
    });
  };

  // Standard Calc Functions
  const handleDigit = (digit: string) => {
    setDisplay(prev => prev === '0' ? digit : prev + digit);
  };

  const handleOperator = (op: string) => {
    setExpression(display + ' ' + op + ' ');
    setDisplay('0');
  };

  const calculateStandard = () => {
    try {
      const fullExpr = expression + display;
      const result = Function(`"use strict"; return (${fullExpr.replace('×', '*').replace('÷', '/')})`)().toString();
      const newItem: CalcHistoryItem = { 
        id: Math.random().toString(36).substr(2, 9), 
        expression: fullExpr, 
        result, 
        type: 'standard' 
      };
      setCalcHistory(prev => [newItem, ...prev].slice(0, 20));
      setDisplay(result);
      setExpression('');
    } catch (e) {
      setDisplay('Error');
    }
  };

  const clearCalc = () => { setDisplay('0'); setExpression(''); };
  const backspace = () => { setDisplay(prev => prev.length > 1 ? prev.slice(0, -1) : '0'); };

  // Fraction Helper
  const [f1n, setF1n] = useState('');
  const [f1d, setF1d] = useState('');
  const [f2n, setF2n] = useState('');
  const [f2d, setF2d] = useState('');
  const [fractionOp, setFractionOp] = useState<'+' | '-' | '*' | '/'>('+');

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

  const calculateFraction = () => {
    const n1 = parseInt(f1n); const d1 = parseInt(f1d); const n2 = parseInt(f2n); const d2 = parseInt(f2d);
    if (isNaN(n1) || isNaN(d1) || isNaN(n2) || isNaN(d2) || d1 === 0 || d2 === 0) return;
    let resN = 0; let resD = 0;
    switch (fractionOp) {
      case '+': resN = n1 * d2 + n2 * d1; resD = d1 * d2; break;
      case '-': resN = n1 * d2 - n2 * d1; resD = d1 * d2; break;
      case '*': resN = n1 * n2; resD = d1 * d2; break;
      case '/': resN = n1 * d2; resD = d1 * n2; break;
    }
    const common = Math.abs(gcd(resN, resD));
    const finalN = resN / common; const finalD = resD / common;
    const whole = Math.floor(Math.abs(finalN) / finalD) * (finalN < 0 ? -1 : 1);
    const remN = Math.abs(finalN) % finalD;
    let fractionStr = remN !== 0 ? (Math.abs(finalN) > finalD ? `${whole} ${remN}/${finalD}` : `${finalN}/${finalD}`) : `${whole}`;
    
    setCalcHistory(prev => [{ 
      id: Math.random().toString(36).substr(2, 9), 
      expression: `${n1}/${d1} ${fractionOp} ${n2}/${d2}`, 
      result: fractionStr, 
      type: 'fraction' 
    }, ...prev].slice(0, 20));
  };

  // Triangle Solver (Construction Master Pro Mode)
  const [triRise, setTriRise] = useState('');
  const [triRun, setTriRun] = useState('');
  const [triDiag, setTriDiag] = useState('');
  const [triPitch, setTriPitch] = useState('');

  const calculateTriangle = () => {
    const rise = parseFloat(triRise);
    const run = parseFloat(triRun);
    const diag = parseFloat(triDiag);
    const pitch = parseFloat(triPitch);

    let resRise = rise, resRun = run, resDiag = diag, resPitch = pitch;

    if (!isNaN(rise) && !isNaN(run)) {
      resDiag = Math.sqrt(rise * rise + run * run);
      resPitch = (Math.atan(rise / run) * 180) / Math.PI;
    } else if (!isNaN(rise) && !isNaN(diag)) {
      resRun = Math.sqrt(diag * diag - rise * rise);
      resPitch = (Math.asin(rise / diag) * 180) / Math.PI;
    } else if (!isNaN(run) && !isNaN(diag)) {
      resRise = Math.sqrt(diag * diag - run * run);
      resPitch = (Math.acos(run / diag) * 180) / Math.PI;
    } else if (!isNaN(pitch) && !isNaN(run)) {
      const rad = (pitch * Math.PI) / 180;
      resRise = run * Math.tan(rad);
      resDiag = run / Math.cos(rad);
    }

    if (isNaN(resRise) || isNaN(resRun)) {
      toast({ variant: "destructive", title: "Incomplete Data", description: "Need 2 values." });
      return;
    }

    setTriRise(resRise.toFixed(3));
    setTriRun(resRun.toFixed(3));
    setTriDiag(resDiag.toFixed(3));
    setTriPitch(resPitch.toFixed(2));
    
    setCalcHistory(prev => [{ 
      id: Math.random().toString(36).substr(2, 9), 
      expression: "Triangle Solve", 
      result: `Diag: ${resDiag.toFixed(3)}", Pitch: ${resPitch.toFixed(2)}°`, 
      type: 'triangle' 
    }, ...prev]);
  };

  // Roof Pitch Helper
  const [roofRise, setRoofRise] = useState('');
  const [roofRun, setRoofRun] = useState('12');

  const calculateRoofPitch = () => {
    const rise = parseFloat(roofRise);
    const run = parseFloat(roofRun);
    if (isNaN(rise) || isNaN(run) || run === 0) return;
    const pitchX = (rise / run) * 12;
    const angle = (Math.atan(rise / run) * 180) / Math.PI;
    setCalcHistory(prev => [{ 
      id: Math.random().toString(36).substr(2, 9), 
      expression: `Roof Pitch: ${rise}" over ${run}"`, 
      result: `${pitchX.toFixed(2)}/12 (${angle.toFixed(1)}°)`, 
      type: 'pitch' 
    }, ...prev]);
  };

  // Estimation Helpers
  const [concL, setConcL] = useState('');
  const [concW, setConcW] = useState('');
  const [concT, setConcT] = useState('');
  const calculateConcrete = () => {
    const l = parseFloat(concL); const w = parseFloat(concW); const t = parseFloat(concT);
    if (isNaN(l) || isNaN(w) || isNaN(t)) return;
    const yards = (l * w * (t / 12)) / 27;
    setCalcHistory(prev => [{ id: Math.random().toString(36).substr(2, 9), expression: `Concrete ${l}'x${w}'x${t}"`, result: `${yards.toFixed(2)} Cu Yards`, type: 'concrete' }, ...prev]);
  };

  const [studRun, setStudRun] = useState('');
  const [studOC, setStudOC] = useState('16');
  const calculateStuds = () => {
    const run = parseFloat(studRun); const oc = parseFloat(studOC);
    if (isNaN(run)) return;
    const count = Math.ceil((run * 12) / oc) + 1 + 2; // +1 for end, +2 for corners
    setCalcHistory(prev => [{ id: Math.random().toString(36).substr(2, 9), expression: `Studs for ${run}' @ ${oc}" OC`, result: `${count} Studs`, type: 'studs' }, ...prev]);
  };

  const [balOpen, setBalOpen] = useState('');
  const [balWidth, setBalWidth] = useState('0.5');
  const calculateBalusters = () => {
    const opening = parseFloat(balOpen); const width = parseFloat(balWidth);
    if (isNaN(opening)) return;
    const count = Math.ceil(opening / (4 + width));
    const gap = (opening - (count * width)) / (count + 1);
    setCalcHistory(prev => [{ id: Math.random().toString(36).substr(2, 9), expression: `Balusters for ${opening}"`, result: `${count} units @ ${gap.toFixed(3)}" gap`, type: 'baluster' }, ...prev]);
  };

  const [bfT, setBfT] = useState('1');
  const [bfW, setBfW] = useState('4');
  const [bfL, setBfL] = useState('');
  const calculateBoardFoot = () => {
    const t = parseFloat(bfT);
    const w = parseFloat(bfW);
    const l = parseFloat(bfL);
    if (isNaN(t) || isNaN(w) || isNaN(l)) return;
    const bf = (t * w * l) / 12;
    setCalcHistory(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      expression: `${t}"x${w}"x${l}' Lumber`,
      result: `${bf.toFixed(2)} Board Ft`,
      type: 'lumber'
    }, ...prev]);
  };

  const handleVaultSubmit = (e: React.FormEvent) => {
    e.preventDefault(); 
    if (!vaultForm.website || !vaultForm.username || !vaultForm.password) return;
    if (editingVaultId) updatePassword(editingVaultId, vaultForm);
    else addPassword(vaultForm);
    setEditingVaultId(null); 
    setVaultForm({ website: '', username: '', password: '', notes: '' });
    toast({ title: "Vault synchronized." });
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-12">
      <div className="flex flex-col xl:flex-row gap-8 items-start">
        {/* Left Side: Professional Calculator UI */}
        <div className="w-full xl:w-[450px] shrink-0 sticky top-28">
          <Card className="bg-[#1a1c1e] border-[#2d3135] shadow-2xl p-6 rounded-[2.5rem] w-full ring-8 ring-background">
            <div className="space-y-6">
              <div className="bg-[#c2d1b2] p-6 rounded-2xl shadow-inner border-4 border-[#8e9b81] flex flex-col items-end justify-center min-h-[120px] overflow-hidden">
                <div className="text-[#3a4134] text-xs font-mono mb-1 truncate w-full text-right h-4 opacity-70">{expression}</div>
                <div className="text-[#242921] text-6xl font-mono tracking-tighter truncate w-full text-right leading-none">{display}</div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <Button variant="outline" className="h-16 bg-rose-500/10 text-rose-500 rounded-2xl text-lg font-bold" onClick={clearCalc}>C</Button>
                <Button variant="outline" className="h-16 bg-muted/20 rounded-2xl text-lg font-bold" onClick={backspace}><Delete className="h-5 w-5" /></Button>
                <Button variant="outline" className="h-16 bg-muted/20 rounded-2xl text-xl font-bold" onClick={() => handleOperator('/')}><Divide className="h-6 w-6" /></Button>
                <Button variant="outline" className="h-16 bg-muted/20 rounded-2xl text-xl font-bold" onClick={() => handleOperator('*')}><X className="h-6 w-6" /></Button>
                {[7, 8, 9].map(n => <Button key={n} variant="outline" className="h-16 bg-secondary/50 rounded-2xl text-2xl font-bold hover:bg-primary" onClick={() => handleDigit(n.toString())}>{n}</Button>)}
                <Button variant="outline" className="h-16 bg-muted/20 rounded-2xl text-xl font-bold" onClick={() => handleOperator('-')}><Minus className="h-6 w-6" /></Button>
                {[4, 5, 6].map(n => <Button key={n} variant="outline" className="h-16 bg-secondary/50 rounded-2xl text-2xl font-bold hover:bg-primary" onClick={() => handleDigit(n.toString())}>{n}</Button>)}
                <Button variant="outline" className="h-16 bg-muted/20 rounded-2xl text-xl font-bold" onClick={() => handleOperator('+')}><Plus className="h-6 w-6" /></Button>
                {[1, 2, 3].map(n => <Button key={n} variant="outline" className="h-16 bg-secondary/50 rounded-2xl text-2xl font-bold hover:bg-primary" onClick={() => handleDigit(n.toString())}>{n}</Button>)}
                <Button variant="outline" className="h-34 row-span-2 bg-primary text-white rounded-2xl text-3xl font-bold" onClick={calculateStandard}><Equal className="h-10 w-10" /></Button>
                <Button variant="outline" className="h-16 col-span-2 bg-secondary/50 rounded-2xl text-2xl font-bold hover:bg-primary text-left px-6" onClick={() => handleDigit('0')}>0</Button>
                <Button variant="outline" className="h-16 bg-secondary/50 rounded-2xl text-2xl font-bold hover:bg-primary" onClick={() => handleDigit('.')}>.</Button>
              </div>
            </div>
          </Card>

          {/* History Log */}
          <Card className="mt-8 border-border/50 bg-card/30">
            <CardHeader className="py-3 border-b border-border/50 flex flex-row items-center justify-between">
              <CardTitle className="text-xs uppercase font-black text-muted-foreground flex items-center gap-2">
                <History className="h-3 w-3" /> Tool History
              </CardTitle>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCalcHistory([])}><Trash2 className="h-3 w-3" /></Button>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[300px]">
                {calcHistory.map(item => (
                  <div key={item.id} className="p-3 border-b border-border/20 group hover:bg-primary/5 transition-all">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[8px] font-black uppercase text-primary tracking-widest">{item.type}</span>
                      <span className="text-[9px] text-muted-foreground font-mono">{item.expression}</span>
                    </div>
                    <div className="text-sm font-bold text-white font-mono flex justify-between items-center">
                      {item.result}
                      <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100" onClick={() => setDisplay(item.result.split(' ')[0])}><Hash className="h-3 w-3" /></Button>
                    </div>
                  </div>
                ))}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Tabbed Tools */}
        <div className="flex-1 space-y-8 w-full">
          <Tabs defaultValue="tools" className="w-full">
            <TabsList className="bg-card border border-border/50 p-1 rounded-xl mb-6 h-auto flex-wrap justify-start">
              <TabsTrigger value="tools" className="px-6 gap-2 shrink-0 h-10"><Hammer className="h-4 w-4" /> Architectural Helpers</TabsTrigger>
              <TabsTrigger value="checklists" className="px-6 gap-2 shrink-0 h-10"><CheckCircle2 className="h-4 w-4" /> Project Checklists</TabsTrigger>
              <TabsTrigger value="library" className="px-6 gap-2 shrink-0 h-10"><Library className="h-4 w-4" /> Reference Library</TabsTrigger>
              <TabsTrigger value="supplies" className="px-6 gap-2 shrink-0 h-10"><ShoppingCart className="h-4 w-4" /> Groceries & Supplies</TabsTrigger>
              <TabsTrigger value="vault" className="px-6 gap-2 shrink-0 h-10"><Lock className="h-4 w-4" /> Password Vault</TabsTrigger>
              <TabsTrigger value="prompts" className="px-6 gap-2 shrink-0 h-10"><BookOpen className="h-4 w-4" /> Prompt Library</TabsTrigger>
              <TabsTrigger value="plan-review" className="px-6 gap-2 shrink-0 h-10"><ScanLine className="h-4 w-4" /> Plan Review</TabsTrigger>
            </TabsList>

            <TabsContent value="tools" className="space-y-6 animate-in fade-in duration-500">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 4065 Triangle Solver */}
                <Card className="border-border/50 bg-card/30 lg:col-span-2">
                  <CardHeader className="bg-primary/10 py-4">
                    <CardTitle className="text-sm font-headline flex items-center gap-2 text-primary uppercase tracking-widest">
                      <Triangle className="h-4 w-4" /> Right Triangle Solver (Construction Master Pro Logic)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div className="space-y-1"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Rise (Inches)</Label><Input type="number" step="0.001" className="h-10 bg-background/50" value={triRise} onChange={e => setTriRise(e.target.value)} /></div>
                      <div className="space-y-1"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Run (Inches)</Label><Input type="number" step="0.001" className="h-10 bg-background/50" value={triRun} onChange={e => setTriRun(e.target.value)} /></div>
                      <div className="space-y-1"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Diagonal (Inches)</Label><Input type="number" step="0.001" className="h-10 bg-background/50" value={triDiag} onChange={e => setTriDiag(e.target.value)} /></div>
                      <div className="space-y-1"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Pitch (Degrees)</Label><Input type="number" step="0.01" className="h-10 bg-background/50" value={triPitch} onChange={e => setTriPitch(e.target.value)} /></div>
                    </div>
                    <div className="flex justify-between items-center bg-muted/20 p-4 rounded-xl border border-border/50">
                      <p className="text-[10px] text-muted-foreground italic">Enter any 2 values to solve the remaining dimensions.</p>
                      <Button onClick={calculateTriangle} className="bg-primary gap-2 h-10 px-8 shadow-lg shadow-primary/20">
                        <MoveUpRight className="h-4 w-4" /> Solve Triangle
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Fraction Calculator */}
                <Card className="border-border/50 bg-card/30">
                  <CardHeader className="py-3 border-b border-border/50"><CardTitle className="text-xs uppercase font-black text-muted-foreground flex items-center gap-2"><Ruler className="h-3 w-3" /> Tape Measure Fraction Tool</CardTitle></CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 grid grid-cols-2 gap-1"><Input className="h-8 text-center" placeholder="N" value={f1n} onChange={e => setF1n(e.target.value)} /><Input className="h-8 text-center" placeholder="D" value={f1d} onChange={e => setF1d(e.target.value)} /></div>
                      <select className="h-8 rounded bg-background border border-border/50 text-xs px-1" value={fractionOp} onChange={e => setFractionOp(e.target.value as any)}><option value="+">+</option><option value="-">-</option><option value="*">×</option><option value="/">÷</option></select>
                      <div className="flex-1 grid grid-cols-2 gap-1"><Input className="h-8 text-center" placeholder="N" value={f2n} onChange={e => setF2n(e.target.value)} /><Input className="h-8 text-center" placeholder="D" value={f2d} onChange={e => setF2d(e.target.value)} /></div>
                    </div>
                    <Button variant="outline" className="w-full h-8 text-[10px] font-black uppercase tracking-widest border-primary/20 text-primary" onClick={calculateFraction}>Process Fraction</Button>
                  </CardContent>
                </Card>

                {/* Roof Pitch Helper */}
                <Card className="border-border/50 bg-card/30">
                  <CardHeader className="py-3 border-b border-border/50">
                    <CardTitle className="text-xs uppercase font-black text-muted-foreground flex items-center gap-2">
                      <MoveUpRight className="h-3 w-3" /> Roof Pitch & Slope
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[8px] uppercase">Rise (Inches)</Label>
                        <Input className="h-8" value={roofRise} onChange={e => setRoofRise(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[8px] uppercase">Run (Inches)</Label>
                        <Input className="h-8" value={roofRun} onChange={e => setRoofRun(e.target.value)} />
                      </div>
                    </div>
                    <Button variant="outline" className="w-full h-8 text-[10px] font-black uppercase tracking-widest border-indigo-500/20 text-indigo-500" onClick={calculateRoofPitch}>
                      Calculate Pitch
                    </Button>
                  </CardContent>
                </Card>

                {/* Concrete Volume */}
                <Card className="border-border/50 bg-card/30">
                  <CardHeader className="py-3 border-b border-border/50"><CardTitle className="text-xs uppercase font-black text-muted-foreground flex items-center gap-2"><Droplets className="h-3 w-3" /> Concrete Slab Volume</CardTitle></CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1"><Label className="text-[8px] uppercase">L (Feet)</Label><Input className="h-8" value={concL} onChange={e => setConcL(e.target.value)} /></div>
                      <div className="space-y-1"><Label className="text-[8px] uppercase">W (Feet)</Label><Input className="h-8" value={concW} onChange={e => setConcW(e.target.value)} /></div>
                      <div className="space-y-1"><Label className="text-[8px] uppercase">T (Inches)</Label><Input className="h-8" value={concT} onChange={e => setConcT(e.target.value)} /></div>
                    </div>
                    <Button variant="outline" className="w-full h-8 text-[10px] font-black uppercase tracking-widest border-emerald-500/20 text-emerald-500" onClick={calculateConcrete}>Calc Cu Yards</Button>
                  </CardContent>
                </Card>

                {/* Wall Studs */}
                <Card className="border-border/50 bg-card/30">
                  <CardHeader className="py-3 border-b border-border/50"><CardTitle className="text-xs uppercase font-black text-muted-foreground flex items-center gap-2"><Construction className="h-3 w-3" /> Wall Stud Estimator</CardTitle></CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1"><Label className="text-[8px] uppercase">Wall Run (Ft)</Label><Input className="h-8" value={studRun} onChange={e => setStudRun(e.target.value)} /></div>
                      <div className="space-y-1"><Label className="text-[8px] uppercase">Spacing (OC)</Label><select className="h-8 w-full bg-background border border-border/50 rounded text-xs px-2" value={studOC} onChange={e => setStudOC(e.target.value)}><option value="16">16" O.C.</option><option value="24">24" O.C.</option></select></div>
                    </div>
                    <Button variant="outline" className="w-full h-8 text-[10px] font-black uppercase tracking-widest border-amber-500/20 text-amber-500" onClick={calculateStuds}>Estimate Studs</Button>
                  </CardContent>
                </Card>

                {/* Baluster Spacing */}
                <Card className="border-border/50 bg-card/30">
                  <CardHeader className="py-3 border-b border-border/50"><CardTitle className="text-xs uppercase font-black text-muted-foreground flex items-center gap-2"><Layers className="h-3 w-3" /> Baluster Spacing</CardTitle></CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1"><Label className="text-[8px] uppercase">Opening (In)</Label><Input className="h-8" value={balOpen} onChange={e => setBalOpen(e.target.value)} /></div>
                      <div className="space-y-1"><Label className="text-[8px] uppercase">Bal Width (In)</Label><Input className="h-8" value={balWidth} onChange={e => setBalWidth(e.target.value)} /></div>
                    </div>
                    <Button variant="outline" className="w-full h-8 text-[10px] font-black uppercase tracking-widest border-sky-500/20 text-sky-500" onClick={calculateBalusters}>Calculate Layout</Button>
                  </CardContent>
                </Card>

                {/* Board Foot Calculator */}
                <Card className="border-border/50 bg-card/30">
                  <CardHeader className="py-3 border-b border-border/50">
                    <CardTitle className="text-xs uppercase font-black text-muted-foreground flex items-center gap-2">
                      <Box className="h-3 w-3" /> Board Foot (Lumber)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1"><Label className="text-[8px] uppercase">T (In)</Label><Input className="h-8" value={bfT} onChange={e => setBfT(e.target.value)} /></div>
                      <div className="space-y-1"><Label className="text-[8px] uppercase">W (In)</Label><Input className="h-8" value={bfW} onChange={e => setBfW(e.target.value)} /></div>
                      <div className="space-y-1"><Label className="text-[8px] uppercase">L (Ft)</Label><Input className="h-8" value={bfL} onChange={e => setBfL(e.target.value)} /></div>
                    </div>
                    <Button variant="outline" className="w-full h-8 text-[10px] font-black uppercase tracking-widest border-orange-500/20 text-orange-500" onClick={calculateBoardFoot}>
                      Estimate BF
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="checklists">
              <ProjectChecklistsTab />
            </TabsContent>

            <TabsContent value="library">
              <ReferenceLibraryTab 
                documents={referenceLibrary} 
                onAddDoc={addReferenceDoc} 
                onUpdateDoc={updateReferenceDoc} 
                onDeleteDoc={deleteReferenceDoc} 
                canEdit={permissions.calculator === 'write'} 
              />
            </TabsContent>

            <TabsContent value="supplies">
              <SuppliesTab 
                supplies={supplies} 
                onAddItem={addSupplyItem} 
                onDeleteItem={deleteSupplyItem} 
                canEdit={permissions.supplies === 'write'} 
              />
            </TabsContent>

            <TabsContent value="vault" className="space-y-6">
              <Card className="border-border/50 bg-card/30">
                <CardHeader className="bg-muted/30 py-4">
                  <CardTitle className="text-lg font-headline flex items-center gap-2 text-accent">
                    <Lock className="h-4 w-4" /> {editingVaultId ? 'Edit Credential' : 'Add Website Credential'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <form onSubmit={handleVaultSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2"><Label>Website/Service</Label><Input placeholder="e.g. Chief Architect" value={vaultForm.website} onChange={e => setVaultForm({...vaultForm, website: e.target.value})} required /></div>
                      <div className="space-y-2"><Label>Username</Label><Input value={vaultForm.username} onChange={e => setVaultForm({...vaultForm, username: e.target.value})} required /></div>
                      <div className="space-y-2"><Label>Password</Label><Input type="text" value={vaultForm.password} onChange={e => setVaultForm({...vaultForm, password: e.target.value})} required /></div>
                    </div>
                    <div className="flex justify-end gap-2">
                      {editingVaultId && <Button type="button" variant="ghost" onClick={() => setEditingVaultId(null)}>Cancel</Button>}
                      <Button type="submit" className="bg-primary">{editingVaultId ? 'Update' : 'Save to Vault'}</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-card/30">
                <CardHeader className="bg-muted/30 py-4">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-lg font-headline flex items-center gap-2">
                    <Lock className="h-4 w-4 text-primary" /> Active Credentials
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-[10px] uppercase font-black"
                    onClick={seedVaultFromScreenshot}
                    title="Add entries from provided screenshot list"
                  >
                    <Plus className="h-3 w-3" /> Add Screenshot Entries
                  </Button>
                </div>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[400px]">
                    <div className="divide-y divide-border/50">
                      {passwordVault.length === 0 ? (
                        <div className="text-center py-20 text-muted-foreground italic">No credentials stored yet.</div>
                      ) : (
                        passwordVault.map((entry) => (
                          <div key={entry.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:bg-muted/20">
                            <div className="space-y-1">
                              <div className="font-bold text-white">{entry.website}</div>
                              <div className="flex flex-wrap gap-4 text-sm">
                                <div className="bg-muted/30 px-2 py-1 rounded">User: {entry.username}</div>
                                <div className="bg-muted/30 px-2 py-1 rounded">Pass: {entry.password}</div>
                              </div>
                            </div>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100">
                              <Button variant="ghost" size="icon" onClick={() => { setEditingVaultId(entry.id); setVaultForm(entry); }}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-rose-500" onClick={() => deletePassword(entry.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="prompts" className="space-y-6">
              <PromptLibraryTab 
                templates={templates} 
                onAddTemplate={onAddTemplate} 
                onUpdateTemplate={onUpdateTemplate} 
                onDeleteTemplate={onDeleteTemplate} 
                canEdit={canEditTemplates} 
              />
            </TabsContent>

            <TabsContent value="plan-review" className="space-y-6 animate-in fade-in duration-500">
              <PlanReviewTab
                sessionEmployeeId={sessionEmployeeId}
                canEditPrompts={permissions.calculator === 'write'}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

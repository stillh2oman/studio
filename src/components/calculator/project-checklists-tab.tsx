
"use client"

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Trash2, Save, FileCheck, Info, ChevronRight, ListTodo, Settings2 } from 'lucide-react';
import { useLedgerData } from '@/hooks/use-ledger-data';
import { ChecklistCategory } from '@/lib/checklist-data';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export function ProjectChecklistsTab() {
  const { checklistTemplate, updateChecklistTemplate, permissions } = useLedgerData();
  const { toast } = useToast();
  
  const [localTemplate, setLocalTemplate] = useState<ChecklistCategory[]>(checklistTemplate);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);

  const canEdit = permissions.calculator === 'write';

  const selectedCategory = localTemplate.find(c => c.id === selectedCatId);

  const handleUpdateCategory = (id: string, updates: Partial<ChecklistCategory>) => {
    const next = localTemplate.map(c => c.id === id ? { ...c, ...updates } : c);
    setLocalTemplate(next);
  };

  const handleUpdateSubTask = (catId: string, subId: string, label: string) => {
    const next = localTemplate.map(c => {
      if (c.id !== catId) return c;
      return {
        ...c,
        subTasks: c.subTasks.map(s => s.id === subId ? { ...s, label } : s)
      };
    });
    setLocalTemplate(next);
  };

  const addSubTask = (catId: string) => {
    const next = localTemplate.map(c => {
      if (c.id !== catId) return c;
      return {
        ...c,
        subTasks: [...c.subTasks, { id: Math.random().toString(36).substr(2, 9), label: 'New Requirement' }]
      };
    });
    setLocalTemplate(next);
  };

  const removeSubTask = (catId: string, subId: string) => {
    const next = localTemplate.map(c => {
      if (c.id !== catId) return c;
      return {
        ...c,
        subTasks: c.subTasks.filter(s => s.id !== subId)
      };
    });
    setLocalTemplate(next);
  };

  const handleSave = () => {
    updateChecklistTemplate(localTemplate);
    toast({ title: "Firm Standards Synchronized", description: "The master checklist template has been updated." });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-card/30 p-8 rounded-3xl border border-border/50 shadow-xl">
        <div className="space-y-1">
          <h2 className="text-3xl font-headline font-bold text-white flex items-center gap-3">
            <FileCheck className="h-8 w-8 text-primary" /> Master Checklist Template
          </h2>
          <p className="text-muted-foreground text-sm uppercase tracking-widest font-semibold">Architectural Standard Operating Procedures</p>
        </div>
        {canEdit && (
          <Button onClick={handleSave} className="bg-primary h-12 px-8 gap-2 font-bold shadow-lg shadow-primary/20">
            <Save className="h-4 w-4" /> Save Firm Standards
          </Button>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <Card className="lg:col-span-4 border-border/50 bg-card/30 overflow-hidden h-fit">
          <CardHeader className="bg-muted/30 border-b border-border/50 py-4">
            <CardTitle className="text-sm font-headline uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Settings2 className="h-4 w-4" /> Document Categories
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/30">
              {localTemplate.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCatId(cat.id)}
                  className={cn(
                    "w-full text-left p-4 hover:bg-primary/5 transition-all group flex items-center justify-between border-l-4",
                    selectedCatId === cat.id ? "bg-primary/10 border-primary" : "border-transparent"
                  )}
                >
                  <div className="space-y-0.5">
                    <span className="font-bold text-sm text-white group-hover:text-primary transition-colors">{cat.label}</span>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">{cat.subTasks.length} Requirements</p>
                  </div>
                  <ChevronRight className={cn("h-4 w-4 transition-all opacity-0 group-hover:opacity-100", selectedCatId === cat.id && "opacity-100 translate-x-1")} />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-8 space-y-6">
          {selectedCategory ? (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
              <Card className="border-border/50 bg-card/30">
                <CardHeader className="bg-muted/30 border-b border-border/50 py-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase font-black text-primary tracking-[0.2em]">Category Label</Label>
                      <Input 
                        value={selectedCategory.label} 
                        onChange={e => handleUpdateCategory(selectedCategory.id, { label: e.target.value })}
                        className="h-12 text-2xl font-headline font-bold bg-background/50"
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase font-black text-accent tracking-[0.2em]">Objective / Description</Label>
                      <Textarea 
                        value={selectedCategory.description} 
                        onChange={e => handleUpdateCategory(selectedCategory.id, { description: e.target.value })}
                        className="bg-background/50"
                        disabled={!canEdit}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-8">
                  <div className="flex items-center justify-between mb-6 px-2">
                    <h3 className="font-headline text-xl text-white flex items-center gap-2">
                      <ListTodo className="h-5 w-5 text-primary" /> Technical Requirements
                    </h3>
                    {canEdit && (
                      <Button variant="outline" size="sm" onClick={() => addSubTask(selectedCategory.id)} className="h-8 gap-2 border-primary/30 text-primary">
                        <Plus className="h-3 w-3" /> Add Detail
                      </Button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {selectedCategory.subTasks.map(sub => (
                      <div key={sub.id} className="flex gap-3 items-start p-3 bg-muted/20 border border-border/50 rounded-xl group hover:border-primary/30 transition-all">
                        <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center shrink-0 border border-border/50 text-[10px] font-black text-muted-foreground group-hover:text-primary transition-colors">
                          {selectedCategory.subTasks.indexOf(sub) + 1}
                        </div>
                        <Textarea 
                          value={sub.label} 
                          onChange={e => handleUpdateSubTask(selectedCategory.id, sub.id, e.target.value)}
                          className="min-h-[60px] bg-transparent border-transparent hover:border-border/50 focus:border-primary/50 text-sm leading-relaxed p-2 resize-none"
                          disabled={!canEdit}
                        />
                        {canEdit && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => removeSubTask(selectedCategory.id, sub.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="border-border/50 bg-card/30 border-dashed h-[500px]">
              <CardContent className="h-full flex flex-col items-center justify-center py-20 space-y-4">
                <div className="h-20 w-20 bg-primary/5 rounded-full flex items-center justify-center border border-primary/10">
                  <FileCheck className="h-10 w-10 text-primary/40" />
                </div>
                <div className="text-center">
                  <h3 className="text-xl font-headline font-bold text-white">Select a Category</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mt-1">
                    Choose a plan document set category from the left to view or edit the technical firm standards.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Card className="border-border/50 bg-accent/5 shadow-inner">
        <CardContent className="p-6 flex gap-4">
          <div className="h-12 w-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
            <Info className="h-6 w-6 text-accent" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-black uppercase text-accent tracking-widest">About Global Standards</p>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-4xl">
              Updates to this master template will not affect existing project checklists, but will be used for all <strong>new project initializations</strong> and <strong>automated Construction Document tasks</strong>. Use this area to codify firm-wide best practices and code compliance checks.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

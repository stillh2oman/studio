
"use client"

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Search, FileText, User, Layout, ClipboardList, DollarSign, 
  Printer, BookOpen, MessageSquare, ChevronRight, Hash, Command,
  Database, FileCode, ShoppingCart, ArrowUpDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  Client, Project, Task, BillableEntry, PrintEntry, 
  ProjectNote, ReferenceDocument, TextTemplate 
} from '@/lib/types';

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: {
    clients: Client[];
    projects: Project[];
    tasks: Task[];
    billableEntries: BillableEntry[];
    printEntries: PrintEntry[];
    notes: ProjectNote[];
    library: ReferenceDocument[];
    templates: TextTemplate[];
  };
  onNavigate: (tab: string, subTab?: string, entityId?: string) => void;
  /** When false, billable/print ledger hits are omitted (users without Billing tab access). */
  includeBillingInSearch?: boolean;
}

type SearchResult = {
  id: string;
  category: 'Project' | 'Client' | 'Task' | 'Note' | 'Billing' | 'Printing' | 'Library' | 'Template';
  title: string;
  subtitle: string;
  snippet?: string;
  linkAction: () => void;
};

export function GlobalSearch({ open, onOpenChange, data, onNavigate, includeBillingInSearch = true }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const router = useRouter();

  const results = useMemo(() => {
    if (!query.trim() || query.length < 2) return [];
    
    const q = query.toLowerCase();
    const matches: SearchResult[] = [];

    // 1. Projects
    data.projects.forEach(p => {
      if (p.name.toLowerCase().includes(q) || p.address?.toLowerCase().includes(q) || p.constructionCompany?.toLowerCase().includes(q)) {
        matches.push({
          id: p.id,
          category: 'Project',
          title: p.name,
          subtitle: p.address || 'Architectural Registry',
          linkAction: () => {
            router.push(`/projects/${p.id}`);
            onOpenChange(false);
          }
        });
      }
    });

    // 2. Clients
    data.clients.forEach(c => {
      if (c.name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)) {
        matches.push({
          id: c.id,
          category: 'Client',
          title: c.name,
          subtitle: c.email || 'Client Database',
          linkAction: () => {
            onNavigate('registry', 'clients');
            onOpenChange(false);
          }
        });
      }
    });

    // 3. Tasks
    data.tasks.forEach(t => {
      if (t.name?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q)) {
        const proj = data.projects.find(p => p.id === t.projectId);
        matches.push({
          id: t.id,
          category: 'Task',
          title: t.name || 'Untitled Task',
          subtitle: proj ? `Project: ${proj.name}` : 'Task Queue',
          snippet: t.description,
          linkAction: () => {
            onNavigate('tasks', undefined, t.id);
            onOpenChange(false);
          }
        });
      }
    });

    // 4. Activity Logs (Notes)
    data.notes?.forEach(n => {
      if (n.text.toLowerCase().includes(q)) {
        const proj = data.projects.find(p => p.id === n.projectId);
        matches.push({
          id: n.id,
          category: 'Note',
          title: `Log Entry by ${n.authorName}`,
          subtitle: proj ? `Project: ${proj.name}` : 'Activity Log',
          snippet: n.text,
          linkAction: () => {
            if (proj) router.push(`/projects/${proj.id}`);
            onOpenChange(false);
          }
        });
      }
    });

    // 5. Billing (Billable Hours) — optional for users without Billing tab
    if (includeBillingInSearch) {
      data.billableEntries.forEach(e => {
        if (e.description?.toLowerCase().includes(q)) {
          const proj = data.projects.find(p => p.id === e.projectId);
          matches.push({
            id: e.id,
            category: 'Billing',
            title: `${e.hours}h - ${e.designer}`,
            subtitle: proj ? `Project: ${proj.name}` : 'Billing Ledger',
            snippet: e.description,
            linkAction: () => {
              onNavigate('billing', 'hours');
              onOpenChange(false);
            }
          });
        }
      });

      // 6. Printing
      data.printEntries.forEach(e => {
        if (e.description?.toLowerCase().includes(q)) {
          const proj = data.projects.find(p => p.id === e.projectId);
          matches.push({
            id: e.id,
            category: 'Printing',
            title: `${e.sheets} Sheets - ${e.paperSize}`,
            subtitle: proj ? `Project: ${proj.name}` : 'Print Ledger',
            snippet: e.description,
            linkAction: () => {
              onNavigate('billing', 'printing');
              onOpenChange(false);
            }
          });
        }
      });
    }

    // 7. Reference Library
    data.library.forEach(doc => {
      if (doc.title.toLowerCase().includes(q) || doc.description?.toLowerCase().includes(q)) {
        matches.push({
          id: doc.id,
          category: 'Library',
          title: doc.title,
          subtitle: doc.category || 'Reference Catalog',
          snippet: doc.description,
          linkAction: () => {
            onNavigate('toolset', 'library');
            onOpenChange(false);
          }
        });
      }
    });

    // 8. Templates
    data.templates.forEach(t => {
      if (t.name.toLowerCase().includes(q) || t.content.toLowerCase().includes(q)) {
        matches.push({
          id: t.id,
          category: 'Template',
          title: t.name,
          subtitle: 'Prompt Library',
          snippet: t.content,
          linkAction: () => {
            onNavigate('toolset', 'prompts');
            onOpenChange(false);
          }
        });
      }
    });

    return matches;
  }, [query, data, router, onNavigate, onOpenChange, includeBillingInSearch]);

  const CategoryIcon = ({ cat }: { cat: SearchResult['category'] }) => {
    switch (cat) {
      case 'Project': return <Layout className="h-4 w-4 text-primary" />;
      case 'Client': return <User className="h-4 w-4 text-accent" />;
      case 'Task': return <ClipboardList className="h-4 w-4 text-sky-500" />;
      case 'Note': return <MessageSquare className="h-4 w-4 text-amber-500" />;
      case 'Billing': return <DollarSign className="h-4 w-4 text-emerald-500" />;
      case 'Printing': return <Printer className="h-4 w-4 text-indigo-500" />;
      case 'Library': return <BookOpen className="h-4 w-4 text-rose-500" />;
      case 'Template': return <FileCode className="h-4 w-4 text-purple-500" />;
      default: return <Hash className="h-4 w-4" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] p-0 gap-0 border-border/50 bg-[#1a1c1e] overflow-hidden shadow-2xl">
        <DialogTitle className="sr-only">Global search</DialogTitle>
        <div className="flex items-center border-b border-border/50 px-4 h-16">
          <Search className="h-5 w-5 text-muted-foreground mr-3" />
          <Input 
            autoFocus
            placeholder="Search Projects, Clients, Tasks, Notes..." 
            className="flex-1 border-none bg-transparent focus-visible:ring-0 text-lg font-bold placeholder:text-muted-foreground/50"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className="flex items-center gap-1.5 ml-4">
            <kbd className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono text-muted-foreground border border-border/50">ESC</kbd>
            <span className="text-[10px] uppercase font-black text-muted-foreground/50">to close</span>
          </div>
        </div>

        <ScrollArea className="h-[450px]">
          {query.trim() && results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-muted/10 flex items-center justify-center">
                <Search className="h-8 w-8 text-muted-foreground/20" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-white/50">No matches found for "{query}"</p>
                <p className="text-xs text-muted-foreground">Try searching for a client name or project alias.</p>
              </div>
            </div>
          ) : !query.trim() ? (
            <div className="p-8 space-y-8">
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em]">Search Suggestions</h4>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setQuery('Residence')} className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/50 hover:border-primary/50 transition-all text-left">
                    <span className="text-xs font-bold">Search Residences</span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  </button>
                  <button onClick={() => setQuery('Meeting')} className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/50 hover:border-primary/50 transition-all text-left">
                    <span className="text-xs font-bold">Search Meetings</span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
              </div>
              <div className="flex flex-col items-center gap-2 opacity-20">
                <Command className="h-10 w-10" />
                <p className="text-[10px] font-black uppercase">Firm Command Search Engine</p>
              </div>
            </div>
          ) : (
            <div className="py-2">
              {results.map((result) => (
                <button
                  key={`${result.category}-${result.id}`}
                  onClick={result.linkAction}
                  className="w-full text-left px-4 py-3 hover:bg-primary/5 transition-all group flex items-start gap-4 border-l-4 border-transparent hover:border-primary"
                >
                  <div className="mt-1 h-8 w-8 rounded-lg bg-muted/30 flex items-center justify-center shrink-0 border border-border/50 group-hover:border-primary/30 transition-all">
                    <CategoryIcon cat={result.category} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-white group-hover:text-primary transition-colors">{result.title}</span>
                      <Badge variant="outline" className="text-[8px] h-3.5 px-1 py-0 uppercase font-black tracking-widest border-muted-foreground/20">
                        {result.category}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">{result.subtitle}</p>
                    {result.snippet && (
                      <p className="text-[11px] text-muted-foreground/70 line-clamp-1 mt-1 font-medium italic">
                        "{result.snippet}"
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/30 mt-2 group-hover:translate-x-1 group-hover:text-primary transition-all" />
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="flex items-center justify-between px-4 py-3 bg-muted/10 border-t border-border/50">
          <div className="flex items-center gap-4 text-[9px] font-black uppercase text-muted-foreground tracking-widest">
            <span className="flex items-center gap-1.5"><ChevronRight className="h-3 w-3" /> Select</span>
            <span className="flex items-center gap-1.5"><ArrowUpDown className="h-3 w-3" /> Navigate</span>
          </div>
          <p className="text-[9px] text-muted-foreground font-bold">FOUND {results.length} ENTRIES</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

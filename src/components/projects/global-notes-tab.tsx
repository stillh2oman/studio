
"use client"

import { useState, useMemo } from 'react';
import { Project, Client, ProjectNote } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ProjectNotes } from './project-notes';
import { useCollection, useMemoFirebase, useFirestore } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { MessageSquare, Loader2, BookOpen, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface GlobalNotesTabProps {
  projects: Project[];
  clients: Client[];
  onAddNote: (projectId: string, note: any) => void;
  onUpdateNote: (projectId: string, noteId: string, note: any) => void;
  onDeleteNote: (projectId: string, noteId: string) => void;
  dataRootId: string | null;
  canEdit?: boolean;
}

export function GlobalNotesTab({ projects, clients, onAddNote, onUpdateNote, onDeleteNote, dataRootId, canEdit = true }: GlobalNotesTabProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const firestore = useFirestore();

  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => a.name.localeCompare(b.name));
  }, [projects]);

  const notesQuery = useMemoFirebase(() => {
    if (!dataRootId || !selectedProjectId) return null;
    return query(
      collection(firestore, 'employees', dataRootId, 'projects', selectedProjectId, 'notes'),
      orderBy('createdAt', 'desc')
    );
  }, [firestore, dataRootId, selectedProjectId]);

  const { data: notes, isLoading: isNotesLoading } = useCollection<ProjectNote>(notesQuery);

  const filteredProjects = sortedProjects.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const selectedClient = clients.find(c => c.id === selectedProject?.clientId);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-card/30 p-8 rounded-3xl border border-border/50 gap-6">
        <div className="space-y-1">
          <h2 className="text-4xl font-headline font-bold text-white flex items-center gap-3">
            <MessageSquare className="h-10 w-10 text-primary" /> Project Notes Command
          </h2>
          <p className="text-muted-foreground text-sm uppercase tracking-widest font-semibold">Centralized Project Activity Logs</p>
        </div>
        <div className="flex gap-4 items-end w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search project..." 
              className="pl-10 h-12 bg-background/50 border-border/50" 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="w-full md:w-80">
            <Label className="text-[10px] uppercase mb-2 block font-bold text-accent">Selected Project</Label>
            <select 
              className="flex h-12 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm font-bold shadow-inner focus:ring-2 focus:ring-primary outline-none transition-all"
              value={selectedProjectId}
              onChange={e => setSelectedProjectId(e.target.value)}
            >
              <option value="">Select a Project Context...</option>
              {filteredProjects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {!selectedProjectId ? (
        <Card className="border-border/50 bg-card/30 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-24 space-y-4">
            <div className="h-20 w-20 bg-primary/5 rounded-full flex items-center justify-center border border-primary/10">
              <BookOpen className="h-10 w-10 text-primary/40" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-headline font-bold text-white">No Project Selected</h3>
              <p className="text-muted-foreground text-sm max-w-sm mt-1">
                Choose a project from the dropdown to view its full activity log, record site updates, or transcribe voice notes.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-4">
              <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
              <h3 className="text-2xl font-headline font-bold text-white tracking-tight">{selectedProject?.name}</h3>
              {selectedClient && (
                <div className="flex items-center gap-2 border-l border-border/50 pl-4">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Client</span>
                  <span className="text-sm font-bold text-accent">{selectedClient.name}</span>
                </div>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-[0.2em] bg-muted/30 px-3 py-1.5 rounded-full border border-border/50">
              {notes?.length || 0} LOG ENTRIES
            </div>
          </div>
          
          {isNotesLoading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground animate-pulse font-medium">Synchronizing project logs...</p>
            </div>
          ) : (
            <div className="animate-in slide-in-from-bottom-4 duration-700">
              <ProjectNotes 
                projectId={selectedProjectId}
                notes={notes || []}
                onAddNote={(note) => onAddNote(selectedProjectId, note)}
                onUpdateNote={(noteId, note) => onUpdateNote(selectedProjectId, noteId, note)}
                onDeleteNote={(noteId) => onDeleteNote(selectedProjectId, noteId)}
                canEdit={canEdit}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

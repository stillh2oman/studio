
"use client"

import { useState, useRef, useEffect, useCallback } from 'react';
import { ProjectNote, Attachment } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, Paperclip, Trash2, Clock, User, FileText, X, Send, Plus, Shield, CheckCircle2, Pencil, Link as LinkIcon, ExternalLink, Loader2, Mic } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface ProjectNotesProps {
  projectId: string;
  notes: ProjectNote[];
  onAddNote: (note: Omit<ProjectNote, 'id' | 'authorId' | 'authorName' | 'createdAt'>) => void;
  onUpdateNote: (noteId: string, note: Partial<ProjectNote>) => void;
  onDeleteNote: (noteId: string) => void;
  canEdit?: boolean;
}

const MAX_FILE_SIZE = 800 * 1024; // ~800KB to stay under Firestore 1MB with Base64 overhead

export function ProjectNotes({ projectId, notes, onAddNote, onUpdateNote, onDeleteNote, canEdit = true }: ProjectNotesProps) {
  const { toast } = useToast();
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [newNoteText, setNewNoteText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkName, setLinkName] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const [isDictating, setIsDictating] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognitionCtor =
      (window as unknown as { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recog = new SpeechRecognitionCtor();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = 'en-US';

    recog.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        setNewNoteText((prev) => (prev ? `${prev} ${finalTranscript.trim()}` : finalTranscript.trim()));
      }
    };

    recog.onend = () => setIsDictating(false);
    recog.onerror = () => setIsDictating(false);

    recognitionRef.current = recog;
    return () => {
      try {
        recog.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    };
  }, []);

  const toggleVoiceDictation = useCallback(() => {
    if (!canEdit) return;
    const recognition = recognitionRef.current;
    noteInputRef.current?.focus();

    if (!recognition) {
      toast({
        title: 'Dictation unavailable',
        description: 'Use Chrome or Edge for in-app voice notes, or press Windows + H to dictate into the description field.',
      });
      return;
    }

    if (isDictating) {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
      setIsDictating(false);
      return;
    }

    try {
      recognition.start();
      setIsDictating(true);
      toast({ title: 'Listening…', description: 'Speak clearly; text is added to your note.' });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Could not start microphone',
        description: 'Allow microphone access for this site, or use Windows + H.',
      });
    }
  }, [canEdit, isDictating, toast]);

  const handleSaveNote = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canEdit || isUploading || (!newNoteText.trim() && attachments.length === 0)) return;

    setIsSaving(true);
    try {
      if (editingNoteId) {
        await onUpdateNote(editingNoteId, {
          text: newNoteText,
          attachments: attachments
        });
        toast({ title: "Note Updated" });
      } else {
        await onAddNote({
          projectId,
          text: newNoteText,
          attachments: attachments
        });
        toast({ title: "Note Saved" });
      }

      resetForm();
    } catch (err) {
      console.error("Note save failed", err);
      toast({
        variant: "destructive",
        title: "Action Failed",
        description: "Could not synchronize note to ledger.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setEditingNoteId(null);
    setNewNoteText('');
    setAttachments([]);
  };

  const handleEdit = (note: ProjectNote) => {
    setEditingNoteId(note.id);
    setNewNoteText(note.text);
    setAttachments(note.attachments || []);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) return;
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      toast({
        variant: "destructive",
        title: "File Too Large",
        description: "Large files should be added as links (Google Doc, Dropbox, etc.) to keep the ledger fast.",
      });
      if (e.target) e.target.value = '';
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const newAttachment: Attachment = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        size: file.size,
        type: file.type,
        url: dataUrl
      };
      setAttachments(prev => [...prev, newAttachment]);
      setIsUploading(false);
    };
    reader.onerror = () => {
      setIsUploading(false);
      toast({ variant: "destructive", title: "Upload Failed", description: "Could not read file data." });
    };
    reader.readAsDataURL(file);

    if (e.target) e.target.value = '';
  };

  const handleAddLink = () => {
    if (!linkUrl.trim()) return;
    const url = linkUrl.trim().startsWith('http') ? linkUrl.trim() : `https://${linkUrl.trim()}`;
    const newAttachment: Attachment = {
      id: Math.random().toString(36).substr(2, 9),
      name: linkName.trim() || 'Linked Document',
      size: 0,
      type: 'url',
      url: url
    };
    setAttachments(prev => [...prev, newAttachment]);
    setLinkUrl('');
    setLinkName('');
    setIsLinkDialogOpen(false);
  };

  const removeAttachment = (id: string) => {
    if (!canEdit) return;
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const sortedNotes = [...notes].sort((a, b) => 
    new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        <Card className="border-border/50 shadow-xl bg-card/30">
          <CardHeader className="bg-muted/30 py-4 flex flex-row items-center justify-between">
            <CardTitle className="text-xl font-headline flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" /> Project Activity Log
            </CardTitle>
            <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
              {notes.length} Total Notes
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[600px] p-6">
              {notes.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground italic">
                  No notes recorded for this project yet.
                </div>
              ) : (
                <div className="space-y-6">
                  {sortedNotes.map((note) => {
                    return (
                      <div key={note.id} className={cn(
                        "relative group bg-background/40 border p-5 rounded-2xl transition-all hover:border-primary/30 animate-in fade-in slide-in-from-top-2 duration-300",
                        editingNoteId === note.id ? "border-primary/50 ring-1 ring-primary/20" : "border-border/50"
                      )}>
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                              <User className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-white">{note.authorName}</p>
                              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Clock className="h-2.5 w-2.5" /> {note.createdAt ? format(new Date(note.createdAt), 'MMM d, yyyy • h:mm a') : 'Recently added'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => handleEdit(note)}
                              disabled={!canEdit}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => onDeleteNote(note.id)}
                              disabled={!canEdit}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        
                        <div className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                          {note.text}
                        </div>

                        {note.attachments && note.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border/20">
                            {note.attachments.map(a => {
                              const isAudio = a.type?.startsWith('audio/');
                              return (
                                <a 
                                  key={a.id} 
                                  href={a.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 bg-muted/30 border border-border/50 px-2 py-1 rounded text-[10px] text-muted-foreground hover:bg-primary/10 transition-colors"
                                >
                                  {a.type === 'url' ? (
                                    <LinkIcon className="h-3 w-3 text-emerald-500" />
                                  ) : isAudio ? (
                                    <Mic className="h-3 w-3 text-primary animate-pulse" />
                                  ) : (
                                    <FileText className="h-3 w-3 text-accent" />
                                  )}
                                  <span className="truncate max-w-[120px]">{a.name}</span>
                                  {(a.type === 'url' || isAudio) && <ExternalLink className="h-2 w-2 opacity-50" />}
                                </a>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        {!canEdit && (
          <Alert className="bg-muted/30 border-dashed border-border/50">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <AlertTitle>Read-Only Access</AlertTitle>
            <div className="text-[10px] text-muted-foreground">You can browse project activity, but adding new notes is restricted.</div>
          </Alert>
        )}

        {canEdit && (
          <Card className="border-border/50 shadow-xl bg-card/50 sticky top-24">
            <CardHeader className="bg-primary/5">
              <CardTitle className="text-lg flex items-center gap-2">
                {editingNoteId ? <Pencil className="h-4 w-4 text-accent" /> : <Plus className="h-4 w-4 text-primary" />}
                {editingNoteId ? 'Update Activity' : 'Log New Activity'}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Description</Label>
                <Textarea 
                  ref={noteInputRef}
                  value={newNoteText} 
                  onChange={e => setNewNoteText(e.target.value)} 
                  placeholder="Record project details, site updates, or changes..."
                  className="h-40 bg-background/50"
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-3">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Note Tools</Label>
                
                <Button 
                  variant="outline"
                  className={cn(
                    'w-full h-12 gap-2 bg-accent/5 border-accent/20 text-accent hover:bg-accent/10 font-bold',
                    isDictating && 'animate-pulse border-primary/50 bg-primary/10 text-primary',
                  )}
                  onClick={toggleVoiceDictation}
                  disabled={isSaving}
                >
                  <Mic className="h-5 w-5" />
                  {isDictating ? 'Stop voice note' : 'Voice note'}
                </Button>

                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-2 border-dashed h-10"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSaving || isUploading}
                  >
                    {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                    {isUploading ? 'Uploading...' : 'Add File'}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-2 border-dashed h-10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/10"
                    onClick={() => setIsLinkDialogOpen(true)}
                    disabled={isSaving || isUploading}
                  >
                    <LinkIcon className="h-4 w-4" /> Add Link
                  </Button>
                  <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => handleFileUpload(e)} />
                </div>
                
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {attachments.map(a => (
                      <div key={a.id} className="flex items-center gap-2 bg-accent/5 border border-accent/20 px-2 py-1 rounded text-[10px]">
                        <span className="truncate max-w-[150px]">{a.name}</span>
                        <button onClick={() => removeAttachment(a.id)} className="text-rose-500" disabled={isSaving}><X className="h-3 w-3" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2 border-t border-border/50 pt-4">
                {editingNoteId && (
                  <Button variant="ghost" className="flex-1" onClick={resetForm}>Cancel</Button>
                )}
                <Button 
                  onClick={() => handleSaveNote()} 
                  className={cn("flex-1 gap-2 bg-primary h-12 text-lg font-bold", editingNoteId && "bg-accent text-accent-foreground")}
                  disabled={isSaving || isUploading || (!newNoteText.trim() && attachments.length === 0)}
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : (editingNoteId ? <CheckCircle2 className="h-4 w-4" /> : <Send className="h-4 w-4" />)}
                  {isSaving ? "Saving..." : (editingNoteId ? "Update Note" : "Save Note")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Attach Document Link</DialogTitle>
            <p className="text-xs text-muted-foreground">Paste a URL for Google Docs, Sheets, or Dropbox folders.</p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Link URL</Label>
              <Input 
                placeholder="https://docs.google.com/..." 
                value={linkUrl} 
                onChange={e => setLinkUrl(e.target.value)} 
              />
            </div>
            <div className="space-y-2">
              <Label>Display Name (Optional)</Label>
              <Input 
                placeholder="e.g. Google Doc: Site Notes" 
                value={linkName} 
                onChange={e => setLinkName(e.target.value)} 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLinkDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddLink} disabled={!linkUrl.trim()}>Attach Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

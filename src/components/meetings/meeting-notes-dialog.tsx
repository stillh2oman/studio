'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMeeting } from './meeting-provider';
import { useLedgerData } from '@/hooks/use-ledger-data';
import { Loader2, Mic, Save, Square, Volume2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export function MeetingNotesDialog() {
  const { isRecording, startRecording, stopRecording } = useMeeting();
  const { projects, addProjectNote } = useLedgerData();
  const { toast } = useToast();

  const [projectId, setProjectId] = useState('');
  const [transcription, setTranscription] = useState('');
  const [isDictating, setIsDictating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    // Initialize Browser Speech Recognition (Non-AI Shitty Code)
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recog = new SpeechRecognition();
        recog.continuous = true;
        recog.interimResults = true;
        recog.lang = 'en-US';

        recog.onresult = (event: any) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          
          setTranscription(prev => prev + finalTranscript);
        };

        recog.onend = () => {
          setIsDictating(false);
        };

        recog.onerror = (err: any) => {
          console.error("Speech Recognition Error:", err);
          setIsDictating(false);
        };

        setRecognition(recog);
      }
    }
  }, []);

  const sortedProjects = useMemo(() => 
    [...projects].sort((a, b) => a.name.localeCompare(b.name))
  , [projects]);

  const toggleDictation = () => {
    if (!recognition) {
      toast({ variant: "destructive", title: "Unsupported Browser", description: "Your browser does not support native speech-to-text." });
      return;
    }

    if (isDictating) {
      recognition.stop();
      setIsDictating(false);
    } else {
      recognition.start();
      setIsDictating(true);
      toast({ title: "Listening...", description: "Speak clearly. Native dictation active." });
    }
  };

  const handleSave = async () => {
    if (!projectId || !transcription.trim()) return;

    setIsSaving(true);
    try {
      const project = projects.find(p => p.id === projectId);
      
      await addProjectNote(projectId, {
        projectId,
        text: transcription,
        attachments: []
      });

      toast({
        title: "Voice Note Logged",
        description: `Note anchored to ${project?.name}.`,
      });

      setProjectId('');
      setTranscription('');
      setIsDialogOpen(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Registry Error" });
    } finally {
      setIsSaving(false);
    }
  };

  // Trigger dialog when user starts recording from the header
  useEffect(() => {
    if (isRecording) setIsDialogOpen(true);
  }, [isRecording]);

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="font-headline text-2xl flex items-center gap-2">
            <Mic className="h-6 w-6 text-primary" /> Voice Note Command
          </DialogTitle>
          <DialogDescription>
            Dictate a site note or project update. Uses native browser speech processing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Select Destination Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="font-bold h-12 bg-background/50">
                <SelectValue placeholder="Which project is this for?..." />
              </SelectTrigger>
              <SelectContent>
                {sortedProjects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground">Note Transcription</Label>
              <Button 
                variant="outline" 
                size="sm" 
                className={cn(
                  "h-8 gap-2 rounded-full px-4 border-primary/30",
                  isDictating && "bg-primary text-white border-primary animate-pulse"
                )}
                onClick={toggleDictation}
              >
                {isDictating ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-3.5 w-3.5" />}
                {isDictating ? 'Stop Listening' : 'Start Dictation'}
              </Button>
            </div>
            <Textarea 
              value={transcription}
              onChange={e => setTranscription(e.target.value)}
              placeholder="Your dictated text will appear here... (You can also type manually)"
              className="min-h-[200px] bg-background/50 text-sm leading-relaxed"
              disabled={isSaving}
            />
          </div>
        </div>

        <DialogFooter className="border-t pt-6 gap-3">
          <Button variant="ghost" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>Discard</Button>
          <Button 
            className="bg-primary px-8 h-12 font-bold gap-2 shadow-lg" 
            disabled={!projectId || !transcription.trim() || isSaving} 
            onClick={handleSave}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Log to Project Registry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

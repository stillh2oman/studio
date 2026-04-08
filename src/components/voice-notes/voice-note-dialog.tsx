
'use client';

import React, { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useVoiceNote } from './voice-note-provider';
import { useLedgerData } from '@/hooks/use-ledger-data';
import { Download, Loader2, Maximize2, Mic, Minimize2, Save, Sparkles, Square, Trash2, Video, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Attachment } from '@/lib/types';

const MAX_VIDEO_ATTACHMENT_SIZE = 800 * 1024; // Keep under Firestore doc size limits.

export function VoiceNoteDialog() {
  const { isRecording, isVoiceNoteDialogOpen, closeVoiceNoteDialog, voiceNoteDialogMode } = useVoiceNote();
  const { projects, addProjectNote } = useLedgerData();
  const { toast } = useToast();

  const [projectId, setProjectId] = useState('');
  const [attendees, setAttendees] = useState('');
  const [transcription, setTranscription] = useState('');
  const [isDictating, setIsDictating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  const [includeWebcamVideo, setIncludeWebcamVideo] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [isVideoProcessing, setIsVideoProcessing] = useState(false);
  const [videoAttachment, setVideoAttachment] = useState<Attachment | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);

  const webcamPreviewRef = useRef<HTMLVideoElement | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const webcamRecorderRef = useRef<MediaRecorder | null>(null);
  const webcamChunksRef = useRef<Blob[]>([]);
  const webcamStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Initialize Browser Speech Recognition (Native Browser Feature - NO AI)
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recog = new SpeechRecognition();
        recog.continuous = true;
        recog.interimResults = true;
        recog.lang = 'en-US';

        recog.onresult = (event: any) => {
          let finalTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
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
      toast({ title: "Listening...", description: "Native browser dictation active." });
    }
  };

  const clearWebcamResources = () => {
    if (webcamStopTimerRef.current) {
      clearTimeout(webcamStopTimerRef.current);
      webcamStopTimerRef.current = null;
    }
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach(track => track.stop());
      webcamStreamRef.current = null;
    }
    if (webcamPreviewRef.current) {
      webcamPreviewRef.current.srcObject = null;
    }
    webcamRecorderRef.current = null;
    webcamChunksRef.current = [];
  };

  const stopWebcamRecording = () => {
    if (webcamRecorderRef.current && webcamRecorderRef.current.state !== 'inactive') {
      webcamRecorderRef.current.stop();
    }
    setIsRecordingVideo(false);
  };

  const startWebcamRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 8, max: 10 } },
        audio: true,
      });
      webcamStreamRef.current = stream;
      if (webcamPreviewRef.current) {
        webcamPreviewRef.current.srcObject = stream;
        webcamPreviewRef.current.muted = true;
        webcamPreviewRef.current.defaultMuted = true;
        webcamPreviewRef.current.volume = 0;
      }

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm';

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 280_000,
        audioBitsPerSecond: 64_000,
      });
      webcamRecorderRef.current = recorder;
      webcamChunksRef.current = [];

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) webcamChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        setIsRecordingVideo(false);
        setIsVideoProcessing(true);
        const blob = new Blob(webcamChunksRef.current, { type: mimeType });
        clearWebcamResources();

        if (!blob.size) {
          setIsVideoProcessing(false);
          return;
        }

        if (blob.size > MAX_VIDEO_ATTACHMENT_SIZE) {
          toast({
            variant: 'destructive',
            title: 'Video too large to attach',
            description: 'Please keep the clip shorter than about 30 seconds, then try again.',
          });
          setVideoAttachment(null);
          setIsVideoProcessing(false);
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || '');
          if (!dataUrl) {
            setIsVideoProcessing(false);
            return;
          }
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          setVideoAttachment({
            id: Math.random().toString(36).slice(2, 11),
            name: `meeting-video-${timestamp}.webm`,
            size: blob.size,
            type: blob.type || 'video/webm',
            url: dataUrl,
          });
          toast({ title: 'Meeting video ready', description: 'Video will be saved with this note.' });
          setIsVideoProcessing(false);
        };
        reader.onerror = () => {
          setIsVideoProcessing(false);
          toast({ variant: 'destructive', title: 'Video processing failed' });
        };
        reader.readAsDataURL(blob);
      };

      recorder.start(500);
      setIsRecordingVideo(true);
      toast({ title: 'Webcam recording started' });

      webcamStopTimerRef.current = setTimeout(() => {
        stopWebcamRecording();
      }, 30_000);
    } catch (err) {
      clearWebcamResources();
      toast({
        variant: 'destructive',
        title: 'Camera access denied',
        description: 'Allow camera + microphone permissions to capture meeting video.',
      });
    }
  };

  const toggleWebcamRecording = () => {
    if (isRecordingVideo) stopWebcamRecording();
    else startWebcamRecording();
  };

  const handleWebcamToggle = (checked: boolean) => {
    setIncludeWebcamVideo(checked);
    if (!checked) {
      if (isRecordingVideo) stopWebcamRecording();
      clearWebcamResources();
      setVideoAttachment(null);
      setIsVideoProcessing(false);
    }
  };

  const handleSummarize = async () => {
    if (!projectId || !transcription.trim()) return;
    const project = projects.find(p => p.id === projectId);

    setIsSummarizing(true);
    try {
      const resp = await fetch('/api/gemini/meeting-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcription,
          context: {
            projectName: project?.name || undefined,
            attendees: attendees.trim() || undefined,
            date: new Date().toISOString(),
          },
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.error || `Gemini error (${resp.status})`);
      }

      const data = await resp.json() as {
        title?: string;
        summary?: string;
        actionItems?: string[];
        decisions?: string[];
        risks?: string[];
      };

      const lines: string[] = [];
      lines.push(`MEETING SUMMARY${data.title ? ` — ${data.title}` : ''}`);
      lines.push(`Project: ${project?.name || projectId}`);
      if (attendees.trim()) lines.push(`Attendees: ${attendees.trim()}`);
      lines.push(`Date: ${new Date().toLocaleString()}`);
      lines.push('');
      if (data.summary) {
        lines.push('Summary');
        lines.push(data.summary.trim());
        lines.push('');
      }
      if (data.actionItems?.length) {
        lines.push('Action items');
        for (const item of data.actionItems) lines.push(`- ${item}`);
        lines.push('');
      }
      if (data.decisions?.length) {
        lines.push('Decisions');
        for (const item of data.decisions) lines.push(`- ${item}`);
        lines.push('');
      }
      if (data.risks?.length) {
        lines.push('Risks / blockers');
        for (const item of data.risks) lines.push(`- ${item}`);
        lines.push('');
      }
      lines.push('Raw transcript');
      lines.push(transcription.trim());

      setTranscription(lines.join('\n'));
      toast({ title: 'AI Summary Ready', description: 'Review and save to Project Notes.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'AI Summarization Failed', description: e?.message || 'Unknown error' });
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleSave = async () => {
    if (!projectId || !transcription.trim()) return;

    setIsSaving(true);
    try {
      const project = projects.find(p => p.id === projectId);
      const attachments: Attachment[] = videoAttachment ? [videoAttachment] : [];
      
      await addProjectNote(projectId, {
        projectId,
        text: transcription,
        attachments
      });

      toast({
        title: "Voice Note Logged",
        description: `Note archived to ${project?.name}.`,
      });

      setProjectId('');
      setAttendees('');
      setTranscription('');
      setIncludeWebcamVideo(false);
      setVideoAttachment(null);
      clearWebcamResources();
      closeVoiceNoteDialog();
    } catch (err) {
      toast({ variant: "destructive", title: "Registry Error" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    if (isDictating && recognition) recognition.stop();
    if (isRecordingVideo) stopWebcamRecording();
    clearWebcamResources();
    setProjectId('');
    setAttendees('');
    setTranscription('');
    setIncludeWebcamVideo(false);
    setVideoAttachment(null);
    setIsVideoProcessing(false);
    setIsMinimized(false);
    closeVoiceNoteDialog();
  };

  const saveVideoLocally = () => {
    if (!videoAttachment?.url) return;
    const a = document.createElement('a');
    a.href = videoAttachment.url;
    a.download = videoAttachment.name || `meeting-video-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast({ title: 'Video saved locally' });
  };

  useEffect(() => {
    return () => {
      clearWebcamResources();
    };
  }, []);

  /** One-click mic: start browser dictation as soon as the dialog opens (useLayoutEffect stays closer to the click gesture). */
  useLayoutEffect(() => {
    if (!isVoiceNoteDialogOpen) return;

    const tryStart = () => {
      if (!recognition) return false;
      try {
        recognition.start();
        setIsDictating(true);
        toast({ title: 'Listening…', description: 'Speak clearly; text appears in the transcription box.' });
        return true;
      } catch (err) {
        console.warn('Speech recognition auto-start', err);
        return false;
      }
    };

    if (tryStart()) return;

    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      if (!recognition) {
        toast({
          title: 'Dictation tip',
          description:
            'Chrome or Edge can use the in-app mic here. On other browsers, press Windows + H or use Start Dictation below.',
        });
        return;
      }
      if (!tryStart()) {
        toast({
          variant: 'destructive',
          title: 'Could not start microphone',
          description: 'Allow microphone access for this site, or tap Start Dictation / use Windows + H.',
        });
      }
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [isVoiceNoteDialogOpen, recognition, toast]);

  return (
    <>
    <Dialog open={isVoiceNoteDialogOpen && !isMinimized} onOpenChange={(open) => { if (!open) handleDiscard(); }}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <DialogTitle className="font-headline text-2xl flex items-center gap-2 text-white">
              <Mic className="h-6 w-6 text-primary" /> {voiceNoteDialogMode === 'meeting' ? 'Meeting Notes' : 'Voice Note Command'}
            </DialogTitle>
            <Button type="button" variant="ghost" size="sm" className="h-8 gap-1" onClick={() => setIsMinimized(true)}>
              <Minimize2 className="h-3.5 w-3.5" /> Minimize
            </Button>
          </div>
          <DialogDescription className="text-muted-foreground">
            {voiceNoteDialogMode === 'meeting'
              ? 'Dictate meeting notes, then summarize into action items and save to Project Notes.'
              : 'Microphone dictation starts automatically. You can edit the text below.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Select Target Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="font-bold h-12 bg-background/50 border-border/50 text-white">
                <SelectValue placeholder="Which project is this for?..." />
              </SelectTrigger>
              <SelectContent>
                {sortedProjects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Attendees (optional)</Label>
            <Textarea
              value={attendees}
              onChange={e => setAttendees(e.target.value)}
              placeholder="e.g. Jeff, Tammi, Client"
              className="min-h-[60px] bg-background/50 text-sm leading-relaxed text-white border-border/50"
              disabled={isSaving || isSummarizing}
            />
          </div>

          {voiceNoteDialogMode === 'meeting' ? (
            <div className="space-y-3 rounded-lg border border-border/50 bg-background/30 p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="include-webcam-video"
                  checked={includeWebcamVideo}
                  onCheckedChange={(value) => handleWebcamToggle(Boolean(value))}
                  disabled={isSaving || isSummarizing}
                />
                <Label htmlFor="include-webcam-video" className="text-xs font-semibold text-white">
                  Capture webcam video for this meeting note
                </Label>
              </div>

              {includeWebcamVideo ? (
                <div className="space-y-3">
                  <video
                    ref={webcamPreviewRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full max-h-[180px] rounded border border-border/50 bg-black/60 object-cover"
                  />

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-8 gap-2 rounded-full px-4 border-primary/30 font-bold",
                        isRecordingVideo && "bg-primary text-white border-primary animate-pulse"
                      )}
                      onClick={toggleWebcamRecording}
                      disabled={isSaving || isSummarizing || isVideoProcessing}
                    >
                      <Video className="h-3.5 w-3.5" />
                      {isRecordingVideo ? 'Stop Webcam Recording' : 'Start Webcam Recording'}
                    </Button>
                    {isVideoProcessing ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                  </div>

                  {videoAttachment ? (
                    <div className="flex items-center justify-between rounded border border-border/50 bg-muted/20 px-3 py-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <a
                          href={videoAttachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate text-primary underline-offset-2 hover:underline block"
                        >
                          {videoAttachment.name}
                        </a>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 text-xs"
                          onClick={saveVideoLocally}
                          title="Save recording to this computer"
                        >
                          <Download className="h-3.5 w-3.5" /> Save
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-rose-500"
                          onClick={() => setVideoAttachment(null)}
                          disabled={isSaving || isSummarizing || isRecordingVideo || isVideoProcessing}
                          title="Delete video attachment"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Transcription</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-8 gap-2 rounded-full px-4 border-primary/30 font-bold",
                    isDictating && "bg-primary text-white border-primary animate-pulse"
                  )}
                  onClick={toggleDictation}
                  disabled={isSaving || isSummarizing}
                >
                  {isDictating ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-3.5 w-3.5" />}
                  {isDictating ? 'Stop Listening' : 'Start Dictation'}
                </Button>
                {voiceNoteDialogMode === 'meeting' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-2 rounded-full px-4 border-accent/30 font-bold"
                    onClick={handleSummarize}
                    disabled={!projectId || !transcription.trim() || isSaving || isSummarizing}
                    title="Summarize transcript into action items"
                  >
                    {isSummarizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Summarize
                  </Button>
                ) : null}
              </div>
            </div>
            <Textarea 
              value={transcription}
              onChange={e => setTranscription(e.target.value)}
              placeholder="Your dictated text will appear here... (Manual editing allowed)"
              className="min-h-[200px] bg-background/50 text-sm leading-relaxed text-white border-border/50"
              disabled={isSaving || isSummarizing}
            />
          </div>
        </div>

        <DialogFooter className="border-t border-border/50 pt-6 gap-3">
          <Button variant="ghost" onClick={handleDiscard} disabled={isSaving} className="text-muted-foreground hover:text-white">Discard</Button>
          <Button 
            className="bg-primary px-8 h-12 font-bold gap-2 shadow-lg shadow-primary/20 text-white" 
            disabled={!projectId || !transcription.trim() || isSaving || isVideoProcessing || isRecordingVideo} 
            onClick={handleSave}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Log to Project Ledger
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {isVoiceNoteDialogOpen && isMinimized ? (
      <div className="fixed bottom-4 right-4 z-[70] w-[340px] rounded-xl border border-border/60 bg-card/95 p-3 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {voiceNoteDialogMode === 'meeting' ? 'Meeting Notes' : 'Voice Note'}
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setIsMinimized(false)} title="Restore">
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-500" onClick={handleDiscard} title="Close">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {isDictating ? <span className="text-xs text-primary font-semibold">Dictation active</span> : null}
          {isRecordingVideo ? <span className="text-xs text-primary font-semibold">Webcam recording active</span> : null}
          {videoAttachment ? (
            <Button size="sm" variant="outline" className="h-7 gap-1" onClick={saveVideoLocally}>
              <Download className="h-3.5 w-3.5" /> Save Video
            </Button>
          ) : null}
        </div>
      </div>
    ) : null}
    </>
  );
}

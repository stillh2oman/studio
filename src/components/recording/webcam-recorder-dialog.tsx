"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Camera, Loader2, Maximize2, Minimize2, Save, Square, Video, X } from "lucide-react";

interface WebcamRecorderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WebcamRecorderDialog({ open, onOpenChange }: WebcamRecorderDialogProps) {
  const { toast } = useToast();
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    if (!isRecording) return;
    const timer = setInterval(() => setRecordingSeconds((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [isRecording]);

  const stopTracks = () => {
    if (recordingStreamRef.current) {
      recordingStreamRef.current.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
    }
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
  };

  const resetRecording = () => {
    setIsRecording(false);
    setIsStarting(false);
    setRecordingSeconds(0);
    setRecordedBlob(null);
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl("");
    chunksRef.current = [];
    mediaRecorderRef.current = null;
    stopTracks();
  };

  const startRecording = async () => {
    setIsStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      recordingStreamRef.current = stream;
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        liveVideoRef.current.muted = true;
        liveVideoRef.current.defaultMuted = true;
        liveVideoRef.current.volume = 0;
      }

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setRecordedBlob(blob);
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
        setIsRecording(false);
        stopTracks();
      };

      recorder.start();
      setRecordingSeconds(0);
      setIsRecording(true);
      toast({ title: "Webcam recording started" });
    } catch (error) {
      stopTracks();
      toast({
        variant: "destructive",
        title: "Camera access denied",
        description: "Allow camera and microphone permission, then try again.",
      });
    } finally {
      setIsStarting(false);
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return;
    mediaRecorderRef.current.stop();
  };

  const saveRecording = () => {
    if (!recordedBlob) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `webcam-recording-${timestamp}.webm`;
    const url = URL.createObjectURL(recordedBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ title: "Video saved", description: `Saved as ${fileName}` });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      if (isRecording) {
        setIsMinimized(true);
        return;
      }
      resetRecording();
      setIsMinimized(false);
    } else {
      setIsMinimized(false);
    }
    onOpenChange(nextOpen);
  };

  useEffect(() => {
    return () => {
      resetRecording();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeAndDiscard = () => {
    resetRecording();
    setIsMinimized(false);
    onOpenChange(false);
  };

  return (
    <>
    <Dialog open={open && !isMinimized} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" /> Webcam Recorder
          </DialogTitle>
          <DialogDescription>
            Start recording from your webcam, stop when done, then save the video file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded-lg border border-border/50 bg-black/80 overflow-hidden">
            {recordedUrl ? (
              <video src={recordedUrl} controls className="w-full h-[340px] object-contain" />
            ) : (
              <video ref={liveVideoRef} autoPlay playsInline muted defaultMuted className="w-full h-[340px] object-cover" />
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant={isRecording ? "default" : "outline"}>
                {isRecording ? `Recording ${recordingSeconds}s` : "Idle"}
              </Badge>
              {recordedBlob ? (
                <span className="text-xs text-muted-foreground">
                  {(recordedBlob.size / 1024 / 1024).toFixed(2)} MB
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              {!isRecording ? (
                <Button onClick={startRecording} disabled={isStarting}>
                  {isStarting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                  Start Recording
                </Button>
              ) : (
                <Button variant="destructive" onClick={stopRecording}>
                  <Square className="mr-2 h-4 w-4" /> Stop Recording
                </Button>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setIsMinimized(true)}>
            <Minimize2 className="mr-2 h-4 w-4" /> Minimize
          </Button>
          <Button variant="ghost" onClick={closeAndDiscard}>Close</Button>
          <Button onClick={saveRecording} disabled={!recordedBlob || isRecording}>
            <Save className="mr-2 h-4 w-4" /> Save Video
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {open && isMinimized ? (
      <div className="fixed bottom-4 right-4 z-[70] w-[300px] rounded-xl border border-border/60 bg-card/95 p-3 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Recorder</div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setIsMinimized(false)} title="Restore">
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-500" onClick={closeAndDiscard} title="Close and discard">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <Badge variant={isRecording ? "default" : "outline"}>{isRecording ? `Recording ${recordingSeconds}s` : "Ready"}</Badge>
          <div className="flex items-center gap-2">
            {isRecording ? (
              <Button size="sm" variant="destructive" onClick={stopRecording}>
                <Square className="mr-1 h-3.5 w-3.5" /> Stop
              </Button>
            ) : null}
            <Button size="sm" onClick={saveRecording} disabled={!recordedBlob || isRecording}>
              <Save className="mr-1 h-3.5 w-3.5" /> Save
            </Button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}

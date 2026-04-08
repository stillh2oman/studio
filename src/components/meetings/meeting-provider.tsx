
'use client';

import React, { createContext, useContext, useState, useRef, ReactNode, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

interface VoiceNoteContextProps {
  isRecording: boolean;
  recordingTime: number;
  audioBlob: Blob | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  cancelRecording: () => void;
  setAudioBlob: (blob: Blob | null) => void;
}

const VoiceNoteContext = createContext<VoiceNoteContextProps | undefined>(undefined);

export function MeetingProvider({ children }: { children: ReactNode }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') 
        ? 'audio/webm' 
        : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      toast({ title: "Recording Voice Note", description: "Audio capture is active." });
    } catch (err) {
      console.error("Recording error:", err);
      toast({ variant: "destructive", title: "Microphone Access Denied", description: "Please allow microphone permissions to record voice notes." });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      setAudioBlob(null);
      toast({ title: "Recording Cancelled" });
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <VoiceNoteContext.Provider value={{ 
      isRecording, 
      recordingTime, 
      audioBlob, 
      startRecording, 
      stopRecording, 
      cancelRecording,
      setAudioBlob
    }}>
      {children}
    </VoiceNoteContext.Provider>
  );
}

export const useMeeting = () => {
  const context = useContext(VoiceNoteContext);
  if (!context) throw new Error("useMeeting must be used within MeetingProvider");
  return context;
};


"use client"

import React, { useState, useRef, useEffect } from 'react';
import { 
  Headphones, Play, Pause, Volume2, VolumeX, 
  X, Sparkles, Wind, Fan, Waves, CloudRain
} from 'lucide-react';
import { 
  Popover, PopoverContent, PopoverTrigger 
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

type SoundOption = {
  id: string;
  label: string;
  url: string;
  icon: React.ReactNode;
};

/**
 * FOCUS SOUND LIBRARY
 * Standardized on high-fidelity Dropbox streams for maximum workspace isolation.
 * All links use the raw=1 parameter for direct binary streaming.
 */
const SOUNDS: SoundOption[] = [
  { 
    id: 'brown', 
    label: 'Brown Noise', 
    icon: <Volume2 className="h-4 w-4" />, 
    url: 'https://dl.dropboxusercontent.com/scl/fi/opqe2kttxurxrwasrnkk9/Brown-Noise.mp3?rlkey=e85lpb1duyjiosmnhr6rb4mt5&raw=1' 
  },
  { 
    id: 'fan', 
    label: 'Fan Noise', 
    icon: <Wind className="h-4 w-4" />, 
    url: 'https://dl.dropboxusercontent.com/scl/fi/1jut4ls37grzffpiacx0r/Fan-Noise.mp3?rlkey=8bdzqhq55s0f0qfe8eujopnd9&raw=1' 
  },
  { 
    id: 'white', 
    label: 'White Noise', 
    icon: <Waves className="h-4 w-4" />, 
    url: 'https://dl.dropboxusercontent.com/scl/fi/hzgnghd4hxrljdtm1cnnx/White-Noise.mp3?rlkey=rjcfd9vhl0od31kfn2asq1rli&raw=1' 
  },
  { 
    id: 'rain', 
    label: 'Rain', 
    icon: <CloudRain className="h-4 w-4" />, 
    url: 'https://dl.dropboxusercontent.com/scl/fi/97tld6o4nwanq7i2kxda2/Rain.mp3?rlkey=une7l9ezrz3qe4dedn9yw0vuq&raw=1' 
  },
];

export function FocusMode() {
  const [activeSound, setActiveSound] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState([50]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.loop = true; // CRITICAL: Ensure continuous playback
      audio.preload = "auto";
      audioRef.current = audio;
    }

    const currentAudio = audioRef.current;

    const handleError = (e: any) => {
      // SILENT HANDLING: Use warn instead of error to prevent Next.js overlay crashes
      console.warn("Focus Mode Audio Log:", e);
      
      // Ignore errors that happen when we've intentionally cleared the source
      if (!currentAudio.src || currentAudio.src === window.location.href) return;

      setIsPlaying(false);
      
      let errorDetail = "Stream access restricted by network or provider.";
      if (currentAudio.error?.code === 3) {
        errorDetail = "Format error: The audio stream could not be decoded.";
      } else if (currentAudio.error?.code === 4) {
        errorDetail = "The selected audio source is not supported or offline.";
      }

      toast({
        variant: "destructive",
        title: "Focus Stream Unavailable",
        description: errorDetail,
      });
    };

    currentAudio.addEventListener('error', handleError);

    return () => {
      if (currentAudio) {
        currentAudio.removeEventListener('error', handleError);
        currentAudio.pause();
        currentAudio.src = "";
      }
    };
  }, [toast]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume[0] / 100;
    }
  }, [volume]);

  const toggleSound = (soundId: string) => {
    if (!audioRef.current) return;

    if (activeSound === soundId) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play()
          .then(() => setIsPlaying(true))
          .catch((err) => {
            console.warn("Resume attempt blocked:", err);
            setIsPlaying(false);
          });
      }
    } else {
      const sound = SOUNDS.find(s => s.id === soundId);
      if (sound) {
        // ENGINE RESET: Completely clear current state before loading new source
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current.load();
        
        audioRef.current.src = sound.url;
        audioRef.current.load();
        
        setActiveSound(soundId);
        
        audioRef.current.play()
          .then(() => {
            setIsPlaying(true);
          })
          .catch((err) => {
            console.warn("Initial load play blocked:", err);
            setIsPlaying(false);
          });
      }
    }
  };

  const stopAll = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current.load();
    }
    setActiveSound(null);
    setIsPlaying(false);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          className={cn(
            "h-11 rounded-full px-6 border-indigo-500/30 text-indigo-400 font-bold gap-2 hover:bg-indigo-500/10 transition-all",
            isPlaying && "bg-indigo-500/10 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)]"
          )}
        >
          <Headphones className={cn("h-4 w-4", isPlaying && "animate-bounce")} />
          {isPlaying ? 'Focus Active' : 'Focus Mode'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 border-border/50 bg-[#1a1c1e] shadow-2xl overflow-hidden rounded-2xl">
        <div className="bg-indigo-500/10 border-b border-indigo-500/20 p-4">
          <div className="flex items-center justify-between mb-1">
            <h4 className="font-headline text-lg text-white flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-400" /> Ambient Focus
            </h4>
            {isPlaying && (
              <Badge className="bg-indigo-500 text-white text-[8px] animate-pulse">LOOPING</Badge>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Workspace Isolation</p>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 gap-2">
            {SOUNDS.map((sound) => (
              <Button
                key={sound.id}
                variant="ghost"
                className={cn(
                  "w-full h-12 justify-start gap-4 rounded-xl border border-transparent transition-all",
                  activeSound === sound.id 
                    ? "bg-indigo-500/20 border-indigo-500/30 text-white" 
                    : "text-muted-foreground hover:bg-black hover:text-white"
                )}
                onClick={() => toggleSound(sound.id)}
              >
                <div className={cn(
                  "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-all shadow-inner",
                  activeSound === sound.id ? "bg-indigo-500 text-white" : "bg-muted/30"
                )}>
                  {activeSound === sound.id && isPlaying ? <Pause className="h-4 w-4" /> : sound.icon}
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-xs font-bold">{sound.label}</span>
                  <span className="text-[8px] uppercase opacity-50 font-black">Continuous Loop</span>
                </div>
              </Button>
            ))}
          </div>

          <div className="space-y-3 pt-2 border-t border-border/20">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">Master Comfort</Label>
              <span className="text-[10px] font-mono text-indigo-400">{volume[0]}%</span>
            </div>
            <div className="flex items-center gap-3">
              <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
              <Slider 
                value={volume} 
                onValueChange={setVolume} 
                max={100} 
                step={1} 
                className="flex-1"
              />
              <Volume2 className="h-3.5 w-3.5 text-indigo-400" />
            </div>
          </div>

          <Button 
            variant="ghost" 
            className="w-full h-10 gap-2 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 font-bold text-[10px] uppercase tracking-widest"
            onClick={stopAll}
            disabled={!activeSound}
          >
            <X className="h-3.5 w-3.5" /> Stop Environment
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

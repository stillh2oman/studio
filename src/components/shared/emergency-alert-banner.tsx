'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { EmergencyAlert } from '@/lib/types';
import { fetchPayneCountyAlerts } from '@/services/emergency-alerts';
import { AlertTriangle, Info, X, Siren, Zap, Waves, UserSearch, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// Direct download URL for the requested siren audio
const ALERT_SOUND_URL = 'https://www.dropbox.com/scl/fi/70jy60wp55px0wdadav75/emergency-alert-us-2.mp3?rlkey=lhwy4h21cg2q7ifazyps88ej7&dl=1';

export function EmergencyAlertBanner() {
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [playedIds, setPlayedIds] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playEmergencySound = useCallback(() => {
    try {
      // Stop existing if any
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }

      const audio = new Audio(ALERT_SOUND_URL);
      audioRef.current = audio;
      audio.volume = 0.7;
      // Audio play might be blocked by browser policy until interaction
      audio.play().catch(e => {
        console.warn("Emergency audio playback prevented by browser policy. Interaction required.", e);
      });
    } catch (err) {
      console.error("Failed to initialize emergency audio:", err);
    }
  }, []);

  const stopEmergencySound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  const fetchAlerts = async () => {
    try {
      const activeAlerts = await fetchPayneCountyAlerts();
      setAlerts((prev) => {
        const tests = prev.filter((a) => a.id.startsWith('TEST-'));
        return [...tests, ...activeAlerts];
      });
    } catch (e) {
      console.warn('Emergency alerts fetch failed', e);
    }
  };

  useEffect(() => {
    fetchAlerts();
    // Poll for updates every 2 minutes
    const interval = setInterval(fetchAlerts, 120000);

    // Listen for simulation events from the Firm Command tab
    const handleSimulate = (e: CustomEvent) => {
      const testAlert: EmergencyAlert = {
        id: `TEST-${Date.now()}`,
        event: 'Tornado Warning (SIMULATED TEST)',
        severity: 'Extreme',
        headline: 'TEST ALERT: THIS IS ONLY A TEST of the emergency notification system.',
        description: 'This is a simulated emergency alert designed to verify the functionality of the Command Center\'s life-safety notification system. \n\nIMPORTANT: No actual emergency is occurring in Payne County at this time. This broadcast is part of a scheduled firm safety drill.',
        instruction: 'Continue normal operations. This is only a test of the digital ledger alert system. In a real emergency, this banner would provide specific life-safety directions.',
        effective: new Date().toISOString(),
        expires: new Date(Date.now() + 3600000).toISOString()
      };
      setAlerts(prev => [testAlert, ...prev]);
      setDismissedIds(prev => {
        const next = new Set(prev);
        next.delete(testAlert.id);
        return next;
      });
    };

    window.addEventListener('simulate-emergency-alert' as any, handleSimulate as any);

    return () => {
      clearInterval(interval);
      window.removeEventListener('simulate-emergency-alert' as any, handleSimulate as any);
      stopEmergencySound();
    };
  }, [stopEmergencySound]);

  // Effect to trigger sound when a new, non-dismissed alert is detected
  useEffect(() => {
    const activeUnplayed = alerts.find(a => !playedIds.has(a.id) && !dismissedIds.has(a.id));
    if (activeUnplayed) {
      playEmergencySound();
      setPlayedIds(prev => new Set([...prev, activeUnplayed.id]));
    }
  }, [alerts, playedIds, dismissedIds, playEmergencySound]);

  const visibleAlerts = alerts.filter(a => !dismissedIds.has(a.id));

  if (visibleAlerts.length === 0) return null;

  const activeAlert = visibleAlerts[0];
  const isTest = activeAlert.id.startsWith('TEST-');
  
  const getIcon = (event: string) => {
    if (event.includes('Tornado')) return <Siren className="h-6 w-6 animate-bounce" />;
    if (event.includes('Thunderstorm')) return <Zap className="h-6 w-6" />;
    if (event.includes('Flood')) return <Waves className="h-6 w-6" />;
    if (event.includes('Child')) return <UserSearch className="h-6 w-6 animate-pulse" />;
    return <AlertTriangle className="h-6 w-6" />;
  };

  const getSeverityColor = (severity: string) => {
    if (isTest) return 'bg-indigo-600 text-white';
    switch (severity) {
      case 'Extreme': return 'bg-rose-600 text-white';
      case 'Severe': return 'bg-amber-600 text-white';
      default: return 'bg-primary text-white';
    }
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    stopEmergencySound();
    setDismissedIds(prev => new Set([...prev, activeAlert.id]));
  };

  return (
    <div 
      className={cn(
        "fixed top-0 left-0 right-0 z-[100] transition-all duration-500 shadow-2xl",
        getSeverityColor(activeAlert.severity),
        isExpanded ? "max-h-[80vh] overflow-y-auto" : "h-14"
      )}
    >
      <div className="max-w-[1800px] mx-auto px-6 h-14 flex items-center justify-between cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center gap-4 overflow-hidden">
          <div className="flex-shrink-0">
            {getIcon(activeAlert.event)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
              <span className="bg-white/20 px-2 py-0.5 rounded text-[10px]">
                {isTest ? "SYSTEM TEST" : "PAYNE COUNTY EMERGENCY"}
              </span>
              {activeAlert.event}
            </p>
            {!isExpanded && (
              <p className="text-xs opacity-90 truncate max-w-2xl font-bold italic">
                {activeAlert.headline}
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-[10px] font-black uppercase tracking-tighter hover:bg-white/10"
          >
            {isExpanded ? "Close Details" : "View Details"}
          </Button>
          <button 
            onClick={handleDismiss}
            className="h-8 w-8 flex items-center justify-center hover:bg-white/10 rounded-full"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="max-w-4xl mx-auto px-6 pb-10 pt-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="space-y-6">
            <div className="p-6 bg-white/10 rounded-2xl backdrop-blur-md border border-white/10">
              <h3 className="text-2xl font-headline font-bold mb-4">{activeAlert.headline}</h3>
              <div className="space-y-4 text-sm leading-relaxed whitespace-pre-wrap font-medium">
                {activeAlert.description}
              </div>
            </div>

            {activeAlert.instruction && (
              <div className="p-6 bg-black/20 rounded-2xl border border-white/5">
                <h4 className="text-[10px] uppercase font-black tracking-widest mb-3 flex items-center gap-2">
                  <Info className="h-3 w-3" /> {isTest ? "Test Instructions" : "Safety Instructions"}
                </h4>
                <p className="text-sm italic leading-relaxed">
                  {activeAlert.instruction}
                </p>
              </div>
            )}

            <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-widest opacity-60 px-2">
              <span>Effective: {new Date(activeAlert.effective).toLocaleString()}</span>
              <span>Expires: {new Date(activeAlert.expires).toLocaleString()}</span>
              {isTest && (
                <span className="text-white bg-indigo-500 px-2 py-0.5 rounded flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> VERIFIED TEST MODE
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

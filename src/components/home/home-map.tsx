
"use client"

import { useMemo, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Map, { Marker, Popup, NavigationControl, MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Project, Client } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Navigation, ExternalLink, Building2, UserCircle, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

interface HomeMapProps {
  projects: Project[];
  clients: Client[];
}

// Default center on Stillwater, OK
const INITIAL_VIEW_STATE = {
  latitude: 36.1156,
  longitude: -97.0584,
  zoom: 11
};

export function HomeMap({ projects, clients }: HomeMapProps) {
  const router = useRouter();
  const mapRef = useRef<MapRef>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  if (!MAPBOX_TOKEN) {
    return (
      <Card className="border-border/50 shadow-2xl bg-card/30 overflow-hidden h-[600px] flex flex-col">
        <CardHeader className="bg-muted/30 py-4 flex flex-row items-center justify-between border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2">
            <Navigation className="h-5 w-5 text-primary" />
            <CardTitle className="text-xl font-headline text-white">Project Site Map</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-6 flex items-center justify-center text-sm text-muted-foreground">
          Map is disabled. Set <code className="px-1 rounded bg-muted">NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> in your
          environment.
        </CardContent>
      </Card>
    );
  }

  // Filter for non-archived projects with coordinates
  const markers = useMemo(() => {
    return projects.filter(p => 
      !p.isArchived && 
      p.status !== 'Archived' && 
      typeof p.lat === 'number' && 
      typeof p.lng === 'number'
    );
  }, [projects]);

  // Logic to center map on markers if they exist
  useEffect(() => {
    if (markers.length > 0 && mapRef.current) {
      if (markers.length === 1) {
        mapRef.current.flyTo({
          center: [markers[0].lng!, markers[0].lat!],
          zoom: 12,
          duration: 2000
        });
      } else {
        const lats = markers.map(m => m.lat!);
        const lngs = markers.map(m => m.lng!);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);

        mapRef.current.fitBounds(
          [[minLng, minLat], [maxLng, maxLat]],
          { padding: 80, duration: 2000 }
        );
      }
    }
  }, [markers]);

  const handleFitBounds = () => {
    if (markers.length > 0 && mapRef.current) {
      const lats = markers.map(m => m.lat!);
      const lngs = markers.map(m => m.lng!);
      mapRef.current.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 80, duration: 1000 }
      );
    }
  };

  return (
    <Card className="border-border/50 shadow-2xl bg-card/30 overflow-hidden h-[600px] flex flex-col">
      <CardHeader className="bg-muted/30 py-4 flex flex-row items-center justify-between border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2">
          <Navigation className="h-5 w-5 text-primary" />
          <CardTitle className="text-xl font-headline text-white">Project Site Map</CardTitle>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-8 gap-2 text-[10px] font-bold uppercase" onClick={handleFitBounds}>
            <Maximize2 className="h-3 w-3" /> Fit All
          </Button>
          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
            {markers.length} ACTIVE SITES PLOTTED
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0 relative">
        <Map
          ref={mapRef}
          initialViewState={INITIAL_VIEW_STATE}
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          style={{ width: '100%', height: '100%' }}
        >
          <NavigationControl position="top-right" />
          
          {markers.map((project) => (
            <Marker
              key={project.id}
              latitude={project.lat!}
              longitude={project.lng!}
              anchor="bottom"
              onClick={e => {
                e.originalEvent.stopPropagation();
                setSelectedProject(project);
              }}
            >
              <div className="cursor-pointer group">
                <div className={cn(
                  "p-1.5 rounded-full border-2 transition-all duration-300 bg-background border-primary group-hover:scale-125 group-hover:bg-primary group-hover:border-white shadow-lg",
                  selectedProject?.id === project.id && "scale-125 bg-primary border-white ring-4 ring-primary/20"
                )}>
                  <MapPin className={cn(
                    "h-5 w-5 text-primary transition-colors group-hover:text-white",
                    selectedProject?.id === project.id && "text-white"
                  )} />
                </div>
              </div>
            </Marker>
          ))}

          {selectedProject && (
            <Popup
              latitude={selectedProject.lat!}
              longitude={selectedProject.lng!}
              anchor="top"
              onClose={() => setSelectedProject(null)}
              closeButton={false}
              className="z-50"
              maxWidth="320px"
            >
              <div className="p-1 min-w-[240px]">
                <div className="space-y-3">
                  <div>
                    <h4 className="font-bold text-sm text-foreground mb-0.5">{selectedProject.name}</h4>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1 uppercase font-bold tracking-widest">
                      <UserCircle className="h-2.5 w-2.5" /> 
                      {clients.find(c => c.id === selectedProject.clientId)?.name || 'Client Unlinked'}
                    </p>
                  </div>
                  
                  <div className="space-y-1 bg-muted/50 p-2 rounded-lg border border-border/50">
                    <p className="text-[9px] text-muted-foreground uppercase font-black">Site Address</p>
                    <p className="text-[11px] leading-snug">{selectedProject.address || 'GPS Coordinates Only'}</p>
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      className="flex-1 h-8 text-[10px] font-bold bg-primary hover:bg-primary/90 gap-1.5"
                      onClick={() => router.push(`/projects/${selectedProject.id}`)}
                    >
                      <Building2 className="h-3 w-3" /> View Project
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-8 w-8 p-0"
                      asChild
                    >
                      <a 
                        href={`https://www.google.com/maps/search/?api=1&query=${selectedProject.lat},${selectedProject.lng}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            </Popup>
          )}
        </Map>

        <div className="absolute top-4 left-4 pointer-events-none">
          <div className="bg-background/80 backdrop-blur-md border border-border/50 rounded-full px-4 py-2 flex items-center gap-2 shadow-xl">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-foreground">Operational Tracking Active</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

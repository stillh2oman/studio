
"use client"

import { useState, useMemo, useEffect, useRef } from 'react';
import { Project, Client } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { MapPin, Search, Navigation, Building2, UserCircle, CheckCircle2, ChevronRight, X, ExternalLink, HardHat, Info, Globe, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import Map, { Marker, Popup, NavigationControl, MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

interface ProjectMapViewProps {
  projects: Project[];
  clients: Client[];
}

const INITIAL_VIEW_STATE = {
  latitude: 36.1156,
  longitude: -97.0584,
  zoom: 12
};

export function ProjectMapView({ projects, clients }: ProjectMapViewProps) {
  const router = useRouter();
  const mapRef = useRef<MapRef>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  if (!MAPBOX_TOKEN) {
    return (
      <Card className="border-border/50 bg-card/30 p-6 text-sm text-muted-foreground">
        Map is disabled. Set <code className="px-1 rounded bg-muted">NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> in your
        environment.
      </Card>
    );
  }

  // AGGRESSIVE: Strictly filter for numeric coordinates to prevent Mapbox crashes
  const mappedProjects = useMemo(() => {
    return projects.filter(p => typeof p.lat === 'number' && typeof p.lng === 'number');
  }, [projects]);

  const filteredProjects = useMemo(() => {
    return mappedProjects.filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.address?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [mappedProjects, searchQuery]);

  // AGGRESSIVE logic to center map on markers if they exist, ensuring Oregon markers are included in bounds
  useEffect(() => {
    if (filteredProjects.length > 0 && mapRef.current) {
      if (filteredProjects.length === 1) {
        mapRef.current.flyTo({
          center: [filteredProjects[0].lng!, filteredProjects[0].lat!],
          zoom: 14,
          duration: 2000
        });
      } else {
        const lats = filteredProjects.map(m => m.lat!);
        const lngs = filteredProjects.map(m => m.lng!);
        mapRef.current.fitBounds(
          [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: 100, duration: 2000 }
        );
      }
    }
  }, [filteredProjects]);

  const handleFitBounds = () => {
    if (filteredProjects.length > 0 && mapRef.current) {
      const lats = filteredProjects.map(m => m.lat!);
      const lngs = filteredProjects.map(m => m.lng!);
      mapRef.current.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 100, duration: 1000 }
      );
    }
  };

  const selectedProject = useMemo(() => 
    projects.find(p => p.id === selectedProjectId)
  , [projects, selectedProjectId]);

  const selectedClient = useMemo(() => 
    selectedProject ? clients.find(c => c.id === selectedProject.clientId) : null
  , [selectedProject, clients]);

  return (
    <div className="flex flex-col lg:flex-row h-[750px] gap-6 animate-in fade-in duration-500">
      {/* Side Panel: Project List */}
      <Card className="w-full lg:w-96 border-border/50 bg-card/30 flex flex-col overflow-hidden shadow-2xl">
        <CardHeader className="bg-muted/30 border-b border-border/50 py-4 shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-headline flex items-center gap-2">
              <Navigation className="h-5 w-5 text-primary" /> Site Explorer
            </CardTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleFitBounds} title="Fit to all visible">
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
            {mappedProjects.length} Projects with Mapped Sites
          </CardDescription>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input 
              placeholder="Search by name or street..." 
              className="pl-8 h-9 text-xs bg-background/50 border-border/50" 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-0">
          {filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center space-y-3">
              <MapPin className="h-10 w-10 text-muted-foreground opacity-20" />
              <p className="text-sm text-muted-foreground italic">No projects found with site data.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {filteredProjects.map(project => (
                <button
                  key={project.id}
                  onClick={() => setSelectedProjectId(project.id)}
                  className={cn(
                    "w-full text-left p-4 hover:bg-primary/5 transition-all group border-l-4",
                    selectedProjectId === project.id ? "bg-primary/10 border-primary" : "border-transparent"
                  )}
                >
                  <div className="space-y-1">
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-bold text-sm text-white group-hover:text-primary transition-colors">{project.name}</span>
                      <Badge variant="outline" className="text-[8px] h-4 py-0 shrink-0 border-border/50">{project.type || 'Residential'}</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-2.5 w-2.5 shrink-0" /> {project.address || 'GPS Location'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Area: Mapbox Map */}
      <div className="flex-1 relative bg-background rounded-3xl border border-border/50 shadow-2xl overflow-hidden">
        <Map
          ref={mapRef}
          initialViewState={INITIAL_VIEW_STATE}
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          style={{ width: '100%', height: '100%' }}
        >
          <NavigationControl position="top-right" />
          
          {filteredProjects.map(p => (
            <Marker
              key={p.id}
              latitude={p.lat!}
              longitude={p.lng!}
              anchor="bottom"
              onClick={e => {
                e.originalEvent.stopPropagation();
                setSelectedProjectId(p.id);
              }}
            >
              <div className="cursor-pointer group">
                <div className={cn(
                  "p-1.5 rounded-full border-2 transition-all duration-300 bg-background border-primary",
                  selectedProjectId === p.id ? "bg-primary border-white scale-125 z-50 shadow-lg" : "hover:scale-110"
                )}>
                  <MapPin className={cn("h-5 w-5", selectedProjectId === p.id ? "text-white" : "text-primary")} />
                </div>
              </div>
            </Marker>
          ))}

          {selectedProject && (
            <div className="absolute bottom-8 left-8 right-8 lg:left-1/2 lg:-translate-x-1/2 lg:w-[500px] animate-in slide-in-from-bottom-6 duration-500 z-40">
              <Card className="border-primary/40 shadow-2xl bg-card/95 backdrop-blur-xl overflow-hidden">
                <CardContent className="p-0">
                  <div className="p-6 space-y-6">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <Badge className="bg-primary/20 text-primary border-primary/30 text-[8px] uppercase tracking-widest font-bold">Active Site Assignment</Badge>
                        <h3 className="text-2xl font-headline font-bold text-white leading-tight">{selectedProject.name}</h3>
                        <p className="text-xs text-muted-foreground flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-accent" /> {selectedProject.address || 'Coordinates Only'}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-white/10" onClick={() => setSelectedProjectId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-muted/20 p-3 rounded-xl border border-border/50 space-y-1">
                        <span className="text-[9px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
                          <UserCircle className="h-2.5 w-2.5 text-primary" /> Client
                        </span>
                        <p className="text-xs font-bold text-white truncate">{selectedClient?.name || 'Assigned'}</p>
                      </div>
                      <div className="bg-muted/20 p-3 rounded-xl border border-border/50 space-y-1">
                        <span className="text-[9px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
                          <HardHat className="h-2.5 w-2.5 text-accent" /> Builder
                        </span>
                        <p className="text-xs font-bold text-white truncate">{selectedProject.constructionCompany || 'Not Listed'}</p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        className="flex-1 bg-primary text-white h-10 gap-2 font-bold text-xs"
                        onClick={() => router.push(`/projects/${selectedProject.id}`)}
                      >
                        <Building2 className="h-4 w-4" /> Go to Project
                      </Button>
                      <Button 
                        variant="outline" 
                        className="flex-1 h-10 gap-2 font-bold text-xs border-accent/30 text-accent"
                        asChild
                      >
                        <a 
                          href={`https://www.google.com/maps/search/?api=1&query=${selectedProject.lat},${selectedProject.lng}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          <Globe className="h-4 w-4" /> Maps
                        </a>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </Map>

        <div className="absolute top-6 left-6 animate-in slide-in-from-top-4 duration-700 pointer-events-none">
          <div className="bg-emerald-500/10 backdrop-blur-md border border-emerald-500/20 rounded-full px-4 py-2 flex items-center gap-2 shadow-2xl">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400">Map Registry Active</span>
          </div>
        </div>
      </div>
    </div>
  );
}

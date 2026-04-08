"use client"

import { useMemo } from 'react';
import { Project, Client, PROJECT_STATUS_STEPS, ProjectStatus } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Clock, MapPin, Activity, ChevronRight, ExternalLink, HardHat, Home, Building2, BookOpen } from 'lucide-react';
import { cn, formatDropboxUrl, DEFAULT_PROJECT_RENDERING } from '@/lib/utils';
import { format } from 'date-fns';
import Image from 'next/image';

interface ProjectStatusTabProps {
  projects: Project[];
  clients: Client[];
  onUpdateStatus: (id: string, status: ProjectStatus) => void;
  canEdit?: boolean;
}

export function ProjectStatusTab({ projects, clients, onUpdateStatus, canEdit = true }: ProjectStatusTabProps) {
  // Filter for only active projects (archived are moved to central archive)
  const activeProjects = useMemo(() => 
    projects.filter(p => !p.isArchived && p.status !== 'Archived')
  , [projects]);

  const renderTimeline = (project: Project) => {
    const currentStatus = project.status || 'Initial Meeting';
    const currentIndex = PROJECT_STATUS_STEPS.indexOf(currentStatus);

    return (
      <div className="relative w-full py-8 overflow-x-auto">
        <div className="flex items-center min-w-[1000px] px-4">
          {PROJECT_STATUS_STEPS.map((step, index) => {
            const isCompleted = index < currentIndex;
            const isCurrent = index === currentIndex;
            const isFuture = index > currentIndex;

            return (
              <div key={step} className="flex-1 flex flex-col items-center relative group">
                {/* Connecting Line */}
                {index < PROJECT_STATUS_STEPS.length - 1 && (
                  <div className={cn(
                    "absolute left-[50%] right-[-50%] top-4 h-0.5 z-0",
                    index < currentIndex ? "bg-emerald-500" : "bg-muted"
                  )} />
                )}

                {/* Node */}
                <button
                  onClick={() => canEdit && onUpdateStatus(project.id, step)}
                  disabled={!canEdit}
                  className={cn(
                    "w-8 h-8 rounded-full z-10 flex items-center justify-center transition-all border-2",
                    isCompleted ? "bg-emerald-500 border-emerald-500 text-white" : 
                    isCurrent ? "bg-background border-primary ring-4 ring-primary/20 scale-110" : 
                    "bg-background border-muted text-muted-foreground"
                  )}
                >
                  {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : 
                   isCurrent ? <Activity className="h-4 w-4 text-primary animate-pulse" /> : 
                   <div className="w-2 h-2 rounded-full bg-current" />}
                </button>

                {/* Label */}
                <div className="mt-4 text-center px-2">
                  <p className={cn(
                    "text-[10px] font-bold uppercase tracking-tighter leading-tight",
                    isCurrent ? "text-primary" : isCompleted ? "text-emerald-500" : "text-muted-foreground"
                  )}>
                    {step}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderProjectCard = (project: Project) => {
    const client = clients.find(c => c.id === project.clientId);
    const mapsLink = project.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(project.address)}` : null;
    
    // Use default rendering if none specified
    const displayImageUrl = formatDropboxUrl(project.renderingUrl || DEFAULT_PROJECT_RENDERING);
    const isDataUrl = !!displayImageUrl && displayImageUrl.startsWith('data:image');

    const getTypeIcon = () => {
      switch (project.type) {
        case 'Commercial': return <Building2 className="h-3 w-3" />;
        case 'Tutoring': return <BookOpen className="h-3 w-3" />;
        default: return <Home className="h-3 w-3" />;
      }
    };

    return (
      <Card key={project.id} className="border-border/50 shadow-lg bg-card/30 overflow-hidden hover:border-primary/30 transition-all">
        {displayImageUrl && (
          <div className="relative h-48 w-full overflow-hidden border-b border-border/20 bg-black/20">
            <Image 
              src={displayImageUrl} 
              alt={project.name}
              fill
              unoptimized={isDataUrl}
              className="object-cover"
              data-ai-hint="architectural rendering"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent opacity-60" />
          </div>
        )}
        <CardHeader className="bg-muted/30 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CardTitle className="font-headline text-xl text-white">{project.name}</CardTitle>
              <Badge variant="secondary" className="text-[10px] gap-1 px-2 py-0 h-5">
                {getTypeIcon()}
                {project.type || 'Residential'}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-3">
              <CardDescription className="text-xs flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {client?.name || 'Unknown Client'}
              </CardDescription>
              {project.constructionCompany && (
                <CardDescription className="text-xs flex items-center gap-1 border-l border-border/50 pl-3">
                  <HardHat className="h-3 w-3 text-accent" /> {project.constructionCompany}
                </CardDescription>
              )}
              {project.nature && project.nature.length > 0 && (
                <div className="flex gap-1 border-l border-border/50 pl-3">
                  {project.nature.map(n => (
                    <Badge key={n} variant="outline" className="text-[8px] bg-accent/5 text-accent border-accent/20 px-1 py-0 h-4">
                      {n}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            {project.address && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Site Address:</span>
                <a 
                  href={mapsLink!} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-[10px] text-sky-400 hover:underline flex items-center gap-1 font-medium"
                >
                  {project.address} <ExternalLink className="h-2 w-2" />
                </a>
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground uppercase font-bold">
              <Clock className="h-3 w-3" /> Last Updated
            </div>
            <p className="text-xs font-medium text-accent">
              {project.lastStatusUpdate ? format(new Date(project.lastStatusUpdate), 'MMM d, yyyy • h:mm a') : 'No updates recorded'}
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {renderTimeline(project)}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-headline font-bold text-white flex items-center gap-3">
            <Activity className="h-8 w-8 text-primary" /> Project Command Pipeline
          </h2>
          <p className="text-sm text-muted-foreground">Monitor and update phase progression for all active projects.</p>
        </div>
        <Badge variant="outline" className="h-8 px-4 text-xs font-bold bg-primary/5 text-primary border-primary/20 uppercase tracking-widest">
          {activeProjects.length} Active Missions
        </Badge>
      </header>

      <div className="space-y-6">
        {activeProjects.length === 0 ? (
          <div className="text-center py-20 bg-muted/20 rounded-3xl border border-dashed border-border/50">
            <p className="text-muted-foreground italic">No active projects detected in the operational pipeline.</p>
          </div>
        ) : activeProjects.map(renderProjectCard)}
      </div>
    </div>
  );
}

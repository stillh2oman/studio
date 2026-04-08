
"use client"

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookOpen, ExternalLink, ShieldCheck, HelpCircle } from 'lucide-react';

const NOTEBOOKS = [
  {
    id: 'stillwater',
    title: 'Stillwater Code Reference',
    description: 'Direct access to local building codes, zoning regulations, and Stillwater-specific architectural compliance data via external notebook.',
    url: 'https://notebooklm.google.com/notebook/0993e97b-3102-4b21-ae6f-fdf681dc9d98',
    icon: <ShieldCheck className="h-8 w-8 text-primary" />,
    accent: 'border-primary/20 bg-primary/5'
  },
  {
    id: 'chief-arch',
    title: 'Chief Architect Documentation',
    description: 'Comprehensive help files and power-user tips for Chief Architect. Search thousands of pages of documentation instantly via external notebook.',
    url: 'https://notebooklm.google.com/notebook/6e83a37a-5d63-4009-881b-0ea33a30e5af',
    icon: <HelpCircle className="h-8 w-8 text-accent" />,
    accent: 'border-accent/20 bg-accent/5'
  }
];

export function NotebooksTab() {
  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <h2 className="text-4xl font-headline font-bold text-white flex items-center justify-center gap-3">
          <BookOpen className="h-10 w-10 text-primary" /> Knowledge Base
        </h2>
        <p className="text-muted-foreground text-sm uppercase tracking-[0.2em] font-medium">
          Integrated Reference Libraries
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto">
        {NOTEBOOKS.map((notebook) => (
          <Card 
            key={notebook.id} 
            className={`border-2 ${notebook.accent} shadow-2xl hover:scale-[1.02] transition-all duration-300 group overflow-hidden`}
          >
            <CardHeader className="pb-4 relative">
              <div className="mb-4 bg-background/50 w-fit p-4 rounded-2xl shadow-inner border border-white/5">
                {notebook.icon}
              </div>
              <CardTitle className="font-headline text-3xl group-hover:text-white transition-colors">
                {notebook.title}
              </CardTitle>
              <CardDescription className="text-base mt-2 leading-relaxed h-24">
                {notebook.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                asChild 
                className="w-full h-14 text-lg font-bold gap-3 rounded-xl bg-card border border-border/50 hover:bg-muted hover:border-primary/50 transition-all shadow-lg"
              >
                <a href={notebook.url} target="_blank" rel="noopener noreferrer">
                  Open Reference <ExternalLink className="h-5 w-5 opacity-50" />
                </a>
              </Button>
            </CardContent>
            <div className="h-1 w-full bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          </Card>
        ))}
      </div>

      <div className="max-w-4xl mx-auto mt-12">
        <Card className="bg-card/30 border-dashed border-border/50 backdrop-blur-sm">
          <CardContent className="py-8 flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <BookOpen className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-lg text-white">Using the Reference Library</h4>
              <p className="text-muted-foreground text-sm max-w-2xl">
                These external notebooks prioritize your specific Stillwater codes and Chief Architect manuals to ensure technical accuracy and save hours of research time.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

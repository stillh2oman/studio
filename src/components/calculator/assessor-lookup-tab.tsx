
"use client"

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Map as MapIcon, Search, Landmark, Info, Globe, RotateCcw } from 'lucide-react';

export function AssessorLookupTab() {
  const [query, setQuery] = useState('');

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    // Direct link to Google search for official records
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query + " county assessor GIS parcel map")}`, '_blank');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-border/50 shadow-xl overflow-hidden bg-card/30">
            <CardHeader className="bg-primary/5">
              <CardTitle className="text-xl font-headline flex items-center gap-2">
                <Search className="h-5 w-5 text-primary" /> Property Records
              </CardTitle>
              <CardDescription>AI Jurisdictional lookup is disabled. Use this tool to launch a manual records search.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleManualSearch} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="search-query">City or County Name</Label>
                  <Input 
                    id="search-query" 
                    value={query} 
                    onChange={e => setQuery(e.target.value)} 
                    placeholder="e.g. Payne County, Stillwater..." 
                    required
                    className="h-12 bg-background/50"
                  />
                </div>
                <Button type="submit" className="w-full bg-primary hover:bg-primary/90 h-12 gap-2" disabled={!query.trim()}>
                  <Globe className="h-4 w-4" /> Search Official Records
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-accent/5 shadow-inner">
            <CardContent className="p-4 flex gap-3">
              <Info className="h-5 w-5 text-accent shrink-0" />
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase text-accent">Manual Research Mode</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Automated GIS discovery is offline. Please verify parent counties and zoning portals via official municipal websites.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <div className="h-full min-h-[300px] flex flex-col items-center justify-center border border-dashed border-border/50 rounded-3xl bg-muted/5 p-12 text-center space-y-4">
            <Landmark className="h-12 w-12 text-muted-foreground/20" />
            <div className="space-y-1">
              <h3 className="font-bold text-lg text-white/50">Manual Search Ready</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Enter a location to launch a search for official property deeds and GIS maps in a new tab.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

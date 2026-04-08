
"use client"

import { useState } from 'react';
import { Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface NoteHelperProps {
  onDescriptionGenerated: (desc: string) => void;
}

/**
 * NoteHelper provides manual text expansion and standard firm keywords.
 * This component is 100% AI-free, relying only on user-defined templates.
 */
export function NoteHelper({ onDescriptionGenerated }: NoteHelperProps) {
  const [keywords, setKeywords] = useState('');

  const handleManualHint = () => {
    if (!keywords.trim()) return;
    onDescriptionGenerated(`${keywords}`);
    setKeywords('');
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 text-muted-foreground border-border/50 hover:bg-muted/10">
          <Type className="h-4 w-4" />
          Note Helper
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Firm Text Helper</h4>
            <p className="text-xs text-muted-foreground italic">Add standard architectural keywords or phrases to your description.</p>
          </div>
          <div className="flex gap-2">
            <Input 
              placeholder="e.g. schematic, revisions..." 
              value={keywords} 
              onChange={e => setKeywords(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && handleManualHint()}
            />
            <Button size="sm" onClick={handleManualHint} disabled={!keywords.trim()}>
              Add
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

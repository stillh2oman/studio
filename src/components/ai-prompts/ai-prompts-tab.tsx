
"use client"

import { useState } from 'react';
import { AiPrompt } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Copy, Pencil, Trash2, Plus, Check, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PromptLibraryTabProps {
  prompts: AiPrompt[];
  onAddPrompt: (prompt: Omit<AiPrompt, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdatePrompt: (id: string, prompt: Partial<AiPrompt>) => void;
  onDeletePrompt: (id: string) => void;
  canEdit?: boolean;
}

export function AiPromptsTab({ prompts, onAddPrompt, onUpdatePrompt, onDeletePrompt, canEdit = true }: PromptLibraryTabProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [promptText, setPromptText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !name || !promptText) return;

    if (editingId) {
      onUpdatePrompt(editingId, { name, prompt: promptText });
    } else {
      onAddPrompt({ name, prompt: promptText });
    }

    resetForm();
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setPromptText('');
  };

  const handleEdit = (prompt: AiPrompt) => {
    if (!canEdit) return;
    setEditingId(prompt.id);
    setName(prompt.name);
    setPromptText(prompt.prompt);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCopy = (prompt: AiPrompt) => {
    navigator.clipboard.writeText(prompt.prompt);
    setCopiedId(prompt.id);
    toast({
      title: "Copied!",
      description: "Template copied to clipboard.",
    });
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {!canEdit && (
        <Alert className="bg-muted/30 border-dashed border-border/50">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <AlertTitle>Read-Only Access</AlertTitle>
          <div className="text-xs text-muted-foreground">You can copy templates, but modification is restricted.</div>
        </Alert>
      )}

      {canEdit && (
        <Card className="border-border/50 shadow-xl overflow-hidden">
          <CardHeader className="bg-muted/50">
            <CardTitle className="font-headline text-3xl text-accent flex justify-between items-center">
              {editingId ? 'Edit Template' : 'Manage Prompt Library'}
              {editingId && (
                <Button variant="ghost" size="sm" onClick={resetForm} className="text-muted-foreground">Cancel Edit</Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="prompt-name">Template Name</Label>
                <Input 
                  id="prompt-name" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  placeholder="e.g., Residential Billing Note, Site Revisions..." 
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prompt-text">Template Content</Label>
                <Textarea 
                  id="prompt-text" 
                  value={promptText} 
                  onChange={e => setPromptText(e.target.value)} 
                  placeholder="Enter the standard text template here..." 
                  className="min-h-[150px]"
                  required
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" className="bg-primary hover:bg-primary/90 px-8 h-11 gap-2">
                  {editingId ? <><Pencil className="h-4 w-4" /> Update Template</> : <><Plus className="h-4 w-4" /> Add Template</>}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50 shadow-lg overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[250px]">Template Name</TableHead>
                <TableHead>Preview</TableHead>
                <TableHead className="w-[180px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prompts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center h-24 text-muted-foreground">No templates stored in the library yet.</TableCell>
                </TableRow>
              ) : (
                prompts.map(prompt => (
                  <TableRow key={prompt.id}>
                    <TableCell className="font-bold">{prompt.name}</TableCell>
                    <TableCell className="max-w-md truncate text-muted-foreground text-xs">
                      {prompt.prompt}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleCopy(prompt)} 
                          className="h-8 gap-1.5 border-accent/20 text-accent hover:bg-accent/10"
                        >
                          {copiedId === prompt.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          COPY
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8" 
                          onClick={() => handleEdit(prompt)}
                          disabled={!canEdit}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-rose-500" 
                          onClick={() => onDeletePrompt(prompt.id)}
                          disabled={!canEdit}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}


"use client"

import { useState, useMemo } from 'react';
import { TextTemplate } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Copy, Pencil, Trash2, Plus, Check, Shield, ArrowUpDown, ChevronUp, ChevronDown, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type SortConfig = { key: keyof TextTemplate; direction: 'asc' | 'desc' } | null;

interface PromptLibraryTabProps {
  templates: TextTemplate[];
  onAddTemplate: (template: Omit<TextTemplate, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateTemplate: (id: string, template: Partial<TextTemplate>) => void;
  onDeleteTemplate: (id: string) => void;
  canEdit?: boolean;
}

export function PromptLibraryTab({ templates, onAddTemplate, onUpdateTemplate, onDeleteTemplate, canEdit = true }: PromptLibraryTabProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const { toast } = useToast();

  const sortedTemplates = useMemo(() => {
    let items = [...templates];
    if (sortConfig) {
      items.sort((a, b) => {
        const aVal = String(a[sortConfig.key] || '');
        const bVal = String(b[sortConfig.key] || '');
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return items;
  }, [templates, sortConfig]);

  const handleSort = (key: keyof TextTemplate) => {
    setSortConfig(prev => (prev?.key === key && prev.direction === 'asc') ? { key, direction: 'desc' } : { key, direction: 'asc' });
  };

  const SortIcon = ({ column }: { column: keyof TextTemplate }) => {
    if (sortConfig?.key !== column) return <ArrowUpDown className="ml-2 h-3.5 w-3.5 opacity-30" />;
    return sortConfig.direction === 'asc' ? <ChevronUp className="ml-2 h-3.5 w-3.5 text-primary" /> : <ChevronDown className="ml-2 h-3.5 w-3.5 text-primary" />;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    if (!name.trim() || !content.trim()) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Template name and content are required.",
      });
      return;
    }

    try {
      if (editingId) {
        onUpdateTemplate(editingId, { name: name.trim(), content: content.trim() });
        toast({ title: "Template updated successfully." });
      } else {
        onAddTemplate({ name: name.trim(), content: content.trim() });
        toast({ title: "New template added to library." });
      }
      resetForm();
    } catch (err) {
      toast({ variant: "destructive", title: "Action Failed", description: "Could not save template." });
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setContent('');
  };

  const handleEdit = (template: TextTemplate) => {
    if (!canEdit) return;
    setEditingId(template.id);
    setName(template.name);
    setContent(template.content);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCopy = (template: TextTemplate) => {
    navigator.clipboard.writeText(template.content);
    setCopiedId(template.id);
    toast({
      title: "Copied!",
      description: "Template content copied to clipboard.",
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
              {editingId ? 'Edit Manual Template' : 'Manage Prompt Library'}
              {editingId && (
                <Button variant="ghost" size="sm" onClick={resetForm} className="text-muted-foreground">Cancel Edit</Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="template-name">Template Name</Label>
                <Input 
                  id="template-name" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  placeholder="e.g., Residential Billing Note, Site Revisions..." 
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-content">Template Content</Label>
                <Textarea 
                  id="template-content" 
                  value={content} 
                  onChange={e => setContent(e.target.value)} 
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
                <TableHead className="w-[250px] cursor-pointer hover:bg-muted/80" onClick={() => handleSort('name')}>
                  <div className="flex items-center">Template Name <SortIcon column="name" /></div>
                </TableHead>
                <TableHead>Preview</TableHead>
                <TableHead className="w-[180px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTemplates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center h-24 text-muted-foreground">No templates stored in the library yet.</TableCell>
                </TableRow>
              ) : (
                sortedTemplates.map(template => (
                  <TableRow key={template.id}>
                    <TableCell className="font-bold">{template.name}</TableCell>
                    <TableCell className="max-w-md truncate text-muted-foreground text-xs">
                      {template.content}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleCopy(template)} 
                          className="h-8 gap-1.5 border-accent/20 text-accent hover:bg-accent/10"
                        >
                          {copiedId === template.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          COPY
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8" 
                          onClick={() => handleEdit(template)}
                          disabled={!canEdit}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-rose-500" 
                          onClick={() => onDeleteTemplate(template.id)}
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

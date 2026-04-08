
"use client"

import { useState, useMemo } from 'react';
import { ReferenceDocument } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, BookOpen, Trash2, Pencil, ExternalLink, Plus, Library, Shield, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type SortConfig = { key: keyof ReferenceDocument; direction: 'asc' | 'desc' } | null;

interface ReferenceLibraryTabProps {
  documents: ReferenceDocument[];
  onAddDoc: (doc: Omit<ReferenceDocument, 'id' | 'updatedAt'>) => void;
  onUpdateDoc: (id: string, doc: Partial<ReferenceDocument>) => void;
  onDeleteDoc: (id: string) => void;
  canEdit?: boolean;
}

const CATEGORIES = ["Code Books", "Design Guides", "Firm Standards", "Chief Architect Manuals", "Zoning Regs", "Vendor Specs"].sort();

export function ReferenceLibraryTab({ documents, onAddDoc, onUpdateDoc, onDeleteDoc, canEdit = true }: ReferenceLibraryTabProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<ReferenceDocument>>({
    title: '',
    category: 'Code Books',
    description: '',
    dropboxUrl: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !form.title || !form.dropboxUrl) return;

    const docData = {
      title: form.title!,
      category: form.category || 'Code Books',
      description: form.description || '',
      dropboxUrl: form.dropboxUrl!
    };

    if (editingId) {
      onUpdateDoc(editingId, docData);
      toast({ title: 'Reference Updated' });
    } else {
      onAddDoc(docData);
      toast({ title: 'Reference Added' });
    }

    resetForm();
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({ title: '', category: 'Code Books', description: '', dropboxUrl: '' });
  };

  const handleEdit = (doc: ReferenceDocument) => {
    if (!canEdit) return;
    setEditingId(doc.id);
    setForm(doc);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSort = (key: keyof ReferenceDocument) => {
    setSortConfig(prev => (prev?.key === key && prev.direction === 'asc') ? { key, direction: 'desc' } : { key, direction: 'asc' });
  };

  const SortIcon = ({ column }: { column: keyof ReferenceDocument }) => {
    if (sortConfig?.key !== column) return <ArrowUpDown className="ml-2 h-3.5 w-3.5 opacity-30" />;
    return sortConfig.direction === 'asc' ? <ChevronUp className="ml-2 h-3.5 w-3.5 text-primary" /> : <ChevronDown className="ml-2 h-3.5 w-3.5 text-primary" />;
  };

  const filteredDocs = useMemo(() => {
    let items = documents.filter(d => 
      d.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      d.category.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (sortConfig) {
      items.sort((a, b) => {
        const aVal = a[sortConfig.key] || '';
        const bVal = b[sortConfig.key] || '';
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return items;
  }, [documents, searchQuery, sortConfig]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-border/50 shadow-xl overflow-hidden bg-card/30">
            <CardHeader className="bg-muted/50 border-b border-border/50">
              <CardTitle className="font-headline text-3xl text-accent flex items-center gap-3">
                <BookOpen className="h-8 w-8 text-primary" />
                {editingId ? 'Edit Resource' : 'Register New Reference'}
              </CardTitle>
              <CardDescription>Register code books and PDF manuals hosted on Dropbox for firm-wide access.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Document Title</Label>
                    <Input 
                      value={form.title} 
                      onChange={e => setForm({...form, title: e.target.value})} 
                      placeholder="e.g., 2024 International Residential Code"
                      required
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <select 
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-bold shadow-inner focus:ring-2 focus:ring-primary outline-none transition-all"
                      value={form.category}
                      onChange={e => setForm({...form, category: e.target.value})}
                      disabled={!canEdit}
                    >
                      {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Dropbox PDF Link (Shared URL)</Label>
                  <Input 
                    value={form.dropboxUrl} 
                    onChange={e => setForm({...form, dropboxUrl: e.target.value})} 
                    placeholder="https://www.dropbox.com/s/..."
                    required
                    disabled={!canEdit}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Content Description</Label>
                  <Textarea 
                    value={form.description} 
                    onChange={e => setForm({...form, description: e.target.value})} 
                    placeholder="Describe what is covered in this document for manual lookup reference."
                    className="h-32 bg-background/50"
                    disabled={!canEdit}
                  />
                </div>

                {canEdit && (
                  <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
                    {editingId && <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>}
                    <Button type="submit" className="bg-primary hover:bg-primary/90 px-10 h-12 font-bold shadow-lg">
                      {editingId ? 'Update Resource' : 'Register Document'}
                    </Button>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          <Card className="border-border/50 shadow-xl overflow-hidden bg-card/30">
            <CardHeader className="bg-muted/20 border-b border-border/50">
              <CardTitle className="font-headline text-2xl flex items-center gap-2">
                <Search className="h-5 w-5 text-primary" /> Filter Library
              </CardTitle>
              <CardDescription>Manually filter the reference catalog by title or category.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <Input 
                placeholder="Filter by title..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-12 bg-background/50"
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-border/50 shadow-lg overflow-hidden bg-card/30">
        <CardHeader className="py-4 bg-muted/20 border-b border-border/50">
          <CardTitle className="text-lg font-headline">Firm Reference Catalog</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('title')}>
                  <div className="flex items-center">Resource Title <SortIcon column="title" /></div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('category')}>
                  <div className="flex items-center">Category <SortIcon column="category" /></div>
                </TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right cursor-pointer hover:bg-muted/80" onClick={() => handleSort('updatedAt')}>
                  <div className="flex items-center justify-end">Last Updated <SortIcon column="updatedAt" /></div>
                </TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDocs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center h-48 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <BookOpen className="h-10 w-10 opacity-10" />
                      <p className="italic">No matching reference books found.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredDocs.map(doc => (
                  <TableRow key={doc.id} className="hover:bg-muted/20 transition-colors group">
                    <TableCell>
                      <div className="font-bold text-white">{doc.title}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px] bg-background/50 border-border/50">{doc.category}</Badge>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <p className="text-xs text-muted-foreground line-clamp-2">{doc.description || '—'}</p>
                    </TableCell>
                    <TableCell className="text-right text-[10px] text-muted-foreground whitespace-nowrap">
                      {new Date(doc.updatedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" asChild title="Open in Dropbox">
                          <a href={doc.dropboxUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(doc)} title="Edit" disabled={!canEdit}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-rose-500" onClick={() => onDeleteDoc(doc.id)} title="Delete" disabled={!canEdit}>
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

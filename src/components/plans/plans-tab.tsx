"use client"

import { useState, useRef } from 'react';
import { Plan, SPECIAL_FEATURES_OPTIONS, SpecialFeature } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { FileUp, Search, Trash2, Pencil, ExternalLink, Filter, Image as ImageIcon, Shield, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn, compressImage } from '@/lib/utils';
import Image from 'next/image';

interface PlansTabProps {
  plans: Plan[];
  onAddPlan: (plan: Omit<Plan, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdatePlan: (id: string, plan: Partial<Plan>) => void;
  onDeletePlan: (id: string) => void;
  canEdit?: boolean;
}

export function PlansTab({ plans, onAddPlan, onUpdatePlan, onDeletePlan, canEdit = true }: PlansTabProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCompressing, setIsCompressing] = useState(false);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Plan>>({
    projectName: '', heatedSqFt: 0, bedrooms: 0, bathrooms: 0, stories: 1, garageCapacity: 2, hasBonusRoom: false, maxWidth: 0, maxDepth: 0, designerName: '', houseStyle: '', specialFeatures: [], pdfUrl: '', thumbnailUrl: ''
  });

  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  const handleThumbnailUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) return;
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsCompressing(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const rawDataUrl = event.target?.result as string;
        const compressed = await compressImage(rawDataUrl, 800, 0.6);
        setForm(prev => ({ ...prev, thumbnailUrl: compressed }));
        toast({ title: 'Image Optimized & Uploaded' });
      } catch (err) {
        console.error("Optimization failed", err);
        toast({ variant: "destructive", title: "Image Error", description: "Failed to optimize image." });
      } finally {
        setIsCompressing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || isCompressing) return;
    const planData = {
      projectName: form.projectName || 'Untitled Plan',
      heatedSqFt: Number(form.heatedSqFt || 0),
      bedrooms: Number(form.bedrooms || 0),
      bathrooms: Number(form.bathrooms || 0),
      stories: Number(form.stories || 1),
      garageCapacity: Number(form.garageCapacity || 0),
      hasBonusRoom: !!form.hasBonusRoom,
      maxWidth: Number(form.maxWidth || 0),
      maxDepth: Number(form.maxDepth || 0),
      designerName: form.designerName || '',
      houseStyle: form.houseStyle || '',
      specialFeatures: form.specialFeatures || [],
      pdfUrl: form.pdfUrl || '',
      thumbnailUrl: form.thumbnailUrl || ''
    };

    if (editingId) onUpdatePlan(editingId, planData);
    else onAddPlan(planData);
    resetForm();
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({ projectName: '', heatedSqFt: 0, bedrooms: 0, bathrooms: 0, stories: 1, garageCapacity: 2, hasBonusRoom: false, maxWidth: 0, maxDepth: 0, designerName: '', houseStyle: '', specialFeatures: [], pdfUrl: '', thumbnailUrl: '' });
  };

  const handleEdit = (plan: Plan) => {
    if (!canEdit) return;
    setEditingId(plan.id);
    setForm(plan);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleFeature = (feature: SpecialFeature) => {
    if (!canEdit) return;
    setForm(prev => {
      const features = prev.specialFeatures || [];
      if (features.includes(feature)) return { ...prev, specialFeatures: features.filter(f => f !== feature) };
      return { ...prev, specialFeatures: [...features, feature] };
    });
  };

  const visiblePlans = plans.filter(p => 
    p.projectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.houseStyle.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-border/50 shadow-xl overflow-hidden bg-card/30">
            <CardHeader className="bg-muted/50">
              <CardTitle className="font-headline text-3xl text-accent">
                {editingId ? 'Edit Plan Record' : 'Register Manual Plan Entry'}
              </CardTitle>
              <CardDescription>AI blueprint analysis is disabled. Please enter all metadata manually.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="space-y-2 lg:col-span-2">
                    <Label>Project Name</Label>
                    <Input 
                      value={form.projectName} 
                      onChange={e => setForm({...form, projectName: e.target.value})} 
                      required 
                      disabled={!canEdit} 
                    />
                  </div>
                  <div className="space-y-2"><Label>Designer</Label><Input value={form.designerName} onChange={e => setForm({...form, designerName: e.target.value})} disabled={!canEdit} /></div>
                  <div className="space-y-2"><Label>Style</Label><Input value={form.houseStyle} onChange={e => setForm({...form, houseStyle: e.target.value})} disabled={!canEdit} /></div>
                  <div className="space-y-2"><Label>Heated Sq Ft</Label><Input type="number" value={form.heatedSqFt} onChange={e => setForm({...form, heatedSqFt: Number(e.target.value)})} disabled={!canEdit} /></div>
                  <div className="space-y-2"><Label>Bedrooms</Label><Input type="number" value={form.bedrooms} onChange={e => setForm({...form, bedrooms: Number(e.target.value)})} disabled={!canEdit} /></div>
                  <div className="space-y-2"><Label>Bathrooms</Label><Input type="number" step="0.5" value={form.bathrooms} onChange={e => setForm({...form, bathrooms: Number(e.target.value)})} disabled={!canEdit} /></div>
                  <div className="space-y-2"><Label>Stories</Label><Input type="number" value={form.stories} onChange={e => setForm({...form, stories: Number(e.target.value)})} disabled={!canEdit} /></div>
                </div>
                <div className="space-y-3"><Label>Special Features</Label><div className="flex flex-wrap gap-2">{SPECIAL_FEATURES_OPTIONS.map(feature => (<Badge key={feature} variant={form.specialFeatures?.includes(feature) ? 'default' : 'outline'} className={cn("py-1.5 px-3", canEdit ? "cursor-pointer" : "opacity-70")} onClick={() => toggleFeature(feature)}>{feature}</Badge>))}</div></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2"><Label>Dropbox PDF Link</Label><Input value={form.pdfUrl} onChange={e => setForm({...form, pdfUrl: e.target.value})} required disabled={!canEdit} /></div>
                  <div className="space-y-2">
                    <Label>Thumbnail Rendering</Label>
                    <div className="flex gap-4 items-center">
                      <Button type="button" variant="outline" size="sm" onClick={() => thumbnailInputRef.current?.click()} disabled={isCompressing || !canEdit}>
                        {isCompressing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ImageIcon className="h-4 w-4 mr-2" />} 
                        {isCompressing ? 'Optimizing...' : 'Upload Preview'}
                      </Button>
                      <input type="file" ref={thumbnailInputRef} className="hidden" accept="image/*" onChange={handleThumbnailUpload} />
                      {form.thumbnailUrl && <div className="relative h-10 w-16 rounded border overflow-hidden"><Image src={form.thumbnailUrl} alt="Preview" fill unoptimized className="object-cover" /></div>}
                    </div>
                  </div>
                </div>
                {canEdit && <div className="flex justify-end gap-3 pt-4"><Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button><Button type="submit" className="bg-primary" disabled={isCompressing}>{isCompressing ? 'Optimizing...' : editingId ? 'Update Plan' : 'Add to Database'}</Button></div>}
              </form>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-8">
          <Card className="border-border/50 shadow-xl bg-card/30">
            <CardHeader><CardTitle className="text-xl flex items-center gap-2"><Search className="h-5 w-5" /> Manual Search</CardTitle></CardHeader>
            <CardContent className="pt-0"><Input placeholder="Search project name..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></CardContent>
          </Card>
        </div>
      </div>
      <Card className="border-border/50 shadow-lg overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Project Name</TableHead>
                <TableHead>Style</TableHead>
                <TableHead className="text-right">Sq Ft</TableHead>
                <TableHead className="text-center">Beds/Baths</TableHead>
                <TableHead>Features</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiblePlans.map(plan => (
                <TableRow key={plan.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {plan.thumbnailUrl && (
                        <div className="relative h-10 w-16 rounded border overflow-hidden">
                          <Image src={plan.thumbnailUrl} alt="Thumbnail" fill unoptimized className="object-cover" />
                        </div>
                      )}
                      <div>
                        <div className="font-bold">{plan.projectName}</div>
                        <div className="text-[10px] uppercase text-muted-foreground">{plan.designerName}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="secondary">{plan.houseStyle}</Badge></TableCell>
                  <TableCell className="text-right font-bold text-accent">{plan.heatedSqFt}</TableCell>
                  <TableCell className="text-center">{plan.bedrooms}/{plan.bathrooms}</TableCell>
                  <TableCell><div className="flex flex-wrap gap-1 max-w-[200px]">{plan.specialFeatures?.slice(0, 2).map(f => (<Badge key={f} variant="outline" className="text-[8px]">{f}</Badge>))}</div></TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" asChild><a href={plan.pdfUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(plan)} disabled={!canEdit}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-rose-500" onClick={() => onDeletePlan(plan.id)} disabled={!canEdit}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
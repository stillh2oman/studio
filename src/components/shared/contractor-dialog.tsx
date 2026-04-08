
"use client"

import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Contractor, ContractorContact } from '@/lib/types';
import { Building2, Mail, Phone, UserPlus, Plus, Trash2, ImageIcon, Upload, Loader2, X, CheckCircle2, Key } from 'lucide-react';
import { compressImage } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';

const generateAccessCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

interface ContractorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (contractor: Omit<Contractor, 'id'>) => void;
  initialData?: Contractor | null;
}

export function ContractorDialog({ open, onOpenChange, onSave, initialData }: ContractorDialogProps) {
  const { toast } = useToast();
  const [companyName, setCompanyName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [permitPdfDownloads, setPermitPdfDownloads] = useState(false);
  const [qualifiesForDiscount, setQualifiesForDiscount] = useState(true);
  const [contacts, setContacts] = useState<ContractorContact[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialData) {
      setCompanyName(initialData.companyName);
      setLogoUrl(initialData.logoUrl || '');
      setBillingEmail(initialData.billingEmail || '');
      setAccessCode(initialData.accessCode || '');
      setPermitPdfDownloads(!!initialData.permitPdfDownloads);
      setQualifiesForDiscount(initialData.qualifiesForDiscount !== false);
      setContacts(initialData.contacts || []);
    } else {
      setCompanyName('');
      setLogoUrl('');
      setBillingEmail('');
      setAccessCode('');
      setPermitPdfDownloads(false);
      setQualifiesForDiscount(true);
      setContacts([{ name: '', title: '', email: '', phone: '' }]);
    }
  }, [initialData, open]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressing(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const rawDataUrl = event.target?.result as string;
        const compressed = await compressImage(rawDataUrl, 400, 0.6);
        setLogoUrl(compressed);
        toast({ title: "Logo Optimized" });
      } catch (err) {
        console.error("Optimization failed", err);
      } finally {
        setIsCompressing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const addContactField = () => {
    setContacts(prev => [...prev, { name: '', title: '', email: '', phone: '' }]);
  };

  const removeContactField = (index: number) => {
    setContacts(prev => prev.filter((_, i) => i !== index));
  };

  const updateContact = (index: number, field: keyof ContractorContact, value: string) => {
    setContacts(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || isCompressing) return;

    onSave({
      companyName: companyName.trim(),
      logoUrl: logoUrl.trim(),
      billingEmail: billingEmail.trim(),
      accessCode: accessCode.trim() || undefined,
      permitPdfDownloads,
      qualifiesForDiscount,
      contacts: contacts.filter(c => c.name.trim() !== '')
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 bg-muted/20 border-b">
          <DialogTitle className="text-2xl font-headline flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            {initialData ? 'Edit Contractor Onboarding' : 'Register New Contractor'}
          </DialogTitle>
          <DialogDescription>Create a branded landing page and secure folder for a GC.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
          <ScrollArea className="flex-1 px-6 py-6">
            <div className="space-y-8 pb-6">
              <section className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Company Name</Label>
                    <Input 
                      value={companyName} 
                      onChange={e => setCompanyName(e.target.value)} 
                      placeholder="e.g. Red Rock Builders" 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Shared Access Code</Label>
                    <Input 
                      value={accessCode} 
                      onChange={e => setAccessCode(e.target.value.toUpperCase())} 
                      placeholder="e.g. SUMMIT-2024" 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Billing E-mail</Label>
                  <Input 
                    type="email" 
                    value={billingEmail} 
                    onChange={e => setBillingEmail(e.target.value)} 
                    placeholder="accounts@firm.com" 
                  />
                </div>

                <div className="space-y-2">
                  <Label>Logo URL (Optional)</Label>
                  <div className="flex gap-2">
                    <Input 
                      value={logoUrl} 
                      onChange={e => setLogoUrl(e.target.value)} 
                      placeholder="https://..." 
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      className="h-10 px-3 text-[10px] font-black uppercase"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isCompressing}
                    >
                      {isCompressing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
                      Upload Logo
                    </Button>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 border border-border/40 rounded-xl">
                  <div>
                    <Label className="text-xs font-bold">Contractor Discount Eligible</Label>
                    <p className="text-[10px] text-muted-foreground">Enable if this contractor qualifies for discount pricing.</p>
                  </div>
                  <Switch checked={qualifiesForDiscount} onCheckedChange={(v) => setQualifiesForDiscount(!!v)} />
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] uppercase font-black tracking-widest text-accent">Company Contacts</Label>
                  <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-[10px] font-black" onClick={addContactField}>
                    <Plus className="h-3 w-3" /> ADD CONTACT
                  </Button>
                </div>

                <div className="space-y-4">
                  {contacts.map((contact, index) => (
                    <div key={index} className="p-4 bg-muted/20 border border-border/50 rounded-2xl relative group animate-in slide-in-from-right-2 duration-300">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label className="text-[9px] uppercase font-bold text-muted-foreground ml-1">Contact Name</Label>
                          <Input className="h-9 text-sm" value={contact.name} onChange={e => updateContact(index, 'name', e.target.value)} placeholder="Full Name" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[9px] uppercase font-bold text-muted-foreground ml-1">Title</Label>
                          <Input className="h-9 text-sm" value={contact.title} onChange={e => updateContact(index, 'title', e.target.value)} placeholder="e.g. Site Super" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[9px] uppercase font-bold text-muted-foreground ml-1">Direct Email</Label>
                          <div className="relative">
                            <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                            <Input className="h-9 text-sm pl-8" value={contact.email} onChange={e => updateContact(index, 'email', e.target.value)} placeholder="email@firm.com" />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[9px] uppercase font-bold text-muted-foreground ml-1">Phone Number</Label>
                          <div className="relative">
                            <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                            <Input className="h-9 text-sm pl-8" value={contact.phone} onChange={e => updateContact(index, 'phone', e.target.value)} placeholder="(000) 000-0000" />
                          </div>
                        </div>
                      </div>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="icon" 
                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-rose-500 text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" 
                        onClick={() => removeContactField(index)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </ScrollArea>

          <DialogFooter className="p-6 bg-muted/30 border-t">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Discard</Button>
            <Button type="submit" className="bg-primary px-10 h-12 font-bold shadow-lg" disabled={isCompressing}>
              {initialData ? 'Commit Changes' : 'Register Firm'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

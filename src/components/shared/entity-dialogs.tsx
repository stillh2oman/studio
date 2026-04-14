
"use client"

import { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Client, Project, ProjectType, ProjectNature, ProjectStatus, PROJECT_STATUS_STEPS, Designer, Contractor, ContractorContact } from '@/lib/types';
import { AlertCircle, Building2, MapPin, Loader2, Home, Hammer, PlusCircle, UserCog, ImageIcon, Upload, X, Phone, Key, ShieldCheck, Mail, Trash2, UserPlus, Percent } from 'lucide-react';
import { cn, compressImage } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';
const CLIENT_DISCOUNT_OPTIONS = ['First Responder', 'Military', 'Home & Garden Show', 'Repeat Client', 'Other'] as const;

async function geocodeAddress(address: string) {
  try {
    if (!MAPBOX_TOKEN) return null;
    const gpsMatch = address.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
    if (gpsMatch) {
      return { lat: parseFloat(gpsMatch[1]), lng: parseFloat(gpsMatch[2]) };
    }

    const resp = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&limit=1`);
    const data = await resp.json();
    if (data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].center;
      return { lat, lng };
    }
  } catch (e) {
    console.error("Geocoding failed", e);
  }
  return null;
}

interface ClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (client: Omit<Client, 'id'>) => void;
  initialData?: Client | null;
  clients: Client[];
  contractors?: Contractor[];
  projects?: Project[];
  allowContractorToggle?: boolean;
}

export function ClientDialog({ open, onOpenChange, onSave, initialData, clients, contractors = [], projects = [], allowContractorToggle = true }: ClientDialogProps) {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [secondaryClientName, setSecondaryClientName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isContractor, setIsContractor] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [permitPdfDownloads, setPermitPdfDownloads] = useState(false);
  const [initialProjectName, setInitialProjectName] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [associatedProjectIds, setAssociatedProjectIds] = useState<string[]>([]);
  const [projectAddress, setProjectAddress] = useState('');
  const [projectRenderingUrl, setProjectRenderingUrl] = useState('');
  const [assignedContractorId, setAssignedContractorId] = useState('');
  const [discountEligibility, setDiscountEligibility] = useState('');
  
  const clientName = `${firstName} ${lastName}`.trim();

  // Contractor specific state
  const [logoUrl, setLogoUrl] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [contacts, setContacts] = useState<ContractorContact[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialData) {
      setFirstName(initialData.firstName || (initialData.name || '').split(/\s+/).slice(0, -1).join(' ') || (initialData.name || '').split(/\s+/)[0] || '');
      setLastName(initialData.lastName || ((initialData.name || '').split(/\s+/).length > 1 ? (initialData.name || '').split(/\s+/).slice(-1)[0] : ''));
      setSecondaryClientName(initialData.secondaryClientName || '');
      setEmail(initialData.email || '');
      setPhoneNumber(initialData.phoneNumber || '');
      setIsContractor(!!initialData.isContractor);
      setPermitPdfDownloads(!!initialData.permitPdfDownloads);
      setInitialProjectName(initialData.initialProjectName || '');
      const matched = (projects || []).find(p => p.name === (initialData.initialProjectName || ''));
      setSelectedProjectId(matched?.id || '');
      setAssociatedProjectIds(
        Array.isArray(initialData.associatedProjectIds)
          ? initialData.associatedProjectIds
          : (matched?.id ? [matched.id] : [])
      );
      setProjectAddress(initialData.projectAddress || '');
      setProjectRenderingUrl(initialData.projectRenderingUrl || '');
      setAssignedContractorId(initialData.assignedContractorId || '');
      setDiscountEligibility(initialData.discountEligibility || '');
      setLogoUrl(initialData.logoUrl || '');
      setBillingEmail(initialData.billingEmail || '');
      setContacts(initialData.additionalStakeholders || initialData.contacts || []);
      setAccessCode(initialData.accessCode || '');
    } else {
      setFirstName('');
      setLastName('');
      setSecondaryClientName('');
      setEmail('');
      setPhoneNumber('');
      setIsContractor(false);
      setPermitPdfDownloads(false);
      setInitialProjectName('');
      setSelectedProjectId('');
      setAssociatedProjectIds([]);
      setProjectAddress('');
      setProjectRenderingUrl('');
      setAssignedContractorId('');
      setDiscountEligibility('');
      setLogoUrl('');
      setBillingEmail('');
      setAccessCode('');
      setContacts([{ name: '', title: '', email: '', phone: '' }]);
    }
  }, [initialData, open]);

  useEffect(() => {
    if (!initialData || !selectedProjectId) return;
    const project = (projects || []).find(p => p.id === selectedProjectId);
    if (!project) return;
    setInitialProjectName(project.name || '');
    setAssociatedProjectIds(prev => (prev.includes(project.id) ? prev : [...prev, project.id]));
    setProjectAddress(project.address || '');
    setProjectRenderingUrl(project.renderingUrl || '');
  }, [initialData, selectedProjectId, projects]);

  const handleAssociatedProjectsChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(e.target.selectedOptions).map(o => o.value);
    setAssociatedProjectIds(values);
  };

  // Automated Access Code Logic
  useEffect(() => {
    if (!initialData && clientName.length > 2) {
      const sanitized = clientName.replace(/\s+/g, '').toUpperCase();
      setAccessCode(`${sanitized}2026`);
    }
  }, [clientName, initialData]);

  const handleToggleContractor = (checked: boolean) => {
    setIsContractor(checked);
    if (checked && !billingEmail && email) {
      setBillingEmail(email);
    }
  };

  const existingNames = useMemo(() => Array.from(new Set((clients || []).map(c => c.name))).sort(), [clients]);
  
  const isDuplicate = useMemo(() => 
    existingNames.some(n => n.toLowerCase() === clientName.trim().toLowerCase()) && (!initialData || initialData.id === 'new'), 
  [clientName, existingNames, initialData]);

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
    if (!clientName.trim() || isCompressing) return;
    
    const payload: any = { 
      name: clientName.trim(),
      firstName: firstName.trim() || "",
      lastName: lastName.trim() || "",
      secondaryClientName: secondaryClientName.trim() || "",
      email: email.trim() || "",
      phoneNumber: phoneNumber.trim() || "",
      isContractor: allowContractorToggle ? isContractor : false,
      accessCode: accessCode.trim() || "",
      permitPdfDownloads,
      initialProjectName: initialProjectName.trim() || "",
      associatedProjectIds,
      projectAddress: projectAddress.trim() || "",
      projectRenderingUrl: projectRenderingUrl.trim() || "",
      assignedContractorId: assignedContractorId || "",
      discountEligibility: discountEligibility || "",
    };

    if (isContractor) {
      payload.logoUrl = logoUrl.trim() || "";
      payload.billingEmail = billingEmail.trim() || "";
      payload.contacts = contacts.filter(c => c.name.trim() !== '');
    } else {
      payload.additionalStakeholders = contacts.filter(c => c.name.trim() !== '');
    }

    onSave(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 bg-muted/20 border-b shrink-0">
          <div className="flex justify-between items-center mr-8">
            <DialogTitle className="font-headline text-2xl">
              {initialData ? 'Edit Client' : 'New Client'}
            </DialogTitle>
            {allowContractorToggle ? (
              <div className="flex items-center gap-2">
                <Label htmlFor="is-contractor-toggle" className="text-[10px] uppercase font-black text-muted-foreground">Contractor Firm?</Label>
                <Switch 
                  id="is-contractor-toggle" 
                  checked={isContractor} 
                  onCheckedChange={handleToggleContractor}
                />
              </div>
            ) : null}
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <ScrollArea className="flex-1 min-h-0 px-6 py-6">
            <div className="space-y-6 pb-6">
              {!isContractor ? (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground">Client Identity</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>First Name</Label>
                      <Input 
                        className="h-11"
                        value={firstName} 
                        onChange={e => setFirstName(e.target.value)} 
                        placeholder="e.g. John" 
                        list="client-name-suggestions"
                        required 
                      />
                      <datalist id="client-name-suggestions">
                        {existingNames.map(name => (
                          <option key={name} value={name} />
                        ))}
                      </datalist>
                      {isDuplicate && (
                        <p className="text-[10px] text-amber-500 font-bold flex items-center gap-1 animate-pulse">
                          <AlertCircle className="h-3 w-3" /> Note: Account already exists.
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Last Name</Label>
                      <Input 
                        className="h-11"
                        value={lastName} 
                        onChange={e => setLastName(e.target.value)} 
                        placeholder="e.g. Miller"
                        required
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Secondary Client (Optional)</Label>
                      <Input
                        className="h-11"
                        value={secondaryClientName}
                        onChange={e => setSecondaryClientName(e.target.value)}
                        placeholder="e.g. Jane Miller"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Primary Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                          className="h-11 pl-10"
                          type="email" 
                          value={email} 
                          onChange={e => setEmail(e.target.value)} 
                          placeholder="client@example.com" 
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Primary Phone</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                          className="h-11 pl-10"
                          value={phoneNumber} 
                          onChange={e => setPhoneNumber(e.target.value)} 
                          placeholder="(555) 000-0000" 
                        />
                      </div>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Discount Eligibility</Label>
                      <select
                        className="flex h-10 w-full rounded-md border bg-background px-3 text-sm font-bold shadow-inner focus:ring-2 focus:ring-primary outline-none"
                        value={discountEligibility}
                        onChange={(e) => setDiscountEligibility(e.target.value)}
                      >
                        <option value="">None selected</option>
                        {CLIENT_DISCOUNT_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <section className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] uppercase font-black tracking-widest text-accent">Additional Stakeholders</Label>
                      <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-[10px] font-black" onClick={addContactField}>
                        <PlusCircle className="h-3 w-3" /> Add Person
                      </Button>
                    </div>
                    <div className="space-y-3">
                      {contacts.map((contact, index) => (
                        <div key={index} className="p-3 bg-muted/20 border border-border/50 rounded-xl relative group">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <Input className="h-9 text-sm" value={contact.name} onChange={e => updateContact(index, 'name', e.target.value)} placeholder="Contact Name" />
                            <Input className="h-9 text-sm" value={contact.email} onChange={e => updateContact(index, 'email', e.target.value)} placeholder="Email Address" />
                            <Input className="h-9 text-sm md:col-span-2" value={contact.phone} onChange={e => updateContact(index, 'phone', e.target.value)} placeholder="Phone Number" />
                          </div>
                          <Button type="button" variant="ghost" size="icon" className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-rose-500 text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeContactField(index)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </section>
                  {!initialData ? (
                    <div className="rounded-lg border border-border/60 bg-muted/15 px-4 py-3 text-sm text-muted-foreground leading-relaxed">
                      <p className="font-semibold text-foreground mb-1">Projects & contractors</p>
                      <p>
                        Add projects from the main command center: use{" "}
                        <span className="font-semibold text-foreground">Register New Architectural Project</span>. There
                        you choose the <span className="font-semibold text-foreground">client</span> and optional{" "}
                        <span className="font-semibold text-foreground">contractor</span> for each project—no project
                        details are required here.
                      </p>
                    </div>
                  ) : (
                    <section className="space-y-4">
                      <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground">
                        Linked projects (optional)
                      </Label>
                      <p className="text-[10px] text-muted-foreground">
                        Contractor for a job is set per project in &quot;Register New Architectural Project&quot;, not on
                        the client card.
                      </p>
                      <div className="space-y-2">
                        <Label>Project Name</Label>
                        <select
                          className="flex h-11 w-full rounded-md border bg-background px-3 text-sm font-bold shadow-inner focus:ring-2 focus:ring-primary outline-none"
                          value={selectedProjectId}
                          onChange={(e) => setSelectedProjectId(e.target.value)}
                        >
                          <option value="">Select from Project Database...</option>
                          {projects
                            .slice()
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>Associated Projects (Multiple)</Label>
                        <select
                          multiple
                          className="flex min-h-[120px] w-full rounded-md border bg-background px-3 py-2 text-sm font-bold shadow-inner focus:ring-2 focus:ring-primary outline-none"
                          value={associatedProjectIds}
                          onChange={handleAssociatedProjectsChange}
                        >
                          {projects
                            .slice()
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                        </select>
                        <p className="text-[10px] text-muted-foreground">Hold Ctrl (Windows) to select multiple projects.</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Project Address</Label>
                        <div className="relative">
                          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            className="h-11 pl-10"
                            value={projectAddress}
                            onChange={(e) => setProjectAddress(e.target.value)}
                            placeholder="123 Maple St, City, State"
                            readOnly
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Project Rendering URL (Optional)</Label>
                        <div className="relative">
                          <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            className="h-11 pl-10"
                            value={projectRenderingUrl}
                            onChange={(e) => setProjectRenderingUrl(e.target.value)}
                            placeholder="Dropbox link to rendering image"
                            readOnly
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          If left blank, a default Designer&apos;s Ink image can be used.
                        </p>
                      </div>
                    </section>
                  )}
                  <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground">Hub Access</Label>
                  <div className="flex items-center justify-between p-3 border border-border/40 rounded-xl">
                    <div>
                      <Label className="text-xs font-bold">Permit PDF Downloads</Label>
                      <p className="text-[10px] text-muted-foreground">Allow users in this hub to save PDF files locally.</p>
                    </div>
                    <Switch checked={permitPdfDownloads} onCheckedChange={(v) => setPermitPdfDownloads(!!v)} />
                  </div>
                </div>
              ) : (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <section className="space-y-4">
                    <Label className="text-[10px] uppercase font-black tracking-widest text-primary">Company Intelligence</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Company Name</Label>
                        <Input 
                          value={firstName} 
                          onChange={e => setFirstName(e.target.value)} 
                          placeholder="e.g. Red Rock Builders" 
                          required 
                        />
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
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className="flex items-center gap-2">
                          <ImageIcon className="h-3.5 w-3.5 text-accent" /> Company Logo Source
                        </Label>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 text-[9px] font-black uppercase text-primary border border-primary/20"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isCompressing}
                        >
                          {isCompressing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
                          Upload Logo
                        </Button>
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                      </div>
                      <Input 
                        value={logoUrl} 
                        onChange={e => setLogoUrl(e.target.value)} 
                        placeholder="Direct Link or Local Upload Result" 
                      />
                    </div>
                  </section>

                  <section className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] uppercase font-black tracking-widest text-accent">Company Contacts</Label>
                      <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-[10px] font-black" onClick={addContactField}>
                        <PlusCircle className="h-3 w-3" /> ADD CONTACT
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
                              <Label className="text-[9px] uppercase font-bold text-muted-foreground ml-1">Title / Role</Label>
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
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="p-6 bg-muted/30 border-t shrink-0">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Discard</Button>
            <Button type="submit" className="bg-primary px-10 h-12 text-lg font-bold shadow-lg" disabled={isCompressing}>
              {initialData ? 'Save Client Changes' : 'Save Client Profile'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: Client[];
  contractors: Contractor[];
  projects: Project[];
  onSave: (project: Omit<Project, 'id'>) => void;
  onAddClientTrigger: () => void;
  initialData?: Project | null;
}

export function ProjectDialog({ open, onOpenChange, clients, contractors, projects, onSave, onAddClientTrigger, initialData }: ProjectDialogProps) {
  const [projectName, setProjectName] = useState('');
  const [clientId, setClientId] = useState('');
  const [contractorId, setContractorId] = useState('');
  const [address, setAddress] = useState('');
  const [constructionCompany, setConstructionCompany] = useState('');
  const [type, setType] = useState<ProjectType>('Residential');
  const [status, setStatus] = useState<ProjectStatus>('Initial Meeting');
  const [nature, setNature] = useState<ProjectNature[]>([]);
  const [hourlyRate, setHourlyRate] = useState<string>('');
  const [hasHourlyDiscount, setHasHourlyDiscount] = useState(false);
  const [currentHeatedSqFt, setCurrentHeatedSqFt] = useState<string>('');
  const [lat, setLat] = useState<string>('');
  const [lng, setLng] = useState<string>('');
  const [designer, setDesigner] = useState<Designer>('Jeff Dillon');
  const [renderingUrl, setRenderingUrl] = useState('');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const sortedClients = useMemo(() => {
    return [...clients].sort((a, b) => a.name.localeCompare(b.name));
  }, [clients]);

  const contractorFirms = useMemo(() => {
    return [...(contractors || [])].sort((a, b) => a.companyName.localeCompare(b.companyName));
  }, [contractors]);

  useEffect(() => {
    if (initialData) {
      setProjectName(initialData.name);
      setClientId(initialData.clientId);
      setContractorId(initialData.contractorId || '');
      setAddress(initialData.address || '');
      setConstructionCompany(initialData.constructionCompany || '');
      setType(initialData.type || 'Residential');
      setStatus(initialData.status || 'Initial Meeting');
      setNature(initialData.nature || []);
      setHourlyRate(initialData.hourlyRate?.toString() || '');
      setHasHourlyDiscount(!!initialData.hasHourlyDiscount);
      setCurrentHeatedSqFt(initialData.currentHeatedSqFt?.toString() || '');
      setLat(initialData.lat?.toString() || '');
      setLng(initialData.lng?.toString() || '');
      setDesigner(initialData.designer || 'Jeff Dillon');
      setRenderingUrl((initialData.renderingUrl || (initialData as any).renderingSource || (initialData as any).rendering || '') as string);
    } else {
      setProjectName(''); 
      setClientId(''); 
      setContractorId('');
      setAddress(''); 
      setConstructionCompany('');
      setType('Residential'); 
      setStatus('Initial Meeting');
      setNature([]);
      setHourlyRate('');
      setHasHourlyDiscount(false);
      setCurrentHeatedSqFt('');
      setLat('');
      setLng('');
      setDesigner('Jeff Dillon');
      setRenderingUrl('');
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
        const compressed = await compressImage(rawDataUrl, 800, 0.6);
        setRenderingUrl(compressed);
      } catch (err) {
        console.error("Image optimization failed", err);
      } finally {
        setIsCompressing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim() || !clientId || isCompressing) return;

    let finalLat = parseFloat(lat);
    let finalLng = parseFloat(lng);

    const needsGeocode = address.trim() && (isNaN(finalLat) || isNaN(finalLng) || (initialData && address !== initialData.address));

    if (needsGeocode) {
      setIsGeocoding(true);
      const coords = await geocodeAddress(address);
      if (coords) {
        finalLat = coords.lat;
        finalLng = coords.lng;
      }
      setIsGeocoding(false);
    }

    const payload: any = { 
      name: projectName.trim(), 
      clientId, 
      address: address.trim() || "", 
      constructionCompany: constructionCompany.trim() || "",
      type, 
      status,
      nature,
      hourlyRate: parseFloat(hourlyRate) || 0,
      hasHourlyDiscount,
      currentHeatedSqFt: parseFloat(currentHeatedSqFt) || 0,
      designer,
      renderingUrl: renderingUrl.trim() || ""
    };

    if (contractorId) payload.contractorId = contractorId;
    if (!isNaN(finalLat)) payload.lat = finalLat;
    if (!isNaN(finalLng)) payload.lng = finalLng;

    onSave(payload);
    onOpenChange(false);
  };

  const effectiveRate = useMemo(() => {
    const base = parseFloat(hourlyRate) || 0;
    return hasHourlyDiscount ? Math.max(0, base - 15) : base;
  }, [hourlyRate, hasHourlyDiscount]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto bg-[#1a1c1e] text-white border-border/50">
        <DialogHeader>
          <DialogTitle className="font-headline text-3xl text-primary flex items-center gap-3">
            <PlusCircle className="h-8 w-8" />
            {initialData ? 'Update Project Intelligence' : 'Register New Architectural Project'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-8 py-6">
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-[10px] uppercase font-black tracking-widest text-muted-foreground">
              <div className="h-px bg-border flex-1" /> Primary Registry <div className="h-px bg-border flex-1" />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-accent">Project Alias / Name</Label>
                <Input 
                  className="h-12 bg-background border-border/50 font-bold"
                  value={projectName} 
                  onChange={e => setProjectName(e.target.value)} 
                  placeholder="e.g. Smith Residence" 
                  required 
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-accent">Client Account</Label>
                <div className="flex gap-2">
                  <select 
                    className="flex h-12 w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-primary outline-none" 
                    value={clientId} 
                    onChange={e => setClientId(e.target.value)} 
                    required
                  >
                    <option value="">Choose Account...</option>
                    {sortedClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <Button type="button" variant="outline" className="h-12 w-12 shrink-0 border-primary/30 text-primary" onClick={onAddClientTrigger} title="Add Client">+</Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-accent flex items-center gap-2"><UserCog className="h-3 w-3" /> Lead Firm Designer</Label>
                <select 
                  className="flex h-12 w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-primary outline-none" 
                  value={designer} 
                  onChange={e => setDesigner(e.target.value as Designer)}
                  required
                >
                  <option value="Jeff Dillon">Jeff Dillon</option>
                  <option value="Kevin Walthall">Kevin Walthall</option>
                </select>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="text-xs font-bold uppercase text-accent flex items-center gap-2">
                    <ImageIcon className="h-3 w-3" /> Rendering Source
                  </Label>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 text-[9px] font-black uppercase text-primary border border-primary/20"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isCompressing}
                  >
                    {isCompressing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
                    {isCompressing ? 'Optimizing...' : 'Upload File'}
                  </Button>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                </div>
                <Input 
                  className="h-12 bg-background border-border/50"
                  value={renderingUrl} 
                  onChange={e => setRenderingUrl(e.target.value)} 
                  placeholder="Paste Dropbox Link or Upload File" 
                />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2 text-[10px] uppercase font-black tracking-widest text-muted-foreground">
              <div className="h-px bg-border flex-1" /> Site & Partner Intelligence <div className="h-px bg-border flex-1" />
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-emerald-500">Official Site Address</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-10 h-12 bg-background border-border/50" value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Stillwater Ave, OK" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-emerald-500">Select Linked Contractor Firm</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <select 
                    className="flex h-12 w-full rounded-md border border-border/50 bg-background pl-10 pr-3 py-2 text-sm font-bold focus:ring-primary outline-none" 
                    value={contractorId} 
                    onChange={e => {
                      const id = e.target.value;
                      setContractorId(id);
                      const firm = contractorFirms.find(c => c.id === id);
                      if (firm) setConstructionCompany(firm.companyName);
                    }}
                  >
                    <option value="">Choose Contractor...</option>
                    {contractorFirms.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center mb-1">
                  <Label className="text-xs font-bold uppercase text-emerald-500">Firm Hourly Rate ($)</Label>
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id="hourly-discount" 
                      checked={hasHourlyDiscount} 
                      onCheckedChange={(c) => setHasHourlyDiscount(!!c)} 
                    />
                    <Label htmlFor="hourly-discount" className="text-[9px] font-black uppercase text-accent cursor-pointer flex items-center gap-1">
                      <Percent className="h-2.5 w-2.5" /> Apply $15 Discount
                    </Label>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Input 
                    type="number" 
                    step="0.01" 
                    value={hourlyRate} 
                    onChange={e => setHourlyRate(e.target.value)} 
                    className="h-12 bg-background border-border/50 font-bold flex-1" 
                  />
                  {hasHourlyDiscount && (
                    <div className="h-12 bg-accent/10 border border-accent/20 rounded-xl flex flex-col justify-center px-4 shrink-0">
                      <p className="text-[8px] font-black uppercase text-accent leading-none mb-1">Effective Rate</p>
                      <p className="text-lg font-bold text-white leading-none">${effectiveRate.toFixed(2)}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-indigo-400">Current Heated Square Footage (to Frame)</Label>
              <Input 
                type="number" 
                step="0.01" 
                value={currentHeatedSqFt} 
                onChange={e => setCurrentHeatedSqFt(e.target.value)} 
                className="h-12 bg-background border-border/50 font-bold" 
                placeholder="0.00"
              />
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2 text-[10px] uppercase font-black tracking-widest text-muted-foreground">
              <div className="h-px bg-border flex-1" /> Classification <div className="h-px bg-border flex-1" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase text-primary">Project Category</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(['Residential', 'Commercial', 'Tutoring'] as ProjectType[]).map(t => (
                    <Button
                      key={t}
                      type="button"
                      variant={type === t ? 'default' : 'outline'}
                      className={cn("h-10 text-[10px] font-black uppercase", type === t && "bg-primary text-white border-primary")}
                      onClick={() => setType(t)}
                    >
                      {t}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase text-primary">Status Phase</Label>
                <select className="h-10 w-full rounded-md border border-border/50 bg-background px-3 text-[10px] font-black uppercase focus:ring-primary outline-none" value={status} onChange={e => setStatus(e.target.value as ProjectStatus)}>
                  {PROJECT_STATUS_STEPS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </section>

          <DialogFooter className="pt-6 border-t border-border/50">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Discard</Button>
            <Button type="submit" className="px-12 h-14 bg-primary text-white text-lg font-black shadow-xl shadow-primary/20" disabled={isGeocoding || isCompressing}>
              {isGeocoding ? <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Syncing GPS...</> : isCompressing ? <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Optimizing...</> : initialData ? 'Commit Changes' : 'Launch Project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

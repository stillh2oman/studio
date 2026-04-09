
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Settings2, Building2, Save, Trash2, UserPlus, Download, Loader2, SeparatorHorizontal } from "lucide-react";
import { useDirectoryStore } from "@/firebase/use-directory-store";
import { doc, updateDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { useMirrorDropboxImageUrl } from "@planport/hooks/use-mirror-dropbox-image";
import { Separator } from "@/components/ui/separator";
import { ConvertToClientDialog } from "./ConvertToClientDialog";

interface EditGCDialogProps {
  gc: {
    id: string;
    name: string;
    accessCode: string;
    dropboxRootPath?: string;
    logoUrl?: string;
    allowDownloads?: boolean;
    contacts?: any[];
  };
}

export function EditGCDialog({ gc }: EditGCDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(gc.name);
  const [accessCode, setAccessCode] = useState(gc.accessCode);
  const [logoUrl, setLogoUrl] = useState(gc.logoUrl || "");
  const [allowDownloads, setAllowDownloads] = useState(gc.allowDownloads || false);
  const [contacts, setContacts] = useState(gc.contacts || [{ name: "", email: "", phone: "" }]);
  const [loading, setLoading] = useState(false);
  
  const { directoryDb, contractorsCollection } = useDirectoryStore();
  const { toast } = useToast();
  const mirrorDropboxImage = useMirrorDropboxImageUrl();

  // Sync state with props
  useEffect(() => {
    setName(gc.name);
    setAccessCode(gc.accessCode);
    setLogoUrl(gc.logoUrl || "");
    setAllowDownloads(gc.allowDownloads || false);
    setContacts(gc.contacts || [{ name: "", email: "", phone: "" }]);
  }, [gc]);

  const handleAddContact = () => {
    setContacts([...contacts, { name: "", email: "", phone: "" }]);
  };

  const handleUpdateContact = (index: number, field: string, value: string) => {
    const newContacts = [...contacts];
    (newContacts[index] as any)[field] = value;
    setContacts(newContacts);
  };

  const handleRemoveContact = (index: number) => {
    setContacts(contacts.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const normalizedCode = accessCode.trim().toUpperCase();
    
    try {
      const resolvedLogo = await mirrorDropboxImage(logoUrl);
      const gcRef = doc(directoryDb, contractorsCollection, gc.id);
      await updateDoc(gcRef, {
        name,
        accessCode: normalizedCode,
        logoUrl: resolvedLogo,
        allowDownloads,
        contacts: contacts.filter((c) => c.name),
        updatedAt: new Date().toISOString()
      });
      
      toast({ title: "Contractor Updated", description: `${name} has been successfully updated.` });
      setOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between mt-2">
          Edit Contractor Settings
          <Settings2 className="w-4 h-4 ml-2" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto bg-background">
        <DialogHeader>
          <DialogTitle className="text-2xl text-primary flex items-center gap-2">
            <Building2 className="w-6 h-6 text-accent" />
            Edit Contractor: {gc.name}
          </DialogTitle>
          <DialogDescription>Modify contractor branding, access, and global permissions.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input placeholder="e.g. Summit Ridge Builders" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Shared Access Code</Label>
              <Input placeholder="e.g. SUMMIT-2024" value={accessCode} onChange={e => setAccessCode(e.target.value)} required />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Logo URL (Optional)</Label>
            <Input placeholder="https://..." value={logoUrl} onChange={e => setLogoUrl(e.target.value)} />
          </div>

          <div className="flex items-center justify-between p-4 bg-secondary rounded-md border border-dashed border-border">
            <div className="space-y-0.5">
              <Label className="text-sm font-bold flex items-center gap-2">
                <Download className="w-4 h-4 text-accent" />
                Permit PDF Downloads
              </Label>
              <p className="text-[10px] text-muted-foreground">Allows all subcontractors for this GC to download blueprints.</p>
            </div>
            <Switch 
              checked={allowDownloads} 
              onCheckedChange={setAllowDownloads} 
            />
          </div>

          <div className="space-y-4 pt-4 border-t">
            <div className="flex justify-between items-center">
              <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Company Contacts</Label>
              <Button type="button" variant="ghost" size="sm" onClick={handleAddContact} className="text-accent hover:text-accent/80">
                <UserPlus className="w-4 h-4 mr-1" /> Add Contact
              </Button>
            </div>
            
            <div className="space-y-4">
              {contacts.map((contact, index) => (
                <div key={index} className="p-4 bg-secondary/30 rounded-xl border space-y-3 relative group">
                  {contacts.length > 1 && (
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleRemoveContact(index)}
                      className="absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <Input placeholder="Contact Name" value={contact.name} onChange={e => handleUpdateContact(index, "name", e.target.value)} required />
                    <Input placeholder="Email Address" value={contact.email} onChange={e => handleUpdateContact(index, "email", e.target.value)} required />
                  </div>
                  <Input placeholder="Phone Number" value={contact.phone} onChange={e => handleUpdateContact(index, "phone", e.target.value)} required />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4 pt-6">
            <Button
              type="submit"
              className="w-full h-12 bg-ink text-ink-foreground hover:bg-ink/90"
              disabled={loading}
            >
              {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
              {loading ? "Updating..." : "Save Contractor Settings"}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Administrative Actions</span>
              </div>
            </div>

            <ConvertToClientDialog gc={gc} />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

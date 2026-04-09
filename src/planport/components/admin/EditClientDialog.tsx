
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
import { Settings2, User, Save, MapPin, Phone, Mail, Download, Loader2 } from "lucide-react";
import { useDirectoryStore } from "@/firebase/use-directory-store";
import { doc, updateDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

interface EditClientDialogProps {
  client: {
    id: string;
    husbandName: string;
    wifeName?: string;
    accessCode: string;
    address?: string;
    email?: string;
    /** QuickBooks customer match; falls back to `email` when empty. */
    billingEmail?: string;
    phone?: string;
    allowDownloads?: boolean;
  };
}

export function EditClientDialog({ client }: EditClientDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [husbandName, setHusbandName] = useState(client.husbandName);
  const [wifeName, setWifeName] = useState(client.wifeName || "");
  const [accessCode, setAccessCode] = useState(client.accessCode);
  const [address, setAddress] = useState(client.address || "");
  const [email, setEmail] = useState(client.email || "");
  const [billingEmail, setBillingEmail] = useState(
    typeof client.billingEmail === "string" ? client.billingEmail : ""
  );
  const [phone, setPhone] = useState(client.phone || "");
  const [allowDownloads, setAllowDownloads] = useState(client.allowDownloads || false);
  
  const { directoryDb, clientsCollection } = useDirectoryStore();
  const { toast } = useToast();

  useEffect(() => {
    setHusbandName(client.husbandName);
    setWifeName(client.wifeName || "");
    setAccessCode(client.accessCode);
    setAddress(client.address || "");
    setEmail(client.email || "");
    setBillingEmail(typeof client.billingEmail === "string" ? client.billingEmail : "");
    setPhone(client.phone || "");
    setAllowDownloads(client.allowDownloads || false);
  }, [client]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const normalizedCode = accessCode.trim().toUpperCase();
    
    try {
      const clientRef = doc(directoryDb, clientsCollection, client.id);
      await updateDoc(clientRef, {
        husbandName,
        wifeName: wifeName || null,
        accessCode: normalizedCode,
        address: address || null,
        email: email || null,
        billingEmail: billingEmail.trim() || null,
        phone: phone || null,
        allowDownloads,
        updatedAt: new Date().toISOString()
      });
      
      toast({ title: "Profile Updated", description: `"${husbandName}" profile has been successfully updated.` });
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
          Edit Client Settings
          <Settings2 className="w-4 h-4 ml-2" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto bg-background">
        <DialogHeader>
          <DialogTitle className="text-2xl text-primary flex items-center gap-2">
            <User className="w-6 h-6 text-accent" />
            Edit Client Profile
          </DialogTitle>
          <DialogDescription>Modify residence details, access codes, and permissions.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Primary Name</Label>
              <Input value={husbandName} onChange={e => setHusbandName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Secondary Name</Label>
              <Input value={wifeName} onChange={e => setWifeName(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Residence Address</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Input className="pl-10" value={address} onChange={e => setAddress(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Contact Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input className="pl-10" type="email" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Contact Phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input className="pl-10" value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>QuickBooks billing email (optional)</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-10"
                type="email"
                placeholder="Defaults to contact email when empty"
                value={billingEmail}
                onChange={(e) => setBillingEmail(e.target.value)}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Used to match this client to a QuickBooks customer for invoice linking.
            </p>
          </div>

          <div className="space-y-2 border-t pt-4">
            <Label>Shared Access Code</Label>
            <Input className="font-mono font-bold uppercase" value={accessCode} onChange={e => setAccessCode(e.target.value)} required />
          </div>

          <div className="flex items-center justify-between p-4 bg-secondary rounded-md border border-dashed border-border">
            <div className="space-y-0.5">
              <Label className="text-sm font-bold flex items-center gap-2">
                <Download className="w-4 h-4 text-accent" />
                Permit PDF Downloads
              </Label>
              <p className="text-[10px] text-muted-foreground">Allows homeowners to save blueprint files locally.</p>
            </div>
            <Switch checked={allowDownloads} onCheckedChange={setAllowDownloads} />
          </div>

          <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-white h-12 mt-4" disabled={loading}>
            {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
            {loading ? "Updating..." : "Save Client Settings"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

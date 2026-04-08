
"use client";

import { useState } from "react";
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
import { User, ArrowRightLeft, Save, Loader2, AlertTriangle } from "lucide-react";
import { useDirectoryStore } from "@/firebase/use-directory-store";
import { PLANPORT_CLIENT_ROOT, PLANPORT_GC_ROOT } from "@/lib/planport-project-paths";
import { doc, setDoc, getDocs, collection, deleteDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

interface ConvertToClientDialogProps {
  gc: {
    id: string;
    name: string;
    accessCode: string;
    allowDownloads?: boolean;
    contacts?: any[];
  };
}

export function ConvertToClientDialog({ gc }: ConvertToClientDialogProps) {
  const [open, setOpen] = useState(false);
  const [husbandName, setHusbandName] = useState(gc.name); // Default to GC name
  const [wifeName, setWifeName] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  
  const { directoryDb, contractorsCollection, clientsCollection, planportDb, isLedgerPrimary } =
    useDirectoryStore();
  const { toast } = useToast();

  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const safeSlug = (str: string) =>
      str
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
    const newClientId = `${safeSlug(husbandName)}${wifeName ? `-${safeSlug(wifeName)}` : ""}-${Date.now().toString(36)}`;
    const firstContact = gc.contacts?.[0] || {};
    const now = new Date().toISOString();

    try {
      const clientRef = doc(directoryDb, clientsCollection, newClientId);
      const clientData = {
        id: newClientId,
        husbandName,
        wifeName: wifeName || null,
        accessCode: gc.accessCode,
        address: address || null,
        email: firstContact.email || null,
        phone: firstContact.phone || null,
        allowDownloads: gc.allowDownloads || false,
        additionalContacts: [],
        createdAt: now,
        updatedAt: now,
        sourceApp: "planport"
      };
      await setDoc(clientRef, clientData);

      const projectsSnapshot = await getDocs(collection(planportDb, PLANPORT_GC_ROOT, gc.id, "projects"));

      for (const projectDoc of projectsSnapshot.docs) {
        const projectId = projectDoc.id;
        const projectData = {
          ...projectDoc.data(),
          generalContractorId: null,
          individualClientId: newClientId
        };

        await setDoc(doc(planportDb, PLANPORT_CLIENT_ROOT, newClientId, "projects", projectId), projectData);

        const subcollections = ["blueprints", "renderings", "chiefFiles"];
        for (const sub of subcollections) {
          const subSnapshot = await getDocs(
            collection(planportDb, PLANPORT_GC_ROOT, gc.id, "projects", projectId, sub)
          );
          for (const itemDoc of subSnapshot.docs) {
            await setDoc(
              doc(planportDb, PLANPORT_CLIENT_ROOT, newClientId, "projects", projectId, sub, itemDoc.id),
              itemDoc.data()
            );
            await deleteDoc(itemDoc.ref);
          }
        }

        await deleteDoc(projectDoc.ref);
      }

      await deleteDoc(doc(directoryDb, contractorsCollection, gc.id));
      if (isLedgerPrimary) {
        await deleteDoc(doc(planportDb, PLANPORT_GC_ROOT, gc.id));
      }

      toast({ 
        title: "Conversion Complete", 
        description: `"${gc.name}" is now managed as an Individual Client.` 
      });
      setOpen(false);
      window.location.reload(); // Refresh to update Admin state
    } catch (error: any) {
      toast({ variant: "destructive", title: "Conversion Failed", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full border-amber-500/50 text-amber-600 hover:bg-amber-50">
          <ArrowRightLeft className="w-4 h-4 mr-2" /> Convert to Individual Client
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[450px] bg-background">
        <DialogHeader>
          <DialogTitle className="text-2xl text-primary flex items-center gap-2">
            <User className="w-6 h-6 text-accent" />
            Convert Hub Type
          </DialogTitle>
          <DialogDescription>
            Change "{gc.name}" from a Contractor to an Individual Residence. This will migrate all project data.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleConvert} className="space-y-4 pt-4">
          <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-800 leading-relaxed">
              <strong>Warning:</strong> This action moves all projects and files. The old Contractor ID will be deleted and replaced with a Client profile.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Husband's Name</Label>
              <Input value={husbandName} onChange={e => setHusbandName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Wife's Name</Label>
              <Input value={wifeName} onChange={e => setWifeName(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Residence Address</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} required placeholder="123 Main St..." />
          </div>

          <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-white h-12 mt-4" disabled={loading}>
            {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
            {loading ? "Migrating Data..." : "Finalize Conversion"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

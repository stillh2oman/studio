
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Save, LayoutGrid, Image as ImageIcon, MapPin, User, PenTool, Loader2 } from "lucide-react";
import { useFirestore } from "@planport/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { useMirrorDropboxImageUrl } from "@planport/hooks/use-mirror-dropbox-image";
import {
  syncClientProjectToContractorIfEnabled,
  syncGcProjectToClientIfEnabled,
} from "@/lib/contractor-project-sync";

interface EditProjectDialogProps {
  hubId: string;
  hubType?: "gc" | "client";
  project: {
    id: string;
    name: string;
    ownerName: string;
    address: string;
    designerName?: string;
    renderingUrl?: string;
    status: string;
  };
}

const PROJECT_PHASES = [
  "Draft Phase",
  "Bid Phase",
  "Building Phase",
  "Project Completed"
] as const;

const DESIGNERS = [
  "Jeff Dillon",
  "Kevin Walthall"
] as const;

export function EditProjectDialog({ hubId, hubType = "gc", project }: EditProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [ownerName, setOwnerName] = useState(project.ownerName);
  const [address, setAddress] = useState(project.address);
  const [designerName, setDesignerName] = useState(project.designerName || "");
  const [renderingUrl, setRenderingUrl] = useState(project.renderingUrl || "");
  const [status, setStatus] = useState<string>(project.status);
  const [loading, setLoading] = useState(false);
  
  const db = useFirestore();
  const { toast } = useToast();
  const mirrorDropboxImage = useMirrorDropboxImageUrl();

  const collectionPath = hubType === "gc" ? "generalContractors" : "individualClients";

  useEffect(() => {
    setName(project.name);
    setOwnerName(project.ownerName);
    setAddress(project.address);
    setDesignerName(project.designerName || "");
    setRenderingUrl(project.renderingUrl || "");
    setStatus(project.status);
  }, [project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const resolvedRendering = await mirrorDropboxImage(renderingUrl);
      const projectRef = doc(db, collectionPath, hubId, "projects", project.id);
      await updateDoc(projectRef, {
        name,
        ownerName,
        address,
        designerName,
        renderingUrl: resolvedRendering,
        status
      });

      if (hubType === "client") {
        try {
          await syncClientProjectToContractorIfEnabled(db, hubId, project.id, "project");
        } catch (mirrorErr: unknown) {
          const msg = mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr);
          toast({
            variant: "destructive",
            title: "Project updated — contractor sync failed",
            description: msg,
          });
        }
      } else {
        try {
          await syncGcProjectToClientIfEnabled(db, hubId, project.id, "project");
        } catch (mirrorErr: unknown) {
          const msg = mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr);
          toast({
            variant: "destructive",
            title: "Project updated — client hub sync failed",
            description: msg,
          });
        }
      }
      
      toast({ title: "Project Updated", description: `${name} has been successfully updated.` });
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
        <Button variant="outline" size="sm" className="border-border bg-secondary text-foreground hover:bg-background">
          <Pencil className="w-3.5 h-3.5 mr-2" />
          Edit Project Info
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-background">
        <DialogHeader>
          <DialogTitle className="text-2xl text-primary flex items-center gap-2">
            <LayoutGrid className="w-6 h-6 text-accent" />
            Edit Project Details
          </DialogTitle>
          <DialogDescription>Update project parameters, client details, and status.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Project Name</Label>
              <Input placeholder="e.g. Lakeside Villa" value={name} onChange={e => setName(e.target.value)} required />
            </div>

            <div className="space-y-2">
              <Label>Client / Owner Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input className="pl-10" placeholder="John Doe" value={ownerName} onChange={e => setOwnerName(e.target.value)} required />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Project Address</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input className="pl-10" placeholder="123 Builder St, City" value={address} onChange={e => setAddress(e.target.value)} required />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Lead Designer</Label>
              <Select onValueChange={(val) => setDesignerName(val)} value={designerName}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a designer" />
                </SelectTrigger>
                <SelectContent>
                  {DESIGNERS.map(designer => (
                    <SelectItem key={designer} value={designer}>{designer}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Rendering Image URL</Label>
              <div className="relative">
                <ImageIcon className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input className="pl-10" placeholder="Dropbox link or public image URL" value={renderingUrl} onChange={e => setRenderingUrl(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Current Phase</Label>
              <Select onValueChange={(val: string) => setStatus(val)} defaultValue={status}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_PHASES.map(phase => (
                    <SelectItem key={phase} value={phase}>{phase}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-white h-12 mt-6" disabled={loading}>
            {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
            {loading ? "Saving Changes..." : "Update Project"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

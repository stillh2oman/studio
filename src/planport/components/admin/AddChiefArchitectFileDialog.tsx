
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
import { FileArchive, Save, Link as LinkIcon, Loader2 } from "lucide-react";
import { useFirestore } from "@planport/firebase";
import { doc, setDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  syncClientProjectToContractorIfEnabled,
  syncGcProjectToClientIfEnabled,
} from "@/lib/contractor-project-sync";

interface AddChiefArchitectFileDialogProps {
  hubId: string;
  hubType?: "gc" | "client";
  projectId: string;
  triggerClassName?: string;
}

export function AddChiefArchitectFileDialog({
  hubId,
  hubType = "gc",
  projectId,
  triggerClassName,
}: AddChiefArchitectFileDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  
  const db = useFirestore();
  const { toast } = useToast();

  const collectionPath = hubType === "gc" ? "generalContractors" : "individualClients";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !url) {
      toast({ variant: "destructive", title: "Missing Information", description: "Please provide a name and URL." });
      return;
    }

    setLoading(true);
    const fileId = `chief-${Date.now().toString(36)}`;
    
    try {
      await setDoc(doc(db, collectionPath, hubId, "projects", projectId, "chiefFiles", fileId), {
        id: fileId,
        name,
        url,
        projectId,
        uploadedAt: new Date().toISOString()
      });

      if (hubType === "client") {
        try {
          await syncClientProjectToContractorIfEnabled(db, hubId, projectId, "chiefFiles");
        } catch (mirrorErr: unknown) {
          const msg = mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr);
          toast({
            variant: "destructive",
            title: "File linked — contractor sync failed",
            description: msg,
          });
        }
      } else {
        try {
          await syncGcProjectToClientIfEnabled(db, hubId, projectId, "chiefFiles");
        } catch (mirrorErr: unknown) {
          const msg = mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr);
          toast({
            variant: "destructive",
            title: "File linked — client hub sync failed",
            description: msg,
          });
        }
      }
      
      toast({ 
        title: "Project File Linked", 
        description: `"${name}" has been added for direct download.` 
      });
      setOpen(false);
      setName("");
      setUrl("");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to link file", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className={cn("border-border", triggerClassName)}>
          <FileArchive className="w-4 h-4 mr-2" /> Link Chief Architect File
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[450px] bg-background">
        <DialogHeader>
          <DialogTitle className="text-2xl text-primary flex items-center gap-2">
            <FileArchive className="w-6 h-6 text-accent" />
            Link Project File
          </DialogTitle>
          <DialogDescription>
            Provide a Dropbox link to a large Chief Architect (.plan) file for direct client download.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>File Display Name</Label>
            <Input 
              placeholder="e.g. Master Plan File - v1.2" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              required 
            />
          </div>

          <div className="space-y-2">
            <Label>Dropbox Link</Label>
            <div className="relative">
              <LinkIcon className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Input 
                className="pl-10" 
                placeholder="https://www.dropbox.com/..." 
                value={url} 
                onChange={e => setUrl(e.target.value)} 
                required 
              />
            </div>
            <p className="text-[10px] text-muted-foreground">This link will trigger a direct browser download for the client.</p>
          </div>

          <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-white h-12 mt-4" disabled={loading}>
            {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
            {loading ? "Linking..." : "Save Project File Link"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

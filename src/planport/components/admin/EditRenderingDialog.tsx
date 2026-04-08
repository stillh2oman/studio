
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
import { Pencil, Save, Link as LinkIcon, Loader2 } from "lucide-react";
import { useFirestore } from "@planport/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { useMirrorDropboxImageUrl } from "@planport/hooks/use-mirror-dropbox-image";
import {
  syncClientProjectToContractorIfEnabled,
  syncGcProjectToClientIfEnabled,
} from "@/lib/contractor-project-sync";

interface EditRenderingDialogProps {
  hubId: string;
  hubType?: "gc" | "client";
  projectId: string;
  rendering: {
    id: string;
    name: string;
    url: string;
  };
}

export function EditRenderingDialog({ hubId, hubType = "gc", projectId, rendering }: EditRenderingDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(rendering.name);
  const [url, setUrl] = useState(rendering.url);
  const [loading, setLoading] = useState(false);
  
  const db = useFirestore();
  const { toast } = useToast();
  const mirrorDropboxImage = useMirrorDropboxImageUrl();

  const collectionPath = hubType === "gc" ? "generalContractors" : "individualClients";

  useEffect(() => {
    if (open) {
      setName(rendering.name);
      setUrl(rendering.url);
    }
  }, [rendering, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const resolvedUrl = await mirrorDropboxImage(url);
      const renderingRef = doc(db, collectionPath, hubId, "projects", projectId, "renderings", rendering.id);
      await updateDoc(renderingRef, {
        name,
        url: resolvedUrl,
      });

      if (hubType === "client") {
        try {
          await syncClientProjectToContractorIfEnabled(db, hubId, projectId, "renderings");
        } catch (mirrorErr: unknown) {
          const msg = mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr);
          toast({
            variant: "destructive",
            title: "Rendering updated — contractor sync failed",
            description: msg,
          });
        }
      } else {
        try {
          await syncGcProjectToClientIfEnabled(db, hubId, projectId, "renderings");
        } catch (mirrorErr: unknown) {
          const msg = mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr);
          toast({
            variant: "destructive",
            title: "Rendering updated — client hub sync failed",
            description: msg,
          });
        }
      }
      
      toast({ 
        title: "Rendering Updated", 
        description: `The rendering "${name}" has been updated.` 
      });
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
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 bg-black/50 text-white hover:bg-accent hover:text-accent-foreground"
        >
          <Pencil className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[450px] bg-background">
        <DialogHeader>
          <DialogTitle className="text-2xl text-primary flex items-center gap-2">
            <Pencil className="w-6 h-6 text-accent" />
            Edit Rendering
          </DialogTitle>
          <DialogDescription>Update the name or Dropbox URL for this rendering.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Rendering Name</Label>
            <Input 
              placeholder="e.g. Front Elevation Night View" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              required 
            />
          </div>

          <div className="space-y-2">
            <Label>Dropbox Image URL</Label>
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
          </div>

          <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-white h-12 mt-4" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
            {loading ? "Updating..." : "Save Changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

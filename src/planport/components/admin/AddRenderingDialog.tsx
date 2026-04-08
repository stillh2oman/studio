
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
import { Plus, ImageIcon, Save, Link as LinkIcon, Trash2, PlusCircle } from "lucide-react";
import { useFirestore } from "@planport/firebase";
import { doc, setDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useMirrorDropboxImageUrl } from "@planport/hooks/use-mirror-dropbox-image";
import {
  syncClientProjectToContractorIfEnabled,
  syncGcProjectToClientIfEnabled,
} from "@/lib/contractor-project-sync";

interface AddRenderingDialogProps {
  hubId: string;
  hubType?: "gc" | "client";
  projectId: string;
  triggerClassName?: string;
}

interface RenderingInput {
  name: string;
  url: string;
}

export function AddRenderingDialog({ hubId, hubType = "gc", projectId, triggerClassName }: AddRenderingDialogProps) {
  const [open, setOpen] = useState(false);
  const [renderings, setRenderings] = useState<RenderingInput[]>([{ name: "", url: "" }]);
  const [loading, setLoading] = useState(false);
  
  const db = useFirestore();
  const { toast } = useToast();
  const mirrorDropboxImage = useMirrorDropboxImageUrl();

  const collectionPath = hubType === "gc" ? "generalContractors" : "individualClients";

  const handleAddRow = () => {
    setRenderings([...renderings, { name: "", url: "" }]);
  };

  const handleRemoveRow = (index: number) => {
    if (renderings.length > 1) {
      setRenderings(renderings.filter((_, i) => i !== index));
    }
  };

  const handleUpdateRendering = (index: number, field: keyof RenderingInput, value: string) => {
    const updated = [...renderings];
    updated[index][field] = value;
    setRenderings(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const validRenderings = renderings.filter(r => r.name.trim() && r.url.trim());
      
      if (validRenderings.length === 0) {
        throw new Error("Please provide at least one valid rendering with a name and URL.");
      }

      for (const rendering of validRenderings) {
        const resolvedUrl = await mirrorDropboxImage(rendering.url);
        const renderingId =
          rendering.name.toLowerCase().replace(/\s+/g, "-") +
          "-" +
          Date.now() +
          Math.random().toString(36).substring(7);
        await setDoc(
          doc(db, collectionPath, hubId, "projects", projectId, "renderings", renderingId),
          {
            id: renderingId,
            name: rendering.name,
            projectId,
            url: resolvedUrl,
            uploadedAt: new Date().toISOString(),
          }
        );
      }

      if (hubType === "client") {
        try {
          await syncClientProjectToContractorIfEnabled(db, hubId, projectId, "renderings");
        } catch (mirrorErr: unknown) {
          const msg = mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr);
          toast({
            variant: "destructive",
            title: "Renderings saved — contractor sync failed",
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
            title: "Renderings saved — client hub sync failed",
            description: msg,
          });
        }
      }
      
      toast({ 
        title: "Renderings Added", 
        description: `${validRenderings.length} rendering(s) have been added to the gallery.` 
      });
      setOpen(false);
      resetForm();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to add renderings", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setRenderings([{ name: "", url: "" }]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className={cn("border-border", triggerClassName)}>
          <Plus className="w-4 h-4 mr-2" /> Add Rendering
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto bg-background">
        <DialogHeader>
          <DialogTitle className="text-2xl text-primary flex items-center gap-2">
            <ImageIcon className="w-6 h-6 text-accent" />
            Add Project Renderings
          </DialogTitle>
          <DialogDescription>Link multiple high-resolution images from Dropbox at once.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="space-y-4">
            {renderings.map((rendering, index) => (
              <div key={index} className="p-4 bg-secondary/20 rounded-xl border space-y-3 relative group animate-in fade-in duration-300">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Rendering #{index + 1}</span>
                  {renderings.length > 1 && (
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      onClick={() => handleRemoveRow(index)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Rendering Name</Label>
                    <Input 
                      placeholder="e.g. Front Elevation Night View" 
                      value={rendering.name} 
                      onChange={e => handleUpdateRendering(index, "name", e.target.value)} 
                      required 
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Dropbox Image URL</Label>
                    <div className="relative">
                      <LinkIcon className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                      <Input 
                        className="pl-10" 
                        placeholder="https://www.dropbox.com/..." 
                        value={rendering.url} 
                        onChange={e => handleUpdateRendering(index, "url", e.target.value)} 
                        required 
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-4">
            <Button 
              type="button" 
              variant="outline" 
              className="w-full border-dashed border-border text-foreground hover:bg-secondary"
              onClick={handleAddRow}
            >
              <PlusCircle className="w-4 h-4 mr-2" /> Add Another Rendering
            </Button>

            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-white h-12" disabled={loading}>
              <Save className="w-5 h-5 mr-2" /> {loading ? "Adding Renderings..." : `Save ${renderings.length} Rendering(s)`}
            </Button>
          </div>
          <p className="text-[10px] text-center text-muted-foreground">Tip: Ensure links are shared from Dropbox with view permissions.</p>
        </form>
      </DialogContent>
    </Dialog>
  );
}

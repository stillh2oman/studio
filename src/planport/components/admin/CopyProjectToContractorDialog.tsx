"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy, Loader2, Building2 } from "lucide-react";
import { useCollection, useMemoFirebase } from "@planport/firebase";
import { useDirectoryStore } from "@/firebase/use-directory-store";
import { PLANPORT_CLIENT_ROOT } from "@/lib/planport-project-paths";
import { copyClientProjectToContractor } from "@/lib/copy-client-project-to-contractor";
import { collection, query } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

interface CopyProjectToContractorDialogProps {
  clientId: string;
  clientDisplayName: string;
}

export function CopyProjectToContractorDialog({
  clientId,
  clientDisplayName,
}: CopyProjectToContractorDialogProps) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState<string>("");
  const [gcId, setGcId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const { directoryDb, contractorsCollection, planportDb } = useDirectoryStore();
  const { toast } = useToast();

  const projectsQuery = useMemoFirebase(
    () => query(collection(planportDb, PLANPORT_CLIENT_ROOT, clientId, "projects")),
    [planportDb, clientId]
  );
  const { data: projects, isLoading: projectsLoading } = useCollection(projectsQuery);

  const gcsQuery = useMemoFirebase(
    () => query(collection(directoryDb, contractorsCollection)),
    [directoryDb, contractorsCollection]
  );
  const { data: gcs, isLoading: gcsLoading } = useCollection(gcsQuery);

  const sortedProjects = useMemo(
    () =>
      (projects ?? [])
        .slice()
        .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)),
    [projects]
  );

  const sortedGcs = useMemo(
    () => (gcs ?? []).slice().sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)),
    [gcs]
  );

  const handleCopy = async () => {
    if (!projectId || !gcId) {
      toast({
        variant: "destructive",
        title: "Selection required",
        description: "Choose a project and a contractor.",
      });
      return;
    }

    setLoading(true);
    try {
      const { subdocumentsCopied } = await copyClientProjectToContractor(planportDb, {
        clientId,
        projectId,
        gcId,
        linkClientProjectToGc: true,
      });
      const gcName = sortedGcs.find((g) => g.id === gcId)?.name ?? "contractor";
      toast({
        title: "Project copied to contractor hub",
        description: `The client project is now on ${gcName}'s portal (${subdocumentsCopied} blueprint / file records copied). The private client hub is unchanged.`,
      });
      setOpen(false);
      setProjectId("");
      setGcId("");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Copy failed.";
      toast({ variant: "destructive", title: "Could not copy project", description: message });
    } finally {
      setLoading(false);
    }
  };

  const disabled =
    loading ||
    projectsLoading ||
    gcsLoading ||
    !sortedProjects.length ||
    !sortedGcs.length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between hover:bg-accent hover:text-accent-foreground bg-card border-dashed border-primary/40"
        >
          Copy project to contractor hub
          <Copy className="w-4 h-4 ml-2 shrink-0" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px] bg-background">
        <DialogHeader>
          <DialogTitle className="text-2xl text-primary flex items-center gap-2">
            <Building2 className="w-6 h-6 text-accent" />
            Share with contractor
          </DialogTitle>
          <DialogDescription>
            Copy a project from <span className="font-semibold text-foreground">{clientDisplayName}</span>
            &apos;s private hub to a general contractor portal. Blueprints, renderings, and Chief Architect
            files are duplicated; the client hub stays as-is. The client project is also linked to that
            contractor for your records.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {!sortedProjects.length && !projectsLoading ? (
            <p className="text-sm text-muted-foreground">
              This client has no projects yet. Add a project first, then copy it to a contractor.
            </p>
          ) : (
            <div className="space-y-2">
              <Label>Project to copy</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder={projectsLoading ? "Loading…" : "Select project"} />
                </SelectTrigger>
                <SelectContent>
                  {sortedProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name || p.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Contractor portal</Label>
            <Select value={gcId} onValueChange={setGcId}>
              <SelectTrigger>
                <SelectValue placeholder={gcsLoading ? "Loading…" : "Select contractor"} />
              </SelectTrigger>
              <SelectContent>
                {sortedGcs.map((gc) => (
                  <SelectItem key={gc.id} value={gc.id}>
                    {gc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!sortedGcs.length && !gcsLoading ? (
            <p className="text-sm text-destructive">Add a general contractor first.</p>
          ) : null}

          <Button
            type="button"
            className="w-full bg-primary hover:bg-primary/90 text-white h-11"
            disabled={disabled || !projectId || !gcId}
            onClick={() => void handleCopy()}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Copying…
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-2" />
                Copy to contractor portal
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

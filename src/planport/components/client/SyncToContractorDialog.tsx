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
import { RefreshCw, Loader2, Building2, Link2Off } from "lucide-react";
import { useCollection, useMemoFirebase, useFirestore } from "@planport/firebase";
import { useDirectoryStore } from "@/firebase/use-directory-store";
import { collection, query } from "firebase/firestore";
import {
  disableContractorProjectSync,
  enableContractorProjectSync,
} from "@/lib/contractor-project-sync";
import { useToast } from "@/hooks/use-toast";

interface SyncToContractorDialogProps {
  clientId: string;
  projectId: string;
  projectName: string;
  /** From live project document */
  contractorSyncEnabled?: boolean;
  syncedContractorId?: string | null;
}

export function SyncToContractorDialog({
  clientId,
  projectId,
  projectName,
  contractorSyncEnabled,
  syncedContractorId,
}: SyncToContractorDialogProps) {
  const [open, setOpen] = useState(false);
  const [gcId, setGcId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [stopLoading, setStopLoading] = useState(false);

  const db = useFirestore();
  const { directoryDb, contractorsCollection } = useDirectoryStore();
  const { toast } = useToast();

  const gcsQuery = useMemoFirebase(
    () => query(collection(directoryDb, contractorsCollection)),
    [directoryDb, contractorsCollection]
  );
  const { data: gcs, isLoading: gcsLoading } = useCollection(gcsQuery);

  const sortedGcs = useMemo(
    () => (gcs ?? []).slice().sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)),
    [gcs]
  );

  const linkedGcName = useMemo(() => {
    if (!syncedContractorId) return null;
    return sortedGcs.find((g) => g.id === syncedContractorId)?.name ?? syncedContractorId;
  }, [sortedGcs, syncedContractorId]);

  const handleEnable = async () => {
    if (!gcId) {
      toast({
        variant: "destructive",
        title: "Select a contractor",
        description: "Choose which contractor portal should receive this project.",
      });
      return;
    }
    setLoading(true);
    try {
      await enableContractorProjectSync(db, { clientId, projectId, gcId });
      const name = sortedGcs.find((g) => g.id === gcId)?.name ?? "contractor";
      toast({
        title: "Two-way sync enabled",
        description: `${projectName} matches ${name}'s portal — changes on either hub stay synced.`,
      });
      setOpen(false);
      setGcId("");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Could not enable sync.";
      toast({ variant: "destructive", title: "Sync failed", description: message });
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setStopLoading(true);
    try {
      await disableContractorProjectSync(db, clientId, projectId);
      toast({
        title: "Two-way sync stopped",
        description:
          "Neither hub will update the other automatically. Existing files on both sides are unchanged.",
      });
      setOpen(false);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Could not stop sync.";
      toast({ variant: "destructive", title: "Error", description: message });
    } finally {
      setStopLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between border-primary/30 text-primary hover:bg-primary/5"
        >
          <span className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 shrink-0" />
            Two-way contractor sync
          </span>
          {contractorSyncEnabled && (
            <span className="text-[10px] font-bold uppercase text-accent">On</span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px] bg-background">
        <DialogHeader>
          <DialogTitle className="text-2xl text-primary flex items-center gap-2">
            <Building2 className="w-6 h-6 text-accent" />
            Two-way contractor sync
          </DialogTitle>
          <DialogDescription>
            <span className="font-semibold text-foreground">{projectName}</span> — copy to the contractor portal,
            then keep <span className="font-semibold text-foreground">both hubs aligned</span>. Blueprints,
            renderings, project files, and project details sync when you save on{" "}
            <span className="font-medium">either</span> the private client hub or the contractor hub (last save
            wins if the same field is edited in both places).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {contractorSyncEnabled && linkedGcName ? (
            <div className="rounded-lg border bg-secondary/30 p-4 space-y-3">
              <p className="text-sm">
                Two-way sync with <span className="font-bold text-primary">{linkedGcName}</span>.
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full border-destructive/40 text-destructive hover:bg-destructive/10"
                disabled={stopLoading}
                onClick={() => void handleStop()}
              >
                {stopLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Link2Off className="w-4 h-4 mr-2" />
                )}
                Stop two-way sync
              </Button>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>{contractorSyncEnabled ? "Switch contractor (re-push everything)" : "Contractor portal"}</Label>
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
            <p className="text-sm text-destructive">Add a general contractor in Admin first.</p>
          ) : null}

          <Button
            type="button"
            className="w-full bg-primary hover:bg-primary/90 text-white h-11"
            disabled={loading || !gcId || gcsLoading}
            onClick={() => void handleEnable()}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Pushing…
              </>
            ) : contractorSyncEnabled ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Re-sync to selected contractor
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Enable two-way sync
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

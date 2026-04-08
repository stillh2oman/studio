"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2 } from "lucide-react";
import { useFirestore } from "@planport/firebase";
import { useToast } from "@/hooks/use-toast";
import { deletePrivateClientPlanportData } from "@/lib/contractor-project-sync";
import { PLANPORT_CLIENT_ROOT } from "@/lib/planport-project-paths";

type DeletePrivateClientButtonProps = {
  clientId: string;
  displayName: string;
  projectCount: number;
  onDeleted?: () => void;
};

export function DeletePrivateClientButton({
  clientId,
  displayName,
  projectCount,
  onDeleted,
}: DeletePrivateClientButtonProps) {
  const [loading, setLoading] = useState(false);
  const db = useFirestore();
  const { toast } = useToast();

  const handleDelete = async () => {
    setLoading(true);
    try {
      await deletePrivateClientPlanportData(db, clientId);
      toast({
        title: "Private client removed",
        description: `${displayName} and ${projectCount === 0 ? "their portfolio" : `all ${projectCount} project(s)`} were deleted from PlanPort.`,
      });
      onDeleted?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not delete this client.";
      toast({ variant: "destructive", title: "Delete failed", description: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete client
            </>
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-background">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-primary">Delete this private client?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span>
              This permanently removes <strong>{displayName}</strong> from{" "}
              <code className="text-xs font-mono">{PLANPORT_CLIENT_ROOT}</code>, including{" "}
              <strong>every project</strong> (blueprints, renderings, files, documents, and contract requests) and the
              client access profile.
            </span>
            <span className="block text-foreground/90">
              Linked contractor-hub copies of those projects are removed when the project record references a general
              contractor.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleDelete();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? "Deleting…" : "Delete client permanently"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

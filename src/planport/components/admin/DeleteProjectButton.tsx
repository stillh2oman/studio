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
import { deletePlanportProjectEverywhere } from "@/lib/contractor-project-sync";

export interface DeleteProjectButtonProject {
  id: string;
  name: string;
  individualClientId?: string | null;
  generalContractorId?: string | null;
}

interface DeleteProjectButtonProps {
  hubId: string;
  hubType?: "gc" | "client";
  project: DeleteProjectButtonProject;
  onDeleted?: () => void;
}

export function DeleteProjectButton({
  hubId,
  hubType = "gc",
  project,
  onDeleted,
}: DeleteProjectButtonProps) {
  const [loading, setLoading] = useState(false);
  const db = useFirestore();
  const { toast } = useToast();

  const handleDelete = async () => {
    setLoading(true);
    try {
      await deletePlanportProjectEverywhere(db, {
        hubType,
        hubId,
        projectId: project.id,
        individualClientId: project.individualClientId,
        generalContractorId: project.generalContractorId,
      });
      toast({
        title: "Project deleted",
        description: `"${project.name}" and its files were removed from PlanPort.`,
      });
      onDeleted?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not delete the project.";
      toast({ variant: "destructive", title: "Delete failed", description: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={(e) => e.stopPropagation()}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete project
            </>
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-background" onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-primary">Delete this project?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span>
              This permanently removes <strong>{project.name}</strong> from this hub, including all
              blueprints, renderings, and project file links stored in PlanPort.
            </span>
            {(project.individualClientId || project.generalContractorId) && (
              <span className="block text-foreground/90">
                If this project is also linked to the other hub (contractor or private client), that
                copy will be removed as well.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.stopPropagation();
              void handleDelete();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? "Deleting…" : "Delete permanently"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

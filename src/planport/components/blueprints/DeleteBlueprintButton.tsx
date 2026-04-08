
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
  AlertDialogTrigger 
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";
import { useFirestore } from "@planport/firebase";
import { doc, deleteDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import {
  syncClientProjectToContractorIfEnabled,
  syncGcProjectToClientIfEnabled,
} from "@/lib/contractor-project-sync";

interface DeleteBlueprintButtonProps {
  hubId: string;
  hubType?: "gc" | "client";
  projectId: string;
  blueprintId: string;
  blueprintName: string;
}

export function DeleteBlueprintButton({ 
  hubId, 
  hubType = "gc",
  projectId, 
  blueprintId, 
  blueprintName 
}: DeleteBlueprintButtonProps) {
  const [loading, setLoading] = useState(false);
  const db = useFirestore();
  const { toast } = useToast();

  const collectionPath = hubType === "gc" ? "generalContractors" : "individualClients";

  const handleDelete = async () => {
    setLoading(true);
    try {
      const blueprintRef = doc(db, collectionPath, hubId, "projects", projectId, "blueprints", blueprintId);
      await deleteDoc(blueprintRef);

      if (hubType === "client") {
        try {
          await syncClientProjectToContractorIfEnabled(db, hubId, projectId, "blueprints");
        } catch (mirrorErr: unknown) {
          const msg = mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr);
          toast({
            variant: "destructive",
            title: "Deleted here — contractor sync failed",
            description: msg,
          });
        }
      } else {
        try {
          await syncGcProjectToClientIfEnabled(db, hubId, projectId, "blueprints");
        } catch (mirrorErr: unknown) {
          const msg = mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr);
          toast({
            variant: "destructive",
            title: "Deleted here — client hub sync failed",
            description: msg,
          });
        }
      }
      
      toast({
        title: "Blueprint Deleted",
        description: `"${blueprintName}" has been removed from the project.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: error.message || "Could not delete the blueprint.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          title="Delete Blueprint"
          onClick={(e) => e.stopPropagation()}
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-background">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-primary">Permanent Deletion</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete <strong>{blueprintName}</strong>? This action cannot be undone and the file link will be removed from PlanPort.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? "Deleting..." : "Delete Permanently"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}


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
import { Plus, FileText, Save, Link as LinkIcon, Archive, Loader2, Bell, Check } from "lucide-react";
import { useFirestore } from "@planport/firebase";
import { doc, setDoc, collection, query, where, getDocs, writeBatch } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { sendBlueprintNotification } from "@/ai/flows/send-blueprint-notification";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";
import {
  emailsFromGcContacts,
  uniqueEmails,
} from "@/lib/notify-recipient-emails";
import {
  syncClientProjectToContractorIfEnabled,
  syncGcProjectToClientIfEnabled,
} from "@/lib/contractor-project-sync";

interface AddBlueprintDialogProps {
  hubId: string;
  hubType?: "gc" | "client";
  projectId: string;
  hubName: string;
  projectName: string;
  /** GC contractor contacts (emails). */
  contacts?: { email?: string | null }[];
  /** Client hub: primary + additional emails; merged with \`contacts\` for GC if provided. */
  notifyRecipientEmails?: string[];
  initialStatus?: "latest" | "archived";
  triggerClassName?: string;
}

export function AddBlueprintDialog({ 
  hubId, 
  hubType = "gc",
  projectId, 
  hubName, 
  projectName, 
  contacts = [], 
  notifyRecipientEmails = [],
  initialStatus = "latest",
  triggerClassName,
}: AddBlueprintDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [dropboxUrl, setDropboxUrl] = useState("");
  const [versionNumber, setVersionNumber] = useState("1");
  const [loading, setLoading] = useState(false);
  
  const db = useFirestore();
  const { toast } = useToast();

  const collectionPath = hubType === "gc" ? "generalContractors" : "individualClients";

  const resolveNotifyEmails = () =>
    uniqueEmails([
      ...notifyRecipientEmails,
      ...emailsFromGcContacts(contacts),
    ]);

  const handleAction = async (sendEmail: boolean) => {
    if (!name || !dropboxUrl) {
      toast({ variant: "destructive", title: "Missing Information", description: "Please provide a name and URL." });
      return;
    }

    const notifyEmails = sendEmail ? resolveNotifyEmails() : [];
    if (sendEmail && notifyEmails.length === 0) {
      toast({
        variant: "destructive",
        title: "No email on file",
        description:
          hubType === "client"
            ? "Add an email to this client profile (or an additional contact with email), then try again."
            : "Add contractor contacts with email and/or link a client record with an email.",
      });
      return;
    }

    setLoading(true);
    const baseId = name.toLowerCase().replace(/\s+/g, '-');
    const blueprintId = `${baseId}-v${versionNumber}-${Date.now().toString(36)}`;
    
    try {
      const blueprintRef = doc(db, collectionPath, hubId, "projects", projectId, "blueprints", blueprintId);
      const blueprintData = {
        id: blueprintId,
        name,
        projectId,
        dropboxFilePath: dropboxUrl,
        versionNumber: parseInt(versionNumber, 10),
        status: initialStatus,
        uploadedAt: new Date().toISOString()
      };

      if (initialStatus === "latest") {
        const blueprintsRef = collection(db, collectionPath, hubId, "projects", projectId, "blueprints");
        const q = query(blueprintsRef, where("status", "==", "latest"));
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        
        snapshot.docs.forEach((d) => {
          batch.update(d.ref, { status: "archived" });
        });
        
        batch.set(blueprintRef, blueprintData);
        try {
          await batch.commit();
        } catch (error: unknown) {
          errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: blueprintRef.path,
            operation: 'write',
            requestResourceData: blueprintData,
          }));
          throw error;
        }
      } else {
        try {
          await setDoc(blueprintRef, blueprintData);
        } catch (error: unknown) {
          errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: blueprintRef.path,
            operation: 'create',
            requestResourceData: blueprintData,
          }));
          throw error;
        }
      }

      if (hubType === "client") {
        try {
          await syncClientProjectToContractorIfEnabled(db, hubId, projectId, "blueprints");
        } catch (mirrorErr: unknown) {
          const msg = mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr);
          toast({
            variant: "destructive",
            title: "Blueprint saved — contractor sync failed",
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
            title: "Blueprint saved — client hub sync failed",
            description: msg,
          });
        }
      }
      
      if (sendEmail && notifyEmails.length > 0) {
        const result = await sendBlueprintNotification({
          hubDisplayName: hubName || "PlanPort",
          projectName,
          blueprintName: name,
          versionNumber: parseInt(versionNumber, 10),
          recipientEmails: notifyEmails,
        });
        if (!result.success) {
          toast({
            variant: "destructive",
            title: "Blueprint saved — email failed",
            description: result.message,
          });
          setOpen(false);
          resetForm();
          return;
        }
      }
      
      toast({ 
        title: sendEmail ? "Notification sent" : "Blueprint saved", 
        description: sendEmail 
          ? `${name} added and ${notifyEmails.length} recipient(s) emailed.`
          : `${name} has been successfully added to the folder.`
      });
      
      setOpen(false);
      resetForm();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Something went wrong.";
      toast({ variant: "destructive", title: "Action failed", description: msg });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName("");
    setDropboxUrl("");
    setVersionNumber("1");
  };

  const isArchive = initialStatus === "archived";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={isArchive ? "outline" : "default"}
          className={cn(
            isArchive ? "border-ledger-red text-ledger-red hover:bg-secondary" : "bg-accent text-accent-foreground hover:bg-accent/90",
            triggerClassName
          )}
        >
          {isArchive ? <Archive className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
          {isArchive ? "Upload to Archive" : "Upload Blueprint"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[450px] bg-background">
        <DialogHeader>
          <DialogTitle className="text-2xl text-primary flex items-center gap-2">
            {isArchive ? <Archive className="w-6 h-6 text-accent" /> : <FileText className="w-6 h-6 text-accent" />}
            {isArchive ? "Add to Archives" : "Register Blueprint"}
          </DialogTitle>
          <DialogDescription>
            {isArchive 
              ? "Add a historical version of a plan to the project archives." 
              : "Link a new .pdf from Dropbox to this project folder."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Blueprint Name</Label>
            <Input placeholder="e.g. Floor Plan - Level 1" value={name} onChange={e => setName(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label>Dropbox PDF URL</Label>
            <div className="relative">
              <LinkIcon className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Input className="pl-10" placeholder="https://www.dropbox.com/..." value={dropboxUrl} onChange={e => setDropboxUrl(e.target.value)} required />
            </div>
            <p className="text-[10px] text-muted-foreground">Ensure this is a shared link to the PDF file.</p>
          </div>

          <div className="space-y-2">
            <Label>Version Number</Label>
            <Input type="number" value={versionNumber} onChange={e => setVersionNumber(e.target.value)} required />
          </div>

          <div className="flex flex-col gap-3 pt-4">
            <Button 
              type="button" 
              className="w-full bg-primary hover:bg-primary/90 text-white h-12" 
              disabled={loading}
              onClick={() => handleAction(false)}
            >
              {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Check className="w-5 h-5 mr-2" />}
              {loading ? "Saving…" : isArchive ? "Save to Archive" : "Save Blueprint Only"}
            </Button>
            
            {!isArchive && (
              <Button 
                type="button" 
                variant="secondary"
                className="w-full bg-accent text-accent-foreground hover:bg-accent/80 h-12 font-bold" 
                disabled={loading}
                onClick={() => handleAction(true)}
              >
                {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Bell className="w-5 h-5 mr-2" />}
                {loading ? "Saving…" : `Notify ${hubType === 'gc' ? 'contacts' : 'client'}`}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


"use client";

import { useEffect, useState } from "react";
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
import { FolderPlus, Save, LayoutGrid, Loader2, ClipboardList } from "lucide-react";
import { useCollection, useMemoFirebase } from "@planport/firebase";
import { useAuth } from "@/firebase/provider";
import { useDirectoryStore } from "@/firebase/use-directory-store";
import { PLANPORT_CLIENT_ROOT, PLANPORT_GC_ROOT } from "@/lib/planport-project-paths";
import { doc, setDoc, collection, query, orderBy } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { useMirrorDropboxImageUrl } from "@planport/hooks/use-mirror-dropbox-image";
import { LedgerImportPanel } from "@planport/components/admin/LedgerImportPanel";
import {
  getOnboardingQuestionnaireSubmission,
  listOnboardingQuestionnaireSubmissions,
} from "@/ai/flows/onboarding-submissions-admin";
import { mapSubmissionToNewProjectPrefill } from "@/lib/onboarding-submission-map";
import type {
  OnboardingSubmissionListItem,
  ProjectOnboardingIntake,
} from "@/lib/onboarding-submission-types";

interface CreateProjectDialogProps {
  type?: "gc" | "client";
  parentId?: string;
  parentName?: string;
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

const MANUAL_SUBMISSION_VALUE = "__manual__";

function safeProjectIdSegment(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function CreateProjectDialog({ type, parentId, parentName }: CreateProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [address, setAddress] = useState("");
  const [designerName, setDesignerName] = useState("Jeff Dillon");
  const [renderingUrl, setRenderingUrl] = useState("");
  const [status, setStatus] = useState<string>("Draft Phase");
  const [saving, setSaving] = useState(false);

  const auth = useAuth();
  const [submissionRows, setSubmissionRows] = useState<OnboardingSubmissionListItem[]>([]);
  const [submissionsError, setSubmissionsError] = useState<string | null>(null);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string>(MANUAL_SUBMISSION_VALUE);
  const [loadingSubmission, setLoadingSubmission] = useState(false);
  const [intakeForProject, setIntakeForProject] = useState<ProjectOnboardingIntake | null>(null);

  // Selection state for dual-hub assignment
  const [gcId, setGcId] = useState<string>(type === "gc" ? parentId || "" : "");
  const [clientId, setClientId] = useState<string>(type === "client" ? parentId || "" : "");

  const { directoryDb, contractorsCollection, clientsCollection, planportDb } = useDirectoryStore();
  const { toast } = useToast();
  const mirrorDropboxImage = useMirrorDropboxImageUrl();

  const gcQuery = useMemoFirebase(
    () => query(collection(directoryDb, contractorsCollection), orderBy("name")),
    [directoryDb, contractorsCollection]
  );
  const { data: gcs } = useCollection(gcQuery);

  const clientQuery = useMemoFirebase(
    () => query(collection(directoryDb, clientsCollection), orderBy("husbandName")),
    [directoryDb, clientsCollection]
  );
  const { data: clients } = useCollection(clientQuery);

  const isClientHub = type === "client";

  useEffect(() => {
    if (!open || !isClientHub) return;
    let cancelled = false;
    (async () => {
      setSubmissionsError(null);
      try {
        const user = auth.currentUser;
        if (!user) {
          if (!cancelled) setSubmissionRows([]);
          return;
        }
        const idToken = await user.getIdToken();
        const result = await listOnboardingQuestionnaireSubmissions(idToken);
        if (cancelled) return;
        if ("error" in result) {
          setSubmissionsError(result.error);
          setSubmissionRows([]);
          return;
        }
        setSubmissionRows(result.items);
      } catch (e) {
        if (!cancelled) {
          setSubmissionsError(e instanceof Error ? e.message : "Could not load questionnaire submissions.");
          setSubmissionRows([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, isClientHub, auth]);

  const handleSubmissionSelect = async (value: string) => {
    setSelectedSubmissionId(value);
    if (value === MANUAL_SUBMISSION_VALUE) {
      setIntakeForProject(null);
      return;
    }
    setLoadingSubmission(true);
    try {
      const user = auth.currentUser;
      if (!user) return;
      const idToken = await user.getIdToken();
      const res = await getOnboardingQuestionnaireSubmission(idToken, value);
      if ("error" in res) {
        setSubmissionsError(res.error);
        return;
      }
      const pre = mapSubmissionToNewProjectPrefill(res.submission);
      setName(pre.projectName);
      setAddress(pre.projectAddress);
      setOwnerName(pre.ownerName);
      setIntakeForProject(pre.onboardingIntake);
      setSubmissionsError(null);
    } finally {
      setLoadingSubmission(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const base = safeProjectIdSegment(name) || "project";
    const projectId = `${base}-${Date.now().toString(36)}`;

    const nonGcValues = ["none", "unknown", "pending"];
    const isRealGc = gcId && !nonGcValues.includes(gcId);

    setSaving(true);
    try {
      const resolvedRendering = await mirrorDropboxImage(renderingUrl);
      const projectData: Record<string, unknown> = {
        id: projectId,
        name,
        ownerName,
        address,
        designerName,
        renderingUrl: resolvedRendering,
        status,
        generalContractorId: isRealGc ? gcId : (gcId === "none" ? null : gcId),
        individualClientId: clientId && clientId !== "none" ? clientId : null,
        createdAt: new Date().toISOString(),
      };
      if (intakeForProject) {
        projectData.onboardingIntake = intakeForProject;
      }

      if (isRealGc) {
        await setDoc(doc(planportDb, PLANPORT_GC_ROOT, gcId, "projects", projectId), projectData);
      }
      if (clientId && clientId !== "none") {
        await setDoc(doc(planportDb, PLANPORT_CLIENT_ROOT, clientId, "projects", projectId), projectData);
      }

      toast({ title: "Project Created", description: `${name} has been synchronized with the selected hubs.` });

      void (async () => {
        try {
          const user = auth.currentUser;
          if (!user) return;
          const idToken = await user.getIdToken();
          const r = await fetch("/api/quickbooks/match-invoice", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${idToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ projectId }),
          });
          if (!r.ok) return;
          const data = (await r.json()) as { matched?: boolean };
          if (data.matched) {
            toast({
              title: "QuickBooks invoice linked",
              description: "One open invoice matched the client billing email and was saved on this project.",
            });
          }
        } catch {
          /* QuickBooks is optional */
        }
      })();

      setOpen(false);
      resetForm();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({ variant: "destructive", title: "Creation Failed", description: message });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setName("");
    setOwnerName("");
    setAddress("");
    setRenderingUrl("");
    setIntakeForProject(null);
    setSelectedSubmissionId(MANUAL_SUBMISSION_VALUE);
    setSubmissionsError(null);
    if (type !== "gc") setGcId("");
    if (type === "client") {
      setClientId(parentId || "");
    } else {
      setClientId("");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          Add New Project
          <FolderPlus className="w-4 h-4 ml-2" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto bg-background">
        <DialogHeader>
          <DialogTitle className="text-2xl text-primary flex items-center gap-2">
            <LayoutGrid className="w-6 h-6 text-accent" />
            Add Building Project
          </DialogTitle>
          <DialogDescription>
            {isClientHub
              ? `Add a project for ${parentName ?? "this client"}. You can pre-fill fields from a saved onboarding questionnaire.`
              : "Define parameters and assign to contractor or client hubs."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {isClientHub ? (
            <div className="space-y-2 rounded-md border border-border bg-secondary p-4">
              <Label className="flex items-center gap-2 text-primary font-semibold text-sm">
                <ClipboardList className="h-4 w-4 shrink-0 text-accent" />
                Pre-fill from onboarding questionnaire (optional)
              </Label>
              <Select
                value={selectedSubmissionId}
                onValueChange={(v) => void handleSubmissionSelect(v)}
                disabled={loadingSubmission}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Choose a submitted questionnaire…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={MANUAL_SUBMISSION_VALUE}>None — enter manually</SelectItem>
                  {submissionRows.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.clientNames}
                      {s.status === "imported" ? " (imported)" : ""}
                      {s.submittedAtIso
                        ? ` · ${new Date(s.submittedAtIso).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {submissionsError ? (
                <p className="text-xs text-destructive leading-snug">{submissionsError}</p>
              ) : null}
              {loadingSubmission ? (
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading questionnaire…
                </p>
              ) : null}
              {intakeForProject ? (
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Questionnaire answers will be stored on this project for the client hub. Edit any field before
                  saving.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Project Name</Label>
              <Input placeholder="e.g. Lakeside Villa" value={name} onChange={e => setName(e.target.value)} required />
            </div>

            <div className="space-y-1">
              <Label>Project Address</Label>
              <Input placeholder="123 Maple St..." value={address} onChange={e => setAddress(e.target.value)} required />
            </div>

            <div className="space-y-1">
              <Label>Client / Owner Name (shown on hubs)</Label>
              <Input placeholder="e.g. John & Jane Miller" value={ownerName} onChange={e => setOwnerName(e.target.value)} />
              <LedgerImportPanel
                mode="client"
                className="mt-2"
                onApply={(m) => {
                  setOwnerName(
                    m.wifeName ? `${m.husbandName} & ${m.wifeName}` : m.husbandName
                  );
                  if (m.address) setAddress(m.address);
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Assigned Contractor</Label>
                <Select value={gcId} onValueChange={setGcId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select GC" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    {gcs?.map(gc => (
                      <SelectItem key={gc.id} value={gc.id}>{gc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Assigned Private Client</Label>
                <Select value={clientId} onValueChange={setClientId} disabled={isClientHub}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Client" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {clients?.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.husbandName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Lead Designer</Label>
              <Select onValueChange={setDesignerName} value={designerName}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a designer" />
                </SelectTrigger>
                <SelectContent>
                  {DESIGNERS.map(designer => (
                    <SelectItem key={designer} value={designer}>{designer}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Project Rendering URL (Optional)</Label>
              <Input
                placeholder="Dropbox link..."
                value={renderingUrl}
                onChange={e => setRenderingUrl(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Phase</Label>
              <Select onValueChange={setStatus} value={status}>
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

          <Button type="submit" disabled={saving} className="w-full bg-primary hover:bg-primary/90 text-white h-12 mt-6">
            <Save className="w-5 h-5 mr-2" /> Synchronize Project
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

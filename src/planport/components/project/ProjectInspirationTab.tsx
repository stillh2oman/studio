"use client";

import { useMemo, useState } from "react";
import { useAuth, useCollection, useMemoFirebase, useUser } from "@planport/firebase";
import { useDirectoryStore } from "@/firebase/use-directory-store";
import { PLANPORT_CLIENT_ROOT, PLANPORT_GC_ROOT } from "@/lib/planport-project-paths";
import { PLANPORT_INSPIRATION_SUBCOLLECTION } from "@/lib/planport-inspiration";
import { collection, deleteDoc, doc, orderBy, query } from "firebase/firestore";
import { submitProjectInspiration } from "@/ai/flows/submit-project-inspiration";
import {
  syncClientProjectToContractorIfEnabled,
  syncGcProjectToClientIfEnabled,
} from "@/lib/contractor-project-sync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ExternalLink, Loader2, Sparkles, Trash2, Link2 } from "lucide-react";

export type ProjectInspirationTabProps = {
  hubType: "client" | "gc";
  hubId: string;
  projectId: string;
  projectName: string;
  projectAddress?: string;
  hubDisplayLabel?: string;
  designerEmail?: string;
  isStaffDesigner: boolean;
  isTabActive: boolean;
};

type InspirationDoc = {
  id: string;
  kind?: string;
  url?: string;
  title?: string;
  fileName?: string;
  mimeType?: string;
  deliveredByEmail?: boolean;
  uploadedAt?: string;
  uploadedByLabel?: string;
};

const ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

function readFileAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read file."));
    r.readAsDataURL(file);
  });
}

export function ProjectInspirationTab({
  hubType,
  hubId,
  projectId,
  projectName,
  projectAddress,
  hubDisplayLabel,
  designerEmail,
  isStaffDesigner,
  isTabActive,
}: ProjectInspirationTabProps) {
  const auth = useAuth();
  const { user } = useUser();
  const { planportDb } = useDirectoryStore();
  const { toast } = useToast();

  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [submitting, setSubmitting] = useState<"link" | "file" | null>(null);

  const root = hubType === "client" ? PLANPORT_CLIENT_ROOT : PLANPORT_GC_ROOT;

  const inspirationQuery = useMemoFirebase(() => {
    if (!isTabActive || !projectId) return null;
    return query(
      collection(planportDb, root, hubId, "projects", projectId, PLANPORT_INSPIRATION_SUBCOLLECTION),
      orderBy("uploadedAt", "desc")
    );
  }, [planportDb, root, hubId, projectId, isTabActive]);

  const { data: rows, isLoading } = useCollection(inspirationQuery);

  const items = useMemo(() => (rows ?? []) as InspirationDoc[], [rows]);

  const getToken = async () => {
    const u = auth.currentUser;
    if (!u) return null;
    return u.getIdToken();
  };

  const runSubmit = async (
    submission: { kind: "link"; url: string; title?: string } | { kind: "file"; fileName: string; dataUri: string }
  ) => {
    const idToken = await getToken();
    if (!idToken) {
      toast({
        variant: "destructive",
        title: "Sign in required",
        description: "Refresh the page or open the hub from your invite link, then try again.",
      });
      return;
    }

    if (user?.isAnonymous) {
      if (!contactEmail.trim()) {
        toast({
          variant: "destructive",
          title: "Email needed",
          description: "Add your email so the design team can reply in Firm Chat.",
        });
        return;
      }
    }

    setSubmitting(submission.kind === "link" ? "link" : "file");
    try {
      const result = await submitProjectInspiration({
        idToken,
        hubType,
        hubId,
        projectId,
        projectName,
        projectAddress,
        hubDisplayLabel,
        designerEmail,
        optionalContactEmail: contactEmail.trim() || undefined,
        optionalContactName: contactName.trim() || undefined,
        submission,
      });

      if (!result.success) {
        toast({ variant: "destructive", title: "Could not save", description: result.message });
        return;
      }

      if (result.emailWarning) {
        toast({
          variant: "destructive",
          title: "Saved — email notice",
          description: `Inspiration is on the hub, but Firm Chat email failed: ${result.emailWarning}`,
        });
      } else {
        toast({
          title: "Inspiration added",
          description: isStaffDesigner
            ? "Saved to this project."
            : result.emailSent
              ? "The lead designer was notified via Firm Chat."
              : result.message,
        });
      }

      if (submission.kind === "link") {
        setLinkUrl("");
        setLinkTitle("");
      }
    } finally {
      setSubmitting(null);
    }
  };

  const handleAddLink = () => {
    void runSubmit({
      kind: "link",
      url: linkUrl.trim(),
      title: linkTitle.trim() || undefined,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const lower = file.name.toLowerCase();
    const ok =
      lower.endsWith(".pdf") ||
      lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg") ||
      lower.endsWith(".png");
    if (!ok) {
      toast({
        variant: "destructive",
        title: "Unsupported file",
        description: "Use a PDF, JPG, or PNG file.",
      });
      return;
    }

    void (async () => {
      let dataUri: string;
      try {
        dataUri = await readFileAsDataUri(file);
      } catch {
        toast({ variant: "destructive", title: "Read failed", description: "Could not read that file." });
        return;
      }
      await runSubmit({ kind: "file", fileName: file.name, dataUri });
    })();
  };

  const handleDelete = async (row: InspirationDoc) => {
    if (!isStaffDesigner) return;
    const label = row.kind === "link" ? row.url || "link" : row.fileName || "file";
    if (!confirm(`Remove this inspiration item?\n\n${label}`)) return;
    try {
      await deleteDoc(
        doc(
          planportDb,
          root,
          hubId,
          "projects",
          projectId,
          PLANPORT_INSPIRATION_SUBCOLLECTION,
          row.id
        )
      );
      try {
        if (hubType === "client") {
          await syncClientProjectToContractorIfEnabled(planportDb, hubId, projectId, "inspiration");
        } else {
          await syncGcProjectToClientIfEnabled(planportDb, hubId, projectId, "inspiration");
        }
      } catch (mirrorErr: unknown) {
        const msg = mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr);
        toast({
          variant: "destructive",
          title: "Removed here — sync failed",
          description: msg,
        });
        return;
      }
      toast({ title: "Removed" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ variant: "destructive", title: "Could not remove", description: msg });
    }
  };

  return (
    <div className="space-y-8">
      <div className="rounded-md border border-border bg-card p-4 sm:p-5 space-y-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-ledger-yellow shrink-0" />
            Share inspiration
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            Add website links or upload PDF / image references. When a client adds something new, the lead designer
            gets a <strong className="text-foreground/90 font-medium">Firm Chat</strong> email alert.
          </p>
        </div>

        {!user ? (
          <p className="text-sm text-muted-foreground">Open this hub with your access link or sign in to add items.</p>
        ) : (
          <>
            {user.isAnonymous ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="insp-contact-name">Your name (optional)</Label>
                  <Input
                    id="insp-contact-name"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="e.g. Alex Morgan"
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="insp-contact-email">Your email</Label>
                  <Input
                    id="insp-contact-email"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-3 rounded-md border border-border/80 bg-secondary/40 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Link2 className="w-4 h-4" />
                  Website link
                </div>
                <div className="space-y-2">
                  <Label htmlFor="insp-url">URL</Label>
                  <Input
                    id="insp-url"
                    type="url"
                    inputMode="url"
                    placeholder="https://…"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="insp-url-title">Label (optional)</Label>
                  <Input
                    id="insp-url-title"
                    placeholder="e.g. Kitchen palette"
                    value={linkTitle}
                    onChange={(e) => setLinkTitle(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  className="w-full sm:w-auto bg-primary text-primary-foreground"
                  disabled={!!submitting || !linkUrl.trim()}
                  onClick={() => void handleAddLink()}
                >
                  {submitting === "link" ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Add link"
                  )}
                </Button>
              </div>

              <div className="space-y-3 rounded-md border border-border/80 bg-secondary/40 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Sparkles className="w-4 h-4 text-ledger-yellow" />
                  File (PDF, JPG, PNG)
                </div>
                <p className="text-xs text-muted-foreground">
                  Files are attached to the Firm Chat email to your lead designer (max 12 MB).
                </p>
                <div>
                  <Input type="file" accept={ACCEPT} onChange={handleFileChange} disabled={!!submitting} />
                </div>
                {submitting === "file" ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Uploading…
                  </p>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="space-y-3">
        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">On this project</h4>
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-10 h-10 animate-spin text-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center bg-card rounded-md border border-dashed border-border text-center px-6">
            <Sparkles className="w-12 h-12 text-muted-foreground/25 mb-2" />
            <p className="text-muted-foreground text-sm">No inspiration yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((row) => (
              <Card key={row.id} className="p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <Sparkles className="w-8 h-8 text-ledger-yellow/90 shrink-0 mt-0.5" />
                  <div className="min-w-0 space-y-1">
                    {row.kind === "link" && row.url ? (
                      <>
                        <p className="font-semibold text-foreground truncate">
                          {row.title?.trim() || row.url}
                        </p>
                        {row.title?.trim() ? (
                          <p className="text-xs text-muted-foreground truncate">{row.url}</p>
                        ) : null}
                      </>
                    ) : (
                      <p className="font-semibold text-foreground truncate">{row.fileName || "File"}</p>
                    )}
                    {row.deliveredByEmail ? (
                      <p className="text-xs text-muted-foreground">
                        Delivered to the lead designer by email (Firm Chat).
                      </p>
                    ) : null}
                    <p className="text-[10px] text-muted-foreground">
                      {row.uploadedByLabel ? `${row.uploadedByLabel} · ` : ""}
                      {row.uploadedAt ? new Date(row.uploadedAt).toLocaleString() : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {row.kind === "link" && row.url ? (
                    <Button variant="outline" size="sm" asChild>
                      <a href={row.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4 mr-1" />
                        Open
                      </a>
                    </Button>
                  ) : null}
                  {isStaffDesigner ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => void handleDelete(row)}
                      aria-label="Remove inspiration"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

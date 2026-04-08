
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
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, User, Save, MapPin, Phone, Mail, Download, Users, Trash2, UserPlus, Loader2, LayoutGrid, ImageIcon, ClipboardList } from "lucide-react";
import { useCollection, useMemoFirebase } from "@planport/firebase";
import { useAuth } from "@/firebase/provider";
import {
  getOnboardingQuestionnaireSubmission,
  listOnboardingQuestionnaireSubmissions,
  markOnboardingSubmissionImported,
} from "@/ai/flows/onboarding-submissions-admin";
import { mapSubmissionToCreateClientPrefill } from "@/lib/onboarding-submission-map";
import type {
  OnboardingSubmissionListItem,
  ProjectOnboardingIntake,
} from "@/lib/onboarding-submission-types";
import { useDirectoryStore } from "@/firebase/use-directory-store";
import { PLANPORT_CLIENT_ROOT, PLANPORT_GC_ROOT } from "@/lib/planport-project-paths";
import { doc, setDoc, collection, query, orderBy } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { useMirrorDropboxImageUrl } from "@planport/hooks/use-mirror-dropbox-image";

interface AdditionalClient {
  name: string;
  email: string;
}

const MANUAL_SUBMISSION_VALUE = "__manual__";

export function CreateClientDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const auth = useAuth();

  const [submissionRows, setSubmissionRows] = useState<OnboardingSubmissionListItem[]>([]);
  const [submissionsError, setSubmissionsError] = useState<string | null>(null);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string>(MANUAL_SUBMISSION_VALUE);
  const [linkedSubmissionId, setLinkedSubmissionId] = useState<string | null>(null);
  const [intakeForProject, setIntakeForProject] = useState<ProjectOnboardingIntake | null>(null);
  const [loadingSubmission, setLoadingSubmission] = useState(false);
  
  // Client Identity
  const [husbandName, setHusbandName] = useState("");
  const [wifeName, setWifeName] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [email, setEmail] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [allowDownloads, setAllowDownloads] = useState(false);
  const [additionalClients, setAdditionalClients] = useState<AdditionalClient[]>([]);

  // Project Info
  const [projectName, setProjectName] = useState("");
  const [projectAddress, setProjectAddress] = useState("");
  const [renderingUrl, setRenderingUrl] = useState("");
  const [assignedGcId, setAssignedGcId] = useState<string>("none");
  
  const { directoryDb, contractorsCollection, clientsCollection, planportDb } = useDirectoryStore();
  const { toast } = useToast();
  const mirrorDropboxImage = useMirrorDropboxImageUrl();

  const gcQuery = useMemoFirebase(
    () => query(collection(directoryDb, contractorsCollection), orderBy("name")),
    [directoryDb, contractorsCollection]
  );
  const { data: gcs } = useCollection(gcQuery);

  useEffect(() => {
    if (!open) return;
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
  }, [open, auth]);

  const handleSubmissionSelect = async (value: string) => {
    setSelectedSubmissionId(value);
    if (value === MANUAL_SUBMISSION_VALUE) {
      setLinkedSubmissionId(null);
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
      if (res.submission.status === "imported") {
        setSubmissionsError("That questionnaire was already used to create a client. Pick another row or enter manually.");
        setSelectedSubmissionId(MANUAL_SUBMISSION_VALUE);
        setLinkedSubmissionId(null);
        setIntakeForProject(null);
        return;
      }
      const pre = mapSubmissionToCreateClientPrefill(res.submission, {
        privateClientQuestionnairePrefill: true,
      });
      setHusbandName(pre.husbandName);
      setWifeName(pre.wifeName);
      setEmail(pre.email);
      setPhone(pre.phone);
      setAdditionalClients(pre.additionalContacts);
      setProjectName(pre.projectName);
      setProjectAddress(pre.projectAddress);
      setAccessCode(pre.accessCodeSuggestion);
      setIntakeForProject(pre.onboardingIntake);
      setLinkedSubmissionId(res.submission.id);
      setSubmissionsError(null);
    } finally {
      setLoadingSubmission(false);
    }
  };

  const handleAddAdditionalClient = () => {
    setAdditionalClients([...additionalClients, { name: "", email: "" }]);
  };

  const handleUpdateAdditionalClient = (index: number, field: keyof AdditionalClient, value: string) => {
    const updated = [...additionalClients];
    updated[index][field] = value;
    setAdditionalClients(updated);
  };

  const handleRemoveAdditionalClient = (index: number) => {
    setAdditionalClients(additionalClients.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!husbandName || !accessCode || !projectName) {
      toast({ variant: "destructive", title: "Missing Fields", description: "Please provide a client name, access code, and project name." });
      return;
    }

    setLoading(true);

    const safeSlug = (str: string) => str.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
    const clientId = `${safeSlug(husbandName)}${wifeName ? `-${safeSlug(wifeName)}` : ""}-${Date.now().toString(36)}`;
    const normalizedCode = accessCode.trim().toUpperCase();
    const projectId = `${safeSlug(projectName)}-${Date.now().toString(36)}`;
    
    try {
      const now = new Date().toISOString();
      const clientRef = doc(directoryDb, clientsCollection, clientId);
      const clientPayload = {
        id: clientId,
        husbandName,
        wifeName: wifeName || null,
        accessCode: normalizedCode,
        address: projectAddress || null,
        email: email || null,
        billingEmail: billingEmail.trim() || null,
        phone: phone || null,
        allowDownloads,
        additionalContacts: additionalClients.filter((c) => c.name),
        createdAt: now,
        updatedAt: now,
        sourceApp: "planport"
      };

      await setDoc(clientRef, clientPayload);

      // Define special non-GC values
      const nonGcValues = ["none", "unknown", "pending"];
      const isRealGc = !nonGcValues.includes(assignedGcId);

      const resolvedRendering = await mirrorDropboxImage(renderingUrl);
      // 2. Create the Initial Project
      const projectData: Record<string, unknown> = {
        id: projectId,
        name: projectName,
        ownerName: wifeName ? `${husbandName} & ${wifeName}` : husbandName,
        address: projectAddress,
        status: "Draft Phase",
        individualClientId: clientId,
        generalContractorId: isRealGc ? assignedGcId : (assignedGcId === "none" ? null : assignedGcId),
        designerName: "Jeff Dillon",
        renderingUrl: resolvedRendering,
        createdAt: new Date().toISOString(),
      };
      if (intakeForProject) {
        projectData.onboardingIntake = intakeForProject;
      }

      await setDoc(doc(planportDb, PLANPORT_CLIENT_ROOT, clientId, "projects", projectId), projectData);

      if (isRealGc) {
        await setDoc(
          doc(planportDb, PLANPORT_GC_ROOT, assignedGcId, "projects", projectId),
          projectData
        );
      }

      let importNote = "";
      if (linkedSubmissionId && auth.currentUser) {
        try {
          const idToken = await auth.currentUser.getIdToken();
          const marked = await markOnboardingSubmissionImported(
            idToken,
            linkedSubmissionId,
            clientId,
            projectId
          );
          if ("error" in marked) {
            importNote = ` Note: the questionnaire row could not be marked as imported (${marked.error}).`;
          }
        } catch (markErr) {
          importNote = ` Note: could not mark the questionnaire row as imported (${markErr instanceof Error ? markErr.message : "unknown error"}).`;
        }
      }

      toast({
        title: "Client Successfully Created",
        description: `"${husbandName}" has been added to the PlanPort client database.${importNote}`,
      });
      
      setOpen(false);
      resetForm();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Onboarding Failed", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setHusbandName("");
    setWifeName("");
    setAccessCode("");
    setEmail("");
    setBillingEmail("");
    setPhone("");
    setAllowDownloads(false);
    setAdditionalClients([]);
    setProjectName("");
    setProjectAddress("");
    setRenderingUrl("");
    setAssignedGcId("none");
    setSelectedSubmissionId(MANUAL_SUBMISSION_VALUE);
    setLinkedSubmissionId(null);
    setIntakeForProject(null);
    setSubmissionsError(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-accent text-accent-foreground hover:bg-accent/90 h-14">
          <Plus className="w-5 h-5 mr-2" /> Add Private Client
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto bg-background">
        <DialogHeader>
          <DialogTitle className="text-2xl text-primary flex items-center gap-2">
            <User className="w-6 h-6 text-accent" />
            New Client Onboarding
          </DialogTitle>
          <DialogDescription>
            Register a private client and their first PlanPort project. When clients submit the onboarding
            questionnaire, responses are saved to PlanPort—use the dropdown below to pre-fill client and project
            fields from a pending submission before you complete onboarding.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-8 pt-4">
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
                {submissionRows
                  .filter((s) => s.status === "pending")
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.clientNames}
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
                Questionnaire answers will be attached to the first project so they appear on the client hub. Project
                address is pre-filled from street, city, and state only; enter a project name and hub access code
                yourself. You can edit any field before saving.
              </p>
            ) : null}
          </div>
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Users className="w-4 h-4" /> Client Identity
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Primary Client Name</Label>
                <Input placeholder="e.g. John Miller" value={husbandName} onChange={e => setHusbandName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Secondary Client (Optional)</Label>
                <Input placeholder="e.g. Jane Miller" value={wifeName} onChange={e => setWifeName(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Primary Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Input className="pl-10" type="email" placeholder="client@example.com" value={email} onChange={e => setEmail(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Primary Phone</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Input className="pl-10" placeholder="(555) 000-0000" value={phone} onChange={e => setPhone(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>QuickBooks billing email (optional)</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-10"
                  type="email"
                  placeholder="Defaults to primary email when empty"
                  value={billingEmail}
                  onChange={(e) => setBillingEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="text-sm font-medium">Additional Stakeholders</Label>
                <Button type="button" variant="ghost" size="sm" onClick={handleAddAdditionalClient} className="text-accent h-8">
                  <UserPlus className="w-4 h-4 mr-1" /> Add Person
                </Button>
              </div>
              {additionalClients.map((client, index) => (
                <div key={index} className="flex gap-2 items-start animate-in fade-in duration-200">
                  <Input 
                    placeholder="Name" 
                    value={client.name} 
                    onChange={e => handleUpdateAdditionalClient(index, "name", e.target.value)} 
                    className="flex-1"
                  />
                  <Input 
                    placeholder="Email" 
                    value={client.email} 
                    onChange={e => handleUpdateAdditionalClient(index, "email", e.target.value)} 
                    className="flex-1"
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveAdditionalClient(index)} className="text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <LayoutGrid className="w-4 h-4" /> Initial Project Details
            </h3>

            <div className="space-y-2">
              <Label>Project Name</Label>
              <Input placeholder="e.g. Miller Lakeside Villa" value={projectName} onChange={e => setProjectName(e.target.value)} required />
            </div>

            <div className="space-y-2">
              <Label>Project Address</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input className="pl-10" placeholder="123 Maple St, City, State" value={projectAddress} onChange={e => setProjectAddress(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Project Rendering URL (Optional)</Label>
              <div className="relative">
                <ImageIcon className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input 
                  className="pl-10" 
                  placeholder="Dropbox link to rendering image" 
                  value={renderingUrl} 
                  onChange={e => setRenderingUrl(e.target.value)} 
                />
              </div>
              <p className="text-[10px] text-muted-foreground">If left blank, a default Designer's Ink background will be used.</p>
            </div>

            <div className="space-y-2">
              <Label>Assigned General Contractor</Label>
              <Select value={assignedGcId} onValueChange={setAssignedGcId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a builder" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Owner-Builder / No GC</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  {gcs?.map(gc => (
                    <SelectItem key={gc.id} value={gc.id}>{gc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Plus className="w-4 h-4" /> Hub Access
            </h3>
            
            <div className="space-y-2">
              <Label>Hub Access Code</Label>
              <Input placeholder="e.g. MILLER-VILLA" value={accessCode} onChange={e => setAccessCode(e.target.value)} required />
              <p className="text-[10px] text-muted-foreground">Used for secure authentication by clients and trades.</p>
            </div>

            <div className="flex items-center justify-between p-4 bg-secondary rounded-md border border-dashed border-border">
              <div className="space-y-0.5">
                <Label className="text-sm font-bold flex items-center gap-2">
                  <Download className="w-4 h-4 text-accent" />
                  Permit PDF Downloads
                </Label>
                <p className="text-[10px] text-muted-foreground">Allows users in this hub to save PDF files locally.</p>
              </div>
              <Switch checked={allowDownloads} onCheckedChange={setAllowDownloads} />
            </div>
          </div>

          <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-white h-14" disabled={loading}>
            {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
            {loading ? "Registering Hub..." : "Complete Client Onboarding"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

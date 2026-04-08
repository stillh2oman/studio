"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/firebase/provider";
import { useCollection, useMemoFirebase } from "@planport/firebase";
import { useDirectoryStore } from "@/firebase/use-directory-store";
import { PLANPORT_CLIENT_ROOT } from "@/lib/planport-project-paths";
import { collection, query } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import {
  addContractTemplate,
  createContractForSignature,
  deleteContractTemplate,
  designerCompleteContract,
  getAdminOutboundContractView,
  listContractTemplates,
  listRecentOutboundContracts,
  installDefaultContractTemplate,
  type AdminContractViewPayload,
} from "@/ai/flows/planport-contracts-flow";
import { ContractAgreementHtmlFrame } from "@planport/components/contracts/ContractAgreementHtmlFrame";
import { getPlanportPublicAppUrl } from "@/lib/planport-public-url";
import { SignaturePad } from "@planport/components/contracts/SignaturePad";
import { Eye, FileText, Loader2, Plus, Send, Trash2, Link2, PenLine, RefreshCw } from "lucide-react";

const PDFViewer = dynamic(
  () =>
    import("@planport/components/blueprints/PDFViewer").then((mod) => ({
      default: mod.PDFViewer,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[min(60vh,480px)] items-center justify-center bg-card rounded-md border border-border">
        <Loader2 className="h-10 w-10 animate-spin text-accent" />
      </div>
    ),
  }
);

type DirectoryClient = {
  id: string;
  husbandName: string;
  wifeName?: string | null;
};

export function AdminContractsSection({ clients }: { clients: DirectoryClient[] }) {
  const auth = useAuth();
  const { toast } = useToast();
  const { planportDb } = useDirectoryStore();

  const [templates, setTemplates] = useState<
    {
      id: string;
      title: string;
      description?: string;
      templateKind: "html" | "pdf_form";
      pdfUrl: string;
      bodyHtmlPreview?: string;
      defaultSlug?: string;
      createdAt: string;
    }[]
  >([]);
  const [contracts, setContracts] = useState<
    {
      id: string;
      templateTitle: string;
      clientDisplayName: string;
      projectName: string;
      status: string;
      agreementDate: string;
      signToken: string;
      createdAt: string;
    }[]
  >([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [installingBuiltinSlug, setInstallingBuiltinSlug] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    setLoadingTemplates(true);
    try {
      const token = await user.getIdToken();
      const res = await listContractTemplates(token);
      if ("error" in res) {
        toast({ variant: "destructive", title: "Templates", description: res.error });
        return;
      }
      setTemplates(res.items);
    } finally {
      setLoadingTemplates(false);
    }
  }, [auth, toast]);

  const loadContracts = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    setLoadingContracts(true);
    try {
      const token = await user.getIdToken();
      const res = await listRecentOutboundContracts(token);
      if ("error" in res) {
        toast({ variant: "destructive", title: "Contracts", description: res.error });
        return;
      }
      setContracts(res.items);
    } finally {
      setLoadingContracts(false);
    }
  }, [auth, toast]);

  useEffect(() => {
    void loadTemplates();
    void loadContracts();
  }, [loadTemplates, loadContracts]);

  const [newTitle, setNewTitle] = useState("");
  const [newTemplateKind, setNewTemplateKind] = useState<"html" | "pdf_form">("pdf_form");
  const [newPdfUrl, setNewPdfUrl] = useState("");
  const [newBodyHtml, setNewBodyHtml] = useState("");
  const [newAcroFieldMapJson, setNewAcroFieldMapJson] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAddTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;
    setAdding(true);
    try {
      const token = await user.getIdToken();
      const res = await addContractTemplate(token, {
        templateKind: newTemplateKind,
        title: newTitle,
        ...(newTemplateKind === "pdf_form"
          ? {
              pdfUrl: newPdfUrl,
              ...(newAcroFieldMapJson.trim() ? { acroFieldMapJson: newAcroFieldMapJson } : {}),
            }
          : { bodyHtml: newBodyHtml }),
        ...(newDesc.trim() ? { description: newDesc } : {}),
      });
      if ("error" in res) {
        toast({ variant: "destructive", title: "Could not add template", description: res.error });
        return;
      }
      toast({ title: "Template added" });
      setNewTitle("");
      setNewPdfUrl("");
      setNewBodyHtml("");
      setNewAcroFieldMapJson("");
      setNewDesc("");
      await loadTemplates();
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("Delete this contract template?")) return;
    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    const res = await deleteContractTemplate(token, id);
    if ("error" in res) {
      toast({ variant: "destructive", title: "Delete failed", description: res.error });
      return;
    }
    toast({ title: "Template removed" });
    await loadTemplates();
  };

  const [sendOpen, setSendOpen] = useState(false);
  const [sendDialogContentEl, setSendDialogContentEl] = useState<HTMLDivElement | null>(null);
  const [sendClientId, setSendClientId] = useState<string>("");
  const [sendTemplateId, setSendTemplateId] = useState<string>("");
  const [sendDate, setSendDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sending, setSending] = useState(false);

  const projectsQuery = useMemoFirebase(
    () =>
      sendClientId
        ? query(collection(planportDb, PLANPORT_CLIENT_ROOT, sendClientId, "projects"))
        : null,
    [planportDb, sendClientId]
  );
  const { data: projects } = useCollection(projectsQuery);
  const [sendProjectId, setSendProjectId] = useState("");

  useEffect(() => {
    setSendProjectId("");
  }, [sendClientId]);

  const handleSendContract = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user || !sendTemplateId || !sendClientId || !sendProjectId) {
      toast({ variant: "destructive", title: "Fill all fields" });
      return;
    }
    setSending(true);
    try {
      const token = await user.getIdToken();
      const res = await createContractForSignature(token, {
        templateId: sendTemplateId,
        clientId: sendClientId,
        projectId: sendProjectId,
        agreementDate: sendDate,
      });
      if ("error" in res) {
        toast({ variant: "destructive", title: "Could not send", description: res.error });
        return;
      }
      toast({
        title: "Contract ready on hub",
        description: "The client will see this agreement on their project hub in PlanPort. Use Copy link if you need the signing URL elsewhere.",
      });
      setSendOpen(false);
      await loadContracts();
    } finally {
      setSending(false);
    }
  };

  const [designerDialogContractId, setDesignerDialogContractId] = useState<string | null>(null);
  const [designerSig, setDesignerSig] = useState<string | null>(null);
  const [designerSubmitting, setDesignerSubmitting] = useState(false);

  const submitDesigner = async () => {
    const user = auth.currentUser;
    if (!user || !designerDialogContractId || !designerSig) {
      toast({ variant: "destructive", title: "Sign in the box first." });
      return;
    }
    setDesignerSubmitting(true);
    try {
      const token = await user.getIdToken();
      const res = await designerCompleteContract(token, {
        contractId: designerDialogContractId,
        signaturePngDataUrl: designerSig,
      });
      if ("error" in res) {
        toast({ variant: "destructive", title: "Could not complete", description: res.error });
        return;
      }
      toast({
        title: "Contract filed",
        description: "Designer signature recorded. The document appears on the project Documents tab.",
      });
      setDesignerDialogContractId(null);
      setDesignerSig(null);
      await loadContracts();
    } finally {
      setDesignerSubmitting(false);
    }
  };

  const [viewContractId, setViewContractId] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const [viewPayload, setViewPayload] = useState<AdminContractViewPayload | null>(null);

  const openContractView = useCallback(
    async (contractId: string) => {
      setViewContractId(contractId);
      setViewPayload(null);
      setViewError(null);
      setViewLoading(true);
      const user = auth.currentUser;
      if (!user) {
        setViewLoading(false);
        setViewError("You must be signed in to view this contract.");
        return;
      }
      try {
        const token = await user.getIdToken();
        const res = await getAdminOutboundContractView(token, contractId);
        if ("error" in res) {
          setViewError(res.error);
          return;
        }
        setViewPayload(res.payload);
      } finally {
        setViewLoading(false);
      }
    },
    [auth]
  );

  const copySignLink = (token: string) => {
    const url = `${getPlanportPublicAppUrl()}/contract-sign/${token}`;
    void navigator.clipboard.writeText(url);
    toast({ title: "Link copied", description: "Paste elsewhere if the client needs the URL outside PlanPort." });
  };

  const handleInstallBuiltin = async (slug: string, label: string) => {
    const user = auth.currentUser;
    if (!user) return;
    setInstallingBuiltinSlug(slug);
    try {
      const token = await user.getIdToken();
      const res = await installDefaultContractTemplate(token, slug);
      if ("error" in res) {
        toast({ variant: "destructive", title: "Could not add template", description: res.error });
        return;
      }
      if (res.already) {
        toast({ title: "Already in list", description: `${label} is already installed.` });
        return;
      }
      toast({ title: "Template added", description: `${label} is now available when you send a contract.` });
      await loadTemplates();
    } finally {
      setInstallingBuiltinSlug(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold uppercase tracking-wide text-foreground">Contracts</h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Use a fillable PDF (AcroForm) or an HTML template with placeholders. PlanPort generates a pre-filled draft
            for the client, then after you countersign, produces a single executed PDF for the project Documents tab.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void loadContracts()} disabled={loadingContracts}>
          <RefreshCw className={loadingContracts ? "w-4 h-4 mr-2 animate-spin" : "w-4 h-4 mr-2"} />
          Refresh status
        </Button>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="border-primary/15">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-accent" />
              Contract templates
            </CardTitle>
            <CardDescription>
              <strong>PDF:</strong> Dropbox or HTTPS link to the form. Optional JSON maps AcroForm field names to
              variables:{" "}
              <code className="text-xs bg-secondary border border-border px-1 rounded">
                {`{"ClientName":"clientDisplayName","DateField":"agreementDate"}`}
              </code>
              . Keys are{" "}
              <code className="text-xs bg-secondary border border-border px-1 rounded">
                clientDisplayName, agreementDate, agreementDateLong, projectLocation, projectName, leadDesignerName,
                clientSignerName
              </code>
              . <strong>HTML:</strong> use the same keys as{" "}
              <code className="text-xs bg-secondary border border-border px-1 rounded">{`{{clientDisplayName}}`}</code> etc. The client sees a
              generated PDF; after both sign, signatures are burned into the final PDF.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-md border border-dashed border-border bg-secondary p-4 space-y-3">
              <p className="text-sm font-medium text-primary">Built-in agreements</p>
              <p className="text-xs text-muted-foreground">
                One-click add to your template list (safe to run again—it skips if already installed).
              </p>
              <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-2 justify-start"
                  disabled={!!installingBuiltinSlug}
                  onClick={() => void handleInstallBuiltin("commercial-design-service", "Commercial design agreement")}
                >
                  {installingBuiltinSlug === "commercial-design-service" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  Commercial — new construction
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-2 justify-start"
                  disabled={!!installingBuiltinSlug}
                  onClick={() =>
                    void handleInstallBuiltin(
                      "commercial-additions-remodels",
                      "Commercial additions & remodels agreement"
                    )
                  }
                >
                  {installingBuiltinSlug === "commercial-additions-remodels" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  Commercial — additions &amp; remodels
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-2 justify-start"
                  disabled={!!installingBuiltinSlug}
                  onClick={() =>
                    void handleInstallBuiltin(
                      "residential-new-construction",
                      "Residential new construction agreement"
                    )
                  }
                >
                  {installingBuiltinSlug === "residential-new-construction" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  Residential — new construction
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-2 justify-start"
                  disabled={!!installingBuiltinSlug}
                  onClick={() =>
                    void handleInstallBuiltin(
                      "residential-remodels-additions",
                      "Residential remodels & additions agreement"
                    )
                  }
                >
                  {installingBuiltinSlug === "residential-remodels-additions" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  Residential — remodels &amp; additions
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-2 justify-start"
                  disabled={!!installingBuiltinSlug}
                  onClick={() =>
                    void handleInstallBuiltin(
                      "digital-file-release-waiver",
                      "Digital file release & waiver"
                    )
                  }
                >
                  {installingBuiltinSlug === "digital-file-release-waiver" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  Digital file release (CAD/PDF)
                </Button>
              </div>
            </div>
            <form onSubmit={handleAddTemplate} className="space-y-3">
              <div className="space-y-2">
                <Label>Template type</Label>
                <RadioGroup
                  value={newTemplateKind}
                  onValueChange={(v) => setNewTemplateKind(v as "html" | "pdf_form")}
                  className="flex flex-wrap gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="pdf_form" id="tk_pdf" />
                    <Label htmlFor="tk_pdf" className="font-normal cursor-pointer">
                      Fillable PDF
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="html" id="tk_html" />
                    <Label htmlFor="tk_html" className="font-normal cursor-pointer">
                      HTML (placeholders)
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-1">
                <Label>Template title</Label>
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Design Agreement 2026" required />
              </div>
              {newTemplateKind === "pdf_form" ? (
                <>
                  <div className="space-y-1">
                    <Label>PDF URL</Label>
                    <Input
                      value={newPdfUrl}
                      onChange={(e) => setNewPdfUrl(e.target.value)}
                      placeholder="https://…"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>AcroForm field map (optional JSON)</Label>
                    <Textarea
                      value={newAcroFieldMapJson}
                      onChange={(e) => setNewAcroFieldMapJson(e.target.value)}
                      placeholder='{"Text1":"clientDisplayName","Text2":"agreementDate"}'
                      rows={3}
                      className="font-mono text-xs"
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-1">
                  <Label>Contract HTML</Label>
                  <Textarea
                    value={newBodyHtml}
                    onChange={(e) => setNewBodyHtml(e.target.value)}
                    placeholder="<p>Agreement between {{clientDisplayName}} and Designer's Ink…</p>"
                    rows={10}
                    className="font-mono text-xs min-h-[200px]"
                    required
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label>Notes (optional)</Label>
                <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="When to use this version" />
              </div>
              <Button type="submit" disabled={adding} className="gap-2">
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add template
              </Button>
            </form>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-primary">Saved templates</p>
                <Button type="button" variant="ghost" size="sm" onClick={() => void loadTemplates()} disabled={loadingTemplates}>
                  {loadingTemplates ? <Loader2 className="w-4 h-4 animate-spin" /> : "Reload"}
                </Button>
              </div>
              {templates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No templates yet.</p>
              ) : (
                <ul className="space-y-2">
                  {templates.map((t) => (
                    <li
                      key={t.id}
                      className="flex flex-wrap items-start justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-foreground flex flex-wrap items-center gap-2">
                          {t.title}
                          <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground border rounded px-1.5 py-0.5">
                            {t.templateKind === "html" ? "HTML" : "PDF"}
                          </span>
                          {t.defaultSlug ? (
                            <span className="text-[10px] uppercase tracking-wide font-semibold text-accent border border-accent/30 rounded px-1.5 py-0.5">
                              Built-in
                            </span>
                          ) : null}
                        </p>
                        {t.description ? <p className="text-xs text-muted-foreground">{t.description}</p> : null}
                        {t.templateKind === "pdf_form" && t.pdfUrl ? (
                          <a
                            href={t.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-accent underline break-all"
                          >
                            Open source PDF
                          </a>
                        ) : t.bodyHtmlPreview ? (
                          <p className="text-xs text-muted-foreground line-clamp-2">{t.bodyHtmlPreview}</p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive shrink-0"
                        onClick={() => void handleDeleteTemplate(t.id)}
                        aria-label={`Delete ${t.title}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/15">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Send className="w-5 h-5 text-accent" />
              Send for signature
            </CardTitle>
            <CardDescription>
              Chooses client and project from PlanPort, fills name / date / location from the database, and publishes
              the agreement to that project hub. The client sees it in PlanPort when they open the project—no email is
              sent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Dialog
              open={sendOpen}
              onOpenChange={(o) => {
                setSendOpen(o);
                if (!o) setSendDialogContentEl(null);
              }}
            >
              <DialogTrigger asChild>
                <Button className="w-full sm:w-auto bg-primary text-primary-foreground gap-2">
                  <Send className="w-4 h-4" />
                  New contract for client
                </Button>
              </DialogTrigger>
              <DialogContent ref={(el) => setSendDialogContentEl(el)} className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Send contract</DialogTitle>
                  <DialogDescription>
                    Select template, client, and project. The client is notified in-app on their project hub.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSendContract} className="space-y-4">
                  <div className="space-y-1">
                    <Label>Template</Label>
                    <Select value={sendTemplateId} onValueChange={setSendTemplateId} required>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose template" />
                      </SelectTrigger>
                      <SelectContent portalContainer={sendDialogContentEl ?? undefined}>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.title}
                            {t.templateKind === "html" ? " (HTML)" : " (PDF)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Client</Label>
                    <Select value={sendClientId} onValueChange={setSendClientId} required>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose client" />
                      </SelectTrigger>
                      <SelectContent portalContainer={sendDialogContentEl ?? undefined}>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.wifeName ? `${c.husbandName} & ${c.wifeName}` : c.husbandName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Project</Label>
                    <Select value={sendProjectId} onValueChange={setSendProjectId} disabled={!sendClientId} required>
                      <SelectTrigger>
                        <SelectValue placeholder={sendClientId ? "Choose project" : "Pick a client first"} />
                      </SelectTrigger>
                      <SelectContent portalContainer={sendDialogContentEl ?? undefined}>
                        {(projects ?? []).map((p: { id: string; name?: string }) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name || p.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Agreement date</Label>
                    <Input type="date" value={sendDate} onChange={(e) => setSendDate(e.target.value)} required />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={sending} className="w-full sm:w-auto">
                      {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Create for client hub
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/15">
        <CardHeader>
          <CardTitle className="text-lg">Recent contracts</CardTitle>
          <CardDescription>
            After the client signs in PlanPort, use <strong>Designer sign</strong> to countersign and file the executed
            PDF under the project Documents tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground text-center py-8">
                    No contracts yet.
                  </TableCell>
                </TableRow>
              ) : (
                contracts.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.templateTitle}</TableCell>
                    <TableCell>{row.clientDisplayName}</TableCell>
                    <TableCell>{row.projectName}</TableCell>
                    <TableCell>{row.agreementDate}</TableCell>
                    <TableCell>
                      <span
                        className={
                          row.status === "completed"
                            ? "text-green-700 font-medium"
                            : row.status === "client_signed"
                              ? "text-amber-700 font-medium"
                              : "text-muted-foreground"
                        }
                      >
                        {row.status === "awaiting_client"
                          ? "Awaiting client"
                          : row.status === "client_signed"
                            ? "Awaiting designer"
                            : row.status === "completed"
                              ? "Completed"
                              : row.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void openContractView(row.id)}
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          View
                        </Button>
                        {row.status === "awaiting_client" ? (
                          <Button type="button" variant="outline" size="sm" onClick={() => copySignLink(row.signToken)}>
                            <Link2 className="w-3.5 h-3.5 mr-1" />
                            Copy link
                          </Button>
                        ) : null}
                        {row.status === "client_signed" ? (
                          <Button
                            type="button"
                            size="sm"
                            className="bg-primary text-primary-foreground"
                            onClick={() => {
                              setDesignerSig(null);
                              setDesignerDialogContractId(row.id);
                            }}
                          >
                            <PenLine className="w-3.5 h-3.5 mr-1" />
                            Designer sign
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={viewContractId !== null}
        onOpenChange={(o) => {
          if (!o) {
            setViewContractId(null);
            setViewPayload(null);
            setViewError(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl w-[calc(100vw-1.5rem)] max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden sm:max-w-4xl">
          <div className="px-6 pt-6 pb-2 shrink-0 border-b bg-background">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle>Contract preview</DialogTitle>
              <DialogDescription>
                Draft agreement or fully executed PDF, depending on status. Matches what the client sees before
                completion, except completed items show the filed PDF.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="flex-1 min-h-0 flex flex-col px-6 py-4 overflow-hidden bg-background">
            {viewLoading ? (
              <div className="flex flex-1 min-h-[320px] items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-accent" />
              </div>
            ) : viewError ? (
              <p className="text-sm text-destructive py-4">{viewError}</p>
            ) : viewPayload ? (
              <div className="flex-1 min-h-0 rounded-lg border border-border overflow-hidden bg-background">
                {viewPayload.templateKind === "html" && viewPayload.bodyHtml ? (
                  <ContractAgreementHtmlFrame
                    title={viewPayload.templateTitle}
                    html={viewPayload.bodyHtml}
                    className="h-full min-h-[400px] max-h-[min(72vh,640px)] rounded-none border-0 shadow-none"
                    footerNote="Admin preview. When fully executed, the PDF on the project Documents tab is the official copy."
                  />
                ) : (
                  <div className="h-[min(72vh,640px)] min-h-[320px]">
                    <PDFViewer
                      url={viewPayload.pdfUrl}
                      title={viewPayload.templateTitle}
                      version="PREVIEW"
                      showPrintOrder={false}
                      showSubmitRevision={false}
                    />
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!designerDialogContractId} onOpenChange={(o) => !o && setDesignerDialogContractId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Designer signature</DialogTitle>
            <DialogDescription>
              Sign below to finalize this agreement. A fully executed PDF is added to the project Documents tab.
            </DialogDescription>
          </DialogHeader>
          <SignaturePad width={360} height={120} onChange={setDesignerSig} />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDesignerDialogContractId(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void submitDesigner()} disabled={designerSubmitting || !designerSig}>
              {designerSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Complete &amp; file
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

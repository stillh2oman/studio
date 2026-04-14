"use client";

import { useMemo, useState } from "react";
import { useLedgerData } from "@/hooks/use-ledger-data";
import { useUser } from "@/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  type PlanportLedgerImportPackageV1,
  mapPlanportExportToLedgerClientAndProject,
  tryParsePlanportLedgerImport,
} from "@/lib/handoff/planport-ledger/v1";
import {
  buildLedgerUpsertPatchesFromEnvelopeV2,
  isPlanportSyncEnvelopeV2,
  tryParsePlanportSyncEnvelopeV2,
  type PlanportLedgerSyncEnvelopeV2,
  type SyncDryRunReportV2,
} from "@/lib/handoff/planport-ledger/v2";

function norm(s: string | undefined | null) {
  return String(s ?? "").trim().toLowerCase();
}

function safeIdSegment(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function omitUndefined<T extends Record<string, unknown>>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function safeFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(file);
  });
}

export default function PlanportImportPage() {
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();

  const ledger = useLedgerData(user?.id);
  const clients = ledger.clients ?? [];
  const projects = ledger.projects ?? [];

  const [rawText, setRawText] = useState<string>("");
  const [pasteText, setPasteText] = useState<string>("");
  const [parsed, setParsed] = useState<PlanportLedgerImportPackageV1 | null>(null);
  const [parsedV2, setParsedV2] = useState<PlanportLedgerSyncEnvelopeV2 | null>(null);
  const [dryReportV2, setDryReportV2] = useState<SyncDryRunReportV2 | null>(null);
  const [usedFlexibleMapping, setUsedFlexibleMapping] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<"create" | "update">("create");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  const suggestedClientMatch = useMemo(() => {
    if (!parsed) return null;
    const accessCode = norm(parsed.client.accessCode);
    const email = norm(parsed.client.email);
    const name = norm(parsed.client.name);
    const phone = norm(parsed.client.phoneNumber);

    return (
      clients.find((c) => accessCode && norm(c.accessCode) === accessCode) ??
      clients.find((c) => email && norm(c.email) === email) ??
      clients.find((c) => name && norm(c.name) === name && (!phone || norm(c.phoneNumber) === phone)) ??
      null
    );
  }, [parsed, clients]);

  const suggestedProjectMatch = useMemo(() => {
    if (!parsed) return null;
    const name = norm(parsed.project.name);
    const address = norm(parsed.project.address);
    return (
      projects.find((p) => name && norm(p.name) === name && (!address || norm(p.address) === address)) ?? null
    );
  }, [parsed, projects]);

  const parseJsonText = (text: string) => {
    setParseError(null);
    const json = JSON.parse(text);
    if (isPlanportSyncEnvelopeV2(json)) {
      const v2 = tryParsePlanportSyncEnvelopeV2(json);
      if (!v2.ok) {
        setParseError(v2.error);
        return;
      }
      setParsedV2(v2.data);
      setParsed(null);
      setDryReportV2(null);
      setUsedFlexibleMapping(false);
      return;
    }
    const res = tryParsePlanportLedgerImport(json);
    if (!res.ok) {
      setParseError(res.error);
      return;
    }
    setParsed(res.data);
    setParsedV2(null);
    setDryReportV2(null);
    setUsedFlexibleMapping(res.usedFlexibleMapping);
  };

  const handleChooseFile = async (file: File | null) => {
    setParseError(null);
    setParsed(null);
    setParsedV2(null);
    setDryReportV2(null);
    setUsedFlexibleMapping(false);
    setRawText("");
    if (!file) return;
    try {
      const text = await safeFileText(file);
      setRawText(text);
      parseJsonText(text);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Invalid file.");
    }
  };

  const handleParsePaste = () => {
    setParseError(null);
    setParsed(null);
    setParsedV2(null);
    setDryReportV2(null);
    setUsedFlexibleMapping(false);
    setRawText("");
    const text = String(pasteText || "").trim();
    if (!text) {
      setParseError("Paste JSON from PlanPort first.");
      return;
    }
    try {
      setRawText(text);
      parseJsonText(text);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Invalid JSON.");
    }
  };

  const computeV2DryRun = (): SyncDryRunReportV2 | null => {
    if (!parsedV2) return null;
    const exC = clients.find((c) => c.externalId === parsedV2.client.externalId) ?? null;
    const exP = projects.find((p) => p.externalId === parsedV2.project.externalId) ?? null;
    return buildLedgerUpsertPatchesFromEnvelopeV2(parsedV2, exC, exP);
  };

  const handleDryRunV2 = () => {
    const rep = computeV2DryRun();
    if (!rep) return;
    setDryReportV2(rep);
    toast({
      title: "Dry run complete",
      description: `Client: ${rep.wouldCreateClient ? "create" : "update"}; project: ${rep.wouldCreateProject ? "create" : "update"}.`,
    });
  };

  const handleApplyV2 = () => {
    if (!parsedV2 || !ledger.dataRootId) {
      toast({ variant: "destructive", title: "Not ready", description: "Parse a v2 envelope first." });
      return;
    }
    const rep = computeV2DryRun();
    if (!rep) return;

    const exC = clients.find((c) => c.externalId === parsedV2.client.externalId) ?? null;
    const exP = projects.find((p) => p.externalId === parsedV2.project.externalId) ?? null;

    const clientPatch = omitUndefined(rep.clientPatch as Record<string, unknown>);
    const projectPatch = omitUndefined(rep.projectPatch as Record<string, unknown>);

    let clientId = exC?.id;
    if (!clientId) {
      const slug =
        safeIdSegment(parsedV2.client.externalId) || safeIdSegment(String(clientPatch.name || "client"));
      clientId = `${slug}-${Date.now().toString(36)}`;
      ledger.createClientWithId?.(clientId, { ...clientPatch, id: clientId } as any);
    } else {
      ledger.updateClient(clientId, clientPatch as any);
    }

    const projectIdExisting = exP?.id;
    if (!projectIdExisting) {
      const slug =
        safeIdSegment(parsedV2.project.externalId) || safeIdSegment(String(projectPatch.name || "project"));
      const projectId = `${slug}-${Date.now().toString(36)}`;
      ledger.createProjectWithId?.(projectId, {
        ...(projectPatch as object),
        clientId,
        id: projectId,
      } as any);
    } else {
      ledger.updateProject(projectIdExisting, { ...(projectPatch as object), clientId } as any);
    }

    setDryReportV2(rep);
    toast({
      title: "Import complete (v2)",
      description: "Upserted client and project by externalId.",
    });
  };

  const handleImport = async () => {
    if (!parsed) return;
    if (!ledger.dataRootId) {
      toast({ variant: "destructive", title: "Not ready", description: "Ledger data root is not loaded yet." });
      return;
    }

    const { client: clientPayload, project: projectPayload } =
      mapPlanportExportToLedgerClientAndProject(parsed);

    if (importMode === "create") {
      const clientId =
        safeIdSegment(clientPayload.accessCode || "") ||
        safeIdSegment(clientPayload.email || "") ||
        `${safeIdSegment(clientPayload.name)}-${Date.now().toString(36)}`;
      const projectId =
        `${safeIdSegment(projectPayload.name)}-${Date.now().toString(36)}`;

      ledger.createClientWithId?.(clientId, clientPayload);
      ledger.createProjectWithId?.(projectId, { ...projectPayload, clientId });

      toast({ title: "Import complete", description: "Client + project were created in Ledger." });
      setSelectedClientId(clientId);
      setSelectedProjectId(projectId);
      return;
    }

    // update mode (or follow-up for create): user must select ids explicitly
    const clientId = selectedClientId || suggestedClientMatch?.id || "";
    if (!clientId) {
      toast({ variant: "destructive", title: "Select a client", description: "Pick which Ledger client to update / attach." });
      return;
    }

    const projectId = selectedProjectId || suggestedProjectMatch?.id || "";

    // update client (safe: only provided fields)
    ledger.updateClient(clientId, clientPayload);

    if (projectId) {
      ledger.updateProject(projectId, { ...projectPayload, clientId });
    } else {
      ledger.addProject({ ...projectPayload, clientId });
    }

    toast({ title: "Import complete", description: "Client + project were imported into Ledger." });
  };

  if (isUserLoading) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle>Import from PlanPort</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Import from PlanPort</CardTitle>
          <Badge variant="outline">{parsedV2 ? "v2 sync" : "v1"}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="planportImportFile">PlanPort export JSON</Label>
            <Input
              id="planportImportFile"
              type="file"
              accept="application/json,.json"
              onChange={(e) => void handleChooseFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">
              Upload the official PlanPort export, v1 Ledger handoff, or a v2 sync envelope (
              <span className="font-mono">schemaVersion: 2</span>). v1 flexible parsing still applies when{" "}
              <span className="font-mono">exportVersion: 1</span>. See <span className="font-mono">SYNC_SCHEMA_PLAN.md</span>{" "}
              for field rules.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="planportImportPaste">Or paste JSON (recommended)</Label>
            <textarea
              id="planportImportPaste"
              className="w-full min-h-[140px] rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder='Paste the JSON from PlanPort "Copy JSON" here…'
            />
            <Button type="button" variant="outline" onClick={handleParsePaste}>
              Parse pasted JSON
            </Button>
            <p className="text-xs text-muted-foreground">
              This avoids downloading/uploading files between computers.
            </p>
          </div>

          {parseError ? (
            <Alert variant="destructive">
              <AlertTitle>Invalid import file</AlertTitle>
              <AlertDescription>{parseError}</AlertDescription>
            </Alert>
          ) : null}

          {parsedV2 ? (
            <div className="space-y-4">
              <Alert className="border-emerald-500/30 bg-emerald-500/5">
                <AlertTitle className="text-emerald-200">Sync envelope v2</AlertTitle>
                <AlertDescription className="text-xs text-muted-foreground space-y-2">
                  <p>
                    Client <span className="font-mono text-foreground">{parsedV2.client.externalId}</span> · Project{" "}
                    <span className="font-mono text-foreground">{parsedV2.project.externalId}</span>
                  </p>
                  <p>Run dry run first to see create/update and conflicts (Ledger wins on updates).</p>
                </AlertDescription>
              </Alert>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={handleDryRunV2}>
                  Dry run (v2)
                </Button>
                <Button type="button" onClick={() => void handleApplyV2()}>
                  Apply import (v2)
                </Button>
              </div>
              {dryReportV2 ? (
                <div className="rounded-md border border-border p-4 bg-card text-xs space-y-2 font-mono">
                  <div>wouldCreateClient: {String(dryReportV2.wouldCreateClient)}</div>
                  <div>wouldCreateProject: {String(dryReportV2.wouldCreateProject)}</div>
                  {dryReportV2.clientConflicts.length ? (
                    <div className="text-amber-200">client conflicts: {dryReportV2.clientConflicts.join(", ")}</div>
                  ) : null}
                  {dryReportV2.projectConflicts.length ? (
                    <div className="text-amber-200">project conflicts: {dryReportV2.projectConflicts.join(", ")}</div>
                  ) : null}
                  {dryReportV2.warnings.length ? (
                    <div className="text-muted-foreground">warnings: {dryReportV2.warnings.join(" | ")}</div>
                  ) : null}
                </div>
              ) : null}
              <details className="rounded-md border border-border p-4 bg-card">
                <summary className="cursor-pointer text-sm font-semibold">View raw JSON</summary>
                <pre className="mt-3 text-xs overflow-auto whitespace-pre-wrap break-words">{rawText}</pre>
              </details>
            </div>
          ) : null}

          {parsed ? (
            <div className="space-y-4">
              {usedFlexibleMapping ? (
                <Alert className="border-amber-500/40 bg-amber-500/5">
                  <AlertTitle className="text-amber-200">Flexible field mapping</AlertTitle>
                  <AlertDescription className="text-xs text-muted-foreground">
                    Strict PlanPort v1 shape did not validate; a normalized copy was built from common alias keys
                    (e.g. flat <span className="font-mono">projectName</span>, <span className="font-mono">clientName</span>
                    , root-level IDs). Review the preview below before importing.
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className="rounded-md border border-border p-4 bg-card">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2 items-center">
                    <Badge variant="secondary">Client</Badge>
                    <span className="font-semibold">{parsed.client.name}</span>
                    {parsed.client.accessCode ? (
                      <Badge className="font-mono" variant="outline">
                        {parsed.client.accessCode}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Project: <span className="text-foreground">{parsed.project.name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Source: {parsed.sourceRecordIds.planportHubPath}
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-border p-4 bg-card space-y-3">
                <div className="flex flex-wrap gap-3 items-center">
                  <Label className="text-xs">Mode</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant={importMode === "create" ? "default" : "outline"}
                    onClick={() => setImportMode("create")}
                  >
                    Create new
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={importMode === "update" ? "default" : "outline"}
                    onClick={() => setImportMode("update")}
                  >
                    Update / attach
                  </Button>
                </div>

                {suggestedClientMatch ? (
                  <p className="text-xs text-muted-foreground">
                    Suggested client match: <span className="text-foreground">{suggestedClientMatch.name}</span>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">No obvious client match detected.</p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Client to update/attach</Label>
                    <select
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={selectedClientId}
                      onChange={(e) => setSelectedClientId(e.target.value)}
                    >
                      <option value="">(auto / suggested)</option>
                      {clients
                        .slice()
                        .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.email ? `(${c.email})` : ""}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Project to update (optional)</Label>
                    <select
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={selectedProjectId}
                      onChange={(e) => setSelectedProjectId(e.target.value)}
                    >
                      <option value="">(create new)</option>
                      {projects
                        .slice()
                        .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                    {suggestedProjectMatch ? (
                      <p className="text-[11px] text-muted-foreground">
                        Suggested project match: <span className="text-foreground">{suggestedProjectMatch.name}</span>
                      </p>
                    ) : null}
                  </div>
                </div>

                <Button type="button" className="w-full" onClick={() => void handleImport()}>
                  Import into Ledger
                </Button>
              </div>

              <details className="rounded-md border border-border p-4 bg-card">
                <summary className="cursor-pointer text-sm font-semibold">View raw JSON</summary>
                <pre className="mt-3 text-xs overflow-auto whitespace-pre-wrap break-words">
                  {rawText}
                </pre>
              </details>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}


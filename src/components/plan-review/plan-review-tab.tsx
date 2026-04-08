"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useLedgerData } from "@/hooks/use-ledger-data";
import { cn } from "@/lib/utils";
import { PLAN_REVIEW_PROMPTS } from "@/lib/plan-review/prompts";
import type {
  PlanReviewCategoryId,
  PlanReviewProgressStep,
  PlanReviewPromptTemplate,
} from "@/lib/plan-review/types";
import type { PlanReviewStreamEvent } from "@/lib/plan-review/types";
import {
  FileText,
  Loader2,
  CheckCircle2,
  Circle,
  Download,
  ClipboardList,
  AlertCircle,
  Pencil,
} from "lucide-react";

const STEP_ORDER: { id: PlanReviewProgressStep; label: string }[] = [
  { id: "uploaded", label: "PDF uploaded" },
  { id: "converting", label: "PDF converting to high-resolution images" },
  { id: "perplexity", label: "Sending to Perplexity" },
  { id: "analysis", label: "Review complete" },
  { id: "report", label: "Report PDF generated" },
];

function stepIndex(step: PlanReviewProgressStep | null): number {
  if (!step) return -1;
  return STEP_ORDER.findIndex((s) => s.id === step);
}

function formatPlanReviewHttpFailure(status: number, bodyText: string, maxPdfMbServer: number): string {
  const t = bodyText.trim();
  const looksLikeGoogle502 =
    status === 502 && (t.includes("<!DOCTYPE html") || t.includes("Error 502") || t.includes("That’s an error."));
  if (looksLikeGoogle502) {
    const safeBelow = Math.max(1, Math.floor(maxPdfMbServer * 0.85));
    return [
      `Upstream gateway error (${status}).`,
      "This usually means the request never reached the app (common causes: PDF + form data exceeds the hosting/proxy request size limit, or the serverless instance crashed).",
      `Try a smaller PDF (aim below ~${safeBelow}MB because multipart uploads add overhead beyond the PDF file size), split the plan set, or temporarily omit the optional checklist attachment.`,
    ].join(" ");
  }
  if (status === 413) {
    return t || "Upload too large for the server/proxy. Reduce PDF size or split the plan set.";
  }
  if (status === 504) {
    return t || "Timed out upstream. Try fewer pages / a smaller PDF, then retry.";
  }
  return t || `Request failed (${status}).`;
}

export function PlanReviewTab({
  sessionEmployeeId = null,
  canEditPrompts = true,
}: {
  sessionEmployeeId?: string | null;
  canEditPrompts?: boolean;
}) {
  const { toast } = useToast();
  const {
    planReviewPrompts,
    savePlanReviewPrompts,
    resetPlanReviewPrompts,
    projects,
    checklistTemplate,
  } = useLedgerData(sessionEmployeeId);

  const [mainTab, setMainTab] = useState<"run" | "prompts">("run");
  /** Local copy for the prompts editor; forked when opening the Review prompts tab. */
  const [draftPrompts, setDraftPrompts] = useState<PlanReviewPromptTemplate[] | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [perplexityConfigured, setPerplexityConfigured] = useState(false);
  const [maxPdfMb, setMaxPdfMb] = useState(32);
  const [maxPages, setMaxPages] = useState(20);

  const [category, setCategory] = useState<PlanReviewCategoryId>("residential");
  const [templateId, setTemplateId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  /** When set, plan review includes that project's Ledger checklist in the model prompt and PDF. */
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [lastProgressStep, setLastProgressStep] = useState<PlanReviewProgressStep | null>(null);
  const [progressDetail, setProgressDetail] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const [reportBlobUrl, setReportBlobUrl] = useState<string | null>(null);
  const [lastMeta, setLastMeta] = useState<{
    fileName: string;
    pageCountSent: number;
    totalPdfPages: number;
    truncated: boolean;
    completedAtIso: string;
    usedTextFallback?: boolean;
    checklistProjectLabel?: string;
    checklistLineCount?: number;
  } | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const effectivePrompts = draftPrompts ?? planReviewPrompts;

  const promptsInCategory = useMemo(
    () => effectivePrompts.filter((p) => p.categoryId === category),
    [effectivePrompts, category],
  );

  const sortedProjects = useMemo(
    () =>
      [...(projects || [])].sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }),
      ),
    [projects],
  );

  const checklistBundleJson = useMemo(() => {
    // Always include the firm "Master Checklist Template" as a verification rubric.
    // If a project is selected, label the report with that project name.
    const p = selectedProjectId ? (projects || []).find((pr) => pr.id === selectedProjectId) : null;
    return JSON.stringify({
      projectLabel: (p?.name || "Master Checklist").slice(0, 200),
      template: checklistTemplate,
    });
  }, [selectedProjectId, projects, checklistTemplate]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/plan-review/config", { cache: "no-store" });
        const data = (await res.json()) as {
          perplexityConfigured?: boolean;
          limits?: { maxPdfMb?: number; maxPagesRasterized?: number };
          message?: string | null;
        };
        if (cancelled) return;
        setPerplexityConfigured(!!data.perplexityConfigured);
        if (typeof data.limits?.maxPdfMb === "number") setMaxPdfMb(data.limits.maxPdfMb);
        if (typeof data.limits?.maxPagesRasterized === "number") setMaxPages(data.limits.maxPagesRasterized);
      } catch {
        if (!cancelled) setPerplexityConfigured(false);
      } finally {
        if (!cancelled) setConfigLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const first = promptsInCategory[0]?.id ?? "";
    setTemplateId((prev) => {
      if (prev && promptsInCategory.some((p) => p.id === prev)) return prev;
      return first;
    });
  }, [promptsInCategory]);

  useEffect(() => {
    return () => {
      if (reportBlobUrl) URL.revokeObjectURL(reportBlobUrl);
      abortRef.current?.abort();
    };
  }, [reportBlobUrl]);

  const resetResult = useCallback(() => {
    setError(null);
    setLastProgressStep(null);
    setProgressDetail("");
    setLastMeta(null);
    if (reportBlobUrl) URL.revokeObjectURL(reportBlobUrl);
    setReportBlobUrl(null);
  }, [reportBlobUrl]);

  const onSubmit = async () => {
    resetResult();
    if (!perplexityConfigured) {
      setError(
        "Perplexity API key required. Add PERPLEXITY_API_KEY to your environment configuration.",
      );
      return;
    }
    if (!file) {
      toast({ variant: "destructive", title: "PDF required", description: "Choose a .pdf plan set." });
      return;
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast({ variant: "destructive", title: "Invalid file", description: "Only PDF files are accepted." });
      return;
    }
    if (!templateId) {
      toast({ variant: "destructive", title: "Select a review type", description: "Choose a prompt from the list." });
      return;
    }

    const maxBytes = maxPdfMb * 1024 * 1024;
    if (file.size > maxBytes) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: `Maximum size is ${maxPdfMb} MB.`,
      });
      return;
    }

    setBusy(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const selectedPrompt = effectivePrompts.find((p) => p.id === templateId);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("templateId", templateId);
    fd.append("notes", notes);
    if (selectedPrompt) {
      fd.append(
        "promptSnapshot",
        JSON.stringify({
          id: selectedPrompt.id,
          categoryId: selectedPrompt.categoryId,
          name: selectedPrompt.name,
          group: selectedPrompt.group,
          focusBody: selectedPrompt.focusBody,
        }),
      );
    }
    fd.append("checklistBundle", checklistBundleJson);

    try {
      const res = await fetch("/api/plan-review/run", {
        method: "POST",
        body: fd,
        signal: abortRef.current.signal,
      });

      if (res.headers.get("Content-Type")?.includes("application/json")) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error || `Request failed (${res.status})`);
      }

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        if (res.status === 503) {
          throw new Error(
            formatPlanReviewHttpFailure(res.status, errText) ||
              "Service unavailable (503). Confirm PERPLEXITY_API_KEY is set for the deployed environment, then retry.",
          );
        }
        if (res.status === 502) {
          throw new Error(formatPlanReviewHttpFailure(res.status, errText, maxPdfMb));
        }
        throw new Error(formatPlanReviewHttpFailure(res.status, errText, maxPdfMb));
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let ev: PlanReviewStreamEvent;
          try {
            ev = JSON.parse(trimmed) as PlanReviewStreamEvent;
          } catch {
            continue;
          }
          if (ev.type === "progress") {
            setLastProgressStep(ev.step);
            setProgressDetail(ev.detail || "");
          } else if (ev.type === "error") {
            throw new Error(ev.message || "Plan review failed.");
          } else if (ev.type === "complete") {
            const bytes = Uint8Array.from(atob(ev.reportPdfBase64), (c) => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: "application/pdf" });
            const url = URL.createObjectURL(blob);
            setReportBlobUrl((prev) => {
              if (prev) URL.revokeObjectURL(prev);
              return url;
            });
            setLastMeta(ev.meta);
            setLastProgressStep("report");
            toast({ title: "Plan review complete", description: "Your report PDF is ready." });
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setError("Cancelled.");
      } else {
        const msg = e instanceof Error ? e.message : "Plan review failed.";
        setError(msg);
        toast({ variant: "destructive", title: "Plan review failed", description: msg });
      }
    } finally {
      setBusy(false);
    }
  };

  const progressIdx = stepIndex(lastProgressStep);

  const selectedPromptForEdit = useMemo(() => {
    const list = draftPrompts ?? planReviewPrompts;
    return list.find((p) => p.id === templateId) ?? null;
  }, [draftPrompts, planReviewPrompts, templateId]);

  const patchPrompt = useCallback(
    (patch: Partial<PlanReviewPromptTemplate>) => {
      if (!templateId) return;
      setDraftPrompts((prev) => {
        const base = prev ?? [...planReviewPrompts];
        return base.map((p) => (p.id === templateId ? { ...p, ...patch } : p));
      });
    },
    [planReviewPrompts, templateId],
  );

  const handleSavePrompts = () => {
    const toSave = draftPrompts;
    if (!toSave) {
      toast({ title: "Nothing to save", description: "Open the Review prompts tab first." });
      return;
    }
    savePlanReviewPrompts(toSave);
    toast({ title: "Prompts saved", description: "This firm will use these texts for new plan reviews." });
  };

  const handleResetPrompts = () => {
    if (
      !window.confirm(
        "Remove saved prompts and restore the built-in defaults for this firm? This cannot be undone from here except by re-saving.",
      )
    ) {
      return;
    }
    resetPlanReviewPrompts();
    setDraftPrompts([...PLAN_REVIEW_PROMPTS]);
    toast({ title: "Defaults restored", description: "Built-in review prompts are active again." });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="space-y-1">
        <h3 className="text-lg font-headline font-bold text-white flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" /> Plan Review
        </h3>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Upload an architectural PDF plan set, pick a review focus, and get an AI-assisted report. The server rasterizes
          pages (first {maxPages} sheets), sends images to Perplexity, then builds a downloadable PDF. Large sets take
          longer.
        </p>
      </div>

      {!configLoaded ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking configuration…
        </div>
      ) : null}

      {configLoaded && !perplexityConfigured ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Perplexity API key required</AlertTitle>
          <AlertDescription>
            Add <code className="text-xs bg-muted px-1 rounded">PERPLEXITY_API_KEY</code> to your environment
            configuration (e.g. <code className="text-xs bg-muted px-1 rounded">.env.local</code> for local dev, or your
            hosting provider secrets). Restart the app after adding it.
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs
        value={mainTab}
        onValueChange={(v) => {
          const next = v as "run" | "prompts";
          setMainTab(next);
          if (next === "prompts") {
            setDraftPrompts((d) => d ?? [...planReviewPrompts]);
          }
        }}
        className="w-full"
      >
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="run">Run review</TabsTrigger>
          <TabsTrigger value="prompts" className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" /> Review prompts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="run" className="mt-4 space-y-6">
          <Card className="border-border/50 bg-card/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-headline flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> New review
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Plan set (PDF only)</Label>
                  <InputFile
                    accept="application/pdf,.pdf"
                    disabled={busy}
                    onFile={(f) => setFile(f)}
                  />
                  {file ? (
                    <p className="text-xs text-muted-foreground">
                      {file.name} · {(file.size / (1024 * 1024)).toFixed(2)} MB · max {maxPdfMb} MB
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">PDF only. Many pages may take several minutes.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={category}
                    onValueChange={(v) => setCategory(v as PlanReviewCategoryId)}
                    disabled={busy}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="residential">Residential plan review</SelectItem>
                      <SelectItem value="commercial">Commercial plan review</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Checklist verification (Master Checklist)</Label>
                <Select
                  value={selectedProjectId ?? "none"}
                  onValueChange={(v) => setSelectedProjectId(v === "none" ? null : v)}
                  disabled={busy}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="No project — Master Checklist only" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[280px]">
                    <SelectItem value="none">No project — Master Checklist only</SelectItem>
                    {sortedProjects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name || p.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  The model verifies each Master Checklist item against the plan set itself (not completion checkmarks) and
                  includes evidence (sheet/page refs) for verified/missing/unclear/conflicting items.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Review prompt</Label>
                <Select value={templateId} onValueChange={setTemplateId} disabled={busy}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a review type" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[280px]">
                    {promptsInCategory.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Optional additional instructions</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={busy}
                  placeholder="e.g. Focus on stair to basement; project is in Oklahoma; AHJ uses 2021 IRC…"
                  className="min-h-[88px] resize-y"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void onSubmit()} disabled={busy || !perplexityConfigured}>
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing…
                    </>
                  ) : (
                    "Submit for analysis"
                  )}
                </Button>
                {busy ? (
                  <Button type="button" variant="outline" onClick={() => abortRef.current?.abort()}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-headline">Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-2">
                {STEP_ORDER.map((s, i) => {
                  const done =
                    reportBlobUrl || (progressIdx >= 0 && i < progressIdx);
                  const current =
                    !reportBlobUrl && busy && progressIdx >= 0 && i === progressIdx;
                  const pending = !done && !current;
                  return (
                    <li key={s.id} className="flex items-start gap-2 text-sm">
                      {done ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      ) : current ? (
                        <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      )}
                      <span
                        className={cn(
                          pending && "text-muted-foreground/70",
                          current && "text-white font-medium",
                          done && "text-muted-foreground",
                        )}
                      >
                        {s.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {progressDetail ? (
                <p className="text-xs text-muted-foreground border-t border-border/40 pt-2">{progressDetail}</p>
              ) : null}
              {error ? (
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>

          {reportBlobUrl ? (
            <Card className="border-border/50 bg-card/30 overflow-hidden">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2">
                <CardTitle className="text-base font-headline">Report</CardTitle>
                <Button variant="outline" size="sm" className="gap-2 shrink-0" asChild>
                  <a
                    href={reportBlobUrl}
                    download={
                      lastMeta
                        ? `plan-review-${lastMeta.fileName.replace(/\.pdf$/i, "")}-${lastMeta.completedAtIso.slice(0, 10)}.pdf`
                        : "plan-review-report.pdf"
                    }
                  >
                    <Download className="h-4 w-4" /> Download PDF
                  </a>
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {lastMeta?.usedTextFallback ? (
                  <p className="text-xs text-sky-600 dark:text-sky-400 px-4 py-2 bg-sky-500/10 border-b border-border/40">
                    This run used <strong className="font-semibold">extracted PDF text</strong> instead of plan images
                    because image conversion is not available on this server. Scanned/image-only PDFs may produce thin
                    results — use vector PDFs when possible, or deploy with native canvas support for full visual review.
                  </p>
                ) : null}
                {lastMeta?.truncated ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400 px-4 py-2 bg-amber-500/10 border-b border-border/40">
                    Only the first {lastMeta.pageCountSent} of {lastMeta.totalPdfPages} pages were analyzed. Split very large
                    sets or prioritize sheets for full coverage.
                  </p>
                ) : null}
                {lastMeta?.checklistProjectLabel != null &&
                lastMeta.checklistLineCount != null ? (
                  <p className="text-xs text-muted-foreground px-4 py-2 bg-muted/30 border-b border-border/40">
                    Checklist context: <span className="font-medium text-foreground">{lastMeta.checklistProjectLabel}</span>
                    {" — "}
                    {lastMeta.checklistLineCount} checklist line(s) included as a plan-set verification rubric (see PDF section).
                  </p>
                ) : null}
                <iframe
                  title="Plan review report PDF"
                  src={reportBlobUrl}
                  className="w-full min-h-[520px] md:min-h-[720px] border-0 bg-muted/20"
                />
              </CardContent>
            </Card>
          ) : !busy && configLoaded && perplexityConfigured ? (
            <Card className="border-dashed border-border/60 bg-muted/5">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Run a review to see the report preview here.
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="prompts" className="mt-4 space-y-4">
          <Card className="border-border/50 bg-card/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-headline">Prompt library</CardTitle>
              <p className="text-sm text-muted-foreground font-normal">
                Prompts are saved per firm in Firestore. The Run review tab uses the same library; when you edit here, those
                changes apply to new runs immediately, and Save stores them for next session. Each submit sends the current
                focus text to the server.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as PlanReviewCategoryId)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="residential">Residential</SelectItem>
                      <SelectItem value="commercial">Commercial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Prompt</Label>
                  <Select value={templateId} onValueChange={setTemplateId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a prompt" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[280px]">
                      {promptsInCategory.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedPromptForEdit ? (
                <div className="space-y-3 border-t border-border/40 pt-4">
                  <p className="text-xs text-muted-foreground font-mono">id: {selectedPromptForEdit.id}</p>
                  <div className="space-y-2">
                    <Label>Display name</Label>
                    <Input
                      value={selectedPromptForEdit.name}
                      onChange={(e) => patchPrompt({ name: e.target.value })}
                      readOnly={!canEditPrompts}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Group label</Label>
                    <Input
                      value={selectedPromptForEdit.group}
                      onChange={(e) => patchPrompt({ group: e.target.value })}
                      readOnly={!canEditPrompts}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Focus instructions (sent to the model)</Label>
                    <Textarea
                      value={selectedPromptForEdit.focusBody}
                      onChange={(e) => patchPrompt({ focusBody: e.target.value })}
                      readOnly={!canEditPrompts}
                      className="min-h-[200px] resize-y font-mono text-sm"
                    />
                  </div>
                </div>
              ) : null}

              {canEditPrompts ? (
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button type="button" variant="default" onClick={handleSavePrompts}>
                    Save all prompts
                  </Button>
                  <Button type="button" variant="outline" onClick={handleResetPrompts}>
                    Reset to built-in defaults
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground pt-2">
                  You can view prompts here. Editing and saving require Toolset calculator access.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InputFile({
  accept,
  disabled,
  onFile,
}: {
  accept: string;
  disabled?: boolean;
  onFile: (f: File | null) => void;
}) {
  return (
    <input
      type="file"
      accept={accept}
      disabled={disabled}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:mr-3 file:rounded file:border-0 file:bg-primary/15 file:px-3 file:py-1 file:text-xs file:font-bold file:text-primary"
      onChange={(e) => {
        const f = e.target.files?.[0] ?? null;
        onFile(f);
        e.target.value = "";
      }}
    />
  );
}

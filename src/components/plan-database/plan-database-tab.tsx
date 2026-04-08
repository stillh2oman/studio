"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLedgerData } from "@/hooks/use-ledger-data";
import { useFirestore, setDocumentNonBlocking, deleteDocumentNonBlocking } from "@/firebase";
import { doc } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { dropboxImgSrc } from "@/lib/dropbox-utils";
import type { PlanDatabaseRecord } from "@/lib/plan-database/types";
import { AlertCircle, Download, RefreshCw, Search, Settings, ArrowUpDown, ImageIcon, ExternalLink, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type SortDir = "asc" | "desc";
type SortKey =
  | "projectName"
  | "clientName"
  | "designerName"
  | "heatedSqftToFrame"
  | "bedrooms"
  | "bathrooms"
  | "floors"
  | "hasBasement"
  | "hasBonusRoom"
  | "garageCars"
  | "overallWidth"
  | "overallDepth"
  | "lastSynced";

type SortState = { key: SortKey; dir: SortDir } | null;

function stableDocIdFromDropboxPath(pathLower: string): string {
  // Firestore doc ids cannot contain '/', so use base64url.
  const bytes = new TextEncoder().encode(pathLower);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function boolToYesNo(v: boolean | null | undefined) {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "—";
}

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes("\n") || s.includes("\"")) return `"${s.replaceAll("\"", "\"\"")}"`;
  return s;
}

function parseNdjsonLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split("\n");
  const rest = parts.pop() || "";
  return { lines: parts, rest };
}

function pruneUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => pruneUndefined(v)) as any;
  }
  if (value && typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) {
      if (v === undefined) continue;
      out[k] = pruneUndefined(v);
    }
    return out;
  }
  return value;
}

function renderingDisplaySrc(linkOrPath: string): string {
  const t = String(linkOrPath || "").trim();
  if (!t) return "";
  if (t.startsWith("/")) {
    return `/api/dropbox/proxy-download?path=${encodeURIComponent(t)}`;
  }
  return dropboxImgSrc(t);
}

function normalizeDropboxPathInput(raw: string): string {
  const t = String(raw || "").trim();
  if (!t) return "";
  if (t === "/") return "";
  return t.startsWith("/") ? t : `/${t}`;
}

function normalizeRecordFromSync(raw: any): PlanDatabaseRecord {
  return {
    id: "",
    dropboxFolderPath: String(raw?.dropboxFolderPath || "").trim(),
    dropboxFolderLink: typeof raw?.dropboxFolderLink === "string" ? raw.dropboxFolderLink : undefined,
    planPdfPath: typeof raw?.planPdfPath === "string" ? raw.planPdfPath : undefined,
    planPdfRev: typeof raw?.planPdfRev === "string" ? raw.planPdfRev : undefined,
    planPdfModified: typeof raw?.planPdfModified === "string" ? raw.planPdfModified : undefined,
    planPdfSharedLink: typeof raw?.planPdfSharedLink === "string" ? raw.planPdfSharedLink : undefined,
    projectName: raw?.projectName ?? null,
    clientName: raw?.clientName ?? null,
    designerName: raw?.designerName ?? null,
    heatedSqftToFrame: typeof raw?.heatedSqftToFrame === "number" ? raw.heatedSqftToFrame : raw?.heatedSqftToFrame ?? null,
    bedrooms: typeof raw?.bedrooms === "number" ? raw.bedrooms : raw?.bedrooms ?? null,
    bathrooms: typeof raw?.bathrooms === "number" ? raw.bathrooms : raw?.bathrooms ?? null,
    floors: typeof raw?.floors === "number" ? raw.floors : raw?.floors ?? null,
    hasBasement: typeof raw?.hasBasement === "boolean" ? raw.hasBasement : raw?.hasBasement ?? null,
    hasBonusRoom: typeof raw?.hasBonusRoom === "boolean" ? raw.hasBonusRoom : raw?.hasBonusRoom ?? null,
    garageCars: typeof raw?.garageCars === "number" ? raw.garageCars : raw?.garageCars ?? null,
    overallWidth: raw?.overallWidth ?? null,
    overallDepth: raw?.overallDepth ?? null,
    renderingLinks: Array.isArray(raw?.renderingLinks) ? raw.renderingLinks.filter((x: any) => typeof x === "string") : [],
    thumbnailUrl: raw?.thumbnailUrl ?? null,
    needsReview: !!raw?.needsReview,
    missingFields: Array.isArray(raw?.missingFields) ? raw.missingFields.filter((x: any) => typeof x === "string") : [],
    extractionError: typeof raw?.extractionError === "string" ? raw.extractionError : null,
    lastSynced: typeof raw?.lastSynced === "string" ? raw.lastSynced : undefined,
  };
}

export function PlanDatabaseTab({ sessionEmployeeId = null }: { sessionEmployeeId?: string | null }) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const {
    dataRootId,
    planDatabasePlans,
    planDatabaseConfig,
    updatePlanDatabaseConfig,
  } = useLedgerData(sessionEmployeeId);

  const [folderPathDraft, setFolderPathDraft] = useState(planDatabaseConfig.rootFolderPath);
  useEffect(() => setFolderPathDraft(planDatabaseConfig.rootFolderPath), [planDatabaseConfig.rootFolderPath]);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const [sort, setSort] = useState<SortState>(null);
  const toggleSort = (key: SortKey) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };

  const [syncBusy, setSyncBusy] = useState(false);
  const [syncStep, setSyncStep] = useState<string | null>(null);
  const [syncDetail, setSyncDetail] = useState<string>("");
  const [syncCounts, setSyncCounts] = useState<{ current: number; total: number } | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const [selected, setSelected] = useState<PlanDatabaseRecord | null>(null);
  const [resyncBusy, setResyncBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [editCell, setEditCell] = useState<{ id: string; field: keyof PlanDatabaseRecord; value: string } | null>(null);

  const skipMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of planDatabasePlans || []) {
      if (r.dropboxFolderPath && r.planPdfRev) m[r.dropboxFolderPath.toLowerCase()] = r.planPdfRev;
    }
    return m;
  }, [planDatabasePlans]);

  const filtered = useMemo(() => {
    const q = debouncedSearch;
    const rows = [...(planDatabasePlans || [])];
    const matches = (r: PlanDatabaseRecord) => {
      if (!q) return true;
      const hay = [
        r.projectName,
        r.clientName,
        r.designerName,
        r.overallWidth,
        r.overallDepth,
        r.dropboxFolderPath,
      ]
        .filter(Boolean)
        .join(" | ")
        .toLowerCase();
      return hay.includes(q);
    };
    const base = rows.filter(matches);

    if (!sort) return base;

    const dir = sort.dir === "asc" ? 1 : -1;
    const cmp = (a: any, b: any) => {
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      if (typeof a === "number" && typeof b === "number") return (a - b) * dir;
      if (typeof a === "boolean" && typeof b === "boolean") return (Number(b) - Number(a)) * dir; // Yes before No when asc
      return String(a).localeCompare(String(b)) * dir;
    };

    return base.sort((ra, rb) => {
      const av = (ra as any)[sort.key];
      const bv = (rb as any)[sort.key];
      return cmp(av, bv);
    });
  }, [planDatabasePlans, debouncedSearch, sort]);

  const upsertRecord = useCallback(
    async (recordFromSync: PlanDatabaseRecord) => {
      if (!dataRootId) return;
      const folderLower = recordFromSync.dropboxFolderPath.toLowerCase();
      const id = stableDocIdFromDropboxPath(folderLower);
      const now = new Date().toISOString();
      const ref = doc(firestore, "employees", dataRootId, "plan_database", id);
      const payload = pruneUndefined({
        ...recordFromSync,
        id,
        dropboxFolderPath: folderLower,
        // keep first createdAt if present; always bump updatedAt
        createdAt: recordFromSync.createdAt || now,
        updatedAt: now,
      } satisfies PlanDatabaseRecord);

      await setDocumentNonBlocking(ref, payload as any, { merge: true });
      return id;
    },
    [dataRootId, firestore],
  );

  const runSync = useCallback(
    async (opts?: { projectFolderPath?: string }) => {
      if (!dataRootId) {
        toast({ variant: "destructive", title: "Not ready", description: "No firm id loaded yet." });
        return;
      }
      setSyncBusy(true);
      setSyncStep(null);
      setSyncDetail("");
      setSyncCounts(null);
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      const body = {
        rootFolderPath: normalizeDropboxPathInput(folderPathDraft),
        projectFolderPath: opts?.projectFolderPath ? normalizeDropboxPathInput(opts.projectFolderPath) : undefined,
        skipIfPdfRevMatches: opts?.projectFolderPath ? {} : skipMap,
      };

      try {
        const res = await fetch("/api/plan-database/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: abortRef.current.signal,
        });
        if (!res.ok || !res.body) {
          const t = await res.text().catch(() => "");
          throw new Error(t || `Sync failed (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parsed = parseNdjsonLines(buffer);
          buffer = parsed.rest;
          for (const line of parsed.lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            let ev: any;
            try {
              ev = JSON.parse(trimmed);
            } catch {
              continue;
            }
            if (ev.type === "progress") {
              setSyncStep(String(ev.step || ""));
              setSyncDetail(String(ev.detail || ""));
              if (typeof ev.current === "number" && typeof ev.total === "number") {
                setSyncCounts({ current: ev.current, total: ev.total });
              }
            } else if (ev.type === "record") {
              const rec = normalizeRecordFromSync(ev.record);
              if (rec.dropboxFolderPath) {
                await upsertRecord(rec);
              }
            } else if (ev.type === "error") {
              throw new Error(String(ev.message || "Sync failed."));
            } else if (ev.type === "complete") {
              toast({
                title: "Sync complete",
                description: `Processed ${Number(ev.processed || 0)} project(s), skipped ${Number(ev.skipped || 0)} unchanged.`,
              });
            }
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Sync failed.";
        toast({ variant: "destructive", title: "Sync failed", description: msg });
      } finally {
        setSyncBusy(false);
      }
    },
    [dataRootId, folderPathDraft, skipMap, toast, upsertRecord],
  );

  const exportCsv = () => {
    const cols: Array<{ key: keyof PlanDatabaseRecord | "dropboxFolderLink"; label: string }> = [
      { key: "projectName", label: "Project Name" },
      { key: "clientName", label: "Client Name" },
      { key: "designerName", label: "Designer" },
      { key: "heatedSqftToFrame", label: "Heated Sq Ft (to frame)" },
      { key: "bedrooms", label: "Bedrooms" },
      { key: "bathrooms", label: "Bathrooms" },
      { key: "floors", label: "Floors" },
      { key: "hasBasement", label: "Basement" },
      { key: "hasBonusRoom", label: "Bonus Room" },
      { key: "garageCars", label: "Garage Cars" },
      { key: "overallWidth", label: "Width" },
      { key: "overallDepth", label: "Depth" },
      { key: "dropboxFolderPath", label: "Dropbox Folder Path" },
      { key: "dropboxFolderLink", label: "Dropbox Link" },
      { key: "lastSynced", label: "Last Synced" },
      { key: "needsReview", label: "Needs Review" },
    ];
    const header = cols.map((c) => csvEscape(c.label)).join(",");
    const rows = filtered.map((r) =>
      cols
        .map((c) => {
          const val = c.key === "dropboxFolderLink" ? r.dropboxFolderLink : (r as any)[c.key];
          return csvEscape(val);
        })
        .join(","),
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plan-database-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveInlineEdit = async () => {
    if (!editCell || !dataRootId) return;
    const { id, field, value } = editCell;
    const now = new Date().toISOString();
    const ref = doc(firestore, "employees", dataRootId, "plan_database", id);
    const patch: any = {
      [field]: value,
      overriddenFields: { ...(planDatabasePlans.find((r) => r.id === id)?.overriddenFields || {}), [field]: true },
      updatedAt: now,
    };
    await setDocumentNonBlocking(ref, patch, { merge: true });
    setEditCell(null);
  };

  const deleteSelected = useCallback(async () => {
    if (!dataRootId || !selected?.id) return;
    const label = selected.projectName || selected.dropboxFolderPath || selected.id;
    const ok = window.confirm(`Delete this plan from the catalog?\n\n${label}\n\nThis cannot be undone.`);
    if (!ok) return;
    setDeleteBusy(true);
    try {
      await deleteDocumentNonBlocking(doc(firestore, "employees", dataRootId, "plan_database", selected.id));
      setSelected(null);
      toast({ title: "Deleted", description: "The catalog entry was removed." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Delete failed.";
      toast({ variant: "destructive", title: "Delete failed", description: msg });
    } finally {
      setDeleteBusy(false);
    }
  }, [dataRootId, firestore, selected, toast]);

  return (
    <div className="space-y-6 max-w-[1700px] mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h3 className="text-lg font-headline font-bold text-white flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-primary" /> Plan Database
          </h3>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Sync completed plan sets from Dropbox and extract plan metadata with Perplexity for search, sorting, and reuse.
          </p>
        </div>
      </div>

      <Card className="border-border/50 bg-card/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-headline flex items-center justify-between gap-3 flex-wrap">
            <span className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-primary" /> Tools
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                className="gap-2"
                onClick={() => void runSync()}
                disabled={syncBusy}
                title="Scan Dropbox and update the plan database"
              >
                <RefreshCw className={cn("h-4 w-4", syncBusy && "animate-spin")} />
                {syncBusy ? "Syncing…" : "Sync with Dropbox"}
              </Button>
              <Button type="button" variant="outline" className="gap-2" onClick={exportCsv} disabled={!filtered.length}>
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-5 space-y-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search project, client, designer, dimensions…"
                  className="pl-10"
                />
              </div>
            </div>
            <div className="lg:col-span-7 space-y-2">
              <Label>Dropbox root folder path</Label>
              <div className="flex gap-2">
                <Input
                  value={folderPathDraft}
                  onChange={(e) => setFolderPathDraft(e.target.value)}
                  onBlur={() =>
                    updatePlanDatabaseConfig({ rootFolderPath: normalizeDropboxPathInput(folderPathDraft) })
                  }
                  placeholder="/Projects/Completed Plans"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() =>
                    updatePlanDatabaseConfig({ rootFolderPath: normalizeDropboxPathInput(folderPathDraft) })
                  }
                  disabled={!folderPathDraft.trim()}
                  title="Save"
                >
                  <Settings className="h-4 w-4" /> Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Each subfolder is treated as a project. Sync selects the newest plan set PDF per folder (by name hints + modified date).
              </p>
            </div>
          </div>

          {syncBusy ? (
            <div className="rounded-md border border-border/50 bg-muted/10 p-3 text-sm">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="font-semibold text-white">
                  {syncStep ? `Step: ${syncStep}` : "Syncing…"}{" "}
                  {syncCounts ? (
                    <span className="text-muted-foreground font-normal">
                      ({syncCounts.current} of {syncCounts.total})
                    </span>
                  ) : null}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => abortRef.current?.abort()}>
                  Cancel
                </Button>
              </div>
              {syncDetail ? <div className="text-xs text-muted-foreground mt-1">{syncDetail}</div> : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/30 overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-headline">
            Catalog{" "}
            <span className="text-muted-foreground font-normal">
              ({filtered.length} of {(planDatabasePlans || []).length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="w-full">
            <Table>
              <TableHeader className="bg-muted/40 sticky top-0">
                <TableRow>
                  <TableHead className="w-16">Thumb</TableHead>
                  <TableHead>
                    <button className="flex items-center gap-1 font-bold" onClick={() => toggleSort("projectName")}>
                      Project <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button className="flex items-center gap-1 font-bold" onClick={() => toggleSort("clientName")}>
                      Client <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button className="flex items-center gap-1 font-bold" onClick={() => toggleSort("designerName")}>
                      Designer <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button className="flex items-center gap-1 font-bold ml-auto" onClick={() => toggleSort("heatedSqftToFrame")}>
                      Htd SqFt <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button className="flex items-center gap-1 font-bold ml-auto" onClick={() => toggleSort("bedrooms")}>
                      Beds <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button className="flex items-center gap-1 font-bold ml-auto" onClick={() => toggleSort("bathrooms")}>
                      Baths <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button className="flex items-center gap-1 font-bold ml-auto" onClick={() => toggleSort("floors")}>
                      Floors <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button className="flex items-center gap-1 font-bold" onClick={() => toggleSort("hasBasement")}>
                      Basement <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button className="flex items-center gap-1 font-bold" onClick={() => toggleSort("hasBonusRoom")}>
                      Bonus <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button className="flex items-center gap-1 font-bold ml-auto" onClick={() => toggleSort("garageCars")}>
                      Garage <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button className="flex items-center gap-1 font-bold" onClick={() => toggleSort("overallWidth")}>
                      Width <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button className="flex items-center gap-1 font-bold" onClick={() => toggleSort("overallDepth")}>
                      Depth <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </TableHead>
                  <TableHead className="w-32">Renderings</TableHead>
                  <TableHead className="w-24">Plan PDF</TableHead>
                  <TableHead className="w-28">Dropbox</TableHead>
                  <TableHead className="w-36">
                    <button className="flex items-center gap-1 font-bold" onClick={() => toggleSort("lastSynced")}>
                      Last Synced <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={16} className="text-center py-10 text-muted-foreground italic">
                      No plans found. Set a Dropbox root folder and click “Sync with Dropbox”.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => {
                    const thumb = r.thumbnailUrl ? renderingDisplaySrc(r.thumbnailUrl) : "";
                    const hasThumb = !!thumb;
                    const needsReview = !!r.needsReview;
                    const rowTitle = needsReview
                      ? `Needs review: ${r.missingFields?.length ? r.missingFields.join(", ") : "missing fields"}`
                      : undefined;
                    return (
                      <TableRow
                        key={r.id}
                        className={cn("hover:bg-muted/20 cursor-pointer", needsReview && "bg-amber-500/5")}
                        onClick={() => setSelected(r)}
                        title={rowTitle}
                      >
                        <TableCell>
                          <div className="h-10 w-10 rounded-md overflow-hidden border border-border/50 bg-muted/20">
                            {hasThumb ? (
                              <img
                                src={thumb}
                                alt="Thumbnail"
                                className="h-full w-full object-cover"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-[9px] text-muted-foreground">
                                —
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-bold text-white">
                          <div className="flex items-center gap-2">
                            {needsReview ? <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" /> : null}
                            <span className="truncate max-w-[220px]">{r.projectName || "—"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[180px]">{r.clientName || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[140px]">{r.designerName || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.heatedSqftToFrame ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.bedrooms ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.bathrooms ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.floors ?? "—"}</TableCell>
                        <TableCell className="text-xs">{boolToYesNo(r.hasBasement)}</TableCell>
                        <TableCell className="text-xs">{boolToYesNo(r.hasBonusRoom)}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.garageCars ?? "—"}</TableCell>
                        <TableCell className="text-xs">{r.overallWidth || "—"}</TableCell>
                        <TableCell className="text-xs">{r.overallDepth || "—"}</TableCell>
                        <TableCell>
                          {r.renderingLinks?.length ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelected(r);
                              }}
                            >
                              View ({r.renderingLinks.length})
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.planPdfPath ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                const url = `/api/dropbox/proxy-download?path=${encodeURIComponent(r.planPdfPath!)}&name=${encodeURIComponent((r.projectName || "plan") + ".pdf")}`;
                                window.open(url, "_blank", "noopener,noreferrer");
                              }}
                            >
                              Open
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.dropboxFolderLink ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="gap-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(r.dropboxFolderLink!, "_blank", "noopener,noreferrer");
                              }}
                            >
                              Open <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.lastSynced ? new Date(r.lastSynced).toLocaleString() : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-[980px] max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="font-headline text-2xl">
              {selected?.projectName || "Plan detail"}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs">{selected?.dropboxFolderPath}</span>
              {selected?.needsReview ? (
                <span className="text-amber-400 text-xs font-semibold">Needs review</span>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
              <div className="lg:col-span-7 min-h-0">
                <ScrollArea className="h-[min(52vh,520px)] pr-3">
                  <div className="grid grid-cols-2 gap-3">
                    {(selected.renderingLinks || []).length ? (
                      selected.renderingLinks!.map((u) => {
                        const src = renderingDisplaySrc(u);
                        return (
                          <a
                            key={u}
                            href={u.startsWith("/") ? src : u}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block rounded-lg overflow-hidden border border-border/50 bg-muted/10 hover:border-primary/40 transition-colors"
                            title="Open in Dropbox"
                          >
                            <img
                              src={src}
                              alt="Rendering"
                              className="h-40 w-full object-cover"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          </a>
                        );
                      })
                    ) : (
                      <div className="col-span-2 text-xs text-muted-foreground italic border border-dashed border-border/60 rounded-lg p-6 text-center">
                        No renderings were detected in this folder.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
              <div className="lg:col-span-5 min-h-0 space-y-3">
                {selected.extractionError ? (
                  <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                    {selected.extractionError}
                  </div>
                ) : null}
                {selected.missingFields?.length ? (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                    Missing: {selected.missingFields.join(", ")}
                  </div>
                ) : null}

                <Card className="border-border/50 bg-card/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-headline">Fields</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {(
                      [
                        ["Project Name", "projectName"],
                        ["Client Name", "clientName"],
                        ["Designer", "designerName"],
                        ["Heated Sq Ft (to frame)", "heatedSqftToFrame"],
                        ["Bedrooms", "bedrooms"],
                        ["Bathrooms", "bathrooms"],
                        ["Floors", "floors"],
                        ["Basement", "hasBasement"],
                        ["Bonus Room", "hasBonusRoom"],
                        ["Garage Cars", "garageCars"],
                        ["Width", "overallWidth"],
                        ["Depth", "overallDepth"],
                      ] as Array<[string, keyof PlanDatabaseRecord]>
                    ).map(([label, field]) => {
                      const v = (selected as any)[field];
                      const override = !!selected.overriddenFields?.[field as any];
                      const isEditing = editCell?.id === selected.id && editCell.field === field;
                      return (
                        <div key={String(field)} className="flex items-center justify-between gap-3">
                          <div className="text-xs text-muted-foreground">{label}</div>
                          <div className="flex items-center gap-2">
                            {isEditing ? (
                              <Input
                                value={editCell.value}
                                onChange={(e) => setEditCell({ ...editCell, value: e.target.value })}
                                onBlur={() => void saveInlineEdit()}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") void saveInlineEdit();
                                  if (e.key === "Escape") setEditCell(null);
                                }}
                                className="h-8 w-[260px]"
                                autoFocus
                              />
                            ) : (
                              <button
                                type="button"
                                className={cn(
                                  "text-right font-semibold text-white max-w-[320px] truncate",
                                  override && "text-primary",
                                )}
                                title="Click to edit"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditCell({
                                    id: selected.id,
                                    field,
                                    value: v == null ? "" : String(v),
                                  });
                                }}
                              >
                                {typeof v === "boolean" ? boolToYesNo(v) : v ?? "—"}
                              </button>
                            )}
                            <Pencil className={cn("h-3.5 w-3.5 text-muted-foreground", override && "text-primary")} />
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                <div className="flex flex-wrap gap-2">
                  {selected.planPdfPath ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      onClick={() => {
                        const url = `/api/dropbox/proxy-download?path=${encodeURIComponent(selected.planPdfPath!)}&name=${encodeURIComponent((selected.projectName || "plan") + ".pdf")}`;
                        window.open(url, "_blank", "noopener,noreferrer");
                      }}
                    >
                      Open plan PDF <ExternalLink className="h-4 w-4" />
                    </Button>
                  ) : null}
                  {selected.dropboxFolderLink ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      onClick={() => window.open(selected.dropboxFolderLink!, "_blank", "noopener,noreferrer")}
                    >
                      Open Dropbox folder <ExternalLink className="h-4 w-4" />
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    className="gap-2"
                    disabled={resyncBusy}
                    onClick={() => {
                      setResyncBusy(true);
                      void runSync({ projectFolderPath: selected.dropboxFolderPath })
                        .finally(() => setResyncBusy(false));
                    }}
                  >
                    <RefreshCw className={cn("h-4 w-4", resyncBusy && "animate-spin")} /> Re-Sync This Plan
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="destructive"
              onClick={() => void deleteSelected()}
              disabled={!selected?.id || deleteBusy || resyncBusy || syncBusy}
              title="Delete this entry from the Plan Database"
            >
              {deleteBusy ? "Deleting…" : "Delete"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setSelected(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


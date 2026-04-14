"use client";

import { useMemo, useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import {
  Mail,
  HardDrive,
  Search,
  RefreshCw,
  Settings2,
  Loader2,
  AlertCircle,
  EyeOff,
  ListTodo,
  Save,
  ExternalLink,
  Clock,
  FileText,
  Plus,
  Globe,
  Lock,
  CheckCircle2,
  Users,
  Reply,
  PenLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { InboxTabViewModel } from "./inbox-tab-model";
import type { GmailMessage, CloudFile } from "@/lib/types";

type Section = "mail" | "drive";

type ThreadGroup = { threadId: string; messages: GmailMessage[]; head: GmailMessage };

function extractEmailAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m?.[1] || from).trim();
}

function groupIntoThreads(emails: GmailMessage[]): ThreadGroup[] {
  const map = new Map<string, GmailMessage[]>();
  for (const e of emails) {
    const key = e.threadId || e.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return Array.from(map.entries())
    .map(([threadId, messages]) => {
      const sorted = [...messages].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      return { threadId, messages: sorted, head: sorted[sorted.length - 1]! };
    })
    .sort((a, b) => (a.head.date < b.head.date ? 1 : a.head.date > b.head.date ? -1 : 0));
}

export function InboxGmailLayout({ model }: { model: InboxTabViewModel }) {
  const {
    isSyncing,
    searchQuery,
    setSearchQuery,
    syncError,
    backgroundSyncError,
    onlyShowClients,
    setOnlyShowClients,
    isNoteDialogOpen,
    setIsNoteDialogOpen,
    isTaskDialogOpen,
    setIsTaskDialogOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    selectedItem,
    targetProjectId,
    setTargetProjectId,
    taskForm,
    setTaskForm,
    localConfig,
    setLocalConfig,
    emails,
    integrationConfig,
    serverEnvOAuthConfigured,
    googleSuiteLinked,
    sortedProjects,
    clientEmails,
    filteredEmails,
    googleFiles,
    performDeepSync,
    openTaskDialog,
    openNoteDialog,
    handleDismissItem,
    handleDismissIds,
    resetHiddenInbox,
    handleArchiveToLedger,
    handleCreateTask,
    handleSaveSettings,
    handleVerifyLink,
    handleConnectGoogle,
    isVerifying,
    getMimeLabel,
    formatFileSize,
  } = model;

  const [section, setSection] = useState<Section>("mail");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedDriveFileId, setSelectedDriveFileId] = useState<string | null>(null);

  const threads = useMemo(() => groupIntoThreads(filteredEmails), [filteredEmails]);

  useEffect(() => {
    if (section !== "mail") return;
    if (threads.length === 0) {
      setSelectedThreadId(null);
      return;
    }
    if (!selectedThreadId || !threads.some((t) => t.threadId === selectedThreadId)) {
      setSelectedThreadId(threads[0]!.threadId);
    }
  }, [section, threads, selectedThreadId]);

  useEffect(() => {
    if (section !== "drive") return;
    if (googleFiles.length === 0) {
      setSelectedDriveFileId(null);
      return;
    }
    if (!selectedDriveFileId || !googleFiles.some((f) => f.id === selectedDriveFileId)) {
      setSelectedDriveFileId(googleFiles[0]!.id);
    }
  }, [section, googleFiles, selectedDriveFileId]);

  const activeThread = threads.find((t) => t.threadId === selectedThreadId) ?? null;
  const conversation = useMemo(() => {
    if (!activeThread) return [];
    return [...activeThread.messages].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }, [activeThread]);

  const activeFile = googleFiles.find((f) => f.id === selectedDriveFileId) ?? null;

  const openCompose = () => {
    window.open("mailto:", "_blank", "noopener,noreferrer");
  };

  const openReply = (msg: GmailMessage) => {
    const to = extractEmailAddress(msg.from);
    const subject = encodeURIComponent(msg.subject.startsWith("Re:") ? msg.subject : `Re: ${msg.subject}`);
    window.open(`mailto:${encodeURIComponent(to)}?subject=${subject}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex flex-col gap-0 animate-in fade-in duration-500 rounded-xl border border-border/60 bg-card/25 overflow-hidden min-h-[min(85vh,820px)] shadow-lg">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/50 bg-muted/15 px-3 py-2.5 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Mail className="h-5 w-5 text-primary shrink-0" />
          <h2 className="text-lg font-headline font-bold text-white tracking-tight">Inbox</h2>
          <Badge variant="outline" className="text-[9px] font-bold border-border/60 text-muted-foreground hidden sm:inline-flex">
            {googleSuiteLinked ? "Google linked" : "Setup required"}
          </Badge>
        </div>
        <div className="flex-1 min-w-[140px] max-w-md">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={section === "mail" ? "Search mail…" : "Search Drive summaries…"}
              className="h-9 pl-8 text-sm bg-background/60 border-border/50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1.5 rounded-md border border-border/50 bg-background/40 px-2 py-1 h-9">
            <Checkbox id="gmail-client-only" checked={onlyShowClients} onCheckedChange={(c) => setOnlyShowClients(!!c)} />
            <Label htmlFor="gmail-client-only" className="text-[10px] font-semibold text-muted-foreground cursor-pointer flex items-center gap-1 pr-1">
              <Users className="h-3 w-3" /> Clients
            </Label>
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={openCompose} title="New email (default mail app)">
            <PenLine className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Compose</span>
          </Button>
          <Button variant="outline" size="sm" className="h-9 w-9 p-0" onClick={() => setIsSettingsOpen(true)} title="Connection settings">
            <Settings2 className="h-4 w-4" />
          </Button>
          <Button variant="default" size="sm" className="h-9 gap-1.5" onClick={() => void performDeepSync()} disabled={isSyncing}>
            {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sync
          </Button>
        </div>
      </div>

      {(syncError || backgroundSyncError) && (
        <Alert variant="destructive" className="rounded-none border-x-0 border-t-0 bg-rose-500/10 border-rose-500/25 py-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <div className="space-y-0.5 min-w-0">
            <AlertTitle className="text-[10px] font-bold uppercase tracking-wide">Sync</AlertTitle>
            <p className="text-[11px] opacity-90 whitespace-pre-wrap break-words">
              {Array.from(new Set([syncError, backgroundSyncError].filter(Boolean) as string[])).join("\n")}
            </p>
          </div>
        </Alert>
      )}

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        <div className="flex flex-row lg:flex-col border-b lg:border-b-0 lg:border-r border-border/50 bg-muted/10 p-1 gap-0.5 shrink-0 justify-center lg:justify-start">
          <Button
            type="button"
            variant={section === "mail" ? "secondary" : "ghost"}
            size="sm"
            className={cn("h-10 w-10 lg:w-12 p-0 rounded-lg", section === "mail" && "shadow-sm")}
            onClick={() => setSection("mail")}
            title="Mail"
          >
            <Mail className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant={section === "drive" ? "secondary" : "ghost"}
            size="sm"
            className={cn("h-10 w-10 lg:w-12 p-0 rounded-lg", section === "drive" && "shadow-sm")}
            onClick={() => setSection("drive")}
            title="Meeting summaries (Drive)"
          >
            <HardDrive className="h-4 w-4" />
          </Button>
        </div>

        <div className="w-full lg:w-[min(100%,380px)] lg:max-w-[40%] flex flex-col border-b lg:border-b-0 lg:border-r border-border/50 min-h-[200px] lg:min-h-0 shrink-0">
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border/40 shrink-0 flex justify-between items-center">
            <span>{section === "mail" ? `Primary · ${threads.length}` : `Drive · ${googleFiles.length}`}</span>
            <span className="text-[9px] font-mono truncate max-w-[140px] text-muted-foreground/80" title={integrationConfig.googleAccountEmail}>
              {integrationConfig.googleAccountEmail || (serverEnvOAuthConfigured ? ".env OAuth" : "")}
            </span>
          </div>
          <ScrollArea className="flex-1 h-[280px] lg:h-auto lg:min-h-[480px]">
            <div className="p-1.5 space-y-0.5">
              {section === "mail" ? (
                isSyncing && emails.length === 0 ? (
                  <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-xs font-medium">Loading messages…</p>
                  </div>
                ) : threads.length === 0 ? (
                  <div className="p-6 text-center space-y-3">
                    <p className="text-sm text-muted-foreground">No messages to show.</p>
                    <p className="text-[10px] text-muted-foreground/80">
                      Loaded {emails.length} · Hidden {model.archivedItemIds.size + model.dismissedItemIds.size}
                    </p>
                    <Button type="button" variant="outline" size="sm" onClick={resetHiddenInbox}>
                      Reset hidden
                    </Button>
                  </div>
                ) : (
                  threads.map((t) => {
                    const isClient = clientEmails.some((ce) => t.head.from.toLowerCase().includes(ce!));
                    const active = t.threadId === selectedThreadId;
                    return (
                      <button
                        key={t.threadId}
                        type="button"
                        onClick={() => setSelectedThreadId(t.threadId)}
                        className={cn(
                          "w-full text-left rounded-lg px-3 py-2.5 transition-colors border border-transparent",
                          active ? "bg-primary/15 border-primary/25 shadow-sm" : "hover:bg-muted/50",
                        )}
                      >
                        <div className="flex justify-between gap-2 items-baseline">
                          <span className={cn("text-[13px] truncate flex-1", isClient ? "font-semibold text-primary" : "font-medium text-foreground")}>
                            {t.head.from.replace(/<[^>]+>/, "").trim() || t.head.from}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">{t.head.date}</span>
                        </div>
                        <div className="text-[13px] text-foreground/90 truncate mt-0.5">{t.head.subject}</div>
                        <div className="text-[11px] text-muted-foreground line-clamp-2 mt-1 leading-snug">
                          {t.head.bodyPreview || t.head.snippet}
                        </div>
                        {t.messages.length > 1 ? (
                          <Badge variant="secondary" className="mt-1.5 text-[9px] h-4 px-1.5">
                            {t.messages.length} in thread
                          </Badge>
                        ) : null}
                      </button>
                    );
                  })
                )
              ) : isSyncing && googleFiles.length === 0 ? (
                <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                  <p className="text-xs font-medium">Loading Drive summaries…</p>
                </div>
              ) : googleFiles.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No meeting summaries in this folder.</div>
              ) : (
                googleFiles.map((file) => {
                  const active = file.id === selectedDriveFileId;
                  return (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => setSelectedDriveFileId(file.id)}
                      className={cn(
                        "w-full text-left rounded-lg px-3 py-2.5 transition-colors border border-transparent flex gap-2",
                        active ? "bg-emerald-500/10 border-emerald-500/25" : "hover:bg-muted/50",
                      )}
                    >
                      <FileText className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-foreground truncate">{file.name}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {file.createdTime ? format(parseISO(file.createdTime), "MMM d, yyyy") : "—"} · {formatFileSize(file.size)}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-background/20 min-h-[320px]">
          {section === "mail" && activeThread ? (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-border/50 px-4 py-3 shrink-0 bg-card/20">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-headline font-bold text-white leading-tight">{activeThread.head.subject}</h3>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {conversation.length} message{conversation.length === 1 ? "" : "s"} in thread
                  </p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => openReply(activeThread.head)}>
                  <Reply className="h-3.5 w-3.5" /> Reply
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 h-8 text-emerald-600 border-emerald-500/30" onClick={() => openTaskDialog(activeThread.head)}>
                  <ListTodo className="h-3.5 w-3.5" /> Task
                </Button>
                <Button size="sm" className="gap-1.5 h-8" onClick={() => openNoteDialog(activeThread.head)}>
                  <Save className="h-3.5 w-3.5" /> Archive note
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-rose-500"
                  onClick={() => handleDismissIds(activeThread.messages.map((m) => m.id))}
                  title="Hide entire thread"
                >
                  <EyeOff className="h-4 w-4" />
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4 max-w-3xl">
                  {conversation.map((msg) => {
                    const isClient = clientEmails.some((ce) => msg.from.toLowerCase().includes(ce!));
                    return (
                      <div
                        key={msg.id}
                        className="rounded-xl border border-border/50 bg-card/40 shadow-sm overflow-hidden"
                      >
                        <div className="px-4 py-3 border-b border-border/40 bg-muted/20 flex flex-wrap gap-2 justify-between items-start">
                          <div>
                            <div className="text-sm font-semibold text-foreground">{msg.from}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">To: {msg.to}</div>
                            {isClient ? (
                              <Badge className="mt-1 text-[9px] h-4 bg-primary/15 text-primary border-primary/30">Client</Badge>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground tabular-nums">{msg.date}</span>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => openReply(msg)}>
                              <Reply className="h-3 w-3" /> Reply
                            </Button>
                          </div>
                        </div>
                        <div className="px-4 py-4 text-sm text-foreground/90 whitespace-pre-wrap break-words leading-relaxed">
                          {msg.bodyPreview || msg.snippet || "—"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </>
          ) : section === "drive" && activeFile ? (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-border/50 px-4 py-3 shrink-0 bg-card/20">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-headline font-bold text-white leading-tight truncate">{activeFile.name}</h3>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <Badge variant="secondary" className="text-[9px]">{getMimeLabel(activeFile.mimeType)}</Badge>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {activeFile.createdTime ? format(parseISO(activeFile.createdTime), "MMM d, yyyy h:mm a") : "—"}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{formatFileSize(activeFile.size)}</span>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="h-8 gap-1.5" asChild>
                  <a href={activeFile.webViewLink} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" /> Open in Drive
                  </a>
                </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-emerald-600 border-emerald-500/30" onClick={() => openTaskDialog(activeFile)}>
                  <ListTodo className="h-3.5 w-3.5" /> Task
                </Button>
                <Button size="sm" className="h-8 gap-1.5" onClick={() => openNoteDialog(activeFile)}>
                  <Save className="h-3.5 w-3.5" /> Archive note
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-rose-500" onClick={() => handleDismissItem(activeFile.id)} title="Hide">
                  <EyeOff className="h-4 w-4" />
                </Button>
              </div>
              <div className="p-6 text-sm text-muted-foreground">
                <p>
                  Meeting summaries stay in Google Drive. Use <strong>Open in Drive</strong> to view or edit the file, or archive it to a project note with a link preserved in Ledger.
                </p>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-8">
              Select an item from the list.
            </div>
          )}
        </div>
      </div>

      <Dialog open={isNoteDialogOpen} onOpenChange={setIsNoteDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader><DialogTitle className="font-headline text-2xl flex items-center gap-2"><Save className="h-6 w-6 text-primary" /> Anchor to Project Ledger</DialogTitle></DialogHeader>
          <div className="space-y-6 py-4">
            <div className="p-4 bg-muted/30 rounded-xl border border-border/50 space-y-2">
              <div className="text-sm font-bold text-white">{"subject" in (selectedItem || {}) ? (selectedItem as GmailMessage).subject : (selectedItem as CloudFile)?.name}</div>
              <div className="text-[10px] text-muted-foreground font-medium uppercase italic">Will be saved as a Project Note activity log entry.</div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground">Select Destination Project</Label>
              <select className="flex h-12 w-full rounded-xl border bg-background px-4 text-sm font-bold" value={targetProjectId} onChange={(e) => setTargetProjectId(e.target.value)}>
                <option value="">Choose Project...</option>
                {sortedProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setIsNoteDialogOpen(false)}>Discard</Button><Button className="bg-primary px-8 h-12 font-bold gap-2" disabled={!targetProjectId} onClick={handleArchiveToLedger}>Record Entry</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="font-headline text-2xl flex items-center gap-2">
              <ListTodo className="h-6 w-6 text-emerald-500" /> Convert to Mission Task
            </DialogTitle>
            <DialogDescription>Initialize a new task in the firm queue from this communication.</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Project Context</Label>
                <select className="flex h-12 w-full rounded-xl border bg-background px-4 text-sm font-bold" value={targetProjectId} onChange={(e) => setTargetProjectId(e.target.value)}>
                  <option value="">Choose Project...</option>
                  {sortedProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Task Name</Label>
                <Input value={taskForm.name} onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })} className="font-bold h-12" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">Assign To</Label>
                  <select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm font-bold" value={taskForm.assignedTo} onChange={(e) => setTaskForm({ ...taskForm, assignedTo: e.target.value })}>
                    <option value="Jeff Dillon">Jeff Dillon</option>
                    <option value="Kevin Walthall">Kevin Walthall</option>
                    <option value="Sarah VandeBurgh">Sarah VandeBurgh</option>
                    <option value="Chris Fleming">Chris Fleming</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">Target Date</Label>
                  <Input type="date" value={taskForm.deadline} onChange={(e) => setTaskForm({ ...taskForm, deadline: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Detailed Description</Label>
                <Textarea value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} className="h-32 bg-background/50 text-xs" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsTaskDialogOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 px-8 h-12 font-bold gap-2" disabled={!targetProjectId || !taskForm.name} onClick={handleCreateTask}>
              <Plus className="h-4 w-4" /> Create & Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-headline text-2xl flex items-center gap-2"><Settings2 className="h-6 w-6 text-accent" /> Connection Hub</DialogTitle><DialogDescription>Configure API credentials for autonomous triage.</DialogDescription></DialogHeader>
          <div className="space-y-8 py-4">

            <div className="bg-primary/5 border border-primary/20 p-6 rounded-2xl space-y-4">
              <div className="flex items-center gap-3">
                <Globe className="h-6 w-6 text-primary" />
                <h4 className="font-headline text-xl text-white">Authorize & Verify Integration</h4>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Connect your account or manually verify your Refresh Token link. If &quot;Grant&quot; is blocked, use &quot;Verify Link&quot; to test manual credentials.
              </p>
              <div className="flex gap-3">
                <Button onClick={() => void handleConnectGoogle()} className="flex-1 h-12 gap-2 bg-background border-primary/30 text-primary hover:bg-primary/10 font-bold">
                  <Lock className="h-4 w-4" /> Grant Sync (Popup)
                </Button>
                <Button onClick={() => void handleVerifyLink()} disabled={isVerifying} className="flex-1 h-12 gap-2 bg-primary hover:bg-primary/90 font-bold shadow-lg">
                  {isVerifying ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Verify Integration Link
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase text-primary border-b border-primary/20 pb-1">Google persistent credentials</h4>
              <div className="grid grid-cols-2 gap-4"><div className="space-y-1"><Label className="text-[10px]">Client ID</Label><Input value={localConfig.googleClientId || ""} onChange={(e) => setLocalConfig({ ...localConfig, googleClientId: e.target.value })} placeholder="0000-xxxx.apps.googleusercontent.com" /></div><div className="space-y-1"><Label className="text-[10px]">Client Secret</Label><Input type="password" value={localConfig.googleClientSecret || ""} onChange={(e) => setLocalConfig({ ...localConfig, googleClientSecret: e.target.value })} /></div></div>
              <div className="space-y-1"><Label className="text-[10px]">Refresh Token (Master Key)</Label><Input type="password" value={localConfig.googleRefreshToken || ""} onChange={(e) => setLocalConfig({ ...localConfig, googleRefreshToken: e.target.value })} placeholder="1//0xxxx..." /></div>
              <div className="grid grid-cols-2 gap-4"><div className="space-y-1"><Label className="text-[10px]">Account Email</Label><Input value={localConfig.googleAccountEmail || ""} onChange={(e) => setLocalConfig({ ...localConfig, googleAccountEmail: e.target.value })} placeholder="jeff@designersink.us" /></div><div className="space-y-1"><Label className="text-[10px]">Summaries Folder ID</Label><Input value={localConfig.meetFolderId || ""} onChange={(e) => setLocalConfig({ ...localConfig, meetFolderId: e.target.value })} /></div></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setIsSettingsOpen(false)}>Cancel</Button><Button className="bg-primary px-8 h-12 font-bold" onClick={handleSaveSettings}>Save Settings</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

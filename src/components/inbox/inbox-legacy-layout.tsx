"use client";

import { format, parseISO } from "date-fns";
import {
  Mail,
  Inbox,
  ExternalLink,
  Save,
  Loader2,
  Search,
  Settings2,
  Globe,
  FileText,
  RefreshCw,
  ShieldCheck,
  AlertCircle,
  Users,
  Lock,
  Info,
  Clock,
  HardDrive,
  CheckCircle2,
  EyeOff,
  ListTodo,
  Plus,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { InboxTabViewModel } from "./inbox-tab-model";
import type { GmailMessage, CloudFile } from "@/lib/types";

export function InboxLegacyLayout({ model }: { model: InboxTabViewModel }) {
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

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-card/30 p-8 rounded-3xl border border-border/50 gap-6">
        <div className="space-y-1">
          <h2 className="text-4xl font-headline font-bold text-white flex items-center gap-3">
            <Inbox className="h-10 w-10 text-primary" /> Automated Inbox
          </h2>
          <div className="flex items-center gap-3">
            <p className="text-muted-foreground text-sm uppercase tracking-widest font-semibold">Autonomous Triage Command</p>
            <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded text-[8px] font-black text-emerald-500 uppercase">
              <RefreshCw className={cn("h-2 w-2", isSyncing && "animate-spin")} /> {isSyncing ? "Synchronizing..." : "Auto-Sync Active"}
            </div>
            {backgroundSyncError ? (
              <div className="flex items-center gap-1 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded text-[8px] font-black text-rose-400 uppercase">
                <AlertCircle className="h-2 w-2" /> Background sync error
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="h-12 w-12 p-0 rounded-xl border-border/50" onClick={() => setIsSettingsOpen(true)}>
            <Settings2 className="h-5 w-5 text-muted-foreground" />
          </Button>
          <Button variant="outline" className="gap-2 h-12 rounded-xl border-primary/30 text-primary font-bold hover:bg-primary/10" onClick={() => void performDeepSync()} disabled={isSyncing}>
            {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh All Streams
          </Button>
        </div>
      </header>

      {(syncError || backgroundSyncError) && (
        <Alert variant="destructive" className="bg-rose-500/10 border-rose-500/20 mb-6">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <AlertTitle className="text-xs font-bold uppercase tracking-widest">Synchronization Alerts Detected</AlertTitle>
            <div className="text-xs font-medium opacity-90 leading-relaxed whitespace-pre-wrap">
              {Array.from(new Set([syncError, backgroundSyncError].filter(Boolean) as string[])).join("\n\n")}
            </div>
          </div>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8">
          <Tabs defaultValue="gmail" className="space-y-6">
            <div className="flex justify-center">
              <TabsList className="bg-card border border-border/50 p-1 rounded-2xl h-14 w-fit shadow-lg">
                <TabsTrigger value="gmail" className="px-8 h-11 rounded-xl gap-2"><Mail className="h-4 w-4" /> Gmail ({filteredEmails.length})</TabsTrigger>
                <TabsTrigger value="cloud" className="px-8 h-11 rounded-xl gap-2"><FileText className="h-4 w-4" /> Meeting Summaries ({googleFiles.length})</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="gmail" className="space-y-4">
              <div className="flex flex-col md:flex-row items-center gap-4 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search triaged emails..." className="pl-10 h-12 bg-card/30 border-border/50 rounded-xl" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>

                <div className="flex items-center gap-2 bg-muted/30 px-4 py-2 rounded-xl border border-border/50 h-12">
                  <Checkbox
                    id="client-filter"
                    checked={onlyShowClients}
                    onCheckedChange={(c) => setOnlyShowClients(!!c)}
                  />
                  <Label htmlFor="client-filter" className="text-[10px] font-black uppercase text-muted-foreground cursor-pointer flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" /> Only Client E-mails
                  </Label>
                </div>
              </div>

              <ScrollArea className="h-[600px] pr-4">
                {isSyncing && emails.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 gap-4">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-sm font-bold animate-pulse uppercase tracking-widest text-muted-foreground">Indexing Gmail Stream...</p>
                  </div>
                ) : filteredEmails.length === 0 ? (
                  <Card className="border-border/50 bg-card/30 border-dashed py-24 flex flex-col items-center justify-center text-center space-y-4">
                    <Mail className="h-16 w-16 text-muted-foreground/20" />
                    <div className="max-w-xs mx-auto">
                      <h3 className="text-lg font-bold text-white/50">Inbox Empty</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {onlyShowClients ? "No active client threads found." : "All incoming communication has been triaged."}
                      </p>
                      <div className="mt-4 space-y-2">
                        <div className="text-[10px] text-muted-foreground">
                          Loaded <span className="font-bold">{emails.length}</span> message{emails.length === 1 ? "" : "s"} · Hidden{" "}
                          <span className="font-bold">{model.archivedItemIds.size + model.dismissedItemIds.size}</span>
                        </div>
                        {model.backgroundSyncError ? (
                          <div className="text-[10px] text-rose-400 whitespace-pre-wrap">
                            {model.backgroundSyncError}
                          </div>
                        ) : null}
                        <Button type="button" variant="outline" size="sm" onClick={resetHiddenInbox}>
                          Reset hidden/archived
                        </Button>
                      </div>
                    </div>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {filteredEmails.map((email) => {
                      const isClient = clientEmails.some((ce) => email.from.toLowerCase().includes(ce!));
                      return (
                        <Card key={email.id} className={cn("border-border/50 bg-card/30 hover:border-primary/30 transition-all group", isClient && "border-primary/20 bg-primary/5")}>
                          <CardContent className="p-4 flex flex-col gap-4">
                            <div className="flex items-start justify-between gap-6">
                              <div className="flex-1 min-w-0 space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                  <h4 className="text-lg font-headline font-bold text-white leading-snug pr-2">{email.subject}</h4>
                                  <span className="text-[9px] text-muted-foreground shrink-0 tabular-nums">{email.date}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={cn("text-[10px] font-black uppercase tracking-widest", isClient ? "text-primary" : "text-accent")}>From: {email.from}</span>
                                  <span className="text-[9px] text-muted-foreground font-semibold">To: {email.to}</span>
                                  {isClient && <Badge className="text-[7px] font-black bg-primary/20 text-primary border-primary/30 h-3.5 py-0">ACTIVE CLIENT</Badge>}
                                </div>
                                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap break-words border-l-2 border-border/60 pl-3 py-1">
                                  {email.bodyPreview || email.snippet || "—"}
                                </p>
                              </div>
                              <div className="flex flex-col gap-2 shrink-0">
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-rose-500" onClick={() => handleDismissItem(email.id)} title="Hide Email">
                                  <EyeOff className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>

                            <div className="flex gap-2 pt-2 border-t border-border/20">
                              <Button size="sm" variant="outline" className="flex-1 h-9 gap-2 font-bold border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/10" onClick={() => openTaskDialog(email)}>
                                <ListTodo className="h-4 w-4" /> Convert to Task
                              </Button>
                              <Button size="sm" className="flex-1 h-9 gap-2 font-bold bg-primary px-4 shadow-lg shadow-primary/20" onClick={() => openNoteDialog(email)}>
                                <Save className="h-4 w-4" /> Archive to Note
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="cloud">
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search meeting summaries..." className="pl-10 h-12 bg-card/30 border-border/50 rounded-xl" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>

              <ScrollArea className="h-[600px] pr-4">
                {isSyncing && googleFiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 gap-4">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-sm font-bold animate-pulse uppercase tracking-widest text-muted-foreground">Indexing Summaries...</p>
                  </div>
                ) : googleFiles.length === 0 ? (
                  <Card className="border-border/50 bg-card/30 border-dashed py-24 flex flex-col items-center justify-center text-center space-y-4">
                    <FileText className="h-16 w-16 text-muted-foreground/20" />
                    <div><h3 className="text-lg font-bold text-white/50">No Summaries Found</h3><p className="text-sm text-muted-foreground italic">Items triaged or hidden are removed from this list.</p></div>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {googleFiles.map((file) => (
                      <Card key={file.id} className="border-border/50 bg-card/30 hover:border-emerald-500/30 transition-all group flex flex-col">
                        <CardContent className="p-5 flex-1 flex flex-col justify-between space-y-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-4">
                              <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shrink-0">
                                <FileText className="h-6 w-6 text-emerald-500" />
                              </div>
                              <div className="space-y-1 min-w-0">
                                <h4 className="text-sm font-bold text-white line-clamp-2 leading-snug">{file.name}</h4>
                                <div className="flex flex-wrap gap-2">
                                  <Badge variant="secondary" className="text-[8px] py-0 h-4 uppercase font-black bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                                    {getMimeLabel(file.mimeType)}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1 shrink-0">
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-rose-500" onClick={() => handleDismissItem(file.id)} title="Hide">
                                <EyeOff className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-500 hover:bg-emerald-500/10" asChild title="Open in Drive">
                                <a href={file.webViewLink} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
                              </Button>
                            </div>
                          </div>

                          <div className="pt-3 border-t border-border/30 flex flex-col gap-3">
                            <div className="flex items-center justify-between text-[9px] font-bold text-muted-foreground">
                              <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {file.createdTime ? format(parseISO(file.createdTime), "MMM d, h:mm a") : "—"}</span>
                              <span className="flex items-center gap-1"><HardDrive className="h-2.5 w-2.5" /> {formatFileSize(file.size)}</span>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" className="flex-1 h-8 text-[10px] font-bold gap-1.5" onClick={() => openTaskDialog(file)}>
                                <ListTodo className="h-3 w-3" /> Task
                              </Button>
                              <Button size="sm" className="flex-1 h-8 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" onClick={() => openNoteDialog(file)}>
                                <Save className="h-3 w-3" /> Archive
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <Card className="border-border/50 shadow-xl bg-card/30 overflow-hidden">
            <CardHeader className="bg-primary/5 border-b border-border/50"><CardTitle className="text-lg font-headline flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Persistent Streams</CardTitle></CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between p-3 bg-background/50 rounded-xl border border-border/50">
                <div className="flex items-center gap-3">
                  <Mail className={cn("h-5 w-5", googleSuiteLinked ? "text-emerald-500" : "text-muted-foreground")} />
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-white">Google Suite</p>
                    <p className="text-[10px] text-muted-foreground uppercase">
                      {integrationConfig.googleAccountEmail ||
                        (serverEnvOAuthConfigured ? "Server OAuth (.env)" : "Offline")}
                    </p>
                  </div>
                </div>
                <Badge
                  className={cn(
                    "text-[8px] font-black",
                    googleSuiteLinked ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground",
                  )}
                >
                  {googleSuiteLinked ? "CONNECTED" : "PENDING"}
                </Badge>
              </div>

              <div className="p-4 bg-accent/5 rounded-xl border border-accent/20 space-y-2">
                <p className="text-[10px] font-black uppercase text-accent tracking-widest flex items-center gap-2">
                  <Info className="h-3 w-3" /> Technical Scope Guide
                </p>
                <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                  Meeting Summaries (Drive) and Gmail are separate OAuth scopes. If Drive works but Gmail is empty, your refresh token was issued without Gmail—use Verify Link or check the red alert above, then re-authorize with both scopes.
                </p>
                <ul className="text-[9px] text-muted-foreground list-disc pl-4 space-y-1 break-all">
                  <li><code>https://www.googleapis.com/auth/gmail.readonly</code></li>
                  <li><code>https://www.googleapis.com/auth/drive.readonly</code></li>
                </ul>
              </div>
            </CardContent>
          </Card>
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

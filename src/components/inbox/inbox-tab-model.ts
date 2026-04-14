"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { GmailMessage, CloudFile, Project, Client, IntegrationConfig } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useLedgerData } from "@/hooks/use-ledger-data";
import { useAuth } from "@/firebase";

export interface InboxTabProps {
  projects: Project[];
  clients: Client[];
  onAddNote: (projectId: string, note: unknown) => void;
  onAddTask: (task: unknown) => void;
}

export function formatFileSize(bytes?: number) {
  if (!bytes || bytes === 0) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

export async function postGoogleIntegration<T>(
  action: "verify" | "gmail" | "meet",
  config: IntegrationConfig,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/integrations/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, config }),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Network error";
    throw new Error(
      msg === "Failed to fetch"
        ? "Could not reach the server. Try a full page refresh (dev server restarts invalidate in-flight requests)."
        : msg,
    );
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : res.statusText || "Request failed");
  }
  return data as T;
}

export function getMimeLabel(mimeType?: string) {
  if (!mimeType) return "Document";
  if (mimeType.includes("pdf")) return "PDF Document";
  if (mimeType.includes("word") || mimeType.includes("document")) return "Word Doc";
  if (mimeType.includes("spreadsheet") || mimeType.includes("sheet")) return "Spreadsheet";
  if (mimeType.includes("video")) return "Meeting Video";
  if (mimeType.includes("audio")) return "Audio Recording";
  return "Google Resource";
}

export function useInboxTabModel({ projects, clients, onAddNote, onAddTask }: InboxTabProps) {
  const { toast } = useToast();
  const auth = useAuth();
  const { integrationConfig, updateIntegrationConfig } = useLedgerData();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [backgroundSyncError, setBackgroundSyncError] = useState<string | null>(null);
  const [onlyShowClients, setOnlyShowClients] = useState(false);

  const [archivedItemIds, setArchivedItemIds] = useState<Set<string>>(new Set());
  const [dismissedItemIds, setDismissedItemIds] = useState<Set<string>>(new Set());

  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false);
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<GmailMessage | CloudFile | null>(null);
  const [targetProjectId, setTargetProjectId] = useState("");

  const [taskForm, setTaskForm] = useState({
    name: "",
    description: "",
    deadline: format(new Date(), "yyyy-MM-dd"),
    priority: "Medium" as "High" | "Medium" | "Low",
    assignedTo: "Jeff Dillon",
  });

  const [localConfig, setLocalConfig] = useState<IntegrationConfig>(integrationConfig);

  useEffect(() => {
    const savedArchived = localStorage.getItem("di_inbox_archived_ids");
    const savedDismissed = localStorage.getItem("di_inbox_dismissed_ids");
    if (savedArchived) try { setArchivedItemIds(new Set(JSON.parse(savedArchived))); } catch { /* ignore */ }
    if (savedDismissed) try { setDismissedItemIds(new Set(JSON.parse(savedDismissed))); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    localStorage.setItem("di_inbox_archived_ids", JSON.stringify(Array.from(archivedItemIds)));
    localStorage.setItem("di_inbox_dismissed_ids", JSON.stringify(Array.from(dismissedItemIds)));
  }, [archivedItemIds, dismissedItemIds]);

  useEffect(() => {
    if (integrationConfig && Object.keys(integrationConfig).length > 0) {
      setLocalConfig(integrationConfig);
    }
  }, [integrationConfig]);

  const [emails, setEmails] = useState<GmailMessage[]>([]);
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [serverEnvOAuthConfigured, setServerEnvOAuthConfigured] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations/google", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { serverEnvOAuthConfigured?: boolean }) => {
        if (!cancelled) setServerEnvOAuthConfigured(d.serverEnvOAuthConfigured === true);
      })
      .catch(() => {
        if (!cancelled) setServerEnvOAuthConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const googleSuiteLinked =
    !!integrationConfig.googleRefreshToken || serverEnvOAuthConfigured;

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
  );

  const performDeepSync = useCallback(
    async (silent = false) => {
      if (!silent) {
        setIsSyncing(true);
        setSyncError(null);
      }
      if (silent) setBackgroundSyncError(null);

      let hadErrors = false;
      const syncTasks = [
        postGoogleIntegration<{ messages: GmailMessage[] }>("gmail", integrationConfig)
          .then((d) => setEmails(d.messages))
          .catch((e: Error) => {
            console.error("Auto Gmail Sync Failed", e);
            hadErrors = true;
            if (!silent) setSyncError((prev) => (prev ? `${prev} | ` : "") + e.message);
            else setBackgroundSyncError((prev) => (prev ? `${prev} | ` : "") + e.message);
          }),
        postGoogleIntegration<{ files: CloudFile[] }>("meet", integrationConfig)
          .then((d) => setFiles(d.files))
          .catch((e: Error) => {
            console.error("Auto Meet Sync Failed", e);
            hadErrors = true;
            if (!silent) setSyncError((prev) => (prev ? `${prev} | ` : "") + e.message);
            else setBackgroundSyncError((prev) => (prev ? `${prev} | ` : "") + e.message);
          }),
      ];

      await Promise.all(syncTasks);
      if (!silent) {
        setIsSyncing(false);
        if (!hadErrors) {
          toast({ title: "Autonomous Sync Complete", description: "Firm communication streams refreshed." });
        }
      }
    },
    [integrationConfig, toast],
  );

  useEffect(() => {
    void performDeepSync(true);
    const interval = setInterval(() => void performDeepSync(true), 300000);
    return () => clearInterval(interval);
  }, [performDeepSync]);

  const openNoteDialog = (item: GmailMessage | CloudFile) => {
    setSelectedItem(item);
    setIsNoteDialogOpen(true);
  };

  const openTaskDialog = (item: GmailMessage | CloudFile) => {
    setSelectedItem(item);
    setTaskForm({
      name: "subject" in item ? item.subject : item.name,
      description:
        "snippet" in item
          ? (item as GmailMessage).bodyPreview || item.snippet
          : `Review cloud file: ${item.name}`,
      deadline: format(new Date(), "yyyy-MM-dd"),
      priority: "Medium",
      assignedTo: "Jeff Dillon",
    });
    setIsTaskDialogOpen(true);
  };

  const handleDismissItem = (id: string) => {
    setDismissedItemIds((prev) => new Set([...prev, id]));
    toast({ title: "Item Hidden", description: "Removed from triage stream." });
  };

  const handleDismissIds = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setDismissedItemIds((prev) => new Set([...prev, ...ids]));
    toast({
      title: ids.length > 1 ? "Items hidden" : "Item Hidden",
      description: "Removed from triage stream.",
    });
  }, [toast]);

  const resetHiddenInbox = () => {
    setArchivedItemIds(new Set());
    setDismissedItemIds(new Set());
    try {
      localStorage.removeItem("di_inbox_archived_ids");
      localStorage.removeItem("di_inbox_dismissed_ids");
    } catch { /* ignore */ }
    toast({ title: "Inbox reset", description: "Hidden/archived IDs cleared for this browser." });
  };

  const handleArchiveToLedger = () => {
    if (!selectedItem || !targetProjectId) return;

    const isEmail = "subject" in selectedItem;
    let noteText = "";

    if (isEmail) {
      noteText = `INBOX ARCHIVE: ${selectedItem.subject}\nFrom: ${selectedItem.from}\nTo: ${(selectedItem as GmailMessage).to}\n\n${(selectedItem as GmailMessage).bodyPreview || selectedItem.snippet}`;
    } else {
      const f = selectedItem as CloudFile;
      const createdStr = f.createdTime ? format(parseISO(f.createdTime), "MMM d, yyyy h:mm a") : "Unknown";
      noteText = `CLOUD ATTACHMENT: ${f.name}\nSource: Meeting Summaries\nCreated: ${createdStr}\nSize: ${formatFileSize(f.size)}\nLink: ${f.webViewLink}`;
    }

    onAddNote(targetProjectId, {
      text: noteText,
      attachments: !isEmail
        ? [
            {
              id: Math.random().toString(36).substring(2, 11),
              name: selectedItem.name,
              type: (selectedItem as CloudFile).mimeType || "url",
              url: selectedItem.webViewLink,
              size: (selectedItem as CloudFile).size || 0,
            },
          ]
        : [],
    });

    setArchivedItemIds((prev) => new Set([...prev, selectedItem.id]));

    toast({ title: "Archived to Ledger", description: "Item removed from Triage list." });
    setIsNoteDialogOpen(false);
    setSelectedItem(null);
    setTargetProjectId("");
  };

  const handleCreateTask = () => {
    if (!selectedItem || !targetProjectId) return;

    onAddTask({
      name: taskForm.name,
      description: taskForm.description,
      projectId: targetProjectId,
      clientId: projects.find((p) => p.id === targetProjectId)?.clientId || "",
      deadline: taskForm.deadline,
      priority: taskForm.priority,
      assignedTo: taskForm.assignedTo,
      status: "Assigned",
      category: "Project Related",
      subTasks: [],
      attachments: [],
    });

    setArchivedItemIds((prev) => new Set([...prev, selectedItem.id]));
    toast({ title: "Task Created", description: "Successfully converted email to actionable task." });
    setIsTaskDialogOpen(false);
    setSelectedItem(null);
    setTargetProjectId("");
  };

  const handleSaveSettings = () => {
    updateIntegrationConfig(localConfig);
    setIsSettingsOpen(false);
    toast({ title: "Credentials Vault Updated", description: "Persistence logic synchronized." });
    setTimeout(() => void performDeepSync(false), 500);
  };

  const handleVerifyLink = async () => {
    const hubComplete =
      !!localConfig.googleRefreshToken &&
      !!localConfig.googleClientId &&
      !!localConfig.googleClientSecret;
    if (!hubComplete && !serverEnvOAuthConfigured) {
      toast({
        variant: "destructive",
        title: "Missing Credentials",
        description:
          "Enter Client ID, Secret, and Refresh Token in Connection Hub, or set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN in server .env.",
      });
      return;
    }

    setIsVerifying(true);
    try {
      const result = await postGoogleIntegration<{ success: boolean; message: string }>("verify", localConfig);
      if (result.success) {
        toast({ title: "Link Verified", description: result.message });
        updateIntegrationConfig(localConfig);
      } else {
        toast({ variant: "destructive", title: "Verification Failed", description: result.message });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({ variant: "destructive", title: "System Error", description: message });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleConnectGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.addScope("https://www.googleapis.com/auth/gmail.readonly");
    provider.addScope("https://www.googleapis.com/auth/drive.readonly");

    try {
      const result = await signInWithPopup(auth, provider);
      if (result.user) {
        setLocalConfig({
          ...localConfig,
          googleAccountEmail: result.user.email || undefined,
        });
        toast({
          title: "Account Linked",
          description: "Permissions granted. Please verify your manual credentials match this account.",
        });
      }
    } catch (error: unknown) {
      console.error("Auth System Error:", error);
      const err = error as { code?: string; message?: string };
      if (err.code === "auth/configuration-not-found") {
        toast({
          variant: "destructive",
          title: "Firebase Popup Blocked",
          description:
            "Use the 'Verify Integration Link' button instead to validate your manual credentials if Google Sign-in is restricted.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Authorization Failed",
          description: err.message || "Could not initialize Google Auth popup.",
        });
      }
    }
  };

  const clientEmails = useMemo(
    () => clients.map((c) => c.email?.toLowerCase()).filter(Boolean),
    [clients],
  );

  const filteredEmails = useMemo(() => {
    return emails
      .filter((email) => !archivedItemIds.has(email.id) && !dismissedItemIds.has(email.id))
      .filter((email) => {
        const fromLower = email.from.toLowerCase();
        const isFromClient = clientEmails.some((clientEmail) => fromLower.includes(clientEmail!));

        if (onlyShowClients && !isFromClient) return false;
        if (!searchQuery) return true;

        const q = searchQuery.toLowerCase();
        const body = (email.bodyPreview || email.snippet || "").toLowerCase();
        return (
          email.subject.toLowerCase().includes(q) ||
          email.from.toLowerCase().includes(q) ||
          body.includes(q)
        );
      });
  }, [emails, clientEmails, searchQuery, onlyShowClients, archivedItemIds, dismissedItemIds]);

  const googleFiles = useMemo(() => {
    return files
      .filter((f) => f.source === "google" && !archivedItemIds.has(f.id) && !dismissedItemIds.has(f.id))
      .filter((f) => !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [files, archivedItemIds, dismissedItemIds, searchQuery]);

  return {
    isSyncing,
    isVerifying,
    searchQuery,
    setSearchQuery,
    syncError,
    backgroundSyncError,
    onlyShowClients,
    setOnlyShowClients,
    archivedItemIds,
    dismissedItemIds,
    isNoteDialogOpen,
    setIsNoteDialogOpen,
    isTaskDialogOpen,
    setIsTaskDialogOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    selectedItem,
    setSelectedItem,
    targetProjectId,
    setTargetProjectId,
    taskForm,
    setTaskForm,
    localConfig,
    setLocalConfig,
    emails,
    files,
    serverEnvOAuthConfigured,
    integrationConfig,
    googleSuiteLinked,
    sortedProjects,
    clientEmails,
    filteredEmails,
    googleFiles,
    performDeepSync,
    openNoteDialog,
    openTaskDialog,
    handleDismissItem,
    handleDismissIds,
    resetHiddenInbox,
    handleArchiveToLedger,
    handleCreateTask,
    handleSaveSettings,
    handleVerifyLink,
    handleConnectGoogle,
    getMimeLabel,
    formatFileSize,
    updateIntegrationConfig,
  };
}

export type InboxTabViewModel = ReturnType<typeof useInboxTabModel>;

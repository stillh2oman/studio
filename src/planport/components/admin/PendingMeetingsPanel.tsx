"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@planport/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CalendarClock, ExternalLink, Loader2, CheckCircle, Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PendingMeeting = {
  id: string;
  summary?: string | null;
  htmlLink?: string | null;
  startCentral?: string | null;
  location?: string | null;
  meetLink?: string | null;
  clientEmail?: string | null;
  clientName?: string | null;
  meetingType?: "online" | "in_person" | null;
};

type CalendarDebugPayload = {
  serviceAccountEmail: string;
  configuredCalendarId: string;
  calendars: { id?: string; summary?: string; accessRole?: string }[];
  hint?: string;
};

export function PendingMeetingsPanel() {
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  const [meetings, setMeetings] = useState<PendingMeeting[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [debugBusy, setDebugBusy] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugPayload, setDebugPayload] = useState<CalendarDebugPayload | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setMeetings([]);
      return;
    }
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/calendar/pending", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not load meetings.");
      }
      setMeetings(data.meetings || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not load meetings.";
      toast({ variant: "destructive", title: "Calendar", description: msg });
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (!isUserLoading && user?.email) {
      const ok =
        user.email === "jeff@designersink.us" ||
        user.email === "kevin@designersink.us";
      if (ok) load();
    }
  }, [isUserLoading, user, load]);

  const confirm = async (eventId: string) => {
    if (!user) return;
    setConfirmingId(eventId);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/calendar/confirm", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Confirm failed.");
      }
      if (data.emailSent) {
        toast({
          title: "Confirmed",
          description: "The client has been emailed a confirmation.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Confirmed — email not sent",
          description:
            data.emailMessage ||
            "The calendar event was confirmed but the client email could not be sent. Check server logs and Resend configuration.",
        });
      }
      await load();
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Confirm failed",
        description: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setConfirmingId(null);
    }
  };

  const runCalendarDebug = async () => {
    if (!user) return;
    setDebugBusy(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/calendar/debug-calendars", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string" ? data.error : "Debug request failed."
        );
      }
      setDebugPayload(data as CalendarDebugPayload);
      setDebugOpen(true);
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Calendar debug",
        description: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setDebugBusy(false);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "Copied to clipboard." });
    } catch {
      toast({
        variant: "destructive",
        title: "Copy failed",
        description: "Select and copy the text manually.",
      });
    }
  };

  if (isUserLoading) {
    return null;
  }

  if (
    !user ||
    (user.email !== "jeff@designersink.us" &&
      user.email !== "kevin@designersink.us")
  ) {
    return null;
  }

  return (
    <>
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-accent" />
          Pending client meetings
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => load()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Refresh"
            )}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => runCalendarDebug()}
            disabled={debugBusy}
            title="Lists calendars the service account can see and the configured GOOGLE_CALENDAR_ID"
          >
            {debugBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Calendar access"
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && meetings.length === 0 ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading…
          </p>
        ) : meetings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tentative PlanPort meetings on the calendar. Client requests show
            here after they book.
          </p>
        ) : (
          <ul className="space-y-3">
            {meetings.map((m) => (
              <li
                key={m.id}
                className="rounded-md border border-border bg-secondary p-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
              >
                <div className="space-y-1 min-w-0">
                  <div className="font-medium text-foreground truncate">
                    {m.summary || "Meeting"}
                  </div>
                  {m.startCentral && (
                    <div className="text-sm text-muted-foreground">
                      {m.startCentral}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {m.clientName && <span>{m.clientName}</span>}
                    {m.clientEmail && (
                      <a
                        className="text-accent hover:underline"
                        href={`mailto:${m.clientEmail}`}
                      >
                        {m.clientEmail}
                      </a>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Badge variant="secondary">Tentative</Badge>
                    {m.meetingType === "online" && (
                      <Badge variant="outline" className="font-normal">
                        Online (Google Meet)
                      </Badge>
                    )}
                    {m.meetingType === "in_person" && (
                      <Badge variant="outline" className="font-normal">
                        In-person
                      </Badge>
                    )}
                    {m.meetLink && (
                      <Badge variant="outline" className="font-normal">
                        Meet link ready
                      </Badge>
                    )}
                    {m.meetingType === "online" && !m.meetLink && (
                      <span className="text-[11px] text-ledger-yellow max-w-xs">
                        Add Google Meet on the event in Calendar before confirming so
                        the client gets the link by email.
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  {m.htmlLink && (
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={m.htmlLink}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="w-4 h-4 mr-1" />
                        Open
                      </a>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="bg-primary text-primary-foreground"
                    disabled={confirmingId === m.id}
                    onClick={() => confirm(m.id)}
                  >
                    {confirmingId === m.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Confirm & email client
                      </>
                    )}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>

    <Dialog open={debugOpen} onOpenChange={setDebugOpen}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Calendar access</DialogTitle>
          <DialogDescription>
            PlanPort uses a Google <strong>service account</strong> to read your designer calendar.
            If the list below is empty, the account cannot see any calendars yet.
          </DialogDescription>
        </DialogHeader>
        {debugPayload && (
          <div className="space-y-4 text-sm">
            <div className="rounded-md border border-border bg-secondary p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Service account (share your calendar with this address)
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="text-xs break-all flex-1 min-w-0 bg-background px-2 py-1 rounded border">
                  {debugPayload.serviceAccountEmail}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => copyText(debugPayload.serviceAccountEmail)}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Configured calendar ID
              </p>
              <code className="text-xs">{debugPayload.configuredCalendarId}</code>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Calendars this account can see ({debugPayload.calendars?.length ?? 0})
              </p>
              {(debugPayload.calendars?.length ?? 0) === 0 ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm space-y-2">
                  <p className="font-medium">No calendars yet</p>
                  <ol className="list-decimal pl-4 space-y-1 text-foreground/90">
                    <li>
                      In Google Calendar, open <strong>{debugPayload.configuredCalendarId}</strong> (or the calendar you want PlanPort to use).
                    </li>
                    <li>
                      Settings → <strong>Share with specific people</strong> → add the service account email above.
                    </li>
                    <li>
                      Permission: <strong>Make changes to events</strong> (or higher).
                    </li>
                    <li>Click Calendar access again to refresh.</li>
                  </ol>
                  {debugPayload.hint && (
                    <p className="text-xs text-muted-foreground pt-1">{debugPayload.hint}</p>
                  )}
                </div>
              ) : (
                <ul className="space-y-2 max-h-48 overflow-y-auto">
                  {debugPayload.calendars.map((c, i) => (
                    <li
                      key={c.id || `cal-${i}`}
                      className="rounded border px-2 py-1.5 text-xs flex justify-between gap-2"
                    >
                      <span className="truncate">{c.summary || c.id}</span>
                      <span className="text-muted-foreground shrink-0">{c.accessRole}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}

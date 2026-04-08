"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import {
  ALLOWED_BOOKING_LUXON_WEEKDAYS,
  DESIGNER_CALENDAR_TIMEZONE,
  MEETING_DURATION_MINUTES,
} from "@/lib/planport-calendar/constants";
import { getEarliestBookableChicagoYmd } from "@/lib/planport-calendar/slots";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { CalendarClock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUser, useFirestore } from "@planport/firebase";
import { doc, setDoc } from "firebase/firestore";
import { omitUndefinedFields } from "@/lib/firestore-sanitize";

type MeetingType = "in_person" | "online";

function pickerDateToChicagoYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface ScheduleMeetingDialogProps {
  projectName: string;
  projectAddress?: string;
  hubLabel?: string;
  /** When set with hub id + project id, hub project shows meeting status after booking. */
  planportHubKind?: "client" | "gc";
  planportHubId?: string;
  planportProjectId?: string;
  trigger?: React.ReactNode;
  /** Which Google Calendar drives availability + booking (default Jeff). */
  bookingCalendarOwner?: "jeff" | "kevin";
  /** Shown in loading copy and default trigger (e.g. Jeff, Kevin). */
  schedulerDisplayName?: string;
}

export function ScheduleMeetingDialog({
  projectName,
  projectAddress,
  hubLabel,
  planportHubKind,
  planportHubId,
  planportProjectId,
  trigger,
  bookingCalendarOwner = "jeff",
  schedulerDisplayName = "Jeff",
}: ScheduleMeetingDialogProps) {
  const { toast } = useToast();
  const { user } = useUser();
  const db = useFirestore();
  const [open, setOpen] = useState(false);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [slotsByDate, setSlotsByDate] = useState<Record<string, string[]>>({});
  const [month, setMonth] = useState<Date>(() => {
    const chi = DateTime.now().setZone(DESIGNER_CALENDAR_TIMEZONE);
    return new Date(chi.year, chi.month - 1, 1);
  });

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedSlotIso, setSelectedSlotIso] = useState<string | null>(null);
  const [meetingType, setMeetingType] = useState<MeetingType>("in_person");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const earliestBookableYmd = useMemo(
    () => getEarliestBookableChicagoYmd(),
    [open]
  );

  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;

  const calendarOwnerParam = bookingCalendarOwner === "kevin" ? "kevin" : "jeff";

  const loadMonth = useCallback(async (key: string) => {
    setLoadingMonth(true);
    try {
      const res = await fetch(
        `/api/calendar/availability?month=${encodeURIComponent(key)}&owner=${calendarOwnerParam}`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not load availability.");
      }
      setSlotsByDate(data.slotsByDate || {});
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not load availability.";
      toast({ variant: "destructive", title: "Calendar unavailable", description: msg });
      setSlotsByDate({});
    } finally {
      setLoadingMonth(false);
    }
  }, [toast, calendarOwnerParam]);

  useEffect(() => {
    if (open) {
      loadMonth(monthKey);
    }
  }, [open, monthKey, loadMonth]);

  const datesWithSlots = useMemo(() => {
    const s = new Set<string>();
    for (const [d, slots] of Object.entries(slotsByDate)) {
      if (slots.length > 0) s.add(d);
    }
    return s;
  }, [slotsByDate]);

  const selectedYmd = selectedDate
    ? pickerDateToChicagoYmd(selectedDate)
    : null;
  const slotChoices = selectedYmd ? slotsByDate[selectedYmd] || [] : [];

  useEffect(() => {
    if (
      selectedSlotIso &&
      selectedYmd &&
      !slotChoices.includes(selectedSlotIso)
    ) {
      setSelectedSlotIso(null);
    }
  }, [selectedYmd, selectedSlotIso, slotChoices]);

  const handleSubmit = async () => {
    if (!selectedSlotIso) {
      toast({
        variant: "destructive",
        title: "Pick a time",
        description: "Choose a date and a 90-minute time slot.",
      });
      return;
    }
    if (clientName.trim().length < 2 || !clientEmail.includes("@")) {
      toast({
        variant: "destructive",
        title: "Contact details",
        description: "Please enter your name and a valid email.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/calendar/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startIso: selectedSlotIso,
          meetingType,
          clientName: clientName.trim(),
          clientEmail: clientEmail.trim(),
          clientPhone: clientPhone.trim() || undefined,
          projectName,
          projectAddress,
          hubLabel,
          bookingCalendarOwner,
          ...(planportHubKind && planportHubId && planportProjectId
            ? {
                planportHubKind,
                planportHubId,
                planportProjectId,
              }
            : {}),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        eventId?: string;
        htmlLink?: string | null;
        meetLink?: string | null;
      };
      if (!res.ok) {
        throw new Error(data.error || "Booking failed.");
      }

      // Optional mirror for signed-in staff: Firestore forbids `undefined` (e.g. no Meet link for in-person).
      if (user?.uid && !user.isAnonymous && data.eventId) {
        try {
          const raw: Record<string, unknown> = {
            eventId: data.eventId,
            htmlLink: data.htmlLink ?? null,
            googleMeetLink: data.meetLink ?? null,
            meetingType,
            startIso: selectedSlotIso,
            projectName,
            projectAddress: projectAddress ?? null,
            hubLabel: hubLabel ?? null,
            clientName: clientName.trim(),
            clientEmail: clientEmail.trim(),
            clientPhone: clientPhone.trim() ? clientPhone.trim() : null,
            bookingCalendarOwner,
            planportHubKind: planportHubKind ?? null,
            planportHubId: planportHubId ?? null,
            planportProjectId: planportProjectId ?? null,
            createdAt: new Date().toISOString(),
          };
          await setDoc(
            doc(db, "employees", user.uid, "calendarEvents", data.eventId),
            omitUndefinedFields(raw)
          );
        } catch (persistErr) {
          const msg =
            persistErr instanceof Error ? persistErr.message : "Could not save calendar copy.";
          toast({
            variant: "destructive",
            title: "Calendar save failed",
            description: msg,
          });
        }
      }

      toast({
        title: "Request sent",
        description: data.message,
      });
      setOpen(false);
      setSelectedDate(undefined);
      setSelectedSlotIso(null);
      setClientName("");
      setClientEmail("");
      setClientPhone("");
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Booking failed",
        description: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            type="button"
            variant="outline"
            className="w-full border-border"
          >
            <CalendarClock className="w-4 h-4 mr-2" />
            Schedule meeting with {schedulerDisplayName}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto overflow-x-hidden bg-background">
        <DialogHeader>
          <DialogTitle className="text-xl text-primary flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-accent" />
            Schedule a meeting
          </DialogTitle>
          <DialogDescription className="text-left space-y-1">
            <span className="block">
              Choose an available day, then a {MEETING_DURATION_MINUTES}-minute
              start time. Times are <strong>US Central (Chicago)</strong>.
              Unavailable dates are grayed out.
            </span>
            <span className="block text-xs text-muted-foreground">
              Project: {projectName}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {loadingMonth && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading {schedulerDisplayName}&apos;s calendar…
            </div>
          )}

          <div className="flex justify-center rounded-md border border-border bg-secondary p-3">
            <Calendar
              mode="single"
              month={month}
              onMonthChange={setMonth}
              selected={selectedDate}
              onSelect={(d) => {
                setSelectedDate(d ?? undefined);
                setSelectedSlotIso(null);
              }}
              disabled={(date) => {
                const ymd = pickerDateToChicagoYmd(date);
                if (ymd < earliestBookableYmd) return true;
                const dt = DateTime.fromISO(ymd, {
                  zone: DESIGNER_CALENDAR_TIMEZONE,
                });
                if (!ALLOWED_BOOKING_LUXON_WEEKDAYS.has(dt.weekday)) {
                  return true;
                }
                return !datesWithSlots.has(ymd);
              }}
            />
          </div>

          {selectedDate && selectedYmd && (
            <div className="space-y-2">
              <Label className="text-primary font-semibold">
                Available start times ({MEETING_DURATION_MINUTES} min)
              </Label>
              {slotChoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No open slots that day. Try another date.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {slotChoices.map((iso) => {
                    const label = DateTime.fromISO(iso, { zone: "utc" })
                      .setZone(DESIGNER_CALENDAR_TIMEZONE)
                      .toFormat("h:mm a");
                    const active = selectedSlotIso === iso;
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => setSelectedSlotIso(iso)}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-sm font-medium transition-colors text-left",
                          active
                            ? "border-accent bg-accent/15 text-primary"
                            : "border-border hover:bg-muted/80"
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            <Label className="text-primary font-semibold">Meeting format</Label>
            <RadioGroup
              value={meetingType}
              onValueChange={(v) => setMeetingType(v as MeetingType)}
              className="grid gap-3"
            >
              <div className="flex items-start space-x-3 space-y-0 rounded-lg border p-3">
                <RadioGroupItem value="in_person" id="in_person" />
                <div className="grid gap-1">
                  <Label htmlFor="in_person" className="font-medium cursor-pointer">
                    In-person
                  </Label>
                  <p className="text-xs text-muted-foreground leading-snug">
                    2324 W 7th Place, Suite #1, Stillwater, Oklahoma
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3 space-y-0 rounded-lg border p-3">
                <RadioGroupItem value="online" id="online" />
                <div className="grid gap-1">
                  <Label htmlFor="online" className="font-medium cursor-pointer">
                    Online (Google Meet)
                  </Label>
                  <p className="text-xs text-muted-foreground leading-snug">
                    A Meet link is created when the invite is finalized.
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="sm-name">Your name</Label>
              <Input
                id="sm-name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Full name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sm-email">Email</Label>
              <Input
                id="sm-email"
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sm-phone">Phone (optional)</Label>
              <Input
                id="sm-phone"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="(555) 555-5555"
              />
            </div>
          </div>

          <Button
            type="button"
            className="w-full h-11 bg-primary text-primary-foreground"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending request…
              </>
            ) : (
              "Request appointment"
            )}
          </Button>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Your request appears on Jeff’s calendar as tentative. After it is
            confirmed, you will receive a confirmation email with final details.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

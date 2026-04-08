"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { addDays, endOfMonth, format, isBefore, startOfDay, startOfMonth } from "date-fns";
import { Loader2, Calendar as CalendarIcon, Video, MapPin } from "lucide-react";

type MeetingType = "online" | "in_person";

type Slot = { start: string; end: string };

export function RequestMeetingDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  firmId: string;
  accountId?: string;
  accountName?: string;
  accountEmail?: string;
  projectId?: string;
  projectName?: string;
  triggerLabel?: string;
}) {
  const { toast } = useToast();
  const [meetingType, setMeetingType] = useState<MeetingType>("online");
  const [date, setDate] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [selectedDateObj, setSelectedDateObj] = useState<Date | undefined>(new Date());
  const [month, setMonth] = useState<Date>(new Date());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedStart, setSelectedStart] = useState<string>("");
  const [monthAvailability, setMonthAvailability] = useState<Record<string, Slot[]>>({});
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [notes, setNotes] = useState("");

  const minDate = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const maxDate = useMemo(() => format(addDays(new Date(), 365), "yyyy-MM-dd"), []);

  useEffect(() => {
    if (!props.open) {
      setSlots([]);
      setSelectedStart("");
      setNotes("");
      setMeetingType("online");
      setDate(format(new Date(), "yyyy-MM-dd"));
      setSelectedDateObj(new Date());
      setMonth(new Date());
      setMonthAvailability({});
    }
  }, [props.open]);

  const loadMonthAvailability = async (targetMonth: Date) => {
    setIsLoadingSlots(true);
    try {
      const monthStart = startOfMonth(targetMonth);
      const monthEnd = endOfMonth(targetMonth);
      const resp = await fetch("/api/scheduling/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: format(monthStart, "yyyy-MM-dd"),
          endDate: format(monthEnd, "yyyy-MM-dd"),
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || `Availability failed (${resp.status})`);
      setMonthAvailability((data?.byDate && typeof data.byDate === "object") ? data.byDate : {});
    } catch (e: any) {
      setMonthAvailability({});
      toast({ variant: "destructive", title: "Availability error", description: e?.message || "Could not load availability." });
    } finally {
      setIsLoadingSlots(false);
    }
  };

  useEffect(() => {
    if (!props.open) return;
    loadMonthAvailability(month);
  }, [month, props.open]);

  const isBlockedWeekday = (d: Date) => {
    const day = d.getDay();
    return day === 1 || day === 3 || day === 5;
  };

  const isUnavailable = (d: Date) => {
    if (isBefore(startOfDay(d), startOfDay(new Date()))) return true;
    if (isBlockedWeekday(d)) return true;
    const key = format(d, "yyyy-MM-dd");
    if (!(key in monthAvailability)) return false; // still loading this month
    return (monthAvailability[key]?.length || 0) === 0;
  };

  const onSelectDate = (d: Date | undefined) => {
    if (!d || isUnavailable(d)) return;
    const key = format(d, "yyyy-MM-dd");
    setSelectedDateObj(d);
    setDate(key);
    setSelectedStart("");
    setSlots(monthAvailability[key] || []);
  };

  const book = async () => {
    if (!selectedStart) return;
    setIsBooking(true);
    try {
      const resp = await fetch("/api/scheduling/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firmId: props.firmId,
          accountId: props.accountId,
          accountName: props.accountName,
          accountEmail: props.accountEmail,
          projectId: props.projectId,
          projectName: props.projectName,
          start: selectedStart,
          meetingType: meetingType === "online" ? "online" : "in_person",
          notes,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || `Booking failed (${resp.status})`);

      toast({
        title: "Meeting booked",
        description: data?.meetLink ? "Google Meet link created." : "Added to Jeff’s calendar.",
      });
      props.onOpenChange(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Booking error", description: e?.message || "Could not book meeting." });
    } finally {
      setIsBooking(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            Request a meeting
          </DialogTitle>
          <DialogDescription>
            Select a date and time that is most convenient for you to meet below.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <div className="rounded-lg border border-border/50 p-2">
                <Calendar
                  mode="single"
                  month={month}
                  onMonthChange={setMonth}
                  selected={selectedDateObj}
                  onSelect={onSelectDate}
                  disabled={(d) => isUnavailable(d)}
                  fromDate={new Date(minDate)}
                  toDate={new Date(maxDate)}
                />
              </div>
              {isLoadingSlots ? <p className="text-xs text-muted-foreground">Loading availability...</p> : null}
            </div>

            <div className="space-y-2">
              <Label>Meeting type</Label>
              <RadioGroup value={meetingType} onValueChange={(v) => setMeetingType(v as MeetingType)} className="grid gap-2">
                <label className={cn("flex items-center gap-2 rounded-lg border border-border/50 p-3 cursor-pointer", meetingType === "online" && "border-primary/40 bg-primary/5")}>
                  <RadioGroupItem value="online" />
                  <Video className="h-4 w-4 text-primary" />
                  <div className="leading-tight">
                    <div className="text-sm font-bold">Online (Google Meet)</div>
                    <div className="text-xs text-muted-foreground">Meet link auto-generated</div>
                  </div>
                </label>
                <label className={cn("flex items-center gap-2 rounded-lg border border-border/50 p-3 cursor-pointer", meetingType === "in_person" && "border-primary/40 bg-primary/5")}>
                  <RadioGroupItem value="in_person" />
                  <MapPin className="h-4 w-4 text-accent" />
                  <div className="leading-tight">
                    <div className="text-sm font-bold">In-person</div>
                    <div className="text-xs text-muted-foreground">2324 W 7th Place, Suite #1, Stillwater, OK</div>
                  </div>
                </label>
              </RadioGroup>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Available times</Label>
            {slots.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/50 bg-muted/20 p-4 text-sm text-muted-foreground">
                {date ? "Select an available date to see times." : "Select an available date to see times."}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {slots.map((s) => {
                  const startLabel = (() => {
                    try {
                      return format(new Date(s.start), "h:mm a");
                    } catch {
                      return s.start;
                    }
                  })();
                  const selected = selectedStart === s.start;
                  return (
                    <Button
                      key={s.start}
                      variant={selected ? "default" : "outline"}
                      onClick={() => setSelectedStart(s.start)}
                      className="justify-center"
                    >
                      {startLabel}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything Jeff should know ahead of time?" />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={book} disabled={!selectedStart || isBooking} className="gap-2">
            {isBooking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Confirm booking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


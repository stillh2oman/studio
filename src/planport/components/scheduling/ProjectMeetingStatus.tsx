"use client";

import { DateTime } from "luxon";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { DESIGNER_CALENDAR_TIMEZONE } from "@/lib/planport-calendar/constants";

type Props = {
  status?: string | null;
  /** UTC ISO start from `scheduledMeetingStartIso` on the project doc */
  startIso?: string | null;
  className?: string;
};

function formatMeetingStartCentral(iso: string): string | null {
  const dt = DateTime.fromISO(iso, { setZone: true });
  if (!dt.isValid) return null;
  return dt
    .setZone(DESIGNER_CALENDAR_TIMEZONE)
    .toFormat("MMMM d, yyyy · h:mm a 'Central'");
}

/** Shown next to project location when a Jeff-calendar meeting was requested or confirmed. */
export function ProjectMeetingStatus({ status, startIso, className }: Props) {
  if (status !== "pending" && status !== "confirmed") return null;
  const isPending = status === "pending";
  const when =
    startIso && startIso.trim()
      ? formatMeetingStartCentral(startIso.trim())
      : null;

  return (
    <span
      className={cn(
        "inline-flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-1 text-xs font-medium max-w-[min(100%,20rem)]",
        isPending
          ? "border-ledger-yellow/45 bg-background text-ledger-yellow"
          : "border-emerald-800/60 bg-background text-emerald-400/95",
        className
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <CalendarClock className="h-3.5 w-3.5 shrink-0 opacity-90" />
        {isPending ? "Meeting: confirmation pending" : "Meeting: confirmed"}
      </span>
      {when && (
        <span className="pl-5 text-[11px] font-normal leading-snug opacity-95">
          {when}
        </span>
      )}
    </span>
  );
}

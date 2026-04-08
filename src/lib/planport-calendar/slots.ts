import { DateTime } from "luxon";
import {
  ALLOWED_BOOKING_LUXON_WEEKDAYS,
  BOOKING_MIN_LEAD_FULL_DAYS,
  DESIGNER_CALENDAR_TIMEZONE,
  MEETING_BUFFER_MINUTES,
  MEETING_DURATION_MINUTES,
  WINDOW_END_HOUR,
  WINDOW_END_MINUTE,
  WINDOW_START_HOUR,
  WINDOW_START_MINUTE,
} from "./constants";

export type BusyInterval = { start: Date; end: Date };

/** First YYYY-MM-DD (Chicago) that may be booked, relative to `reference` (default: now). */
export function getEarliestBookableChicagoYmd(
  reference: DateTime = DateTime.now().setZone(DESIGNER_CALENDAR_TIMEZONE)
): string {
  return reference
    .startOf("day")
    .plus({ days: BOOKING_MIN_LEAD_FULL_DAYS + 1 })
    .toISODate()!;
}

function rangesOverlap(
  a0: number,
  a1: number,
  b0: number,
  b1: number
): boolean {
  return a0 < b1 && b0 < a1;
}

/**
 * YYYY-MM-DD interpreted in Central Time; returns UTC ISO strings for slot starts.
 */
export function computeSlotsForChicagoDate(
  chicagoDateYmd: string,
  busy: BusyInterval[]
): string[] {
  const dayStart = DateTime.fromISO(chicagoDateYmd, {
    zone: DESIGNER_CALENDAR_TIMEZONE,
  }).startOf("day");

  if (!dayStart.isValid) return [];

  const earliestYmd = getEarliestBookableChicagoYmd();
  if (chicagoDateYmd < earliestYmd) return [];

  if (!ALLOWED_BOOKING_LUXON_WEEKDAYS.has(dayStart.weekday)) {
    return [];
  }

  const lastStart = dayStart.set({
    hour: WINDOW_END_HOUR,
    minute: WINDOW_END_MINUTE,
    second: 0,
    millisecond: 0,
  }).minus({ minutes: MEETING_DURATION_MINUTES });

  let cursor = dayStart.set({
    hour: WINDOW_START_HOUR,
    minute: WINDOW_START_MINUTE,
    second: 0,
    millisecond: 0,
  });

  const slots: string[] = [];
  const busyMs = busy.map((b) => ({
    start: b.start.getTime(),
    end: b.end.getTime(),
  }));

  while (cursor <= lastStart) {
    const start = cursor;
    const end = cursor.plus({ minutes: MEETING_DURATION_MINUTES });
    const blockStart = start.minus({ minutes: MEETING_BUFFER_MINUTES });
    const blockEnd = end.plus({ minutes: MEETING_BUFFER_MINUTES });
    const bs = blockStart.toUTC().toMillis();
    const be = blockEnd.toUTC().toMillis();

    const conflict = busyMs.some((b) => rangesOverlap(bs, be, b.start, b.end));
    if (!conflict) {
      const iso = start.toUTC().toISO();
      if (iso) slots.push(iso);
    }

    cursor = cursor.plus({ minutes: 30 });
  }

  return slots;
}

/** Inclusive range in Chicago; each key is YYYY-MM-DD (Chicago calendar date). */
export function computeSlotsForChicagoRange(
  chicagoFromYmd: string,
  chicagoToYmd: string,
  busy: BusyInterval[]
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let d = DateTime.fromISO(chicagoFromYmd, {
    zone: DESIGNER_CALENDAR_TIMEZONE,
  }).startOf("day");
  const end = DateTime.fromISO(chicagoToYmd, {
    zone: DESIGNER_CALENDAR_TIMEZONE,
  }).startOf("day");

  if (!d.isValid || !end.isValid) return out;

  while (d <= end) {
    const key = d.toISODate();
    if (key) out[key] = computeSlotsForChicagoDate(key, busy);
    d = d.plus({ days: 1 });
  }

  return out;
}

export function parseBusyFromFreeBusy(
  raw: { start?: string | null; end?: string | null }[]
): BusyInterval[] {
  const intervals: BusyInterval[] = [];
  for (const b of raw) {
    if (!b.start || !b.end) continue;
    const start = new Date(b.start);
    const end = new Date(b.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    intervals.push({ start, end });
  }
  return intervals;
}

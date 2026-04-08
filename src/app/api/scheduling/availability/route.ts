import { NextResponse } from "next/server";
import { addMinutes, eachDayOfInterval, format, formatISO, isAfter, isValid, parseISO, set } from "date-fns";
import { getGoogleAccessToken } from "@/lib/google-oauth";
import { DEFAULT_GOOGLE_CALENDAR_ID, GOOGLE_CALENDAR_TIME_ZONE } from "@/lib/google-calendar-constants";

const TIME_ZONE = GOOGLE_CALENDAR_TIME_ZONE;
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID?.trim() || DEFAULT_GOOGLE_CALENDAR_ID;

const MEETING_MINUTES = 90;
const BUFFER_MINUTES = 30;

function mapGoogleCalendarError(data: any, fallback: string) {
  const message = String(data?.error?.message || fallback);
  const reason = String(data?.error?.errors?.[0]?.reason || "").toLowerCase();
  const lower = message.toLowerCase();
  const isScopeError =
    reason.includes("insufficient") ||
    lower.includes("insufficient authentication scopes") ||
    lower.includes("insufficientpermissions");

  if (!isScopeError) return message;

  return [
    "Google Calendar authorization is missing required scopes.",
    "Reconnect Google OAuth and issue a NEW refresh token with these scopes:",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.freebusy",
  ].join(" ");
}

function isBlockedDay(date: Date) {
  // 0 Sun, 1 Mon, 2 Tue, 3 Wed, 4 Thu, 5 Fri, 6 Sat
  const d = date.getDay();
  return d === 1 || d === 3 || d === 5;
}

function buildDayWindow(date: Date) {
  // Available hours: 1:30 PM to 9:30 PM America/Chicago
  const start = set(date, { hours: 13, minutes: 30, seconds: 0, milliseconds: 0 });
  const end = set(date, { hours: 21, minutes: 30, seconds: 0, milliseconds: 0 });
  return { start, end };
}

type BusyInterval = { start: Date; end: Date };

function expandBusyIntervals(busy: BusyInterval[]) {
  return busy
    .map((b) => ({
      start: addMinutes(b.start, -BUFFER_MINUTES),
      end: addMinutes(b.end, BUFFER_MINUTES),
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

function mergeIntervals(intervals: BusyInterval[]) {
  const out: BusyInterval[] = [];
  for (const it of intervals) {
    if (!out.length) {
      out.push(it);
      continue;
    }
    const last = out[out.length - 1]!;
    if (it.start.getTime() <= last.end.getTime()) {
      if (it.end.getTime() > last.end.getTime()) last.end = it.end;
    } else {
      out.push(it);
    }
  }
  return out;
}

function generateSlots(dayStart: Date, dayEnd: Date, busy: BusyInterval[]) {
  const latestStart = addMinutes(dayEnd, -MEETING_MINUTES);
  const stepMinutes = 30;

  const slots: { start: Date; end: Date }[] = [];
  for (let cursor = new Date(dayStart); cursor.getTime() <= latestStart.getTime(); cursor = addMinutes(cursor, stepMinutes)) {
    const end = addMinutes(cursor, MEETING_MINUTES);

    const overlaps = busy.some((b) => cursor.getTime() < b.end.getTime() && end.getTime() > b.start.getTime());
    if (!overlaps) slots.push({ start: cursor, end });
  }
  return slots;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { date?: string; startDate?: string; endDate?: string };
    const dateStr = String(body?.date || "").trim(); // YYYY-MM-DD
    const startDateStr = String(body?.startDate || "").trim(); // YYYY-MM-DD
    const endDateStr = String(body?.endDate || "").trim(); // YYYY-MM-DD

    const isRange = !!startDateStr && !!endDateStr;
    if (!isRange && !dateStr) return NextResponse.json({ error: "Missing date or range" }, { status: 400 });

    const startDate = isRange ? parseISO(startDateStr) : parseISO(dateStr);
    const endDate = isRange ? parseISO(endDateStr) : parseISO(dateStr);
    if (!isValid(startDate) || !isValid(endDate)) {
      return NextResponse.json({ error: "Invalid date value" }, { status: 400 });
    }
    if (isAfter(startDate, endDate)) {
      return NextResponse.json({ error: "Invalid range: startDate is after endDate" }, { status: 400 });
    }

    const targetDays = eachDayOfInterval({ start: startDate, end: endDate });
    const openDays = targetDays.filter((d) => !isBlockedDay(d));
    if (!openDays.length) {
      if (isRange) {
        const byDate = Object.fromEntries(targetDays.map((d) => [format(d, "yyyy-MM-dd"), []]));
        return NextResponse.json({ timeZone: TIME_ZONE, meetingMinutes: MEETING_MINUTES, bufferMinutes: BUFFER_MINUTES, byDate });
      }
      return NextResponse.json({ timeZone: TIME_ZONE, date: format(startDate, "yyyy-MM-dd"), slots: [] });
    }

    const dayStarts = openDays.map((d) => buildDayWindow(d).start);
    const dayEnds = openDays.map((d) => buildDayWindow(d).end);

    const globalStart = dayStarts.reduce((min, d) => (d.getTime() < min.getTime() ? d : min));
    const globalEnd = dayEnds.reduce((max, d) => (d.getTime() > max.getTime() ? d : max));

    const accessToken = await getGoogleAccessToken();

    // Query a wider window to respect buffers around all target dates.
    const timeMin = addMinutes(globalStart, -BUFFER_MINUTES);
    const timeMax = addMinutes(globalEnd, BUFFER_MINUTES);

    const resp = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin: formatISO(timeMin),
        timeMax: formatISO(timeMax),
        timeZone: TIME_ZONE,
        items: [{ id: CALENDAR_ID }],
      }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return NextResponse.json(
        { error: mapGoogleCalendarError(data, "Google Calendar freeBusy failed"), raw: data },
        { status: resp.status },
      );
    }

    const rawBusy: any[] = data?.calendars?.[CALENDAR_ID]?.busy || [];
    const busyIntervals: BusyInterval[] = rawBusy
      .map((b) => ({ start: new Date(b.start), end: new Date(b.end) }))
      .filter((b) => isValid(b.start) && isValid(b.end));

    const blocked = mergeIntervals(expandBusyIntervals(busyIntervals));

    if (isRange) {
      const byDate: Record<string, { start: string; end: string }[]> = {};
      for (const d of targetDays) {
        const key = format(d, "yyyy-MM-dd");
        if (isBlockedDay(d)) {
          byDate[key] = [];
          continue;
        }
        const { start, end } = buildDayWindow(d);
        byDate[key] = generateSlots(start, end, blocked).map((s) => ({
          start: formatISO(s.start),
          end: formatISO(s.end),
        }));
      }
      return NextResponse.json({ timeZone: TIME_ZONE, meetingMinutes: MEETING_MINUTES, bufferMinutes: BUFFER_MINUTES, byDate });
    }

    const { start, end } = buildDayWindow(startDate);
    const slots = generateSlots(start, end, blocked).map((s) => ({
      start: formatISO(s.start),
      end: formatISO(s.end),
    }));

    return NextResponse.json({
      timeZone: TIME_ZONE,
      date: format(startDate, "yyyy-MM-dd"),
      meetingMinutes: MEETING_MINUTES,
      bufferMinutes: BUFFER_MINUTES,
      slots,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}


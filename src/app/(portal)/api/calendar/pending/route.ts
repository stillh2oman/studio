import { NextRequest, NextResponse } from "next/server";
import { assertCalendarAdmin } from "@/lib/firebase-admin-app";
import {
  listPendingPlanportEvents,
  parseClientEmailFromPlanportBookingDescription,
} from "@/lib/planport-calendar/google-calendar";
import { DateTime } from "luxon";
import {
  DESIGNER_CALENDAR_TIMEZONE,
  getPlanportStaffBookingEmailsLowercased,
  PLANPORT_CLIENT_EMAIL_PROP,
  PLANPORT_CLIENT_NAME_PROP,
  PLANPORT_MEETING_TYPE_PROP,
} from "@/lib/planport-calendar/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization")?.trim();
  if (!h?.toLowerCase().startsWith("bearer ")) return null;
  return h.slice(7).trim() || null;
}

export async function GET(req: NextRequest) {
  try {
    await assertCalendarAdmin(bearer(req));

    const timeMin = DateTime.now()
      .setZone(DESIGNER_CALENDAR_TIMEZONE)
      .minus({ days: 1 })
      .toUTC()
      .toISO()!;

    const items = await listPendingPlanportEvents(timeMin);
    const tentative = items.filter((e) => e.status === "tentative");
    const staffEmails = getPlanportStaffBookingEmailsLowercased();

    const meetings = tentative.map((e) => {
      const startRaw = e.start?.dateTime || e.start?.date;
      const endRaw = e.end?.dateTime || e.end?.date;
      const startDt = startRaw
        ? DateTime.fromISO(startRaw, { setZone: true })
        : null;
      const priv = e.extendedProperties?.private;
      const privEmail = priv?.[PLANPORT_CLIENT_EMAIL_PROP]?.trim();
      const privName = priv?.[PLANPORT_CLIENT_NAME_PROP]?.trim();
      const meetingTypeRaw = priv?.[PLANPORT_MEETING_TYPE_PROP]?.trim();
      const meetingType =
        meetingTypeRaw === "online" || meetingTypeRaw === "in_person"
          ? meetingTypeRaw
          : null;
      const guest = e.attendees?.find(
        (a) => a.email && !staffEmails.has(a.email.toLowerCase())
      );
      const fromDesc = parseClientEmailFromPlanportBookingDescription(
        e.description
      );
      return {
        id: e.id,
        summary: e.summary,
        htmlLink: e.htmlLink,
        startUtc: startRaw,
        startCentral: startDt
          ? startDt.setZone(DESIGNER_CALENDAR_TIMEZONE).toFormat("MMMM d, yyyy h:mm a")
          : null,
        endUtc: endRaw,
        location: e.location,
        meetLink: e.hangoutLink,
        clientEmail: privEmail || guest?.email || fromDesc || null,
        clientName: privName || guest?.displayName || null,
        meetingType,
      };
    });

    return NextResponse.json({ meetings });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to list meetings.";
    const status =
      message === "Unauthorized"
        ? 401
        : message === "Forbidden"
          ? 403
          : 500;
    console.error("[calendar/pending]", e);
    return NextResponse.json({ error: message }, { status });
  }
}

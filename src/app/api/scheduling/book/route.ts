import { NextResponse } from "next/server";
import { addMinutes, formatISO, isValid, parseISO } from "date-fns";
import { randomUUID } from "crypto";
import { getGoogleAccessToken } from "@/lib/google-oauth";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { DEFAULT_GOOGLE_CALENDAR_ID, GOOGLE_CALENDAR_TIME_ZONE } from "@/lib/google-calendar-constants";

const TIME_ZONE = GOOGLE_CALENDAR_TIME_ZONE;
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID?.trim() || DEFAULT_GOOGLE_CALENDAR_ID;

const MEETING_MINUTES = 90;

const OFFICE_ADDRESS = "2324 W 7th Place, Suite #1, Stillwater, Oklahoma";

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

type BookBody = {
  firmId?: string;
  accountId?: string;
  accountName?: string;
  accountEmail?: string;
  projectId?: string;
  projectName?: string;
  start?: string; // ISO
  meetingType?: "in_person" | "online";
  notes?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as BookBody;

    const firmId = String(body.firmId || "").trim();
    if (!firmId) return NextResponse.json({ error: "Missing firmId" }, { status: 400 });

    const startIso = String(body.start || "").trim();
    if (!startIso) return NextResponse.json({ error: "Missing start" }, { status: 400 });

    const start = parseISO(startIso);
    if (!isValid(start)) return NextResponse.json({ error: "Invalid start" }, { status: 400 });

    const end = addMinutes(start, MEETING_MINUTES);

    const meetingType = (body.meetingType === "in_person" || body.meetingType === "online")
      ? body.meetingType
      : "online";

    const accountName = String(body.accountName || "").trim();
    const accountEmail = String(body.accountEmail || "").trim();
    const projectName = String(body.projectName || "").trim();
    const projectId = String(body.projectId || "").trim();
    const accountId = String(body.accountId || "").trim();
    const notes = String(body.notes || "").trim();

    const summary =
      projectName
        ? `Client Meeting - ${projectName}`
        : "Client Meeting";

    const descriptionLines = [
      "Scheduled via Designer's Ink PlanPort / Ledger.",
      accountName ? `Client/Contractor: ${accountName}` : "",
      accountEmail ? `Email: ${accountEmail}` : "",
      projectName ? `Project: ${projectName}` : "",
      projectId ? `Project ID: ${projectId}` : "",
      notes ? `Notes: ${notes}` : "",
    ].filter(Boolean);

    const event: any = {
      summary,
      description: descriptionLines.join("\n"),
      start: { dateTime: formatISO(start), timeZone: TIME_ZONE },
      end: { dateTime: formatISO(end), timeZone: TIME_ZONE },
      attendees: accountEmail ? [{ email: accountEmail }] : undefined,
      location: meetingType === "in_person" ? OFFICE_ADDRESS : undefined,
    };

    if (meetingType === "online") {
      event.conferenceData = {
        createRequest: {
          requestId: randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
    }

    const accessToken = await getGoogleAccessToken();
    const insertUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      CALENDAR_ID,
    )}/events?conferenceDataVersion=1&sendUpdates=none`;

    const resp = await fetch(insertUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return NextResponse.json(
        { error: mapGoogleCalendarError(data, "Google Calendar event insert failed"), raw: data },
        { status: resp.status },
      );
    }

    const meetLink =
      String(data?.hangoutLink || "").trim() ||
      String(data?.conferenceData?.entryPoints?.find((p: any) => p?.entryPointType === "video")?.uri || "").trim();

    // Write into firm calendar_events so it appears on Home page calendar.
    const db = getAdminFirestore();
    const docId = String(data?.id || "").trim() || randomUUID();

    await db
      .collection("employees")
      .doc(firmId)
      .collection("calendar_events")
      .doc(docId)
      .set(
        {
          id: docId,
          title: summary,
          description: descriptionLines.join("\n"),
          type: "ClientMeeting",
          startTime: formatISO(start),
          endTime: formatISO(end),
          ownerId: firmId,
          visibility: "Global",
          locationType: meetingType === "in_person" ? "In-Person" : "Online",
          projectIds: projectId ? [projectId] : [],
          clientIds: accountId ? [accountId] : [],
          googleCalendarEventId: String(data?.id || "").trim() || undefined,
          googleCalendarListId: CALENDAR_ID,
          googleCalendarHtmlLink: String(data?.htmlLink || "").trim() || undefined,
          googleMeetLink: meetLink || undefined,
        },
        { merge: true },
      );

    return NextResponse.json({
      ok: true,
      calendarEventId: docId,
      googleEventId: data?.id,
      htmlLink: data?.htmlLink,
      meetLink: meetLink || null,
      start: formatISO(start),
      end: formatISO(end),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}


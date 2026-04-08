import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCalendarAdmin,
  getPlanportAdminFirestore,
} from "@/lib/firebase-admin-app";
import {
  getScheduledMeetingClientEmailFromProject,
  syncProjectMeetingConfirmed,
  type PlanportHubKind,
} from "@/lib/planport-project-meeting";
import {
  getCalendarEvent,
  parseClientEmailFromPlanportBookingDescription,
  setEventConfirmed,
} from "@/lib/planport-calendar/google-calendar";
import { Resend } from "resend";
import { DateTime } from "luxon";
import {
  DESIGNER_CALENDAR_TIMEZONE,
  getPlanportStaffBookingEmailsLowercased,
  PLANPORT_CLIENT_EMAIL_PROP,
  PLANPORT_EVENT_FLAG_VALUE,
  PLANPORT_EVENT_PRIVATE_FLAG,
  PLANPORT_HUB_ID_PROP,
  PLANPORT_HUB_KIND_PROP,
  PLANPORT_PROJECT_ID_PROP,
} from "@/lib/planport-calendar/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const confirmSchema = z.object({
  eventId: z.string().min(5),
});

function bearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization")?.trim();
  if (!h?.toLowerCase().startsWith("bearer ")) return null;
  return h.slice(7).trim() || null;
}

export async function POST(req: NextRequest) {
  try {
    await assertCalendarAdmin(bearer(req));
    const { eventId } = confirmSchema.parse(await req.json());

    const existing = await getCalendarEvent(eventId);

    const priv = existing.extendedProperties?.private;
    if (priv?.[PLANPORT_EVENT_PRIVATE_FLAG] !== PLANPORT_EVENT_FLAG_VALUE) {
      return NextResponse.json({ error: "Not a PlanPort booking." }, { status: 400 });
    }

    if (existing.status !== "tentative") {
      return NextResponse.json(
        { error: "This event is not pending confirmation." },
        { status: 409 }
      );
    }

    const hubKindRaw = priv?.[PLANPORT_HUB_KIND_PROP]?.trim();
    const hubIdRaw = priv?.[PLANPORT_HUB_ID_PROP]?.trim();
    const projectIdRaw = priv?.[PLANPORT_PROJECT_ID_PROP]?.trim();

    const staffEmails = getPlanportStaffBookingEmailsLowercased();
    const privEmail = priv?.[PLANPORT_CLIENT_EMAIL_PROP]?.trim();
    let guestEmail =
      privEmail ||
      existing.attendees?.find(
        (a: { email?: string | null }) =>
          a.email && !staffEmails.has(a.email.toLowerCase())
      )?.email;

    if (
      (!guestEmail || !guestEmail.includes("@")) &&
      (hubKindRaw === "client" || hubKindRaw === "gc") &&
      hubIdRaw &&
      projectIdRaw
    ) {
      try {
        const db = getPlanportAdminFirestore();
        const fromProject = await getScheduledMeetingClientEmailFromProject(
          db,
          hubKindRaw as PlanportHubKind,
          hubIdRaw,
          projectIdRaw
        );
        if (fromProject) guestEmail = fromProject;
      } catch (lookupErr) {
        console.error(
          "[calendar/confirm] Could not load fallback client email from project:",
          lookupErr
        );
      }
    }

    if (!guestEmail || !guestEmail.includes("@")) {
      const fromDesc = parseClientEmailFromPlanportBookingDescription(
        existing.description
      );
      if (fromDesc) guestEmail = fromDesc;
    }

    const guest =
      guestEmail && guestEmail.includes("@")
        ? { email: guestEmail.trim() }
        : undefined;

    await setEventConfirmed(eventId);
    if (
      (hubKindRaw === "client" || hubKindRaw === "gc") &&
      hubIdRaw &&
      projectIdRaw
    ) {
      try {
        const db = getPlanportAdminFirestore();
        await syncProjectMeetingConfirmed({
          db,
          hubKind: hubKindRaw as PlanportHubKind,
          hubId: hubIdRaw,
          projectId: projectIdRaw,
        });
      } catch (syncErr) {
        console.error(
          "[calendar/confirm] Could not set project meeting to confirmed:",
          syncErr
        );
      }
    }

    const refreshed = await getCalendarEvent(eventId);

    const startRaw =
      refreshed.start?.dateTime || refreshed.start?.date;
    const startDt = startRaw
      ? DateTime.fromISO(startRaw, { setZone: true })
      : null;
    const centralLabel = startDt
      ? startDt
          .setZone(DESIGNER_CALENDAR_TIMEZONE)
          .toFormat("MMMM d, yyyy h:mm a 'Central'")
      : startRaw;

    const meetLink =
      refreshed.conferenceData?.entryPoints?.find(
        (e: { entryPointType?: string | null }) =>
          e.entryPointType === "video"
      )?.uri || refreshed.hangoutLink;

    const resendKey = process.env.RESEND_API_KEY?.trim();
    let emailSent = false;
    let emailMessage: string | undefined;

    if (!resendKey) {
      const msg =
        "Confirmation saved, but no email was sent: RESEND_API_KEY is not set on the server (add it in hosting env / Firebase secrets).";
      console.warn("[calendar/confirm]", msg);
      emailMessage = msg;
    } else if (!guest?.email) {
      const msg =
        "Confirmation saved, but no client email was found on the event, attendees, project record, or booking description.";
      console.warn("[calendar/confirm]", msg);
      emailMessage = msg;
    } else {
      const resend = new Resend(resendKey);
      const from =
        process.env.RESEND_FROM?.trim() || "PlanPort <onboarding@resend.dev>";
      const lines = [
        `Your meeting with Designer's Ink is confirmed.`,
        ``,
        `When: ${centralLabel}`,
        refreshed.location
          ? `Location: ${refreshed.location}`
          : null,
        meetLink ? `Google Meet: ${meetLink}` : null,
        refreshed.htmlLink
          ? `Calendar link: ${refreshed.htmlLink}`
          : null,
        ``,
        `If you need to reschedule, reply to this email or message us through PlanPort.`,
      ].filter(Boolean);

      const sendResult = await resend.emails.send({
        from,
        to: [guest.email],
        reply_to: "jeff@designersink.us",
        subject: `Confirmed: ${refreshed.summary || "your PlanPort meeting"}`,
        text: lines.join("\n"),
      });
      if (sendResult.error) {
        const errMsg =
          sendResult.error.message ||
          sendResult.error.name ||
          "Resend rejected the message.";
        console.error(
          "[calendar/confirm] Resend failed (client confirmation):",
          errMsg
        );
        emailMessage = `Confirmation saved, but the client email failed: ${errMsg} Check RESEND_FROM and domain verification in Resend.`;
      } else {
        emailSent = true;
      }
    }

    return NextResponse.json({
      ok: true,
      emailSent,
      ...(emailMessage ? { emailMessage } : {}),
    });
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : "Confirm failed.";
    const status =
      message === "Unauthorized"
        ? 401
        : message === "Forbidden"
          ? 403
          : 500;
    console.error("[calendar/confirm]", e);
    return NextResponse.json({ error: message }, { status });
  }
}

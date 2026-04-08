import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DateTime } from "luxon";
import {
  BOOKING_MIN_LEAD_FULL_DAYS,
  DESIGNER_BOOKING_EMAIL,
  DESIGNER_CALENDAR_TIMEZONE,
  MEETING_DURATION_MINUTES,
  type PlanportBookingCalendarOwner,
} from "@/lib/planport-calendar/constants";
import {
  computeSlotsForChicagoDate,
  getEarliestBookableChicagoYmd,
  parseBusyFromFreeBusy,
} from "@/lib/planport-calendar/slots";
import {
  createTentativeBookingEvent,
  hasKevinPlanportBookingCalendarConfigured,
  queryFreeBusy,
} from "@/lib/planport-calendar/google-calendar";
import { getPlanportAdminFirestore } from "@/lib/firebase-admin-app";
import { syncProjectMeetingPending } from "@/lib/planport-project-meeting";
import type { PlanportHubKind } from "@/lib/planport-project-meeting";
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bookSchema = z
  .object({
    startIso: z.string().min(10),
    meetingType: z.enum(["in_person", "online"]),
    clientName: z.string().min(2),
    clientEmail: z.string().email(),
    clientPhone: z.string().optional(),
    projectName: z.string().min(1),
    projectAddress: z.string().optional(),
    hubLabel: z.string().optional(),
    planportHubKind: z.enum(["client", "gc"]).optional(),
    planportHubId: z.string().min(1).optional(),
    planportProjectId: z.string().min(1).optional(),
    /** Which designer calendar receives the tentative event (default Jeff). */
    bookingCalendarOwner: z.enum(["jeff", "kevin"]).optional(),
  })
  .refine(
    (d) => {
      const parts = [
        d.planportHubKind,
        d.planportHubId,
        d.planportProjectId,
      ].filter(Boolean);
      return parts.length === 0 || parts.length === 3;
    },
    {
      message:
        "planportHubKind, planportHubId, and planportProjectId must all be sent together.",
    }
  );

function resolveBookingNotifyEmail(owner: PlanportBookingCalendarOwner): string {
  if (owner === "kevin") {
    return (
      process.env.PLANPORT_BOOKING_NOTIFY_EMAIL_KEVIN?.trim() ||
      process.env.KEVIN_DESIGNER_CONTACT_EMAIL?.trim() ||
      DESIGNER_BOOKING_EMAIL
    );
  }
  return process.env.PLANPORT_BOOKING_NOTIFY_EMAIL?.trim() || DESIGNER_BOOKING_EMAIL;
}

export async function POST(req: NextRequest) {
  try {
    const body = bookSchema.parse(await req.json());

    const bookingOwner: PlanportBookingCalendarOwner =
      body.bookingCalendarOwner === "kevin" ? "kevin" : "jeff";
    if (bookingOwner === "kevin" && !hasKevinPlanportBookingCalendarConfigured()) {
      return NextResponse.json(
        {
          error:
            "Kevin’s scheduling calendar is not configured yet. Set GOOGLE_CALENDAR_ID_KEVIN on the server after sharing his calendar with the PlanPort service account.",
        },
        { status: 503 }
      );
    }

    const leadFirstName = bookingOwner === "kevin" ? "Kevin" : "Jeff";

    const startUtc = DateTime.fromISO(body.startIso, { zone: "utc" });
    if (!startUtc.isValid) {
      return NextResponse.json({ error: "Invalid start time." }, { status: 400 });
    }

    const chicagoDate = startUtc.setZone(DESIGNER_CALENDAR_TIMEZONE).toISODate()!;
    const earliestYmd = getEarliestBookableChicagoYmd();
    if (chicagoDate < earliestYmd) {
      const dayWord =
        BOOKING_MIN_LEAD_FULL_DAYS === 1 ? "day" : "days";
      return NextResponse.json(
        {
          error: `Appointments must be at least ${BOOKING_MIN_LEAD_FULL_DAYS} full calendar ${dayWord} in advance (US Central).`,
        },
        { status: 400 }
      );
    }

    const dayStartUtc = DateTime.fromISO(chicagoDate, {
      zone: DESIGNER_CALENDAR_TIMEZONE,
    })
      .startOf("day")
      .toUTC()
      .toISO()!;
    const dayEndUtc = DateTime.fromISO(chicagoDate, {
      zone: DESIGNER_CALENDAR_TIMEZONE,
    })
      .endOf("day")
      .toUTC()
      .toISO()!;

    const busyRaw = await queryFreeBusy(dayStartUtc, dayEndUtc, bookingOwner);
    const busy = parseBusyFromFreeBusy(busyRaw);
    const allowedList = computeSlotsForChicagoDate(chicagoDate, busy);
    const wantMs = startUtc.toUTC().toMillis();
    const slotOk = allowedList.some(
      (iso) => Math.abs(DateTime.fromISO(iso, { zone: "utc" }).toMillis() - wantMs) < 2000
    );

    if (!slotOk) {
      return NextResponse.json(
        { error: "That time is no longer available. Please choose another slot." },
        { status: 409 }
      );
    }

    const startDate = startUtc.toUTC().toJSDate();
    const endDate = DateTime.fromJSDate(startDate)
      .plus({ minutes: MEETING_DURATION_MINUTES })
      .toUTC()
      .toJSDate();

    const meetLabel =
      body.meetingType === "online"
        ? "Online (Google Meet — link will appear on the calendar invite once confirmed)"
        : `In-person at 2324 W 7th Place, Suite #1, Stillwater, Oklahoma`;

    const descriptionLines = [
      `PlanPort appointment request (pending ${leadFirstName}’s confirmation in Google Calendar).`,
      ``,
      `Client: ${body.clientName}`,
      `Email: ${body.clientEmail}`,
      body.clientPhone ? `Phone: ${body.clientPhone}` : null,
      body.hubLabel ? `Account / hub: ${body.hubLabel}` : null,
      `Project: ${body.projectName}`,
      body.projectAddress ? `Address: ${body.projectAddress}` : null,
      `Format: ${meetLabel}`,
      ``,
      `After this event is confirmed, the client will receive a confirmation email.`,
    ].filter(Boolean);

    const summary = `[Pending] PlanPort — ${body.projectName} — ${body.clientName}`;

    const planportSync =
      body.planportHubKind &&
      body.planportHubId &&
      body.planportProjectId
        ? {
            planportHubKind: body.planportHubKind as PlanportHubKind,
            planportHubId: body.planportHubId,
            planportProjectId: body.planportProjectId,
          }
        : {};

    const { eventId, htmlLink, meetLink } = await createTentativeBookingEvent({
      startUtc: startDate,
      endUtc: endDate,
      meetingType: body.meetingType,
      summary,
      description: descriptionLines.join("\n"),
      attendeeEmail: body.clientEmail,
      attendeeName: body.clientName,
      bookingCalendarOwner: bookingOwner,
      ...planportSync,
    });

    if (
      body.planportHubKind &&
      body.planportHubId &&
      body.planportProjectId
    ) {
      try {
        const db = getPlanportAdminFirestore();
        await syncProjectMeetingPending({
          db,
          hubKind: body.planportHubKind as PlanportHubKind,
          hubId: body.planportHubId,
          projectId: body.planportProjectId,
          calendarEventId: eventId,
          startIso: startDate.toISOString(),
          clientEmailFromBooking: body.clientEmail,
        });
      } catch (syncErr) {
        console.error(
          "[calendar/book] Could not update project meeting status in Firestore:",
          syncErr
        );
      }
    }

    const resendKey = process.env.RESEND_API_KEY?.trim();
    const notifyDesignerTo = resolveBookingNotifyEmail(bookingOwner);

    if (resendKey) {
      const resend = new Resend(resendKey);
      const from =
        process.env.RESEND_FROM?.trim() || "PlanPort <onboarding@resend.dev>";
      const onlineMeetNote =
        body.meetingType === "online"
          ? [
              ``,
              `Online (Google Meet): If the event has no Meet link yet, open it in Google Calendar and add “Google Meet” videoconferencing, then confirm. The client receives the Meet link in the PlanPort confirmation email.`,
            ]
          : [];

      const notifyResult = await resend.emails.send({
        from,
        to: [notifyDesignerTo],
        subject: `New PlanPort meeting request — ${body.projectName}`,
        text: [
          `${body.clientName} requested a meeting.`,
          ``,
          `Project: ${body.projectName}`,
          `When (UTC): ${startDate.toISOString()}`,
          `When (Central): ${startUtc.setZone(DESIGNER_CALENDAR_TIMEZONE).toFormat("ff")}`,
          `Format: ${meetLabel}`,
          ...onlineMeetNote,
          ``,
          `Open in Google Calendar: ${htmlLink ?? "(link unavailable)"}`,
          `Event ID: ${eventId}`,
          ``,
          `Confirm the event in Google Calendar (set status to confirmed) or use PlanPort Admin → Pending meetings.`,
        ].join("\n"),
      });

      if (notifyResult.error) {
        console.error(
          "[calendar/book] Resend failed — designer was not emailed about this booking:",
          notifyResult.error.message,
          notifyResult.error.name
        );
      }
    } else {
      console.warn(
        "[calendar/book] RESEND_API_KEY is not set on the server — the designer receives no email for new bookings; only the calendar event is created. Add RESEND_API_KEY and RESEND_FROM (verified domain) to your hosting environment (e.g. Firebase env / secrets)."
      );
    }

    return NextResponse.json({
      ok: true,
      eventId,
      htmlLink,
      meetLink: body.meetingType === "online" ? meetLink : null,
      message: `Request submitted. ${leadFirstName} will confirm the appointment; watch your email.`,
    });
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : "Booking failed.";
    console.error("[calendar/book]", e);
    return NextResponse.json(
      { error: message },
      { status: message.includes("Missing environment") ? 503 : 500 }
    );
  }
}

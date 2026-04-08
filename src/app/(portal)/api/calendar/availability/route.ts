import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";
import {
  DESIGNER_CALENDAR_TIMEZONE,
} from "@/lib/planport-calendar/constants";
import {
  computeSlotsForChicagoRange,
  parseBusyFromFreeBusy,
} from "@/lib/planport-calendar/slots";
import {
  hasKevinPlanportBookingCalendarConfigured,
  queryFreeBusy,
} from "@/lib/planport-calendar/google-calendar";
import type { PlanportBookingCalendarOwner } from "@/lib/planport-calendar/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/calendar/availability?month=2026-03&owner=jeff|kevin
 * Returns slot start ISO strings (UTC) keyed by Central date YYYY-MM-DD.
 */
export async function GET(req: NextRequest) {
  try {
    const month = req.nextUrl.searchParams.get("month")?.trim();
    const ownerRaw = req.nextUrl.searchParams.get("owner")?.trim().toLowerCase();
    const owner: PlanportBookingCalendarOwner =
      ownerRaw === "kevin" ? "kevin" : "jeff";

    if (owner === "kevin" && !hasKevinPlanportBookingCalendarConfigured()) {
      return NextResponse.json(
        {
          error:
            "Kevin’s calendar is not configured (set GOOGLE_CALENDAR_ID_KEVIN after sharing his calendar with the PlanPort service account).",
        },
        { status: 503 }
      );
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: "Query parameter month=YYYY-MM is required." },
        { status: 400 }
      );
    }

    const startChicago = DateTime.fromISO(`${month}-01`, {
      zone: DESIGNER_CALENDAR_TIMEZONE,
    }).startOf("month");
    const endChicago = startChicago.endOf("month");

    if (!startChicago.isValid) {
      return NextResponse.json({ error: "Invalid month." }, { status: 400 });
    }

    const timeMin = startChicago.startOf("day").toUTC().toISO()!;
    const timeMax = endChicago.endOf("day").toUTC().toISO()!;

    const busyRaw = await queryFreeBusy(timeMin, timeMax, owner);
    const busy = parseBusyFromFreeBusy(busyRaw);

    const fromYmd = startChicago.toISODate()!;
    const toYmd = endChicago.toISODate()!;

    const slotsByDate = computeSlotsForChicagoRange(fromYmd, toYmd, busy);

    return NextResponse.json({
      timeZone: DESIGNER_CALENDAR_TIMEZONE,
      slotsByDate,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Availability lookup failed.";
    console.error("[calendar/availability]", e);
    return NextResponse.json(
      { error: message },
      { status: message.includes("Missing environment") ? 503 : 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { assertCalendarAdmin } from "@/lib/firebase-admin-app";
import {
  getDesignerCalendarId,
  getPlanportCalendarServiceAccountEmail,
  listAccessibleCalendars,
} from "@/lib/planport-calendar/google-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization")?.trim();
  if (!h?.toLowerCase().startsWith("bearer ")) return null;
  return h.slice(7).trim() || null;
}

/**
 * GET — lists calendars the PlanPort service account can see (admin only).
 * Use this to pick the correct GOOGLE_CALENDAR_ID.
 */
export async function GET(req: NextRequest) {
  try {
    await assertCalendarAdmin(bearer(req));
    const serviceAccountEmail = getPlanportCalendarServiceAccountEmail();
    const configuredCalendarId = getDesignerCalendarId();
    const calendars = await listAccessibleCalendars();
    return NextResponse.json({
      serviceAccountEmail,
      configuredCalendarId,
      calendars,
      hint:
        "Share Jeff’s calendar with serviceAccountEmail (Make changes to events). Set GOOGLE_CALENDAR_ID to the id you need—often your lowercase Workspace email for the primary calendar.",
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Debug failed.";
    const status =
      message === "Unauthorized"
        ? 401
        : message === "Forbidden"
          ? 403
          : 500;
    console.error("[calendar/debug-calendars]", e);
    return NextResponse.json({ error: message }, { status });
  }
}

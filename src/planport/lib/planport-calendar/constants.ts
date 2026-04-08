/** Central Time — availability window for designer meetings */
export const DESIGNER_CALENDAR_TIMEZONE = "America/Chicago";

/** Jeff's office (in-person meetings) */
export const DESIGNER_OFFICE_ADDRESS =
  "2324 W 7th Place, Suite #1, Stillwater, Oklahoma";

export const DESIGNER_BOOKING_EMAIL = "jeff@designersink.us";

/** Tue, Wed, Fri, Sat — Luxon weekday: 1=Mon … 7=Sun */
export const ALLOWED_BOOKING_LUXON_WEEKDAYS = new Set([2, 3, 5, 6]);

export const MEETING_DURATION_MINUTES = 90;
export const MEETING_BUFFER_MINUTES = 30;

/**
 * Minimum full calendar days of lead time (Central) before a date can be booked.
 * Example: `2` means today, tomorrow, and the following day are not bookable;
 * the first allowed calendar day is start-of-today + 3.
 */
export const BOOKING_MIN_LEAD_FULL_DAYS: number = 2;

/** First meeting start (local Central): 2:00 PM */
export const WINDOW_START_HOUR = 14;
export const WINDOW_START_MINUTE = 0;

/**
 * Latest meeting *end* (local Central): 10:00 PM
 * (90-min meeting → last start 8:30 PM)
 */
export const WINDOW_END_HOUR = 22;
export const WINDOW_END_MINUTE = 0;

export const PLANPORT_EVENT_PRIVATE_FLAG = "planportPending";
export const PLANPORT_EVENT_FLAG_VALUE = "1";

/** `jeff` | `kevin` — which booking calendar holds the event (confirm + PATCH). */
export const PLANPORT_CAL_OWNER_PROP = "planportCalOwner";

export type PlanportBookingCalendarOwner = "jeff" | "kevin";

/** Private extended props so confirm email works without Calendar attendees (service account / no DWD). */
export const PLANPORT_CLIENT_EMAIL_PROP = "planportClientEmail";
export const PLANPORT_CLIENT_NAME_PROP = "planportClientName";

/** `online` | `in_person` — used when listing pending meetings. */
export const PLANPORT_MEETING_TYPE_PROP = "planportMeetingType";

/** Tie calendar events back to PlanPort project docs for UI + confirm sync. */
export const PLANPORT_HUB_KIND_PROP = "planportHubKind";
export const PLANPORT_HUB_ID_PROP = "planportHubId";
export const PLANPORT_PROJECT_ID_PROP = "planportProjectId";

/** Firestore fields on `.../projects/{projectId}` for hub meeting UI */
export const SCHEDULED_MEETING_STATUS_FIELD = "scheduledMeetingStatus";
export const SCHEDULED_MEETING_EVENT_ID_FIELD = "scheduledMeetingCalendarEventId";
export const SCHEDULED_MEETING_START_FIELD = "scheduledMeetingStartIso";
export const SCHEDULED_MEETING_UPDATED_AT_FIELD = "scheduledMeetingUpdatedAt";

/** Client email from booking form — confirm email fallback if calendar props missing. */
export const SCHEDULED_MEETING_CLIENT_EMAIL_FIELD = "scheduledMeetingClientEmail";

/** Lowercased designer/staff emails to ignore when inferring guest from Calendar attendees. */
export function getPlanportStaffBookingEmailsLowercased(): Set<string> {
  const emails = new Set<string>([DESIGNER_BOOKING_EMAIL.toLowerCase()]);
  const kevin = process.env.KEVIN_DESIGNER_CONTACT_EMAIL?.trim().toLowerCase();
  if (kevin) emails.add(kevin);
  return emails;
}

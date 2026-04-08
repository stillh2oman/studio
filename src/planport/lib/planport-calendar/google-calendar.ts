import { JWT, JWTInput, JWTOptions } from "google-auth-library";
import {
  DESIGNER_BOOKING_EMAIL,
  DESIGNER_OFFICE_ADDRESS,
  PLANPORT_CAL_OWNER_PROP,
  type PlanportBookingCalendarOwner,
  PLANPORT_CLIENT_EMAIL_PROP,
  PLANPORT_CLIENT_NAME_PROP,
  PLANPORT_HUB_ID_PROP,
  PLANPORT_HUB_KIND_PROP,
  PLANPORT_MEETING_TYPE_PROP,
  PLANPORT_PROJECT_ID_PROP,
  PLANPORT_EVENT_FLAG_VALUE,
  PLANPORT_EVENT_PRIVATE_FLAG,
} from "./constants";

const CALENDAR_V3_BASE = "https://www.googleapis.com/calendar/v3";

let calendarJwt: JWT | null = null;

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

function resolveCalendarServiceAccountJson(): string | null {
  return (
    process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?.trim() ||
    process.env.PLANPORT_FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ||
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ||
    null
  );
}

function calendarUsesDelegation(): boolean {
  const v = process.env.GOOGLE_CALENDAR_USE_DELEGATION?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export function getDesignerCalendarId(): string {
  if (calendarUsesDelegation()) {
    return "primary";
  }
  const raw =
    process.env.GOOGLE_CALENDAR_ID?.trim() || DESIGNER_BOOKING_EMAIL;
  // Primary calendar IDs are the user’s email; Google expects lowercase.
  return raw.includes("@") ? raw.toLowerCase() : raw;
}

export function hasKevinPlanportBookingCalendarConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CALENDAR_ID_KEVIN?.trim());
}

/** Jeff (default booking) or Kevin’s shared calendar for onboarding scheduling. */
export function getPlanportBookingCalendarId(
  owner: PlanportBookingCalendarOwner
): string {
  if (owner === "kevin") {
    const raw = process.env.GOOGLE_CALENDAR_ID_KEVIN?.trim();
    if (!raw) {
      throw new Error(
        "Missing environment variable: GOOGLE_CALENDAR_ID_KEVIN (share Kevin’s calendar with the PlanPort service account, then set this to its Calendar ID)."
      );
    }
    return raw.includes("@") ? raw.toLowerCase() : raw;
  }
  return getDesignerCalendarId();
}

function isCalendarNotFoundError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const m = e.message;
  return (
    /\b404\b/.test(m) ||
    /not\s+found/i.test(m) ||
    /requested entity was not found/i.test(m)
  );
}

/** Service account `client_email` — must be added under “Share with specific people” on Jeff’s calendar. */
export function getPlanportCalendarServiceAccountEmail(): string {
  const jwt = getCalendarJwt();
  if (!jwt.email) {
    throw new Error("Service account email missing from credentials.");
  }
  return jwt.email;
}

export type AccessibleCalendarRow = {
  id: string;
  summary?: string;
  accessRole?: string;
};

/** Calendars shared with / visible to the service account (for GOOGLE_CALENDAR_ID). */
export async function listAccessibleCalendars(): Promise<AccessibleCalendarRow[]> {
  const token = await getBearerToken();
  const r = await fetch(`${CALENDAR_V3_BASE}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await r.json()) as {
    items?: {
      id?: string;
      summary?: string;
      accessRole?: string;
    }[];
  };
  if (!r.ok) {
    const msg =
      (data as { error?: { message?: string } }).error?.message ??
      `calendarList HTTP ${r.status}`;
    throw new Error(`Could not list calendars: ${msg}`);
  }
  return (data.items ?? [])
    .filter((i) => i.id)
    .map((i) => ({
      id: i.id!,
      summary: i.summary,
      accessRole: i.accessRole,
    }));
}

function getCalendarJwt(): JWT {
  if (calendarJwt) return calendarJwt;

  const rawJson = resolveCalendarServiceAccountJson();
  let credentials: JWTInput;

  if (rawJson) {
    credentials = JSON.parse(rawJson) as JWTInput;
    if (!credentials.client_email || !credentials.private_key) {
      throw new Error(
        "Calendar service account JSON must include client_email and private_key."
      );
    }
  } else {
    credentials = {
      client_email: requireEnv("GOOGLE_CALENDAR_CLIENT_EMAIL"),
      private_key: requireEnv("GOOGLE_CALENDAR_PRIVATE_KEY").replace(
        /\\n/g,
        "\n"
      ),
    };
  }

  if (typeof credentials.private_key === "string") {
    credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  }

  const delegation = calendarUsesDelegation();
  const jwtOptions: JWTOptions = {
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  };
  if (delegation) {
    jwtOptions.subject =
      process.env.GOOGLE_CALENDAR_IMPERSONATE?.trim() ||
      DESIGNER_BOOKING_EMAIL;
  }

  calendarJwt = new JWT(jwtOptions);
  return calendarJwt;
}

async function getBearerToken(): Promise<string> {
  const jwt = getCalendarJwt();
  const access = await jwt.getAccessToken();
  const token = access.token;
  if (!token) {
    throw new Error(
      "Calendar: Google returned no access token. Check service account JSON, " +
        "Calendar API enabled on that GCP project, and private_key formatting in .env."
    );
  }
  return token;
}

/**
 * Raw Calendar v3 calls with an explicit Bearer token (avoids googleapis/gaxios
 * sometimes sending unauthenticated requests under Next.js Turbopack).
 */
async function calendarV3Json<T>(
  method: string,
  pathAndQuery: string,
  body?: unknown
): Promise<T> {
  const token = await getBearerToken();
  const url = `${CALENDAR_V3_BASE}${pathAndQuery}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Calendar API returned non-JSON (${res.status}): ${text.slice(0, 300)}`);
    }
  }
  if (!res.ok) {
    const errObj = data as { error?: { message?: string } };
    const msg = errObj?.error?.message ?? (text || `HTTP ${res.status}`);
    const calMissing =
      res.status === 404 ||
      /\bnot\s+found\b/i.test(msg) ||
      /requested entity was not found/i.test(msg);

    if (calMissing) {
      let visible = "";
      try {
        const rows = await listAccessibleCalendars();
        if (rows.length === 0) {
          visible =
            " This key does not see any calendars yet—nothing has been shared with the service account.";
        } else {
          visible =
            " Calendars this account can access: " +
            rows
              .map(
                (c) =>
                  `"${c.summary ?? c.id}" → set GOOGLE_CALENDAR_ID=${c.id} (role: ${c.accessRole ?? "?"})`
              )
              .join(" | ");
        }
      } catch {
        visible = "";
      }
      const sa = getCalendarJwt().email ?? "(see JSON client_email)";
      const tried = getDesignerCalendarId();
      throw new Error(
        `Calendar "${tried}" was not found or is not accessible.${visible} ` +
          `In Google Calendar as Jeff: open the correct calendar → Settings (gear) → Settings for my calendars → ` +
          `that calendar → Share with specific people → add ${sa} and grant “Make changes to events”. ` +
          `If the Calendar ID under “Integrate calendar” is not ${DESIGNER_BOOKING_EMAIL}, set GOOGLE_CALENDAR_ID in .env.local to that exact ID and restart the dev server.`
      );
    }

    throw new Error(msg);
  }
  return data as T;
}

export async function queryFreeBusy(
  timeMinIso: string,
  timeMaxIso: string,
  owner: PlanportBookingCalendarOwner = "jeff"
): Promise<{ start?: string | null; end?: string | null }[]> {
  const calId = getPlanportBookingCalendarId(owner);
  const data = await calendarV3Json<{
    calendars?: Record<string, { busy?: { start?: string; end?: string }[] }>;
  }>("POST", "/freeBusy", {
    timeMin: timeMinIso,
    timeMax: timeMaxIso,
    items: [{ id: calId }],
  });
  const map = data.calendars ?? {};
  const entry = map[calId] ?? (calId === "primary" ? map.primary : undefined);

  // Google omits calendars the caller cannot access (no 404 on freeBusy).
  if (entry === undefined) {
    let visible = "";
    try {
      const rows = await listAccessibleCalendars();
      visible = rows.length
        ? ` Calendars this account can access: ${rows.map((r) => r.id).join(", ")}.`
        : " No calendars are shared with the service account yet.";
    } catch {
      visible = "";
    }
    const sa = getCalendarJwt().email ?? "client_email in your JSON";
    throw new Error(
      `Calendar "${calId}" was not returned by Free/Busy (no access).${visible} ` +
        `In Google Calendar as Jeff: Settings → that calendar → Share with specific people → add ${sa} with “Make changes to events”. ` +
        `Then set GOOGLE_CALENDAR_ID in .env.local to the Calendar ID from “Integrate calendar” if it is not ${DESIGNER_BOOKING_EMAIL.toLowerCase()}.`
    );
  }

  return entry.busy ?? [];
}

export type CreateBookingInput = {
  startUtc: Date;
  endUtc: Date;
  meetingType: "in_person" | "online";
  summary: string;
  description: string;
  attendeeEmail: string;
  attendeeName: string;
  /** Which calendar receives the tentative event (default Jeff). */
  bookingCalendarOwner?: PlanportBookingCalendarOwner;
  /** When set, stored on the calendar event for confirm → Firestore project sync. */
  planportHubKind?: "client" | "gc";
  planportHubId?: string;
  planportProjectId?: string;
};

/** Matches `Email: …` line from book route description when extended props are missing. */
export function parseClientEmailFromPlanportBookingDescription(
  description: string | null | undefined
): string | null {
  if (!description?.trim()) return null;
  const m = description.match(/^\s*Email:\s*(\S+)\s*$/im);
  const e = m?.[1]?.trim();
  return e && e.includes("@") ? e : null;
}

type CalendarEventResource = {
  id?: string | null;
  summary?: string | null;
  description?: string | null;
  htmlLink?: string | null;
  hangoutLink?: string | null;
  status?: string | null;
  location?: string | null;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email?: string | null; displayName?: string | null }[];
  extendedProperties?: { private?: Record<string, string> };
  conferenceData?: {
    entryPoints?: { entryPointType?: string; uri?: string }[];
  };
};

export async function createTentativeBookingEvent(
  input: CreateBookingInput
): Promise<{ eventId: string; htmlLink?: string | null; meetLink?: string | null }> {
  const bookingOwner: PlanportBookingCalendarOwner =
    input.bookingCalendarOwner ?? "jeff";
  const calId = getPlanportBookingCalendarId(bookingOwner);
  const delegation = calendarUsesDelegation();
  /**
   * Google Meet via `conferenceData.createRequest` typically requires acting as
   * a Workspace user (domain-wide delegation). Service accounts on a shared
   * calendar often get "invalid conference type value" — skip Meet creation
   * then; Jeff adds videoconferencing in Calendar when confirming.
   */
  const canRequestMeetConference =
    input.meetingType === "online" && delegation;
  const conferenceDataVersion = canRequestMeetConference ? 1 : 0;
  /**
   * Without Workspace domain-wide delegation, Google rejects events that list
   * attendees ("Service accounts cannot invite attendees..."). Shared-calendar
   * mode still puts the client on the event description; Jeff can forward or
   * add the guest in Calendar. With delegation, we impersonate the user and
   * may send real invites.
   */
  const q = new URLSearchParams({
    sendUpdates: delegation ? "all" : "none",
    conferenceDataVersion: String(conferenceDataVersion),
  });

  const requestBody: Record<string, unknown> = {
    summary: input.summary,
    description: input.description,
    start: { dateTime: input.startUtc.toISOString(), timeZone: "UTC" },
    end: { dateTime: input.endUtc.toISOString(), timeZone: "UTC" },
    transparency: "opaque",
    status: "tentative",
    extendedProperties: {
      private: {
        [PLANPORT_EVENT_PRIVATE_FLAG]: PLANPORT_EVENT_FLAG_VALUE,
        [PLANPORT_CAL_OWNER_PROP]: bookingOwner,
        [PLANPORT_CLIENT_EMAIL_PROP]: input.attendeeEmail,
        [PLANPORT_CLIENT_NAME_PROP]: input.attendeeName,
        [PLANPORT_MEETING_TYPE_PROP]: input.meetingType,
        ...(input.planportHubKind &&
        input.planportHubId &&
        input.planportProjectId
          ? {
              [PLANPORT_HUB_KIND_PROP]: input.planportHubKind,
              [PLANPORT_HUB_ID_PROP]: input.planportHubId,
              [PLANPORT_PROJECT_ID_PROP]: input.planportProjectId,
            }
          : {}),
      },
    },
    reminders: { useDefault: true },
  };

  if (delegation) {
    requestBody.attendees = [
      {
        email: input.attendeeEmail,
        displayName: input.attendeeName,
      },
    ];
  }

  if (input.meetingType === "in_person") {
    requestBody.location = `Designer's Ink — ${DESIGNER_OFFICE_ADDRESS}`;
  }

  if (input.meetingType === "online") {
    if (canRequestMeetConference) {
      requestBody.conferenceData = {
        createRequest: {
          requestId: `planport-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
    } else {
      requestBody.location =
        "Online — Google Meet (add videoconferencing in Google Calendar when confirming)";
    }
  }

  const path = `/calendars/${encodeURIComponent(calId)}/events?${q.toString()}`;
  const res = await calendarV3Json<CalendarEventResource>("POST", path, requestBody);
  const eventId = res.id;
  if (!eventId) throw new Error("Calendar API did not return an event id");

  const meetLink =
    res.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")
      ?.uri || res.hangoutLink;

  return {
    eventId,
    htmlLink: res.htmlLink,
    meetLink: meetLink ?? null,
  };
}

export async function setEventConfirmed(eventId: string): Promise<void> {
  const owners: PlanportBookingCalendarOwner[] = ["jeff"];
  if (hasKevinPlanportBookingCalendarConfigured()) owners.push("kevin");

  let lastErr: Error | null = null;
  for (const owner of owners) {
    try {
      const calId = getPlanportBookingCalendarId(owner);
      const q = new URLSearchParams({ sendUpdates: "all" });
      const path = `/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}?${q.toString()}`;
      await calendarV3Json("PATCH", path, { status: "confirmed" });
      return;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (!isCalendarNotFoundError(e)) throw lastErr;
    }
  }
  throw lastErr ?? new Error(`Could not confirm calendar event: ${eventId}`);
}

async function listPendingPlanportEventsForCal(
  calId: string,
  timeMinIso: string
): Promise<CalendarEventResource[]> {
  const q = new URLSearchParams({
    timeMin: timeMinIso,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
    privateExtendedProperty: `${PLANPORT_EVENT_PRIVATE_FLAG}=${PLANPORT_EVENT_FLAG_VALUE}`,
  });
  const path = `/calendars/${encodeURIComponent(calId)}/events?${q.toString()}`;
  const data = await calendarV3Json<{ items?: CalendarEventResource[] }>(
    "GET",
    path
  );
  return data.items ?? [];
}

export async function listPendingPlanportEvents(
  timeMinIso: string
): Promise<CalendarEventResource[]> {
  const jeffId = getPlanportBookingCalendarId("jeff");
  const jeffItems = await listPendingPlanportEventsForCal(jeffId, timeMinIso);
  if (!hasKevinPlanportBookingCalendarConfigured()) return jeffItems;
  const kevinId = getPlanportBookingCalendarId("kevin");
  const kevinItems = await listPendingPlanportEventsForCal(kevinId, timeMinIso);
  return [...jeffItems, ...kevinItems];
}

/** For confirm route: load one event (extendedProperties, attendees, etc.). */
export async function getCalendarEvent(
  eventId: string
): Promise<CalendarEventResource> {
  const owners: PlanportBookingCalendarOwner[] = ["jeff"];
  if (hasKevinPlanportBookingCalendarConfigured()) owners.push("kevin");

  let lastErr: Error | null = null;
  for (const owner of owners) {
    try {
      const calId = getPlanportBookingCalendarId(owner);
      const path = `/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`;
      return await calendarV3Json<CalendarEventResource>("GET", path);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (!isCalendarNotFoundError(e)) throw lastErr;
    }
  }
  throw lastErr ?? new Error(`Calendar event not found: ${eventId}`);
}

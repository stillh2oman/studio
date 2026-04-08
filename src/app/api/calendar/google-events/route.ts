import { NextResponse } from 'next/server';
import { addDays, subDays, startOfDay } from 'date-fns';
import { randomUUID } from 'crypto';
import {
  getGoogleAccessToken,
  getGoogleOAuthCredentialSource,
  isGoogleOAuthEnvironmentConfigured,
  resolveGoogleOAuthCreds,
} from '@/lib/google-oauth';
import {
  listGoogleCalendarEventItems,
  mapGoogleCalendarItemToLedgerEvent,
  listSelectedCalendarIdsForSync,
  listReadableCalendarsForPicker,
} from '@/lib/google-calendar-events';
import { DEFAULT_GOOGLE_CALENDAR_ID, GOOGLE_CALENDAR_TIME_ZONE } from '@/lib/google-calendar-constants';
import { mapGoogleCalendarScopeError } from '@/lib/google-calendar-api-helpers';
import { getAdminFirestore } from '@/lib/firebase-admin';
import type { CalendarEvent, IntegrationConfig } from '@/lib/types';

export const dynamic = 'force-dynamic';

function resolvePrimaryCalendarId() {
  return String(process.env.GOOGLE_CALENDAR_ID || DEFAULT_GOOGLE_CALENDAR_ID).trim();
}

async function loadIntegrationForFirm(firmId: string): Promise<IntegrationConfig | undefined> {
  const id = String(firmId || '').trim();
  if (!id || id === 'firm') return undefined;
  try {
    const snap = await getAdminFirestore().doc(`employees/${id}/config/integrations`).get();
    if (!snap.exists) return undefined;
    return snap.data() as IntegrationConfig;
  } catch {
    return undefined;
  }
}

async function accessTokenForFirmId(firmId: string | undefined | null) {
  const integration = await loadIntegrationForFirm(String(firmId || '').trim());
  return getGoogleAccessToken(integration);
}

async function resolveScheduleCalendarIds(
  accessToken: string,
  primaryId: string,
  aggregate: boolean,
  scheduleCalendarsParam: string | null,
): Promise<string[]> {
  if (scheduleCalendarsParam != null && scheduleCalendarsParam !== '') {
    try {
      const parsed = JSON.parse(decodeURIComponent(scheduleCalendarsParam)) as unknown;
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
        const allowed = new Set((await listReadableCalendarsForPicker(accessToken)).map((c) => c.id));
        if (parsed.length === 0) return [];
        const filtered = parsed.filter((id) => allowed.has(id));
        return filtered.length ? filtered : [primaryId];
      }
    } catch {
      // fall through to aggregate / primary
    }
  }

  if (aggregate) {
    try {
      const ids = await listSelectedCalendarIdsForSync(accessToken);
      if (ids.length) return ids;
    } catch {
      // use primary
    }
    return [primaryId];
  }

  return [primaryId];
}

/**
 * GET: list events (optional aggregate of all selected calendars).
 * POST: create event on Google Calendar.
 * PATCH: update event.
 * DELETE: query calendarId, eventId, optional firmId.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ownerId = String(url.searchParams.get('ownerId') || '').trim() || 'firm';
  const integration = await loadIntegrationForFirm(ownerId);
  const oauthFirestoreConfigured = resolveGoogleOAuthCreds(integration) !== null;
  const oauthCredentialSource = getGoogleOAuthCredentialSource(integration);

  if (url.searchParams.get('listOnly') === '1') {
    try {
      const accessToken = await getGoogleAccessToken(integration);
      const calendars = await listReadableCalendarsForPicker(accessToken);
      return NextResponse.json({
        calendars,
        configured: true,
        oauthEnvConfigured: isGoogleOAuthEnvironmentConfigured(),
        oauthFirestoreConfigured,
        oauthCredentialSource,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      return NextResponse.json({
        calendars: [] as { id: string; summary: string; selected: boolean; primary: boolean; accessRole: string }[],
        configured: false,
        oauthEnvConfigured: isGoogleOAuthEnvironmentConfigured(),
        oauthFirestoreConfigured,
        oauthCredentialSource,
        error: message,
      });
    }
  }

  try {
    const daysRaw = url.searchParams.get('days');
    const daysPastRaw = url.searchParams.get('daysPast');
    const daysAhead = Math.min(400, Math.max(1, parseInt(String(daysRaw || '180'), 10) || 180));
    const daysPast = Math.min(400, Math.max(0, parseInt(String(daysPastRaw || '90'), 10) || 90));
    const aggregate = url.searchParams.get('aggregate') !== '0';
    const scheduleCalendarsParam = url.searchParams.get('scheduleCalendars');

    const primaryId = resolvePrimaryCalendarId();
    const accessToken = await getGoogleAccessToken(integration);
    const timeMin = startOfDay(subDays(new Date(), daysPast)).toISOString();
    const timeMax = addDays(new Date(), daysAhead).toISOString();

    const calendarIds = await resolveScheduleCalendarIds(
      accessToken,
      primaryId,
      aggregate,
      scheduleCalendarsParam,
    );

    const merged = new Map<string, CalendarEvent>();
    for (const calId of calendarIds) {
      try {
        const items = await listGoogleCalendarEventItems(accessToken, calId, timeMin, timeMax);
        for (const item of items) {
          const ev = mapGoogleCalendarItemToLedgerEvent(item, ownerId, calId);
          if (ev) merged.set(ev.id, ev);
        }
      } catch (err) {
        console.warn('[google-events GET] calendar skip', calId, err);
      }
    }

    const events = [...merged.values()].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );

    return NextResponse.json({
      events,
      calendarId: primaryId,
      calendarIds,
      configured: true,
      oauthEnvConfigured: isGoogleOAuthEnvironmentConfigured(),
      oauthFirestoreConfigured,
      oauthCredentialSource,
      timeMin,
      timeMax,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({
      events: [] as CalendarEvent[],
      configured: false,
      oauthEnvConfigured: isGoogleOAuthEnvironmentConfigured(),
      oauthFirestoreConfigured,
      oauthCredentialSource,
      error: message,
    });
  }
}

type CreateBody = {
  firmId?: string;
  calendarId?: string;
  title?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  timeZone?: string;
  locationType?: string;
  location?: string;
};

function buildEventJson(body: CreateBody, forUpdate: boolean): Record<string, unknown> {
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const startTime = String(body.startTime || '').trim();
  const endTime = String(body.endTime || '').trim();
  const timeZone = String(body.timeZone || GOOGLE_CALENDAR_TIME_ZONE).trim();
  const locationType = String(body.locationType || 'In-Person');
  const location = String(body.location || '').trim();

  if (!title || !startTime || !endTime) {
    throw new Error('title, startTime, and endTime are required');
  }

  const base: Record<string, unknown> = {
    summary: title,
    description: description || undefined,
  };

  if (location) base.location = location;

  const hasZone = (s: string) => /[zZ]$|[+-]\d{2}:\d{2}$/.test(s);
  base.start = hasZone(startTime) ? { dateTime: startTime } : { dateTime: startTime, timeZone };
  base.end = hasZone(endTime) ? { dateTime: endTime } : { dateTime: endTime, timeZone };

  if (!forUpdate && locationType === 'Online') {
    base.conferenceData = {
      createRequest: {
        requestId: randomUUID(),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }

  return base;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateBody;
    const calendarId = String(body.calendarId || resolvePrimaryCalendarId()).trim();
    const accessToken = await accessTokenForFirmId(body.firmId);
    const eventJson = buildEventJson(body, false);

    const insertUrl = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    );
    insertUrl.searchParams.set('conferenceDataVersion', '1');
    insertUrl.searchParams.set('sendUpdates', 'none');

    const resp = await fetch(insertUrl.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventJson),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return NextResponse.json(
        { error: mapGoogleCalendarScopeError(data, 'Google Calendar create failed'), raw: data },
        { status: resp.status },
      );
    }

    const googleEventId = String((data as { id?: string }).id || '').trim();
    const htmlLink = String((data as { htmlLink?: string }).htmlLink || '').trim();
    const meetLink =
      String((data as { hangoutLink?: string }).hangoutLink || '').trim() ||
      String(
        (data as { conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] } }).conferenceData?.entryPoints?.find(
          (p) => p?.entryPointType === 'video',
        )?.uri || '',
      ).trim();

    return NextResponse.json({
      ok: true,
      calendarId,
      googleEventId,
      htmlLink: htmlLink || undefined,
      googleMeetLink: meetLink || undefined,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type PatchBody = CreateBody & { eventId?: string };

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as PatchBody;
    const calendarId = String(body.calendarId || resolvePrimaryCalendarId()).trim();
    const eventId = String(body.eventId || '').trim();
    if (!eventId) return NextResponse.json({ error: 'eventId is required' }, { status: 400 });

    const accessToken = await accessTokenForFirmId(body.firmId);
    const eventJson = buildEventJson(body, true);

    const patchUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
    const url = new URL(patchUrl);
    url.searchParams.set('sendUpdates', 'none');
    url.searchParams.set('conferenceDataVersion', '1');

    const resp = await fetch(url.toString(), {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventJson),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return NextResponse.json(
        { error: mapGoogleCalendarScopeError(data, 'Google Calendar update failed'), raw: data },
        { status: resp.status },
      );
    }

    const htmlLink = String((data as { htmlLink?: string }).htmlLink || '').trim();
    const meetLink = String((data as { hangoutLink?: string }).hangoutLink || '').trim();

    return NextResponse.json({
      ok: true,
      calendarId,
      googleEventId: eventId,
      htmlLink: htmlLink || undefined,
      googleMeetLink: meetLink || undefined,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const calendarId = String(url.searchParams.get('calendarId') || resolvePrimaryCalendarId()).trim();
    const eventId = String(url.searchParams.get('eventId') || '').trim();
    const firmId = url.searchParams.get('firmId');
    if (!eventId) return NextResponse.json({ error: 'eventId is required' }, { status: 400 });

    const accessToken = await accessTokenForFirmId(firmId);
    const delUrl = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    );
    delUrl.searchParams.set('sendUpdates', 'none');

    const resp = await fetch(delUrl.toString(), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      return NextResponse.json(
        { error: mapGoogleCalendarScopeError(data, 'Google Calendar delete failed'), raw: data },
        { status: resp.status },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

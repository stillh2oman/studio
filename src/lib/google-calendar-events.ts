import { createHash } from 'crypto';
import { format, subDays, parseISO } from 'date-fns';
import type { CalendarEvent } from '@/lib/types';

type GoogleCalendarEventItem = {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  htmlLink?: string;
  hangoutLink?: string;
  location?: string;
  conferenceData?: unknown;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
};

type CalendarListEntry = {
  id?: string;
  summary?: string;
  summaryOverride?: string;
  selected?: boolean;
  primary?: boolean;
  accessRole?: string;
};

export type GoogleCalendarPickerEntry = {
  id: string;
  summary: string;
  selected: boolean;
  primary: boolean;
  accessRole: string;
};

function calendarListEntryReadable(item: CalendarListEntry): boolean {
  const id = String(item.id || '').trim();
  if (!id) return false;
  const role = String(item.accessRole || '').toLowerCase();
  if (role === 'freebusyreader' || !role || role === 'none') return false;
  return true;
}

/** All calendars the account can read events from (for Schedule picker UI). */
export async function listReadableCalendarsForPicker(accessToken: string): Promise<GoogleCalendarPickerEntry[]> {
  const out: GoogleCalendarPickerEntry[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL('https://www.googleapis.com/calendar/v3/users/me/calendarList');
    url.searchParams.set('maxResults', '250');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = String((data as { error?: { message?: string } })?.error?.message || `calendarList failed (${resp.status})`);
      throw new Error(msg);
    }

    const items = ((data as { items?: CalendarListEntry[] }).items || []) as CalendarListEntry[];
    for (const item of items) {
      if (!calendarListEntryReadable(item)) continue;
      const id = String(item.id || '').trim();
      out.push({
        id,
        summary: String(item.summaryOverride || item.summary || id).trim() || id,
        selected: item.selected !== false,
        primary: !!item.primary,
        accessRole: String(item.accessRole || ''),
      });
    }
    pageToken = (data as { nextPageToken?: string }).nextPageToken;
  } while (pageToken);

  return out;
}

/** Calendars the user selected in Google UI that allow reading events (not freeBusy-only). */
export async function listSelectedCalendarIdsForSync(accessToken: string): Promise<string[]> {
  const out: string[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL('https://www.googleapis.com/calendar/v3/users/me/calendarList');
    url.searchParams.set('maxResults', '250');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = String((data as { error?: { message?: string } })?.error?.message || `calendarList failed (${resp.status})`);
      throw new Error(msg);
    }

    const items = ((data as { items?: CalendarListEntry[] }).items || []) as CalendarListEntry[];
    for (const item of items) {
      if (!calendarListEntryReadable(item) || item.selected === false) continue;
      out.push(String(item.id || '').trim());
    }
    pageToken = (data as { nextPageToken?: string }).nextPageToken;
  } while (pageToken);

  return out;
}

function stableMirrorId(calendarListId: string, googleEventId: string): string {
  const h = createHash('sha256').update(`${calendarListId}::${googleEventId}`).digest('hex').slice(0, 24);
  return `gcal_${h}`;
}

export function mapGoogleCalendarItemToLedgerEvent(
  item: GoogleCalendarEventItem,
  ownerId: string,
  calendarListId: string,
): CalendarEvent | null {
  if (!item.id || item.status === 'cancelled') return null;

  const title = String(item.summary || '(No title)').trim();
  let startTime: string;
  let endTime: string;

  if (item.start?.dateTime && item.end?.dateTime) {
    startTime = new Date(item.start.dateTime).toISOString();
    endTime = new Date(item.end.dateTime).toISOString();
  } else if (item.start?.date && item.end?.date) {
    const sd = item.start.date;
    const endExclusive = item.end.date;
    startTime = `${sd}T00:00:00.000Z`;
    const inclusive = subDays(parseISO(endExclusive), 1);
    endTime = `${format(inclusive, 'yyyy-MM-dd')}T23:59:59.999Z`;
  } else {
    return null;
  }

  const hasVideo = !!(item.hangoutLink || item.conferenceData);
  const loc = String(item.location || '').trim();

  return {
    id: stableMirrorId(calendarListId, item.id),
    title,
    description: String(item.description || ''),
    type: 'CompanyEvent',
    startTime,
    endTime,
    ownerId,
    visibility: 'Global',
    locationType: hasVideo ? 'Online' : 'In-Person',
    googleCalendarEventId: item.id,
    googleCalendarListId: calendarListId,
    googleCalendarHtmlLink: item.htmlLink,
    googleMeetLink: String(item.hangoutLink || '').trim() || undefined,
    location: loc || undefined,
    externalSource: 'google',
  };
}

export async function listGoogleCalendarEventItems(
  accessToken: string,
  calendarId: string,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<GoogleCalendarEventItem[]> {
  const out: GoogleCalendarEventItem[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    );
    url.searchParams.set('timeMin', timeMinIso);
    url.searchParams.set('timeMax', timeMaxIso);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '500');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      cache: 'no-store',
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = String((data as { error?: { message?: string } })?.error?.message || `Google Calendar list failed (${resp.status})`);
      if (resp.status === 401) {
        throw new Error(
          `${msg} Re-issue refresh token with the same OAuth client id/secret and Calendar scopes (calendar, calendar.events).`,
        );
      }
      throw new Error(msg);
    }

    const items = (data.items || []) as GoogleCalendarEventItem[];
    out.push(...items);
    pageToken = data.nextPageToken as string | undefined;
  } while (pageToken);

  return out;
}

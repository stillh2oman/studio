
'use server';

/**
 * @fileOverview Google Calendar integration has been decommissioned.
 */

import { CalendarEvent } from '@/lib/types';

export async function fetchExternalCalendarEvents(accessToken: string, ownerId: string): Promise<CalendarEvent[]> {
  return [];
}

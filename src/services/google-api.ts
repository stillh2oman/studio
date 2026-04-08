/**
 * Re-exports Google integration helpers for server-side imports.
 * Client UI should call `/api/integrations/google` instead of importing these as server actions
 * to avoid Next.js `fetchServerAction` "Failed to fetch" issues.
 */

export {
  verifyGoogleIntegration,
  fetchGmailMessagesAuto,
  fetchMeetRecordingsAuto,
  fetchGoogleCalendarList,
  fetchGoogleCalendarAuto,
} from '@/lib/google-integration-server';

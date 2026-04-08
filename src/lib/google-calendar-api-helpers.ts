/**
 * Shared Google Calendar API error text for insufficient OAuth scopes.
 */
export function mapGoogleCalendarScopeError(data: unknown, fallback: string): string {
  const d = data as { error?: { message?: string; errors?: { reason?: string }[] } };
  const message = String(d?.error?.message || fallback);
  const reason = String(d?.error?.errors?.[0]?.reason || '').toLowerCase();
  const lower = message.toLowerCase();
  const isScopeError =
    reason.includes('insufficient') ||
    lower.includes('insufficient authentication scopes') ||
    lower.includes('insufficientpermissions');

  if (!isScopeError) return message;

  return [
    'Google Calendar authorization is missing required scopes.',
    'Reconnect Google OAuth and issue a NEW refresh token with these scopes:',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.freebusy',
  ].join(' ');
}

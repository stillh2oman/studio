/**
 * Server-side Google integration (Gmail, Drive). Used by API routes — not server actions.
 */

import { IntegrationConfig } from '@/lib/types';
import { getGoogleAccessToken, mergeServerEnvIntoGoogleIntegration } from '@/lib/google-oauth';

async function refreshGoogleAccessToken(config: IntegrationConfig) {
  return getGoogleAccessToken(config);
}

function parseGoogleApiErrorBody(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const o = body as { error?: { message?: string; code?: number } };
  return String(o.error?.message || '').trim();
}

/**
 * Gmail nests headers under multipart payloads; metadata format keeps them on payload.headers.
 */
function collectPayloadHeaders(
  payload: { headers?: { name: string; value: string }[]; parts?: unknown[] } | null | undefined,
): { name: string; value: string }[] {
  if (!payload) return [];
  const out: { name: string; value: string }[] = [];
  if (Array.isArray(payload.headers)) {
    for (const h of payload.headers) {
      if (h?.name) out.push({ name: h.name, value: String(h.value ?? '') });
    }
  }
  if (Array.isArray(payload.parts)) {
    for (const p of payload.parts) {
      out.push(...collectPayloadHeaders(p as typeof payload));
    }
  }
  return out;
}

const BODY_PREVIEW_LINE_COUNT = 10;

/** Wrap Gmail snippet into ~10 short lines (metadata path has no full body). */
function formatSnippetAsLines(snippet: string, maxLines: number, maxLineLen = 76): string {
  const flat = snippet.replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  const words = flat.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxLineLen && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
    if (lines.length >= maxLines) break;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  return lines.join('\n');
}

async function mapInBatches<T, R>(items: T[], batchSize: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    out.push(...(await Promise.all(batch.map(fn))));
  }
  return out;
}

export async function verifyGoogleIntegration(config: IntegrationConfig) {
  try {
    const merged = mergeServerEnvIntoGoogleIntegration(config);
    const accessToken = await refreshGoogleAccessToken(merged);

    const gmailProbe = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1&labelIds=INBOX',
      {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        cache: 'no-store',
      },
    );
    if (!gmailProbe.ok) {
      const raw = await gmailProbe.json().catch(() => ({}));
      const msg = parseGoogleApiErrorBody(raw) || gmailProbe.statusText;
      const lower = msg.toLowerCase();
      if (
        gmailProbe.status === 403 &&
        (lower.includes('insufficient') || lower.includes('scope') || lower.includes('access_not_configured'))
      ) {
        return {
          success: false,
          message:
            'This refresh token can reach Google, but it does not have Gmail access (or Gmail API is off). In Google Cloud Console enable the Gmail API, then create a new refresh token with scope https://www.googleapis.com/auth/gmail.readonly (OAuth Playground: include that scope with offline access). Drive can still work with only drive.readonly.',
        };
      }
      return {
        success: false,
        message: `Gmail API check failed (${gmailProbe.status}): ${msg}`,
      };
    }

    const driveProbe = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!driveProbe.ok) {
      const raw = await driveProbe.json().catch(() => ({}));
      const msg = parseGoogleApiErrorBody(raw) || driveProbe.statusText;
      return {
        success: false,
        message: `Drive API check failed (${driveProbe.status}): ${msg}`,
      };
    }

    return {
      success: true,
      message: 'Credentials verified. Gmail (inbox) and Drive API access confirmed.',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Verification failed';
    return { success: false, message };
  }
}

export async function fetchGmailMessagesAuto(config: IntegrationConfig) {
  const merged = mergeServerEnvIntoGoogleIntegration(config);
  const accessToken = await refreshGoogleAccessToken(merged);

  async function listMessageIds(preferInbox: boolean): Promise<{ id: string }[]> {
    const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    listUrl.searchParams.set('maxResults', '100');
    if (preferInbox) {
      listUrl.searchParams.append('labelIds', 'INBOX');
    }

    const response = await fetch(listUrl.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const msg = parseGoogleApiErrorBody(error) || 'Verify your Gmail credentials.';
      const lower = msg.toLowerCase();
      if (response.status === 403 && (lower.includes('insufficient') || lower.includes('scope'))) {
        throw new Error(
          `GMAIL SYNC FAILED: ${msg} Your OAuth refresh token was likely created without gmail.readonly. Add that scope and generate a new refresh_token (OAuth Playground with offline access).`,
        );
      }
      throw new Error(`GMAIL SYNC FAILED: ${msg}`);
    }

    const data = await response.json();
    return data.messages || [];
  }

  let messages = await listMessageIds(true);
  /** INBOX can be empty while “All Mail” still has threads (tabs / routing). */
  if (messages.length === 0) {
    messages = await listMessageIds(false);
  }

  /**
   * Use format=metadata only: format=full for dozens of messages often times out on serverless
   * or yields all-null rows when individual GETs fail. Snippet + headers stay accurate.
   */
  const detailedMessages = await mapInBatches(messages, 20, async (m: { id: string }) => {
    try {
      const metaUrl = new URL(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(m.id)}`,
      );
      metaUrl.searchParams.set('format', 'metadata');
      for (const h of ['Subject', 'From', 'To', 'Date']) {
        metaUrl.searchParams.append('metadataHeaders', h);
      }

      const detailRes = await fetch(metaUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        cache: 'no-store',
      });

      if (!detailRes.ok) return null;

      const detail = await detailRes.json();
      const headerList = collectPayloadHeaders(detail.payload);
      const subject =
        headerList.find((h) => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
      const from = headerList.find((h) => h.name.toLowerCase() === 'from')?.value || 'Unknown';
      const to = headerList.find((h) => h.name.toLowerCase() === 'to')?.value || 'Unknown';
      const dateHeader = headerList.find((h) => h.name.toLowerCase() === 'date')?.value;
      const internalMs = detail.internalDate ? parseInt(String(detail.internalDate), 10) : NaN;
      const dateStr = !Number.isNaN(internalMs)
        ? new Date(internalMs).toISOString().split('T')[0]
        : dateHeader
          ? String(dateHeader).slice(0, 16)
          : '—';

      const snippet = String(detail.snippet || '').trim();
      const bodyPreview =
        snippet.length > 0 ? formatSnippetAsLines(snippet, BODY_PREVIEW_LINE_COUNT) : undefined;

      return {
        id: detail.id,
        threadId: detail.threadId,
        subject,
        from,
        to,
        date: dateStr,
        snippet,
        bodyPreview,
      };
    } catch {
      return null;
    }
  });

  return detailedMessages.filter((msg): msg is NonNullable<typeof msg> => msg !== null);
}

export async function fetchMeetRecordingsAuto(config: IntegrationConfig) {
  const merged = mergeServerEnvIntoGoogleIntegration(config);
  const accessToken = await refreshGoogleAccessToken(merged);
  let folderId =
    (merged.meetFolderId && merged.meetFolderId.trim()) ||
    '1wMca_YllSnSz0kFqsguzQYQeOLjVEty2';

  if (folderId.includes('drive.google.com') || folderId.includes('http')) {
    const match = folderId.match(/folders\/([a-zA-Z0-9_-]{25,})/);
    if (match?.[1]) {
      folderId = match[1];
    } else {
      const parts = folderId.split('/');
      const lastPart = parts[parts.length - 1];
      if (lastPart.length > 20) folderId = lastPart;
    }
  }

  const q = `'${folderId}' in parents and trashed = false`;

  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.append('q', q);
  url.searchParams.append('fields', 'files(id, name, mimeType, webViewLink, thumbnailLink, size, createdTime)');
  url.searchParams.append('pageSize', '100');
  url.searchParams.append('supportsAllDrives', 'true');
  url.searchParams.append('includeItemsFromAllDrives', 'true');

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 403) {
      throw new Error(
        "DRIVE ACCESS DENIED: Ensure Drive API is enabled in Google Console and your token includes 'drive.readonly' scope.",
      );
    }
    if (response.status === 404) {
      throw new Error(`DRIVE FOLDER NOT FOUND: Verify folder ID '${folderId}' is correct and accessible.`);
    }
    throw new Error(`DRIVE SYNC ERROR (${response.status}): ${errorData.error?.message || 'Unknown error.'}`);
  }

  const data = await response.json();

  return (data.files || []).map((f: Record<string, unknown>) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    webViewLink: f.webViewLink,
    thumbnailLink: f.thumbnailLink,
    source: 'google' as const,
    size: parseInt(String(f.size || '0'), 10),
    createdTime: f.createdTime,
  }));
}

export async function fetchGoogleCalendarList(_config: IntegrationConfig) {
  throw new Error('Google Calendar integration has been decommissioned.');
}

export async function fetchGoogleCalendarAuto(_config: IntegrationConfig, _ownerId: string) {
  throw new Error('Google Calendar integration has been decommissioned.');
}

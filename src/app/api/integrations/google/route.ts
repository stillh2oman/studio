import { NextResponse } from 'next/server';
import type { IntegrationConfig } from '@/lib/types';
import { isGoogleOAuthEnvironmentConfigured } from '@/lib/google-oauth';
import {
  verifyGoogleIntegration,
  fetchGmailMessagesAuto,
  fetchMeetRecordingsAuto,
} from '@/lib/google-integration-server';

export const dynamic = 'force-dynamic';

/** Lets the Inbox UI know server `.env` OAuth is available when Firestore hub is empty. */
export async function GET() {
  return NextResponse.json({
    serverEnvOAuthConfigured: isGoogleOAuthEnvironmentConfigured(),
  });
}

type Body = {
  action?: string;
  config?: IntegrationConfig;
};

/**
 * Replaces fragile Next.js server-action round-trips for Connection Hub / Inbox.
 * Client: POST { action: 'verify' | 'gmail' | 'meet', config: IntegrationConfig }
 */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = String(body.action || '').trim();
  const config =
    body.config && typeof body.config === 'object' ? (body.config as IntegrationConfig) : {};
  if (!action) {
    return NextResponse.json({ error: 'Missing action' }, { status: 400 });
  }

  try {
    switch (action) {
      case 'verify': {
        const result = await verifyGoogleIntegration(config);
        return NextResponse.json(result);
      }
      case 'gmail': {
        const messages = await fetchGmailMessagesAuto(config);
        return NextResponse.json({ messages });
      }
      case 'meet': {
        const files = await fetchMeetRecordingsAuto(config);
        return NextResponse.json({ files });
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Request failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

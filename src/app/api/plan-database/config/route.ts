import { callDropboxApi } from '@/lib/dropbox-auth';

export const runtime = 'nodejs';

export async function GET() {
  const perplexityConfigured = !!process.env.PERPLEXITY_API_KEY?.trim();

  // Quick Dropbox sanity check: does list_folder even authenticate?
  let dropboxConfigured = false;
  try {
    const resp = await callDropboxApi('https://api.dropboxapi.com/2/users/get_current_account', {});
    dropboxConfigured = resp.ok;
  } catch {
    dropboxConfigured = false;
  }

  return new Response(
    JSON.stringify({
      perplexityConfigured,
      dropboxConfigured,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}


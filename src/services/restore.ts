
'use server';

/**
 * @fileOverview Emergency restoration service for the Designer's Ink ledger.
 * This service handles direct binary streaming from Dropbox to bypass HTML landing pages.
 */

export async function fetchCloudSnapshot() {
  const dropboxUrl = 'https://www.dropbox.com/scl/fi/ikinc4nlc84u25lr89s3p/DI-LEDGER-RESTORE-POINT-2026-03-15.json?rlkey=u53xfv4vkg82lmaa9y3wmq3ev&dl=1';
  
  // Aggressively force direct download hostname
  const directUrl = dropboxUrl
    .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
    .replace('dl=0', 'dl=1');

  try {
    console.log(`[NUCLEAR RESTORE] Fetching binary stream from: ${directUrl}`);
    const response = await fetch(directUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Cloud fetch failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error: any) {
    console.error('[RESTORE ERROR] Cloud sync failed:', error);
    throw new Error(error.message || 'Failed to retrieve cloud snapshot.');
  }
}

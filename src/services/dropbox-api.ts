
/**
 * @fileOverview Dropbox API integration for PlanPort.
 * Provides read-only access to project blueprints.
 */

import { IntegrationConfig, CloudFile } from '@/lib/types';

/**
 * Fetches files for a specific project from Dropbox.
 * Filters for the "latest" PDF and identifies archives.
 */
export async function fetchProjectBlueprints(config: IntegrationConfig, projectName: string): Promise<{ latest: CloudFile[], archives: CloudFile[] }> {
  const rootPath = config.dropboxRootPath || '/PlanPort';
  const projectPath = `${rootPath}/${projectName}`.replace(/\/+/g, '/');

  try {
    const response = await fetch('/api/dropbox/list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: projectPath,
        recursive: true,
        include_media_info: true,
      })
    });

    if (!response.ok) {
      const err = await response.json();
      if (response.status === 404 || err?.error?.['.tag'] === 'path_not_found') {
        return { latest: [], archives: [] };
      }
      throw new Error(`Dropbox Error: ${err?.error_summary || response.statusText}`);
    }

    const data = await response.json();
    const entries = data.entries || [];

    const files: CloudFile[] = entries
      .filter((e: any) => e['.tag'] === 'file')
      .map((e: any) => ({
        id: e.id,
        name: e.name,
        mimeType: e.name.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
        webViewLink: `https://www.dropbox.com/home${e.path_display}`,
        source: 'dropbox' as const,
        size: e.size,
        createdTime: e.server_modified,
        path: e.path_display
      }));

    // Logic: Files in root are "latest", files in "Archive" subfolder are "archives"
    const latest = files.filter(f => !f.path?.toLowerCase().includes('/archive/'));
    const archives = files.filter(f => f.path?.toLowerCase().includes('/archive/'));

    return { latest, archives };
  } catch (err: any) {
    console.error("Dropbox Fetch Error:", err);
    throw err;
  }
}

/**
 * Generates a direct temporary link for a Dropbox file.
 */
export async function getDropboxDownloadLink(config: IntegrationConfig, path: string): Promise<string> {
  const response = await fetch('/api/dropbox/temporary-link', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path })
  });

  if (!response.ok) throw new Error("Failed to generate download link.");
  const data = await response.json();
  return data.link;
}

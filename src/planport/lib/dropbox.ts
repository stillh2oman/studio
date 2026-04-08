
/**
 * @fileOverview Dropbox Service Utility
 * Provides methods for interacting with the Dropbox API to fetch blueprint files.
 */

export interface DropboxFile {
  name: string;
  path_display: string;
  id: string;
  client_modified: string;
  size: number;
}

/**
 * Fetches the list of files from a specific project folder in Dropbox.
 * @param path The path to the project folder (e.g., /GeneralContractor/ProjectName)
 * @param accessToken The OAuth2 access token for Dropbox
 */
export async function listProjectFiles(path: string, accessToken: string): Promise<DropboxFile[]> {
  try {
    const response = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: path === '/' ? '' : path,
        recursive: false,
        include_media_info: false,
        include_deleted: false,
        include_has_explicit_shared_members: false,
        include_mounted_folders: true,
        include_non_downloadable_files: true
      }),
    });

    if (!response.ok) {
      throw new Error(`Dropbox API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.entries as DropboxFile[];
  } catch (error) {
    console.error('Error fetching Dropbox files:', error);
    return [];
  }
}

/**
 * Generates a temporary link for viewing a PDF file in the read-only viewer.
 * @param path The full path to the .pdf file
 * @param accessToken The OAuth2 access token
 */
export async function getFileTemporaryLink(path: string, accessToken: string): Promise<string> {
  try {
    const response = await fetch('https://api.dropboxapi.com/2/files/get_temporary_link', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path }),
    });

    if (!response.ok) {
      throw new Error(`Dropbox API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.link;
  } catch (error) {
    console.error('Error getting temporary link:', error);
    return '';
  }
}

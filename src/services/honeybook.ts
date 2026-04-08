'use server';

/**
 * @fileOverview Server action for fetching data from the Honeybook API.
 * This keeps the API Key secure on the server and prevents CORS issues.
 */

export async function fetchHoneybookData() {
  const apiKey = process.env.HONEYBOOK_API_KEY;

  if (!apiKey) {
    console.error('HONEYBOOK_API_KEY is missing from environment variables.');
    throw new Error('Honeybook API Key is not configured. Please check your .env file.');
  }

  try {
    // Honeybook API endpoint for projects
    // We use a robust fetch with a timeout to prevent hanging the server process
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const response = await fetch('https://api.honeybook.com/v1/projects', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      next: { revalidate: 0 } // Disable cache for sync actions to ensure fresh data
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Honeybook API Error (${response.status}):`, errorText);
      throw new Error(`Honeybook connectivity issue: ${response.statusText}`);
    }

    const data = await response.json();

    // Map Honeybook's data structure to our internal format
    // Honeybook typically returns projects in a list. We deduplicate clients.
    const projectsRaw = Array.isArray(data.projects) ? data.projects : [];
    
    if (projectsRaw.length === 0 && Array.isArray(data)) {
      // Handle cases where the API might return a top-level array directly
      // (Depends on the specific API version/endpoint configuration)
    }

    const clientsMap = new Map();
    const mappedProjects = projectsRaw.map((p: any) => {
      if (p.client && p.client.id) {
        clientsMap.set(p.client.id, {
          id: p.client.id,
          name: p.client.name || 'Unknown Client',
          email: p.client.email || ''
        });
      }
      return {
        id: p.id || `hb_proj_${Math.random().toString(36).substr(2, 5)}`,
        name: p.title || 'Untitled Project',
        clientId: p.client?.id || 'unknown'
      };
    });

    return {
      clients: Array.from(clientsMap.values()),
      projects: mappedProjects
    };
  } catch (error: any) {
    console.error('Honeybook Sync Server Error:', error);
    if (error.name === 'AbortError') {
      throw new Error('Honeybook API request timed out. Please try again.');
    }
    throw new Error(error.message || 'Failed to connect to Honeybook API.');
  }
}

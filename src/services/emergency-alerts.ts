
'use server';

import { EmergencyAlert } from '@/lib/types';

/**
 * @fileOverview Fetches active emergency alerts for Payne County, OK from NWS.
 * Payne County NWS Zone: OKC119
 */

const PAYNE_COUNTY_ZONE = 'OKC119';
const NWS_API_URL = `https://api.weather.gov/alerts/active?zone=${PAYNE_COUNTY_ZONE}`;

// High-priority event types we specifically want to watch for
const TARGET_EVENTS = [
  'Tornado Warning',
  'Flood Warning',
  'Severe Thunderstorm Warning',
  'Child Abduction Emergency', // Amber Alerts
  'Civil Emergency Message'
];

export async function fetchPayneCountyAlerts(): Promise<EmergencyAlert[]> {
  try {
    const response = await fetch(NWS_API_URL, {
      method: 'GET',
      headers: {
        'User-Agent': 'DesignersInkCommandCenter/1.0 (contact@designersink.com)',
        'Accept': 'application/geo+json'
      },
      next: { revalidate: 60 } // Cache for 1 minute
    });

    if (!response.ok) {
      throw new Error(`NWS API Error: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.features || !Array.isArray(data.features)) {
      return [];
    }

    const alerts: EmergencyAlert[] = data.features
      .filter((feature: any) => {
        const event = feature.properties?.event;
        return TARGET_EVENTS.some(target => event?.includes(target));
      })
      .map((feature: any) => ({
        id: feature.properties.id,
        event: feature.properties.event,
        severity: feature.properties.severity,
        headline: feature.properties.headline,
        description: feature.properties.description,
        instruction: feature.properties.instruction,
        effective: feature.properties.effective,
        expires: feature.properties.expires
      }));

    return alerts;
  } catch (error) {
    console.error('Failed to fetch emergency alerts:', error);
    return [];
  }
}

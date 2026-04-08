export interface PlanDatabaseConfig {
  /** Root Dropbox folder to scan (e.g. `/Projects/Completed Plans`). */
  rootFolderPath: string;
  updatedAt: string;
}

export type PlanDatabaseSyncStatus =
  | 'verified'
  | 'missing'
  | 'unclear'
  | 'conflict';

export interface PlanDatabaseRecord {
  /** Firestore doc id (stable). */
  id: string;
  /** Dropbox folder path for the project, e.g. `/Projects/Completed Plans/Smith Residence`. */
  dropboxFolderPath: string;
  dropboxFolderLink?: string;

  /** Chosen latest plan PDF within folder. */
  planPdfPath?: string;
  planPdfRev?: string;
  planPdfModified?: string;
  planPdfSharedLink?: string;

  /** Extracted fields */
  projectName?: string | null;
  clientName?: string | null;
  designerName?: string | null;
  heatedSqftToFrame?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  floors?: number | null;
  hasBasement?: boolean | null;
  hasBonusRoom?: boolean | null;
  garageCars?: number | null;
  overallWidth?: string | null;
  overallDepth?: string | null;

  /** Renderings shared links (Dropbox share URLs) */
  renderingLinks?: string[];
  /** Primary thumbnail share URL (Dropbox share URL) */
  thumbnailUrl?: string | null;

  /** Extraction quality */
  needsReview?: boolean;
  missingFields?: string[];
  extractionError?: string | null;

  /** Manual overrides */
  overriddenFields?: Record<string, boolean>;

  lastSynced?: string;
  createdAt?: string;
  updatedAt?: string;
}


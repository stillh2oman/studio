import { NextResponse } from 'next/server';
import {
  PLAN_REVIEW_ENABLE_RASTER,
  PLAN_REVIEW_MAX_PAGES,
  PLAN_REVIEW_MAX_PDF_BYTES,
} from '@/lib/plan-review/constants';

export const runtime = 'nodejs';

/**
 * Client checks whether server-side Perplexity is configured (never returns the key).
 */
export async function GET() {
  const configured = Boolean(process.env.PERPLEXITY_API_KEY?.trim());
  return NextResponse.json({
    perplexityConfigured: configured,
    limits: {
      maxPdfBytes: PLAN_REVIEW_MAX_PDF_BYTES,
      maxPdfMb: Math.round(PLAN_REVIEW_MAX_PDF_BYTES / (1024 * 1024)),
      maxPagesRasterized: PLAN_REVIEW_MAX_PAGES,
      rasterEnabled: PLAN_REVIEW_ENABLE_RASTER,
    },
    message: configured
      ? null
      : 'Perplexity API key required. Add PERPLEXITY_API_KEY to your environment configuration.',
  });
}

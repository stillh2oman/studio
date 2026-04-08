import { PLAN_REVIEW_MAX_PAGES } from '@/lib/plan-review/constants';

const MAX_CHARS_PER_PAGE = 14_000;

export type PdfTextExtractResult = {
  /** One string per page (same order as PDF). */
  pageTexts: string[];
  totalPdfPages: number;
  truncated: boolean;
};

/**
 * Extract plain text per page using pdf.js (no canvas). Works on serverless where native canvas is missing.
 * Scanned/image-only sheets may return little or no text.
 */
export async function extractPdfTextByPage(
  pdfBuffer: Buffer,
  maxPages: number = PLAN_REVIEW_MAX_PAGES,
): Promise<PdfTextExtractResult> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(pdfBuffer);
  const loadingTask = pdfjs.getDocument({
    data,
    disableFontFace: true,
    isEvalSupported: false,
  });
  const doc = await loadingTask.promise;
  const totalPdfPages = doc.numPages;
  const limit = Math.min(maxPages, totalPdfPages);
  const pageTexts: string[] = [];

  for (let p = 1; p <= limit; p += 1) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const parts: string[] = [];
    for (const item of tc.items) {
      if (item && typeof item === 'object' && 'str' in item) {
        parts.push(String((item as { str?: string }).str || ''));
      }
    }
    let text = parts.join(' ').replace(/\s+/g, ' ').trim();
    if (text.length > MAX_CHARS_PER_PAGE) {
      text = `${text.slice(0, MAX_CHARS_PER_PAGE)}\n… [truncated]`;
    }
    pageTexts.push(
      text ||
        `(No extractable text on PDF page ${p}. This sheet may be image-only; image-based review was unavailable on the server.)`,
    );
  }

  return {
    pageTexts,
    totalPdfPages,
    truncated: totalPdfPages > limit,
  };
}

import { promises as fs } from 'node:fs';
import { jobPaths } from '@/lib/plan-review/temp-workspace';

export type RasterizedPage = {
  pageIndex: number;
  /** PNG bytes */
  buffer: Buffer;
};

export type RasterizeResult = {
  pages: RasterizedPage[];
  totalPdfPages: number;
  truncated: boolean;
};

/**
 * Rasterize PDF pages to PNG using pdf-to-img (pdf.js + canvas, server-side).
 * Only the first `maxPages` pages are rendered to control cost/latency.
 */
export async function rasterizePdfToPngPages(
  pdfBuffer: Buffer,
  jobDir: string,
  options: { maxPages: number; scale: number },
): Promise<RasterizeResult> {
  const { maxPages, scale } = options;
  const paths = jobPaths(jobDir);
  await fs.mkdir(paths.pagesDir, { recursive: true });

  const { pdf } = await import('pdf-to-img');

  const doc = await pdf(pdfBuffer, { scale });
  const totalPdfPages = doc.length;
  const limit = Math.min(maxPages, totalPdfPages);
  const pages: RasterizedPage[] = [];

  let i = 0;
  for await (const imageBuffer of doc) {
    if (i >= limit) break;
    const buf = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer);
    const outPath = paths.pagePng(i + 1);
    await fs.writeFile(outPath, buf);
    pages.push({ pageIndex: i + 1, buffer: buf });
    i += 1;
  }

  return {
    pages,
    totalPdfPages,
    truncated: totalPdfPages > limit,
  };
}

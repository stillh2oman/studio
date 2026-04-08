import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** Creates a unique job directory under the OS temp folder. */
export async function createPlanReviewJobDir(prefix = 'ledger-plan-review-'): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function writeBufferToFile(filePath: string, data: Buffer): Promise<void> {
  await fs.writeFile(filePath, data);
}

/** Best-effort recursive delete (always swallow errors — temp cleanup must not throw). */
export async function safeRmrf(dir: string | undefined | null): Promise<void> {
  if (!dir) return;
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch (e) {
    console.warn('[plan-review] temp cleanup failed', dir, e);
  }
}

export function jobPaths(jobDir: string) {
  return {
    sourcePdf: path.join(jobDir, 'source.pdf'),
    pagesDir: path.join(jobDir, 'pages'),
    pagePng: (i: number) => path.join(jobDir, 'pages', `page-${String(i).padStart(4, '0')}.png`),
  };
}

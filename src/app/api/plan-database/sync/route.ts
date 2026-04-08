import { callDropboxApi } from '@/lib/dropbox-auth';
import { extractPdfTextByPage } from '@/lib/plan-review/pdf-text-extract';
import { rasterizePdfToPngPages } from '@/lib/plan-review/pdf-pages';
import { createPlanReviewJobDir, safeRmrf } from '@/lib/plan-review/temp-workspace';
import { PLAN_REVIEW_ENABLE_RASTER, PLAN_REVIEW_RASTER_SCALE } from '@/lib/plan-review/constants';

export const runtime = 'nodejs';
export const maxDuration = 300;

type SyncEvent =
  | { type: 'progress'; step: string; detail?: string; current?: number; total?: number }
  | { type: 'record'; record: unknown }
  | { type: 'error'; message: string }
  | { type: 'complete'; processed: number; skipped: number; total: number };

function encodeEvent(ev: SyncEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(ev)}\n`);
}

function isPdf(name: string) {
  return name.trim().toLowerCase().endsWith('.pdf');
}

function isRendering(name: string) {
  const n = name.trim().toLowerCase();
  return (
    n.endsWith('.jpg') ||
    n.endsWith('.jpeg') ||
    n.endsWith('.png') ||
    n.endsWith('.tiff') ||
    n.endsWith('.bmp')
  );
}

function looksLikePlanSet(name: string) {
  const n = name.toLowerCase();
  return /(plan|set|sheet|construction|cd|drawing)/i.test(n);
}

async function dropboxListFolder(path: string, recursive: boolean) {
  return callDropboxApi('https://api.dropboxapi.com/2/files/list_folder', {
    path,
    recursive,
    include_deleted: false,
    include_non_downloadable_files: true,
  });
}

async function dropboxListFolderContinue(cursor: string) {
  return callDropboxApi('https://api.dropboxapi.com/2/files/list_folder/continue', { cursor });
}

type DropboxFileRow = {
  name: string;
  path_lower: string;
  server_modified?: string;
  size?: number;
  rev?: string;
};

async function dropboxListAllFilesUnder(pathLower: string): Promise<DropboxFileRow[]> {
  const files: DropboxFileRow[] = [];
  const first = await dropboxListFolder(pathLower, true);
  if (!first.ok) {
    const msg =
      typeof first.data?.error === 'string'
        ? first.data.error
        : typeof first.data?.hint === 'string'
          ? `${first.data?.error || 'Dropbox error'} — ${first.data.hint}`
          : JSON.stringify(first.data).slice(0, 600);
    throw new Error(`Dropbox list failed: ${msg}`);
  }
  const push = (entries: any[]) => {
    for (const e of entries) {
      if (e?.['.tag'] !== 'file') continue;
      if (typeof e?.path_lower !== 'string' || typeof e?.name !== 'string') continue;
      files.push({
        name: e.name as string,
        path_lower: e.path_lower as string,
        server_modified: typeof e.server_modified === 'string' ? e.server_modified : undefined,
        size: typeof e.size === 'number' ? e.size : undefined,
        rev: typeof e.rev === 'string' ? e.rev : undefined,
      });
    }
  };
  push(Array.isArray(first.data?.entries) ? first.data.entries : []);
  let cursor = typeof first.data?.cursor === 'string' ? first.data.cursor : null;
  let hasMore = !!first.data?.has_more;
  while (hasMore && cursor) {
    const next = await dropboxListFolderContinue(cursor);
    if (!next.ok) break;
    push(Array.isArray(next.data?.entries) ? next.data.entries : []);
    cursor = typeof next.data?.cursor === 'string' ? next.data.cursor : null;
    hasMore = !!next.data?.has_more;
  }
  return files;
}

async function dropboxCreateSharedLink(path: string): Promise<string | null> {
  // Prefer create; if already exists, fall back to list_shared_links.
  const created = await callDropboxApi('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
    path,
    settings: { requested_visibility: 'public' },
  });
  if (created.ok) return String(created.data?.url || '') || null;

  const listed = await callDropboxApi('https://api.dropboxapi.com/2/sharing/list_shared_links', {
    path,
    direct_only: true,
  });
  if (!listed.ok) return null;
  const url = listed.data?.links?.[0]?.url;
  return typeof url === 'string' && url.trim() ? url.trim() : null;
}

async function dropboxGetTemporaryLink(path: string): Promise<string | null> {
  const resp = await callDropboxApi('https://api.dropboxapi.com/2/files/get_temporary_link', { path });
  if (!resp.ok) return null;
  const link = resp.data?.link;
  return typeof link === 'string' && link.trim() ? link.trim() : null;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function toDataUriPng(buffer: Buffer): string {
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

function pickLatestPlanPdf(files: Array<{ name: string; path_lower: string; server_modified?: string; size?: number; rev?: string }>) {
  const pdfs = files.filter((f) => isPdf(f.name));
  if (!pdfs.length) return null;

  // Firm rule: ALL PDFs under the project folder are plan sets.
  const candidates = pdfs;

  candidates.sort((a, b) => {
    const aMod = (a.server_modified || '') as string;
    const bMod = (b.server_modified || '') as string;
    if (aMod && bMod && aMod !== bMod) return bMod.localeCompare(aMod);
    const aSize = Number(a.size || 0);
    const bSize = Number(b.size || 0);
    return bSize - aSize;
  });

  return candidates[0] || null;
}

function parentFolderLower(pathLower: string): string {
  const parts = pathLower.split('/').filter(Boolean);
  if (parts.length <= 1) return '';
  return `/${parts.slice(0, -1).join('/')}`;
}

function chooseProjectDepth(rootLower: string, fileRows: DropboxFileRow[]): 1 | 2 {
  const rootNorm = rootLower.toLowerCase().replace(/\/+$/g, '');
  const topToSecond = new Map<string, Set<string>>();
  for (const f of fileRows) {
    if (!isPdf(f.name)) continue;
    const folder = parentFolderLower(f.path_lower);
    if (!folder.startsWith(rootNorm)) continue;
    const rel = folder.slice(rootNorm.length).replace(/^\/+/, '');
    const seg = rel.split('/').filter(Boolean);
    if (seg.length < 2) continue;
    const top = seg[0];
    const second = seg[1];
    if (!top || !second) continue;
    const set = topToSecond.get(top) || new Set<string>();
    set.add(second);
    topToSecond.set(top, set);
  }

  let maxSecond = 0;
  let multiTopCount = 0;
  for (const set of topToSecond.values()) {
    maxSecond = Math.max(maxSecond, set.size);
    if (set.size >= 2) multiTopCount += 1;
  }

  // Heuristic: if any top folder contains multiple distinct second-level folders with PDFs,
  // we treat projects as depth=2 (e.g. /Root/Category/Project/...).
  if (maxSecond >= 2 && multiTopCount >= 1) return 2;
  return 1;
}

function projectFolderFromFile(rootLower: string, filePathLower: string, depth: 1 | 2): string | null {
  const rootNorm = rootLower.toLowerCase().replace(/\/+$/g, '');
  const parent = parentFolderLower(filePathLower.toLowerCase());
  if (!parent.startsWith(rootNorm)) return null;
  const rel = parent.slice(rootNorm.length).replace(/^\/+/, '');
  const seg = rel.split('/').filter(Boolean);
  if (seg.length < 1) return null;
  const use = seg.slice(0, depth);
  if (!use.length) return null;
  return `${rootNorm}/${use.join('/')}`.replace(/\/+$/g, '');
}

function buildExtractionPrompt(text: string) {
  return [
    'You are an expert architectural plan analyst.',
    'You will be given extracted plain text from a residential construction plan set PDF.',
    'Extract the requested fields accurately.',
    'If a value cannot be found explicitly in the provided text, return null for that field.',
    'Do not guess or infer values that are not explicitly shown.',
    '',
    'Return ONLY valid JSON with exactly these keys:',
    [
      '"project_name"',
      '"client_name"',
      '"designer_name"',
      '"heated_sqft_to_frame"',
      '"bedrooms"',
      '"bathrooms"',
      '"floors"',
      '"has_basement"',
      '"has_bonus_room"',
      '"garage_cars"',
      '"overall_width"',
      '"overall_depth"',
    ].join(', '),
    '',
    'Extracted text:',
    text,
  ].join('\n');
}

function safeJsonObjectFromModel(raw: string) {
  const t = raw.trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s === -1 || e === -1 || e <= s) throw new Error('Model returned no JSON object.');
  return JSON.parse(t.slice(s, e + 1)) as any;
}

async function runPerplexityExtraction(pageTexts: string[]) {
  const apiKey = process.env.PERPLEXITY_API_KEY?.trim();
  if (!apiKey) throw new Error('Missing PERPLEXITY_API_KEY');

  const combined = pageTexts.join('\n\n').slice(0, 120_000);

  const body = {
    model: 'sonar-pro',
    temperature: 0.1,
    disable_search: true,
    max_tokens: 2000,
    messages: [
      { role: 'system', content: 'Respond with JSON only.' },
      { role: 'user', content: buildExtractionPrompt(combined) },
    ],
  };

  const res = await fetch('https://api.perplexity.ai/v1/sonar', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Perplexity API error (${res.status}): ${raw.slice(0, 400)}`);
  }
  const data = JSON.parse(raw) as any;
  const content = data?.choices?.[0]?.message?.content;
  const textOut =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((c: any) => (typeof c?.text === 'string' ? c.text : '')).join('')
        : '';
  if (!textOut.trim()) throw new Error('Perplexity returned empty content.');

  return safeJsonObjectFromModel(textOut);
}

async function runPerplexityExtractionVision(pageImages: Buffer[]) {
  const apiKey = process.env.PERPLEXITY_API_KEY?.trim();
  if (!apiKey) throw new Error('Missing PERPLEXITY_API_KEY');

  const system = [
    'You are an expert architectural plan analyst.',
    'You will be shown pages from a residential plan set PDF (as images).',
    'Extract the requested fields accurately from what is explicitly shown.',
    'If a value cannot be found explicitly on the pages provided, return null.',
    'Do not guess.',
    '',
    'Return ONLY valid JSON with exactly these keys:',
    [
      '"project_name"',
      '"client_name"',
      '"designer_name"',
      '"heated_sqft_to_frame"',
      '"bedrooms"',
      '"bathrooms"',
      '"floors"',
      '"has_basement"',
      '"has_bonus_room"',
      '"garage_cars"',
      '"overall_width"',
      '"overall_depth"',
    ].join(', '),
  ].join('\n');

  const userContent: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  > = [{ type: 'text', text: `You will receive ${pageImages.length} page image(s) in order.` }];

  for (let i = 0; i < pageImages.length; i += 1) {
    userContent.push({ type: 'text', text: `--- Page ${i + 1} of ${pageImages.length} ---` });
    userContent.push({ type: 'image_url', image_url: { url: toDataUriPng(pageImages[i]) } });
  }

  const body = {
    model: 'sonar-pro',
    temperature: 0.1,
    disable_search: true,
    max_tokens: 2000,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userContent },
    ],
  };

  const res = await fetch('https://api.perplexity.ai/v1/sonar', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Perplexity API error (${res.status}): ${raw.slice(0, 400)}`);
  }
  const data = JSON.parse(raw) as any;
  const content = data?.choices?.[0]?.message?.content;
  const textOut =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((c: any) => (typeof c?.text === 'string' ? c.text : '')).join('')
        : '';
  if (!textOut.trim()) throw new Error('Perplexity returned empty content.');
  return safeJsonObjectFromModel(textOut);
}

function normalizeExtracted(obj: any) {
  const out = {
    projectName: typeof obj?.project_name === 'string' ? obj.project_name : null,
    clientName: typeof obj?.client_name === 'string' ? obj.client_name : null,
    designerName: typeof obj?.designer_name === 'string' ? obj.designer_name : null,
    heatedSqftToFrame: typeof obj?.heated_sqft_to_frame === 'number' ? obj.heated_sqft_to_frame : obj?.heated_sqft_to_frame == null ? null : Number(obj.heated_sqft_to_frame),
    bedrooms: typeof obj?.bedrooms === 'number' ? obj.bedrooms : obj?.bedrooms == null ? null : Number(obj.bedrooms),
    bathrooms: typeof obj?.bathrooms === 'number' ? obj.bathrooms : obj?.bathrooms == null ? null : Number(obj.bathrooms),
    floors: typeof obj?.floors === 'number' ? obj.floors : obj?.floors == null ? null : Number(obj.floors),
    hasBasement: typeof obj?.has_basement === 'boolean' ? obj.has_basement : obj?.has_basement == null ? null : Boolean(obj.has_basement),
    hasBonusRoom: typeof obj?.has_bonus_room === 'boolean' ? obj.has_bonus_room : obj?.has_bonus_room == null ? null : Boolean(obj.has_bonus_room),
    garageCars: typeof obj?.garage_cars === 'number' ? obj.garage_cars : obj?.garage_cars == null ? null : Number(obj.garage_cars),
    overallWidth: typeof obj?.overall_width === 'string' ? obj.overall_width : null,
    overallDepth: typeof obj?.overall_depth === 'string' ? obj.overall_depth : null,
  };

  // sanitize NaNs
  for (const k of ['heatedSqftToFrame', 'bedrooms', 'bathrooms', 'floors', 'garageCars'] as const) {
    const v = out[k];
    if (typeof v === 'number' && !Number.isFinite(v)) (out as any)[k] = null;
  }

  return out;
}

function computeMissingFields(extracted: ReturnType<typeof normalizeExtracted>) {
  const missing: string[] = [];
  for (const [k, v] of Object.entries(extracted)) {
    if (v === null || v === undefined || v === '') missing.push(k);
  }
  return missing;
}

function needsVisionFallback(missingFields: string[]) {
  // These are frequently absent from text extraction if they’re shown graphically on cover sheets.
  const important = new Set([
    'bedrooms',
    'bathrooms',
    'garageCars',
    'overallWidth',
    'overallDepth',
  ]);
  return missingFields.some((f) => important.has(f));
}

export async function POST(req: Request) {
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const normalizeDropboxPath = (p: string) => {
    const t = String(p || '').trim();
    if (!t) return '';
    if (t === '/') return '';
    return t.startsWith('/') ? t : `/${t}`;
  };

  const rootFolderPath = normalizeDropboxPath(payload?.rootFolderPath);
  const singleProjectFolderPathRaw = String(payload?.projectFolderPath || '').trim();
  const singleProjectFolderPath = singleProjectFolderPathRaw ? normalizeDropboxPath(singleProjectFolderPathRaw) : null;
  const maxProjects = Number(payload?.maxProjects || 0) > 0 ? Number(payload.maxProjects) : 0;
  const skipIfPdfRevMatches = typeof payload?.skipIfPdfRevMatches === 'object' && payload.skipIfPdfRevMatches
    ? (payload.skipIfPdfRevMatches as Record<string, string>)
    : {};

  if (!rootFolderPath && !singleProjectFolderPath) {
    return new Response(JSON.stringify({ error: 'Missing rootFolderPath' }), { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (ev: SyncEvent) => controller.enqueue(encodeEvent(ev));

      void (async () => {
        try {
          send({ type: 'progress', step: 'starting', detail: 'Discovering plan PDFs in Dropbox…' });

          let processed = 0;
          let skipped = 0;

          // Single-folder sync keeps the old semantics.
          if (singleProjectFolderPath) {
            const fileRows = await dropboxListAllFilesUnder(singleProjectFolderPath.toLowerCase());

            const planPdf = pickLatestPlanPdf(fileRows);
            if (!planPdf) {
              const folderLink = await dropboxCreateSharedLink(singleProjectFolderPath.toLowerCase());
              send({
                type: 'record',
                record: {
                  dropboxFolderPath: singleProjectFolderPath.toLowerCase(),
                  dropboxFolderLink: folderLink,
                  needsReview: true,
                  extractionError: 'No PDFs found in folder.',
                  lastSynced: new Date().toISOString(),
                },
              });
              processed += 1;
              send({ type: 'complete', processed, skipped, total: 1 });
              controller.close();
              return;
            }

            const prevRev = skipIfPdfRevMatches[singleProjectFolderPath.toLowerCase()];
            if (prevRev && planPdf.rev && prevRev === planPdf.rev) {
              skipped += 1;
              send({ type: 'complete', processed, skipped, total: 1 });
              controller.close();
              return;
            }

            // renderings
            const renderings = fileRows.filter((r) => isRendering(r.name));

            const folderLink = await dropboxCreateSharedLink(singleProjectFolderPath.toLowerCase());
            const planPdfSharedLink = await dropboxCreateSharedLink(planPdf.path_lower);
            const renderingLinks = renderings.slice(0, 24).map((r) => r.path_lower);
            const thumbnailUrl = renderingLinks[0] || null;

            // download pdf
            send({
              type: 'progress',
              step: 'downloading',
              detail: `Downloading plan PDF (${planPdf.name})…`,
              current: 1,
              total: 1,
            });
            const tmpLink = await dropboxGetTemporaryLink(planPdf.path_lower);
            if (!tmpLink) {
              send({
                type: 'record',
                record: {
                  dropboxFolderPath: singleProjectFolderPath.toLowerCase(),
                  dropboxFolderLink: folderLink,
                  planPdfPath: planPdf.path_lower,
                  planPdfRev: planPdf.rev,
                  planPdfModified: planPdf.server_modified,
                  planPdfSharedLink,
                  renderingLinks,
                  thumbnailUrl,
                  needsReview: true,
                  extractionError: 'Could not get temporary download link for PDF.',
                  lastSynced: new Date().toISOString(),
                },
              });
              processed += 1;
              send({ type: 'complete', processed, skipped, total: 1 });
              controller.close();
              return;
            }

            let extracted: any = null;
            let extractionError: string | null = null;
            try {
              const pdfBytes = await fetchBytes(tmpLink);
              // Try text first (fast), then vision fallback for commonly-missed graphic fields.
              const extractedText = await extractPdfTextByPage(pdfBytes, 40);
              extracted = await runPerplexityExtraction(extractedText.pageTexts);

              const normalizedMaybe = extracted ? normalizeExtracted(extracted) : null;
              const missingMaybe = normalizedMaybe ? computeMissingFields(normalizedMaybe) : [];
              if (PLAN_REVIEW_ENABLE_RASTER && needsVisionFallback(missingMaybe)) {
                let jobDir: string | undefined;
                try {
                  jobDir = await createPlanReviewJobDir();
                  const raster = await rasterizePdfToPngPages(pdfBytes, jobDir, {
                    maxPages: 6,
                    scale: PLAN_REVIEW_RASTER_SCALE,
                  });
                  if (raster.pages.length) {
                    extracted = await runPerplexityExtractionVision(raster.pages.map((p) => p.buffer));
                  }
                } finally {
                  await safeRmrf(jobDir);
                }
              }
            } catch (e) {
              extractionError = e instanceof Error ? e.message : 'Extraction failed.';
            }

            const normalized = extracted ? normalizeExtracted(extracted) : null;
            const missingFields = normalized ? computeMissingFields(normalized) : [];
            const needsReview = !normalized || !!extractionError || missingFields.length > 0;

            send({
              type: 'record',
              record: {
                dropboxFolderPath: singleProjectFolderPath.toLowerCase(),
                dropboxFolderLink: folderLink,
                planPdfPath: planPdf.path_lower,
                planPdfRev: planPdf.rev,
                planPdfModified: planPdf.server_modified,
                planPdfSharedLink,
                renderingLinks,
                thumbnailUrl,
                ...(normalized || {}),
                needsReview,
                missingFields,
                extractionError,
                lastSynced: new Date().toISOString(),
              },
            });

            processed += 1;
            send({ type: 'complete', processed, skipped, total: 1 });
            controller.close();
            return;
          }

          // Root-folder sync: recursively list once, then group into projects by inferred folder depth.
          const allFiles = await dropboxListAllFilesUnder(rootFolderPath.toLowerCase());
          const depth = chooseProjectDepth(rootFolderPath.toLowerCase(), allFiles);

          const projectToFiles = new Map<string, DropboxFileRow[]>();
          for (const f of allFiles) {
            if (!isPdf(f.name) && !isRendering(f.name)) continue;
            const projectFolder = projectFolderFromFile(rootFolderPath.toLowerCase(), f.path_lower, depth);
            if (!projectFolder) continue;
            const list = projectToFiles.get(projectFolder) || [];
            list.push(f);
            projectToFiles.set(projectFolder, list);
          }

          const projectFolders = Array.from(projectToFiles.keys()).sort((a, b) => a.localeCompare(b));
          const effectiveMax = maxProjects > 0 ? maxProjects : 20;
          const total = Math.min(projectFolders.length, effectiveMax);

          if (!projectFolders.length) {
            send({ type: 'error', message: `No PDFs found under "${rootFolderPath}".` });
            controller.close();
            return;
          }

          for (let idx = 0; idx < projectFolders.length; idx += 1) {
            if (processed + skipped >= effectiveMax) break;
            const projectFolder = projectFolders[idx];
            const fileRows = projectToFiles.get(projectFolder) || [];
            const projectNameGuess = projectFolder.split('/').filter(Boolean).slice(-1)[0] || 'Project';

            send({
              type: 'progress',
              step: 'scanning',
              detail: `Scanning ${projectNameGuess}…`,
              current: processed + skipped + 1,
              total,
            });

            const planPdf = pickLatestPlanPdf(fileRows);
            if (!planPdf) {
              const folderLink = await dropboxCreateSharedLink(projectFolder);
              send({
                type: 'record',
                record: {
                  dropboxFolderPath: projectFolder,
                  dropboxFolderLink: folderLink,
                  needsReview: true,
                  extractionError: 'No PDFs found in folder.',
                  lastSynced: new Date().toISOString(),
                },
              });
              processed += 1;
              continue;
            }

            const prevRev = skipIfPdfRevMatches[projectFolder] || skipIfPdfRevMatches[projectFolder.toLowerCase()];
            if (prevRev && planPdf.rev && prevRev === planPdf.rev) {
              skipped += 1;
              continue;
            }

            const renderings = fileRows.filter((r) => isRendering(r.name));
            const folderLink = await dropboxCreateSharedLink(projectFolder);
            const planPdfSharedLink = await dropboxCreateSharedLink(planPdf.path_lower);

            // IMPORTANT: avoid creating shared links for every rendering during sync (rate limits / slow).
            // Store Dropbox paths and fetch temporary links on-demand for display.
            const renderingLinks = renderings.slice(0, 24).map((r) => r.path_lower);
            const thumbnailUrl = renderingLinks[0] || null;

            send({
              type: 'progress',
              step: 'downloading',
              detail: `Downloading plan PDF (${planPdf.name})…`,
              current: processed + skipped + 1,
              total,
            });

            const tmpLink = await dropboxGetTemporaryLink(planPdf.path_lower);
            if (!tmpLink) {
              send({
                type: 'record',
                record: {
                  dropboxFolderPath: projectFolder,
                  dropboxFolderLink: folderLink,
                  planPdfPath: planPdf.path_lower,
                  planPdfRev: planPdf.rev,
                  planPdfModified: planPdf.server_modified,
                  planPdfSharedLink,
                  renderingLinks,
                  thumbnailUrl,
                  needsReview: true,
                  extractionError: 'Could not get temporary download link for PDF.',
                  lastSynced: new Date().toISOString(),
                },
              });
              processed += 1;
              continue;
            }

            let extracted: any = null;
            let extractionError: string | null = null;
            try {
              const pdfBytes = await fetchBytes(tmpLink);
              const extractedText = await extractPdfTextByPage(pdfBytes, 40);
              extracted = await runPerplexityExtraction(extractedText.pageTexts);

              const normalizedMaybe = extracted ? normalizeExtracted(extracted) : null;
              const missingMaybe = normalizedMaybe ? computeMissingFields(normalizedMaybe) : [];
              if (PLAN_REVIEW_ENABLE_RASTER && needsVisionFallback(missingMaybe)) {
                let jobDir: string | undefined;
                try {
                  jobDir = await createPlanReviewJobDir();
                  const raster = await rasterizePdfToPngPages(pdfBytes, jobDir, {
                    maxPages: 6,
                    scale: PLAN_REVIEW_RASTER_SCALE,
                  });
                  if (raster.pages.length) {
                    extracted = await runPerplexityExtractionVision(raster.pages.map((p) => p.buffer));
                  }
                } finally {
                  await safeRmrf(jobDir);
                }
              }
            } catch (e) {
              extractionError = e instanceof Error ? e.message : 'Extraction failed.';
            }

            const normalized = extracted ? normalizeExtracted(extracted) : null;
            const missingFields = normalized ? computeMissingFields(normalized) : [];
            const needsReview = !normalized || !!extractionError || missingFields.length > 0;

            send({
              type: 'record',
              record: {
                dropboxFolderPath: projectFolder,
                dropboxFolderLink: folderLink,
                planPdfPath: planPdf.path_lower,
                planPdfRev: planPdf.rev,
                planPdfModified: planPdf.server_modified,
                planPdfSharedLink,
                renderingLinks,
                thumbnailUrl,
                ...(normalized || {}),
                needsReview,
                missingFields,
                extractionError,
                lastSynced: new Date().toISOString(),
              },
            });

            processed += 1;

            // Dropbox rate limit safety (and reduces likelihood of upstream 503s).
            await sleep(120);
          }

          send({ type: 'complete', processed, skipped, total });
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Sync failed.';
          send({ type: 'error', message: msg });
        } finally {
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}


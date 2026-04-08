import { callDropboxApi } from '@/lib/dropbox-auth';
import { extractPdfTextByPage } from '@/lib/plan-review/pdf-text-extract';

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
  return name.toLowerCase().endsWith('.pdf');
}

function isRendering(name: string) {
  const n = name.toLowerCase();
  return (
    n.endsWith('.jpg') ||
    n.endsWith('.jpeg') ||
    n.endsWith('.png') ||
    n.endsWith('.tiff') ||
    n.endsWith('.bmp') ||
    (n.endsWith('.pdf') && /(render|rendering|exterior|elevation|3d)/i.test(n))
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

async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function pickLatestPlanPdf(files: Array<{ name: string; path_lower: string; server_modified?: string; size?: number; rev?: string }>) {
  const pdfs = files.filter((f) => isPdf(f.name));
  if (!pdfs.length) return null;

  const planish = pdfs.filter((p) => looksLikePlanSet(p.name));
  const candidates = planish.length ? planish : pdfs;

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

export async function POST(req: Request) {
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const rootFolderPath = String(payload?.rootFolderPath || '').trim();
  const singleProjectFolderPath = String(payload?.projectFolderPath || '').trim() || null;
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
          send({ type: 'progress', step: 'starting', detail: 'Listing Dropbox folders…' });

          const folders: Array<{ name: string; path_lower: string }> = [];
          if (singleProjectFolderPath) {
            folders.push({ name: singleProjectFolderPath.split('/').filter(Boolean).slice(-1)[0] || 'Project', path_lower: singleProjectFolderPath.toLowerCase() });
          } else {
            const root = await dropboxListFolder(rootFolderPath, false);
            if (!root.ok) {
              throw new Error(typeof root.data?.error === 'string' ? root.data.error : JSON.stringify(root.data).slice(0, 200));
            }
            const entries = Array.isArray(root.data?.entries) ? root.data.entries : [];
            for (const e of entries) {
              if (e?.['.tag'] === 'folder' && typeof e.path_lower === 'string' && typeof e.name === 'string') {
                folders.push({ name: e.name, path_lower: e.path_lower });
              }
            }
          }

          const total = maxProjects > 0 ? Math.min(folders.length, maxProjects) : folders.length;
          let processed = 0;
          let skipped = 0;

          for (let i = 0; i < folders.length; i += 1) {
            if (maxProjects > 0 && processed + skipped >= maxProjects) break;
            const f = folders[i];
            send({
              type: 'progress',
              step: 'scanning',
              detail: `Scanning ${f.name}…`,
              current: processed + skipped + 1,
              total,
            });

            // list files (recursive)
            const files: Array<any> = [];
            const first = await dropboxListFolder(f.path_lower, true);
            if (!first.ok) {
              send({ type: 'record', record: { dropboxFolderPath: f.path_lower, dropboxFolderLink: null, needsReview: true, extractionError: `Dropbox list failed: ${JSON.stringify(first.data).slice(0, 240)}` } });
              processed += 1;
              continue;
            }
            files.push(...(Array.isArray(first.data?.entries) ? first.data.entries : []));
            let cursor = typeof first.data?.cursor === 'string' ? first.data.cursor : null;
            let hasMore = !!first.data?.has_more;
            while (hasMore && cursor) {
              const next = await dropboxListFolderContinue(cursor);
              if (!next.ok) break;
              files.push(...(Array.isArray(next.data?.entries) ? next.data.entries : []));
              cursor = typeof next.data?.cursor === 'string' ? next.data.cursor : null;
              hasMore = !!next.data?.has_more;
            }

            const fileRows = files
              .filter((e) => e?.['.tag'] === 'file' && typeof e?.path_lower === 'string' && typeof e?.name === 'string')
              .map((e) => ({
                name: e.name as string,
                path_lower: e.path_lower as string,
                server_modified: typeof e.server_modified === 'string' ? e.server_modified : undefined,
                size: typeof e.size === 'number' ? e.size : undefined,
                rev: typeof e.rev === 'string' ? e.rev : undefined,
              }));

            const planPdf = pickLatestPlanPdf(fileRows);
            if (!planPdf) {
              const folderLink = await dropboxCreateSharedLink(f.path_lower);
              send({
                type: 'record',
                record: {
                  dropboxFolderPath: f.path_lower,
                  dropboxFolderLink: folderLink,
                  needsReview: true,
                  extractionError: 'No PDFs found in folder.',
                  lastSynced: new Date().toISOString(),
                },
              });
              processed += 1;
              continue;
            }

            const prevRev = skipIfPdfRevMatches[f.path_lower] || skipIfPdfRevMatches[f.path_lower.toLowerCase()];
            if (prevRev && planPdf.rev && prevRev === planPdf.rev) {
              skipped += 1;
              continue;
            }

            // renderings
            const renderings = fileRows.filter((r) => isRendering(r.name));

            const folderLink = await dropboxCreateSharedLink(f.path_lower);
            const planPdfSharedLink = await dropboxCreateSharedLink(planPdf.path_lower);

            const renderingLinks: string[] = [];
            for (const r of renderings.slice(0, 24)) {
              const link = await dropboxCreateSharedLink(r.path_lower);
              if (link) renderingLinks.push(link);
            }
            const thumbnailUrl = renderingLinks[0] || null;

            // download pdf
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
                  dropboxFolderPath: f.path_lower,
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
              const extractedText = await extractPdfTextByPage(pdfBytes, 16);
              extracted = await runPerplexityExtraction(extractedText.pageTexts);
            } catch (e) {
              extractionError = e instanceof Error ? e.message : 'Extraction failed.';
            }

            const normalized = extracted ? normalizeExtracted(extracted) : null;
            const missingFields = normalized ? computeMissingFields(normalized) : [];
            const needsReview = !normalized || !!extractionError || missingFields.length > 0;

            send({
              type: 'record',
              record: {
                dropboxFolderPath: f.path_lower,
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


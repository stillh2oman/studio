import {
  PLAN_REVIEW_ENABLE_RASTER,
  PLAN_REVIEW_MAX_PAGES,
  PLAN_REVIEW_MAX_PDF_BYTES,
  PLAN_REVIEW_PERPLEXITY_TIMEOUT_MS,
  PLAN_REVIEW_RASTER_SCALE,
} from '@/lib/plan-review/constants';
import {
  applyPlanReviewPromptSnapshot,
  PLAN_REVIEW_CHECKLIST_TEMPLATE_IDS,
  type PlanReviewRunMode,
} from '@/lib/plan-review/prompts';
import { extractPdfTextByPage } from '@/lib/plan-review/pdf-text-extract';
import {
  runPlanReviewWithPerplexity,
  runPlanReviewWithPerplexityTextPages,
} from '@/lib/plan-review/perplexity';
import { rasterizePdfToPngPages } from '@/lib/plan-review/pdf-pages';
import {
  buildPlanReviewChecklistContext,
  parsePlanReviewChecklistBundle,
} from '@/lib/plan-review/checklist-context';
import { buildPlanReviewReportPdf } from '@/lib/plan-review/report-pdf';
import { createPlanReviewJobDir, safeRmrf } from '@/lib/plan-review/temp-workspace';
import type { PlanReviewStreamEvent } from '@/lib/plan-review/types';

export const runtime = 'nodejs';

/** Allow long-running PDF + model work on platforms that honor this export. */
export const maxDuration = 300;

function encodeEvent(ev: PlanReviewStreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(ev)}\n`);
}

export async function POST(req: Request) {
  const apiKey = process.env.PERPLEXITY_API_KEY?.trim();
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error:
          'Perplexity API key required. Add PERPLEXITY_API_KEY to your environment configuration.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid form data.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const file = form.get('file');
  const templateId = String(form.get('templateId') || '').trim();
  const notes = String(form.get('notes') || '').trim();
  const promptSnapshotRaw = form.get('promptSnapshot');
  const promptSnapshot =
    typeof promptSnapshotRaw === 'string' ? promptSnapshotRaw : null;

  if (!templateId) {
    return new Response(JSON.stringify({ error: 'Missing templateId.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const template = applyPlanReviewPromptSnapshot(templateId, promptSnapshot);
  if (!template) {
    return new Response(JSON.stringify({ error: 'Unknown review template.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const reviewModeRaw = String(form.get('reviewMode') || 'compliance').trim();
  const reviewMode: PlanReviewRunMode =
    reviewModeRaw === 'checklist' ? 'checklist' : 'compliance';

  if (reviewMode === 'compliance') {
    if (
      template.id === PLAN_REVIEW_CHECKLIST_TEMPLATE_IDS.residential ||
      template.id === PLAN_REVIEW_CHECKLIST_TEMPLATE_IDS.commercial
    ) {
      return new Response(
        JSON.stringify({
          error:
            'Master checklist analysis is a separate step. Open the “Master checklist analysis” tab and run it there (do not use it under Code compliance).',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }
  } else {
    const expected = PLAN_REVIEW_CHECKLIST_TEMPLATE_IDS[template.categoryId];
    if (template.id !== expected) {
      return new Response(
        JSON.stringify({
          error: `Checklist analysis must use the dedicated template for this category (expected ${expected}).`,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  if (!(file instanceof Blob)) {
    return new Response(JSON.stringify({ error: 'Missing PDF file.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const name = (file as File).name || 'plan.pdf';
  if (!name.toLowerCase().endsWith('.pdf')) {
    return new Response(JSON.stringify({ error: 'Only .pdf files are accepted.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (file.size > PLAN_REVIEW_MAX_PDF_BYTES) {
    return new Response(
      JSON.stringify({
        error: `PDF exceeds limit of ${Math.round(PLAN_REVIEW_MAX_PDF_BYTES / (1024 * 1024))} MB.`,
      }),
      { status: 413, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());

  let parsedChecklistBundle: ReturnType<typeof parsePlanReviewChecklistBundle> = null;
  let checklistCtx: ReturnType<typeof buildPlanReviewChecklistContext> | null = null;

  if (reviewMode === 'checklist') {
    const checklistBundleRaw = form.get('checklistBundle');
    if (typeof checklistBundleRaw !== 'string' || !checklistBundleRaw.trim()) {
      return new Response(
        JSON.stringify({
          error:
            'Checklist analysis requires the Master Checklist bundle. Select a project label (or “Master Checklist only”) in the Checklist tab.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }
    parsedChecklistBundle = parsePlanReviewChecklistBundle(checklistBundleRaw);
    if (!parsedChecklistBundle) {
      return new Response(JSON.stringify({ error: 'Invalid checklist bundle.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    checklistCtx = buildPlanReviewChecklistContext(parsedChecklistBundle.template);
  }

  const checklistModelAppendix =
    reviewMode === 'checklist' ? checklistCtx?.modelAppendix : undefined;

  /**
   * IMPORTANT: ReadableStream `start` must not be `async` — many runtimes do not await it,
   * which surfaces as unhandled rejections and upstream 502 Bad Gateway.
   */
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (ev: PlanReviewStreamEvent) => {
        controller.enqueue(encodeEvent(ev));
      };

      /** Flush immediately so gateways/proxies do not idle-timeout before heavy PDF work begins. */
      try {
        const mb = (buf.length / (1024 * 1024)).toFixed(2);
        send({
          type: 'progress',
          step: 'uploaded',
          detail: `${name} (${mb} MB) — starting PDF processing…`,
        });
      } catch (e) {
        console.error('[plan-review] failed to enqueue initial progress chunk', e);
      }

      void (async () => {
        let jobDir: string | undefined;
        try {
          jobDir = await createPlanReviewJobDir();

          send({
            type: 'progress',
            step: 'converting',
            detail: PLAN_REVIEW_ENABLE_RASTER
              ? `Rasterizing up to ${PLAN_REVIEW_MAX_PAGES} pages at scale ${PLAN_REVIEW_RASTER_SCALE}…`
              : `Extracting up to ${PLAN_REVIEW_MAX_PAGES} page(s) of PDF text…`,
          });

          let usedTextFallback = false;
          let pageCountSent = 0;
          let totalPdfPages = 0;
          let truncated = false;

          const controllerAbort = AbortSignal.timeout(PLAN_REVIEW_PERPLEXITY_TIMEOUT_MS);
          let analysis;

          if (PLAN_REVIEW_ENABLE_RASTER) {
            try {
              const raster = await rasterizePdfToPngPages(buf, jobDir, {
                maxPages: PLAN_REVIEW_MAX_PAGES,
                scale: PLAN_REVIEW_RASTER_SCALE,
              });
              if (!raster.pages.length) {
                throw new Error('Could not rasterize any pages from this PDF.');
              }
              pageCountSent = raster.pages.length;
              totalPdfPages = raster.totalPdfPages;
              truncated = raster.truncated;

              send({
                type: 'progress',
                step: 'perplexity',
                detail: truncated
                  ? `Sending ${raster.pages.length} page image(s) to Perplexity (${raster.totalPdfPages} pages in file; truncated).`
                  : `Sending ${raster.pages.length} page image(s) to Perplexity.`,
              });

              analysis = await runPlanReviewWithPerplexity({
                apiKey,
                template,
                extraInstructions: notes,
                checklistModelAppendix,
                pageImages: raster.pages.map((p) => p.buffer),
                signal: controllerAbort,
                reviewMode,
              });
            } catch (rasterErr) {
              console.warn('[plan-review] rasterize or vision review failed; using text extraction fallback', rasterErr);
              usedTextFallback = true;
              send({
                type: 'progress',
                step: 'converting',
                detail:
                  'High-resolution image conversion is unavailable on this server. Extracting PDF text instead — scanned sheets may have little text.',
              });
              const extracted = await extractPdfTextByPage(buf, PLAN_REVIEW_MAX_PAGES);
              pageCountSent = extracted.pageTexts.length;
              totalPdfPages = extracted.totalPdfPages;
              truncated = extracted.truncated;
              if (!extracted.pageTexts.length) {
                throw new Error('Could not extract PDF text from this file.');
              }
              send({
                type: 'progress',
                step: 'perplexity',
                detail: `Sending extracted text from ${extracted.pageTexts.length} page(s) to Perplexity.`,
              });
              analysis = await runPlanReviewWithPerplexityTextPages({
                apiKey,
                template,
                extraInstructions: notes,
                checklistModelAppendix,
                pageTexts: extracted.pageTexts,
                signal: controllerAbort,
                reviewMode,
              });
            }
          } else {
            usedTextFallback = true;
            const extracted = await extractPdfTextByPage(buf, PLAN_REVIEW_MAX_PAGES);
            pageCountSent = extracted.pageTexts.length;
            totalPdfPages = extracted.totalPdfPages;
            truncated = extracted.truncated;

            if (!extracted.pageTexts.length) {
              throw new Error(
                'Could not extract text from this PDF. If it is scanned (image-only), enable raster mode on a host with native canvas support.',
              );
            }

            send({
              type: 'progress',
              step: 'perplexity',
              detail: `Sending extracted text from ${extracted.pageTexts.length} page(s) to Perplexity.`,
            });

            analysis = await runPlanReviewWithPerplexityTextPages({
              apiKey,
              template,
              extraInstructions: notes,
              checklistModelAppendix,
              pageTexts: extracted.pageTexts,
              signal: controllerAbort,
              reviewMode,
            });
          }

          send({ type: 'progress', step: 'analysis', detail: 'Review complete' });
          send({ type: 'progress', step: 'report', detail: 'Generating report PDF…' });

          const completedAtIso = new Date().toISOString();
          const categoryLabel =
            template.categoryId === 'residential' ? 'Residential plan review' : 'Commercial plan review';

          const reportPdf = await buildPlanReviewReportPdf({
            title:
              reviewMode === 'checklist'
                ? 'Master Checklist Analysis Report'
                : 'Architectural Plan Review Report',
            generatedAtIso: completedAtIso,
            originalFileName: name,
            categoryLabel,
            promptName: template.name,
            analysis,
            checklistProjectLabel: parsedChecklistBundle?.projectLabel,
          });

          send({
            type: 'complete',
            reportPdfBase64: reportPdf.toString('base64'),
            analysis,
            meta: {
              fileName: name,
              templateId: template.id,
              categoryId: template.categoryId,
              templateName: template.name,
              reviewMode,
              pageCountSent,
              totalPdfPages,
              truncated,
              completedAtIso,
              usedTextFallback,
              ...(parsedChecklistBundle && checklistCtx
                ? {
                    checklistProjectLabel: parsedChecklistBundle.projectLabel,
                    checklistLineCount: checklistCtx.stats.checklistLineCount,
                  }
                : {}),
            },
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Plan review failed.';
          console.error('[plan-review] job error', e);
          try {
            send({ type: 'error', message, code: 'PLAN_REVIEW_FAILED' });
          } catch {
            /* stream may be closed */
          }
        } finally {
          await safeRmrf(jobDir);
          try {
            controller.close();
          } catch {
            /* already closed */
          }
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

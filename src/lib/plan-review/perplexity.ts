import type { PlanReviewAnalysisJson } from '@/lib/plan-review/types';
import {
  planReviewGlobalInstructions,
  planReviewJsonSchema,
  planReviewChecklistSystemPreamble,
  type PlanReviewRunMode,
} from '@/lib/plan-review/prompts';

/** Checklist runs omit verified rows; ensure a (possibly empty) array for downstream PDF/schema. */
function applyChecklistIssuesOnlyPolicy(
  analysis: PlanReviewAnalysisJson,
  reviewMode: PlanReviewRunMode,
): PlanReviewAnalysisJson {
  if (reviewMode !== 'checklist') return analysis;
  const rows = analysis.checklistVerification ?? [];
  return {
    ...analysis,
    checklistVerification: rows.filter((r) => r.status !== 'verified'),
  };
}
import type { PlanReviewPromptTemplate } from '@/lib/plan-review/types';

function planReviewSystemPreamble(mode: PlanReviewRunMode, inputKind: 'images' | 'text'): string {
  if (mode === 'checklist') return planReviewChecklistSystemPreamble(inputKind);
  return planReviewGlobalInstructions();
}

const PERPLEXITY_URL = 'https://api.perplexity.ai/v1/sonar';

function toDataUriPng(buffer: Buffer): string {
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

function extractMessageText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const choices = (data as { choices?: unknown[] }).choices;
  if (!Array.isArray(choices) || !choices[0]) return '';
  const msg = (choices[0] as { message?: { content?: unknown } }).message;
  const content = msg?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (c && typeof c === 'object' && 'text' in c && typeof (c as { text?: string }).text === 'string') {
          return (c as { text: string }).text;
        }
        return '';
      })
      .join('');
  }
  return '';
}

function parseAnalysisJson(raw: string): PlanReviewAnalysisJson {
  const trimmed = raw.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Perplexity returned no JSON object.');
  }
  const parsed = JSON.parse(trimmed.slice(start, end + 1)) as PlanReviewAnalysisJson;
  if (!parsed || typeof parsed.executiveSummary !== 'string') {
    throw new Error('Perplexity JSON missing executiveSummary.');
  }
  const norm = (arr: unknown): PlanReviewAnalysisJson['critical'] => {
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x === 'object')
      .map((x) => {
        const o = x as Record<string, unknown>;
        return {
          title: String(o.title || 'Finding'),
          detail: String(o.detail || ''),
          sheetRef: typeof o.sheetRef === 'string' ? o.sheetRef : undefined,
          confidence: o.confidence === 'possible' ? 'possible' : 'confirmed',
        };
      });
  };

  const normChecklist = (arr: unknown): PlanReviewAnalysisJson['checklistVerification'] => {
    if (!Array.isArray(arr)) return undefined;
    const rows = arr
      .filter((x) => x && typeof x === 'object')
      .map((x) => {
        const o = x as Record<string, unknown>;
        const statusRaw = String(o.status || '').toLowerCase();
        const status =
          statusRaw === 'verified' || statusRaw === 'missing' || statusRaw === 'unclear' || statusRaw === 'conflict'
            ? (statusRaw as 'verified' | 'missing' | 'unclear' | 'conflict')
            : 'unclear';
        const confidence = o.confidence === 'possible' ? ('possible' as const) : ('confirmed' as const);
        return {
          item: String(o.item || ''),
          status,
          evidence: String(o.evidence || ''),
          sheetRef: typeof o.sheetRef === 'string' ? o.sheetRef : undefined,
          confidence,
        };
      })
      .filter((r) => r.item.trim().length > 0);
    return rows.length ? rows : undefined;
  };

  return {
    executiveSummary: parsed.executiveSummary,
    critical: norm(parsed.critical),
    major: norm(parsed.major),
    minor: norm(parsed.minor),
    recommendations: norm(parsed.recommendations),
    checklistVerification: normChecklist((parsed as unknown as Record<string, unknown>).checklistVerification),
  };
}

export async function runPlanReviewWithPerplexity(params: {
  apiKey: string;
  template: PlanReviewPromptTemplate;
  extraInstructions: string;
  /** Optional Ledger checklist summary (project + firm template). */
  checklistModelAppendix?: string;
  pageImages: Buffer[];
  signal?: AbortSignal;
  reviewMode?: PlanReviewRunMode;
}): Promise<PlanReviewAnalysisJson> {
  const {
    apiKey,
    template,
    extraInstructions,
    checklistModelAppendix,
    pageImages,
    signal,
    reviewMode = 'compliance',
  } = params;

  const system = [
    planReviewSystemPreamble(reviewMode, 'images'),
    '',
    `Review category: ${template.categoryId === 'residential' ? 'Residential' : 'Commercial'}.`,
    `Review type: ${template.name}.`,
    '',
    template.focusBody,
    extraInstructions.trim()
      ? ['', 'Additional instructions from the user:', extraInstructions.trim()].join('\n')
      : '',
    checklistModelAppendix?.trim()
      ? ['', checklistModelAppendix.trim()].join('\n')
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const introText = [
    `You will receive ${pageImages.length} PNG image(s) in order — these are pages from an architectural PDF plan set.`,
    'Perform the review and return JSON only (no markdown).',
    reviewMode === 'checklist'
      ? 'The JSON must include executiveSummary, critical, major, minor, recommendations, and checklistVerification (array). checklistVerification must contain ONLY problem items: each row uses status missing, unclear, or conflict — omit verified/correct items entirely (use an empty array if there are no issues). Each row: { item (exact rubric line text), status, evidence, sheetRef?, confidence: confirmed|possible }.'
      : 'The JSON must include keys: executiveSummary (string), critical, major, minor, recommendations (arrays).',
    reviewMode === 'compliance'
      ? 'Each finding object: { title, detail, sheetRef (optional string), confidence: "confirmed" | "possible" }.'
      : 'Finding objects (if any): { title, detail, sheetRef (optional string), confidence: "confirmed" | "possible" }.',
  ].join('\n');

  const userContent: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  > = [{ type: 'text', text: introText }];

  for (let i = 0; i < pageImages.length; i += 1) {
    userContent.push({
      type: 'text',
      text: `--- Page image ${i + 1} of ${pageImages.length} ---`,
    });
    userContent.push({
      type: 'image_url',
      image_url: { url: toDataUriPng(pageImages[i]) },
    });
  }

  const messages = [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: userContent },
  ];

  const baseBody = {
    model: 'sonar-pro',
    temperature: 0.2,
    disable_search: true,
    max_tokens: 8000,
    messages,
  };

  async function post(body: Record<string, unknown>) {
    return fetch(PERPLEXITY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
  }

  let res = await post({
    ...baseBody,
    response_format: {
      type: 'json_schema',
      json_schema: planReviewJsonSchema(reviewMode),
    },
  });

  let rawText = await res.text();

  if (!res.ok && (res.status === 400 || res.status === 422)) {
    console.warn('[plan-review] Perplexity json_schema rejected; retrying without response_format');
    res = await post(baseBody);
    rawText = await res.text();
  }

  if (!res.ok) {
    let msg = rawText.slice(0, 500);
    try {
      const j = JSON.parse(rawText) as { error?: { message?: string } | string };
      if (j?.error) {
        msg = typeof j.error === 'string' ? j.error : j.error?.message || msg;
      }
    } catch {
      /* keep msg */
    }
    throw new Error(`Perplexity API error (${res.status}): ${msg}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error('Perplexity returned non-JSON response.');
  }

  const messageText = extractMessageText(data);
  if (!messageText.trim()) {
    throw new Error('Perplexity returned an empty message.');
  }

  return applyChecklistIssuesOnlyPolicy(parseAnalysisJson(messageText), reviewMode);
}

/** Text-only review when PNG rasterization is unavailable (e.g. missing native canvas on the host). */
export async function runPlanReviewWithPerplexityTextPages(params: {
  apiKey: string;
  template: PlanReviewPromptTemplate;
  extraInstructions: string;
  checklistModelAppendix?: string;
  pageTexts: string[];
  signal?: AbortSignal;
  reviewMode?: PlanReviewRunMode;
}): Promise<PlanReviewAnalysisJson> {
  const {
    apiKey,
    template,
    extraInstructions,
    checklistModelAppendix,
    pageTexts,
    signal,
    reviewMode = 'compliance',
  } = params;

  const system = [
    planReviewSystemPreamble(reviewMode, 'text'),
    '',
    `Review category: ${template.categoryId === 'residential' ? 'Residential' : 'Commercial'}.`,
    `Review type: ${template.name}.`,
    '',
    template.focusBody,
    extraInstructions.trim()
      ? ['', 'Additional instructions from the user:', extraInstructions.trim()].join('\n')
      : '',
    checklistModelAppendix?.trim()
      ? ['', checklistModelAppendix.trim()].join('\n')
      : '',
    '',
    'Input mode: extracted plain text from the PDF per page (not images). Scanned/image-only pages may lack text.',
  ]
    .filter(Boolean)
    .join('\n');

  const chunks: string[] = [
    `The following is extracted text from ${pageTexts.length} PDF page(s) in order. Infer sheet identity from headers/titles when present.`,
  ];
  for (let i = 0; i < pageTexts.length; i += 1) {
    chunks.push(`\n--- PDF page ${i + 1} of ${pageTexts.length} ---\n${pageTexts[i]}`);
  }
  const userBody = chunks.join('\n');

  const userContent: Array<{ type: 'text'; text: string }> = [
    {
      type: 'text',
      text: [
        userBody.slice(0, 120_000),
        userBody.length > 120_000 ? '\n… [earlier pages truncated for request size]' : '',
      ]
        .filter(Boolean)
        .join(''),
    },
  ];

  const messages = [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: userContent },
  ];

  const baseBody = {
    model: 'sonar-pro',
    temperature: 0.2,
    disable_search: true,
    max_tokens: 8000,
    messages,
  };

  async function post(body: Record<string, unknown>) {
    return fetch(PERPLEXITY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
  }

  let res = await post({
    ...baseBody,
    response_format: {
      type: 'json_schema',
      json_schema: planReviewJsonSchema(reviewMode),
    },
  });

  let rawText = await res.text();

  if (!res.ok && (res.status === 400 || res.status === 422)) {
    console.warn('[plan-review] Perplexity json_schema rejected (text mode); retrying without response_format');
    res = await post(baseBody);
    rawText = await res.text();
  }

  if (!res.ok) {
    let msg = rawText.slice(0, 500);
    try {
      const j = JSON.parse(rawText) as { error?: { message?: string } | string };
      if (j?.error) {
        msg = typeof j.error === 'string' ? j.error : j.error?.message || msg;
      }
    } catch {
      /* keep msg */
    }
    throw new Error(`Perplexity API error (${res.status}): ${msg}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error('Perplexity returned non-JSON response.');
  }

  const messageText = extractMessageText(data);
  if (!messageText.trim()) {
    throw new Error('Perplexity returned an empty message.');
  }

  return applyChecklistIssuesOnlyPolicy(parseAnalysisJson(messageText), reviewMode);
}

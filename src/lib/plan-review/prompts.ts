import type { PlanReviewCategoryId, PlanReviewPromptTemplate } from '@/lib/plan-review/types';

/** Standard contract appended to every template (keeps model behavior consistent). */
export function planReviewGlobalInstructions(): string {
  return [
    'You are a senior architectural plan reviewer assisting a design firm.',
    'The user supplied raster images of plan sheets in page order. Treat them as the authoritative visual source.',
    '',
    'Your job:',
    '- Review the plan set carefully for the focus area described below.',
    '- Identify errors, conflicts, omissions, and inconsistencies relevant to that focus.',
    '- Distinguish **confirmed issues** (clearly wrong or contradictory on the sheets) from **possible concerns** (unclear, incomplete, or needing field verification).',
    '- When you can infer it, reference **sheet identifiers, titles, or page index** (e.g. "Sheet A-3", "page 7 of upload"). If unknown, omit sheetRef.',
    '- Do not invent code sections or jurisdiction-specific amendments unless clearly labeled on the sheets; prefer "verify with AHJ" language.',
    '',
    'Output: respond with **only** valid JSON matching the required schema. No markdown fences, no commentary outside JSON.',
  ].join('\n');
}

export const PLAN_REVIEW_JSON_SCHEMA_NAME = 'plan_review_result';

export type PlanReviewRunMode = 'compliance' | 'checklist';

/** JSON Schema for Perplexity `response_format` (draft-07 compatible subset). */
export function planReviewJsonSchema(mode: PlanReviewRunMode = 'compliance') {
  const finding = {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      detail: { type: 'string' },
      sheetRef: { type: 'string' },
      confidence: { type: 'string', enum: ['confirmed', 'possible'] },
    },
    required: ['title', 'detail', 'confidence'],
  } as const;

  const checklistRow = {
    type: 'object',
    additionalProperties: false,
    properties: {
      item: { type: 'string' },
      status: { type: 'string', enum: ['verified', 'missing', 'unclear', 'conflict'] },
      evidence: { type: 'string' },
      sheetRef: { type: 'string' },
      confidence: { type: 'string', enum: ['confirmed', 'possible'] },
    },
    required: ['item', 'status', 'evidence', 'confidence'],
  } as const;

  return {
    name: PLAN_REVIEW_JSON_SCHEMA_NAME,
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        executiveSummary: { type: 'string' },
        critical: { type: 'array', items: finding },
        major: { type: 'array', items: finding },
        minor: { type: 'array', items: finding },
        recommendations: { type: 'array', items: finding },
        checklistVerification: { type: 'array', items: checklistRow },
      },
      required:
        mode === 'checklist'
          ? [
              'executiveSummary',
              'critical',
              'major',
              'minor',
              'recommendations',
              'checklistVerification',
            ]
          : ['executiveSummary', 'critical', 'major', 'minor', 'recommendations'],
    },
  };
}

export type PlanReviewInputKind = 'images' | 'text';

/** System preamble when the run is checklist-only (separate from code compliance). */
export function planReviewChecklistSystemPreamble(inputKind: PlanReviewInputKind): string {
  return [
    'You are a senior architectural plan checker assisting a design firm.',
    inputKind === 'images'
      ? 'The user supplied raster images of plan sheets in page order. Treat them as the authoritative visual source.'
      : 'The user supplied extracted plain text from PDF pages in order. Scanned/image-only pages may lack text — call status "unclear" when the sheets do not contain enough information.',
    '',
    'Your primary job:',
    '- Follow the checklist rubric provided in the system message below EXACTLY.',
    '- For every checklist line in that rubric, output one row in **checklistVerification** (match the item wording).',
    '- Status: verified | missing | unclear | conflict.',
    '- Evidence must describe what you found (or did not find) and cite sheet/page references when possible.',
    '',
    'Use **executiveSummary** for a short overview of checklist results (counts / themes).',
    'Use critical / major / minor / recommendations only for cross-cutting plan issues found while checking the list (these arrays may be empty).',
    '',
    'Output: respond with **only** valid JSON matching the required schema. No markdown fences, no commentary outside JSON.',
  ].join('\n');
}

/** Template ids for the dedicated “second pass” checklist analysis (one per category). */
export const PLAN_REVIEW_CHECKLIST_TEMPLATE_IDS: Record<PlanReviewCategoryId, string> = {
  residential: 'res-master-checklist',
  commercial: 'com-master-checklist',
};

const residential: PlanReviewPromptTemplate[] = [
  {
    id: 'res-code-compliance',
    categoryId: 'residential',
    group: 'Residential plan review',
    name: 'Code compliance review',
    focusBody: [
      'Focus: building code alignment for typical residential construction as shown on the plans.',
      'Look for life-safety basics visible on sheets: egress/window sizing cues, smoke/CO notes if shown, stair geometry, guardrail hints, ceiling heights, occupancy assumptions, and conflicts between life-safety notes and plan geometry.',
      'Flag missing typical code-related annotations when the drawing set appears incomplete for permit-level review.',
    ].join('\n'),
  },
  {
    id: 'res-dimension-inconsistency',
    categoryId: 'residential',
    group: 'Residential plan review',
    name: 'Dimension inconsistency review',
    focusBody: [
      'Focus: dimensional integrity across the plan set.',
      'Compare overall dimensions, key room sizes, openings, and structural/grid alignment where visible. Flag mismatches between plans, enlarged plans, and schedules.',
    ].join('\n'),
  },
  {
    id: 'res-sheet-coordination',
    categoryId: 'residential',
    group: 'Residential plan review',
    name: 'Sheet coordination review',
    focusBody: [
      'Focus: cross-sheet coordination.',
      'Check architectural vs structural vs MEP overlays if present; wall types, openings, levels, and key references. Note contradictions between sheets and missing references.',
    ].join('\n'),
  },
  {
    id: 'res-life-safety-egress',
    categoryId: 'residential',
    group: 'Residential plan review',
    name: 'Life safety / egress review',
    focusBody: [
      'Focus: egress paths, exit access, door swings (where shown), stair headroom, landing sizes, and emergency escape openings if depicted.',
      'Call out conflicts, missing information, or ambiguous egress assumptions.',
    ].join('\n'),
  },
  {
    id: 'res-general-qa',
    categoryId: 'residential',
    group: 'Residential plan review',
    name: 'General QA / constructability review',
    focusBody: [
      'Focus: constructability and general drafting quality.',
      'Look for unclear details, missing sections, ambiguous tags, unlikely framing conditions, and coordination risks that could affect field execution.',
    ].join('\n'),
  },
  {
    id: 'res-door-window-schedule',
    categoryId: 'residential',
    group: 'Residential plan review',
    name: 'Door/window schedule consistency review',
    focusBody: [
      'Focus: doors and windows vs schedules and plans.',
      'Cross-check tags on plans with schedule entries where possible. Flag missing tags, duplicate tags, size mismatches, and type conflicts.',
    ].join('\n'),
  },
  {
    id: 'res-annotation-callout',
    categoryId: 'residential',
    group: 'Residential plan review',
    name: 'Annotation and callout consistency review',
    focusBody: [
      'Focus: annotations, keynotes, and callouts.',
      'Identify broken references, inconsistent terminology, leader targets that do not match geometry, and missing callouts for complex conditions.',
    ].join('\n'),
  },
  {
    id: 'res-master-checklist',
    categoryId: 'residential',
    group: 'Residential plan review',
    name: 'Master checklist analysis (separate pass)',
    focusBody: [
      'This is a checklist-only review pass (run separately from code compliance).',
      'Do not substitute generic code review for the rubric — every rubric line must appear in checklistVerification.',
    ].join('\n'),
  },
];

const commercial: PlanReviewPromptTemplate[] = [
  {
    id: 'com-code-compliance',
    categoryId: 'commercial',
    group: 'Commercial plan review',
    name: 'Code compliance review',
    focusBody: [
      'Focus: commercial / assembly-appropriate code issues visible on the drawings.',
      'Look for occupancy/load implications if noted, exit counts, exit separation hints, accessible routes if shown, fire-rated assemblies if called out, and conflicts between code notes and geometry.',
    ].join('\n'),
  },
  {
    id: 'com-dimension-inconsistency',
    categoryId: 'commercial',
    group: 'Commercial plan review',
    name: 'Dimension inconsistency review',
    focusBody: [
      'Focus: dimensional integrity for commercial plans.',
      'Check grids, suites, storefronts, cores, and vertical transitions for mismatches across sheets.',
    ].join('\n'),
  },
  {
    id: 'com-sheet-coordination',
    categoryId: 'commercial',
    group: 'Commercial plan review',
    name: 'Sheet coordination review',
    focusBody: [
      'Focus: multi-discipline coordination typical of commercial sets.',
      'Compare architectural, structural, and MEP cues if present; flag clashes, missing demolition vs new, and level/datum issues.',
    ].join('\n'),
  },
  {
    id: 'com-life-safety-egress',
    categoryId: 'commercial',
    group: 'Commercial plan review',
    name: 'Life safety / egress review',
    focusBody: [
      'Focus: means of egress for commercial configurations.',
      'Identify dead-end corridors, exit separation concerns (if inferable), exit signage notes, door hardware conflicts, and stair/discharge issues visible on sheets.',
    ].join('\n'),
  },
  {
    id: 'com-general-qa',
    categoryId: 'commercial',
    group: 'Commercial plan review',
    name: 'General QA / constructability review',
    focusBody: [
      'Focus: constructability and documentation completeness for commercial work.',
      'Flag vague details, missing enlarged plans for complex areas, and coordination risks for trades.',
    ].join('\n'),
  },
  {
    id: 'com-ada-accessibility',
    categoryId: 'commercial',
    group: 'Commercial plan review',
    name: 'ADA accessibility review',
    focusBody: [
      'Focus: accessibility cues commonly shown on commercial plans (not legal ADA certification).',
      'Look for restroom layouts, clear widths, turning space, ramp runs, door maneuvering, and accessible route continuity if depicted. Use "possible concern" when drawings are insufficient to confirm compliance.',
    ].join('\n'),
  },
  {
    id: 'com-door-window-schedule',
    categoryId: 'commercial',
    group: 'Commercial plan review',
    name: 'Door/window schedule consistency review',
    focusBody: [
      'Focus: commercial door/hardware schedules vs plans.',
      'Cross-check door numbers, ratings, hardware sets, and glazing tags where visible. Flag missing ratings for required separations when suggested by notes.',
    ].join('\n'),
  },
  {
    id: 'com-annotation-callout',
    categoryId: 'commercial',
    group: 'Commercial plan review',
    name: 'Annotation and callout consistency review',
    focusBody: [
      'Focus: keynotes, details, and references on commercial sheets.',
      'Flag inconsistent detail references, missing detail targets, and unclear scope boundaries.',
    ].join('\n'),
  },
  {
    id: 'com-master-checklist',
    categoryId: 'commercial',
    group: 'Commercial plan review',
    name: 'Master checklist analysis (separate pass)',
    focusBody: [
      'This is a checklist-only review pass (run separately from code compliance).',
      'Do not substitute generic code review for the rubric — every rubric line must appear in checklistVerification.',
    ].join('\n'),
  },
];

export const PLAN_REVIEW_PROMPTS: PlanReviewPromptTemplate[] = [...residential, ...commercial];

export function getPlanReviewPromptTemplate(id: string): PlanReviewPromptTemplate | undefined {
  return PLAN_REVIEW_PROMPTS.find((p) => p.id === id);
}

const PLAN_REVIEW_PROMPT_IDS = new Set(PLAN_REVIEW_PROMPTS.map((p) => p.id));

/**
 * Merge optional Firestore `prompts` array with built-in defaults (by id).
 * Unknown ids are ignored; missing fields fall back to defaults.
 */
export function mergePlanReviewPromptsFromFirestore(stored: unknown): PlanReviewPromptTemplate[] {
  if (!Array.isArray(stored) || stored.length === 0) {
    return PLAN_REVIEW_PROMPTS;
  }
  const overrides = new Map<string, Partial<PlanReviewPromptTemplate>>();
  for (const row of stored) {
    if (!row || typeof row !== 'object') continue;
    const id = String((row as PlanReviewPromptTemplate).id || '').trim();
    if (!PLAN_REVIEW_PROMPT_IDS.has(id)) continue;
    overrides.set(id, row as PlanReviewPromptTemplate);
  }
  return PLAN_REVIEW_PROMPTS.map((def) => {
    const o = overrides.get(def.id);
    if (!o) return def;
    return {
      ...def,
      name: typeof o.name === 'string' && o.name.trim() ? o.name.trim() : def.name,
      group: typeof o.group === 'string' && o.group.trim() ? o.group.trim() : def.group,
      focusBody: typeof o.focusBody === 'string' ? o.focusBody : def.focusBody,
    };
  });
}

/**
 * Use client-submitted JSON for the active template when valid (same id, non-trivial focus body).
 * Falls back to the static template from code.
 */
export function applyPlanReviewPromptSnapshot(
  templateId: string,
  snapshotJson: string | null | undefined,
): PlanReviewPromptTemplate | undefined {
  const base = getPlanReviewPromptTemplate(templateId);
  if (!base) return undefined;
  if (typeof snapshotJson !== 'string' || !snapshotJson.trim()) return base;
  try {
    const snap = JSON.parse(snapshotJson) as Partial<PlanReviewPromptTemplate>;
    if (snap?.id !== templateId) return base;
    if (typeof snap.focusBody !== 'string') return base;
    const focusBody = snap.focusBody.trim();
    if (focusBody.length < 8) return base;
    return {
      ...base,
      name: typeof snap.name === 'string' && snap.name.trim() ? snap.name.trim() : base.name,
      group: typeof snap.group === 'string' && snap.group.trim() ? snap.group.trim() : base.group,
      focusBody,
    };
  } catch {
    return base;
  }
}

export function listPromptsByCategory(categoryId: PlanReviewCategoryId): PlanReviewPromptTemplate[] {
  return PLAN_REVIEW_PROMPTS.filter((p) => p.categoryId === categoryId);
}

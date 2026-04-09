import type { ChecklistCategory } from '@/lib/checklist-data';
import { CHECKLIST_MAIN_KEYS } from '@/lib/types';

const FALLBACK_CATEGORY_LABEL: Record<string, string> = {
  titlePage: 'Title Page',
  plotPlan: 'Plot Plan',
  foundationPlan: 'Foundation Plan',
  floorPlans: 'Floor Plans',
  schedules: 'Schedules',
  exteriorElevations: 'Exterior Elevations',
  interiorElevations: 'Interior Elevations',
  roofPlan: 'Roof Plan',
  electricalPlan: 'Electrical Plan',
  asBuiltPlans: 'As-Built Plans',
};

const MAX_MODEL_APPENDIX_CHARS = 14_000;

function resolveCategory(template: ChecklistCategory[], key: string): ChecklistCategory {
  const found = template.find((c) => c.id === key);
  if (found) return found;
  return {
    id: key,
    label: FALLBACK_CATEGORY_LABEL[key] || key,
    description: '',
    subTasks: [],
  };
}

export interface PlanReviewChecklistContext {
  /** Appended to the model system prompt (bounded length). */
  modelAppendix: string;
  /** Lines for the report PDF “checklist used for verification” section. */
  pdfChecklistLines: string[];
  stats: {
    checklistLineCount: number;
  };
}

/**
 * Parse a checklist bundle posted from the browser. This is intentionally permissive and safe:
 * we only use the checklist template text as a verification rubric.
 */
export function parsePlanReviewChecklistBundle(raw: string | null | undefined): {
  projectLabel: string;
  template: ChecklistCategory[];
} | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const j = JSON.parse(raw) as {
      projectLabel?: unknown;
      template?: unknown;
    };
    if (!Array.isArray(j.template) || j.template.length > 80) return null;
    const template: ChecklistCategory[] = [];
    for (const row of j.template) {
      if (!row || typeof row !== 'object') continue;
      const o = row as Record<string, unknown>;
      const id = typeof o.id === 'string' ? o.id.slice(0, 80) : '';
      if (!id) continue;
      const label = typeof o.label === 'string' ? o.label.slice(0, 200) : id;
      const description = typeof o.description === 'string' ? o.description.slice(0, 500) : '';
      const subRaw = o.subTasks;
      const subTasks: { id: string; label: string }[] = [];
      if (Array.isArray(subRaw)) {
        for (const s of subRaw) {
          if (!s || typeof s !== 'object') continue;
          const so = s as Record<string, unknown>;
          const sid = typeof so.id === 'string' ? so.id.slice(0, 80) : '';
          const sl = typeof so.label === 'string' ? so.label.slice(0, 400) : sid;
          if (sid) subTasks.push({ id: sid, label: sl });
          if (subTasks.length > 120) break;
        }
      }
      template.push({ id, label, description, subTasks });
    }
    const projectLabel =
      typeof j.projectLabel === 'string' ? j.projectLabel.trim().slice(0, 200) : '';
    if (!projectLabel) return null;
    return { projectLabel, template };
  } catch {
    return null;
  }
}

export function buildPlanReviewChecklistContext(
  template: ChecklistCategory[],
): PlanReviewChecklistContext {
  const lines: string[] = [];

  for (const key of CHECKLIST_MAIN_KEYS) {
    const cat = resolveCategory(template, key);
    const subs = Array.isArray(cat.subTasks) ? cat.subTasks : [];

    if (subs.length === 0) {
      lines.push(`${cat.label} (verify on plan sheets)`);
      continue;
    }

    for (const st of subs) {
      lines.push(`${cat.label} › ${st.label}`);
    }
  }

  const stats = {
    checklistLineCount: lines.length,
  };

  const modelBody = [
    '## Master Checklist rubric (plan set is the source of truth)',
    'The lines below define what to check. They are **not** a list to repeat in your output.',
    '',
    'How to use this rubric:',
    '- Work through the lines mentally; output **only** items that are **missing**, **unclear**, or **conflict** on the sheets.',
    '- **Do not** output rows for items that are correctly shown or verified OK.',
    '- In JSON, **checklistVerification** contains **only** those problem rows (use status missing | unclear | conflict).',
    '- item text must match the rubric line you are flagging.',
    '',
    'Plot plan section:',
    '- Rubric lines under **Plot Plan** (label starts with "Plot Plan"): if there is **no** plot/site/civil sheet in the upload, **skip** all of those lines — output nothing for them.',
    '',
    'Framing / structure / alarms / doors (firm policy):',
    '- 2x4 walls are fine up to 10\' wall height (including 9\' ceilings) — not an issue.',
    '- Ignore header/beam structural notes on arch sheets (engineer will spec).',
    '- Do not discuss smoke/CO **interconnection**; do confirm **WP exterior receptacles** on the electrical plan where applicable.',
    '- Do not warn about **6\'-6"** max door leaf height (or similar note-only callouts).',
    '',
    'Optional cross-cutting findings may also go in critical/major/minor/recommendations (or leave empty).',
    '',
    '### Rubric lines (internal reference — do not dump this list into the report narrative)',
    lines.length ? lines.map((l) => `- ${l}`).join('\n') : '- (no checklist items provided)',
  ].join('\n');

  const modelAppendix =
    modelBody.length > MAX_MODEL_APPENDIX_CHARS
      ? `${modelBody.slice(0, MAX_MODEL_APPENDIX_CHARS)}\n\n… [checklist context truncated for size]`
      : modelBody;

  return {
    modelAppendix,
    pdfChecklistLines: lines,
    stats,
  };
}

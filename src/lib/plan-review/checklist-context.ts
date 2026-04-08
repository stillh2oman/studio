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
    '## Checklist verification rubric (use the plan set as the source of truth)',
    'The following checklist items are requirements to VERIFY against the uploaded sheets.',
    'For each item, look for evidence on the plans that it is implemented correctly.',
    '',
    'IMPORTANT:',
    '- Do NOT treat an item as completed just because it appears in a checklist or is typically included.',
    '- Only mark an item "verified" when you can point to concrete evidence on a specific sheet/page.',
    '- When you cannot find evidence, do NOT assume it exists elsewhere in the set.',
    '',
    'How to report checklist issues:',
    '- If an item is missing, conflicting, or clearly wrong on the sheets → add a finding (Major/Minor/Recommendation).',
    '- If it is unclear from the drawings → add a finding with confidence \"possible\" and describe what to verify.',
    '- Prefix checklist-driven finding titles with \"[Checklist]\".',
    '',
    'Also include a `checklistVerification` array in the JSON output when a checklist is provided.',
    'For EVERY checklist item below, add one row:',
    '- item: the checklist line text',
    '- status: "verified" | "missing" | "unclear" | "conflict"',
    '- evidence: what you saw (or did not see) on the sheet(s), including the relevant note/detail/schedule name when possible',
    '- sheetRef: sheet id/title or page index when inferable',
    '- confidence: "confirmed" when evidence is explicit; otherwise "possible"',
    '',
    '### Checklist items',
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

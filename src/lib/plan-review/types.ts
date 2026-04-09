/**
 * Shared types for Plan Review (architectural PDF → Perplexity → report PDF).
 */

export type PlanReviewCategoryId = 'residential' | 'commercial';

export type PlanReviewStepId =
  | 'idle'
  | 'uploaded'
  | 'converting'
  | 'perplexity'
  | 'report'
  | 'complete'
  | 'error';

/** Steps emitted on the NDJSON progress line (before `type: complete`). */
export type PlanReviewProgressStep =
  | 'uploaded'
  | 'converting'
  | 'perplexity'
  | 'analysis'
  | 'report';

export type FindingConfidence = 'confirmed' | 'possible';

export interface PlanReviewFinding {
  title: string;
  detail: string;
  /** Sheet / page reference when inferable from the plan set (e.g. "A-3", "page 12"). */
  sheetRef?: string;
  confidence: FindingConfidence;
}

/** Structured output we ask Perplexity to return (parsed + validated loosely). */
export interface PlanReviewAnalysisJson {
  executiveSummary: string;
  critical: PlanReviewFinding[];
  major: PlanReviewFinding[];
  minor: PlanReviewFinding[];
  recommendations: PlanReviewFinding[];
  /**
   * Master Checklist / rubric results. For dedicated checklist analysis runs, only problem rows are
   * returned (**missing**, **unclear**, **conflict**); verified OK items are omitted. Optional for
   * code-only reviews.
   */
  checklistVerification?: Array<{
    item: string;
    status: 'verified' | 'missing' | 'unclear' | 'conflict';
    /** Concrete evidence for the status (what was/was not found and where). */
    evidence: string;
    /** Sheet / page reference when inferable from the plan set (e.g. "A-3", "page 12"). */
    sheetRef?: string;
    confidence: FindingConfidence;
  }>;
}

export type PlanReviewStreamEvent =
  | { type: 'progress'; step: PlanReviewProgressStep; detail?: string }
  | {
      type: 'complete';
      reportPdfBase64: string;
      analysis: PlanReviewAnalysisJson;
      meta: {
        fileName: string;
        templateId: string;
        categoryId: PlanReviewCategoryId;
        templateName: string;
        /** compliance = code/plan review; checklist = Master Checklist–only pass (separate upload). */
        reviewMode?: 'compliance' | 'checklist';
        pageCountSent: number;
        totalPdfPages: number;
        truncated: boolean;
        completedAtIso: string;
        /** True when PNG rasterization failed (e.g. no canvas on host) and text extraction was used. */
        usedTextFallback?: boolean;
        /** Present when a Ledger project was linked for checklist context. */
        checklistProjectLabel?: string;
        checklistLineCount?: number;
      };
    }
  | { type: 'error'; message: string; code?: string };

export interface PlanReviewPromptTemplate {
  id: string;
  categoryId: PlanReviewCategoryId;
  name: string;
  /** Group heading in dropdown */
  group: string;
  /** Focus instructions for this review type */
  focusBody: string;
}

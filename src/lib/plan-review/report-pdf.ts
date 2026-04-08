import type { PlanReviewAnalysisJson } from '@/lib/plan-review/types';

function addSection(
  doc: import('jspdf').jsPDF,
  title: string,
  y: number,
): number {
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, y);
  return y + 8;
}

function addWrapped(
  doc: import('jspdf').jsPDF,
  text: string,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, 14, y);
  return y + lines.length * lineHeight + 4;
}

function findingsBlock(
  doc: import('jspdf').jsPDF,
  heading: string,
  items: PlanReviewAnalysisJson['critical'],
  startY: number,
  pageWidth: number,
): number {
  let y = addSection(doc, heading, startY);
  if (!items.length) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.text('None noted.', 14, y);
    return y + 8;
  }
  for (const f of items) {
    const head = `${f.confidence === 'possible' ? '[Possible] ' : ''}${f.title}`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(head, 14, y);
    y += 5;
    const meta = f.sheetRef ? `Sheet / page ref: ${f.sheetRef}` : '';
    if (meta) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.text(meta, 14, y);
      y += 5;
    }
    y = addWrapped(doc, f.detail, y, pageWidth - 28, 4.5);
    y += 2;
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
  }
  return y;
}

function checklistLinesBlock(
  doc: import('jspdf').jsPDF,
  title: string,
  lines: string[],
  startY: number,
  pageWidth: number,
): number {
  let y = addSection(doc, title, startY);
  if (!lines.length) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.text('None.', 14, y);
    return y + 8;
  }
  for (const line of lines) {
    y = addWrapped(doc, `• ${line}`, y, pageWidth - 28, 4.5);
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
  }
  return y + 4;
}

function checklistVerificationBlock(
  doc: import('jspdf').jsPDF,
  startY: number,
  pageWidth: number,
  rows: NonNullable<PlanReviewAnalysisJson['checklistVerification']>,
): number {
  let y = addSection(doc, 'Checklist verification results', startY);

  const counts = rows.reduce(
    (acc, r) => {
      acc.total += 1;
      acc[r.status] += 1;
      return acc;
    },
    {
      total: 0,
      verified: 0,
      missing: 0,
      unclear: 0,
      conflict: 0,
    } as { total: number; verified: number; missing: number; unclear: number; conflict: number },
  );

  y = addWrapped(
    doc,
    `Totals: ${counts.total} items — Verified: ${counts.verified}, Missing: ${counts.missing}, Unclear: ${counts.unclear}, Conflict: ${counts.conflict}`,
    y,
    pageWidth - 28,
    4.5,
  );

  if (y > 260) {
    doc.addPage();
    y = 20;
  }

  for (const r of rows) {
    const head = `[${r.status.toUpperCase()}]${r.confidence === 'possible' ? ' [Possible]' : ''} ${r.item}`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(doc.splitTextToSize(head, pageWidth - 28), 14, y);
    y += 5;

    const meta = r.sheetRef ? `Sheet / page ref: ${r.sheetRef}` : '';
    if (meta) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.text(meta, 14, y);
      y += 5;
    }
    y = addWrapped(doc, r.evidence, y, pageWidth - 28, 4.5);
    y += 2;

    if (y > 270) {
      doc.addPage();
      y = 20;
    }
  }

  return y + 4;
}

export async function buildPlanReviewReportPdf(params: {
  title: string;
  generatedAtIso: string;
  originalFileName: string;
  categoryLabel: string;
  promptName: string;
  analysis: PlanReviewAnalysisJson;
  /** When set, adds checklist rubric section before the disclaimer. */
  checklistProjectLabel?: string;
  checklistLines?: string[];
}): Promise<Buffer> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();

  let y = 18;
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(params.title, 14, y);
  y += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${params.generatedAtIso}`, 14, y);
  y += 6;
  doc.text(`Source file: ${params.originalFileName}`, 14, y);
  y += 6;
  doc.text(`Category: ${params.categoryLabel}`, 14, y);
  y += 6;
  doc.text(`Review type: ${params.promptName}`, 14, y);
  y += 12;

  y = addSection(doc, 'Executive summary', y);
  y = addWrapped(doc, params.analysis.executiveSummary, y, pageWidth - 28, 5);
  y += 4;

  if (y > 240) {
    doc.addPage();
    y = 20;
  }
  y = findingsBlock(doc, 'Critical', params.analysis.critical, y, pageWidth);
  y += 4;
  if (y > 240) {
    doc.addPage();
    y = 20;
  }
  y = findingsBlock(doc, 'Major', params.analysis.major, y, pageWidth);
  y += 4;
  if (y > 240) {
    doc.addPage();
    y = 20;
  }
  y = findingsBlock(doc, 'Minor', params.analysis.minor, y, pageWidth);
  y += 4;
  if (y > 240) {
    doc.addPage();
    y = 20;
  }
  y = findingsBlock(doc, 'Recommendations', params.analysis.recommendations, y, pageWidth);
  y += 10;

  if (params.checklistProjectLabel) {
    if (y > 220) {
      doc.addPage();
      y = 20;
    }
    y = addSection(doc, 'Checklist verification rubric', y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Project: ${params.checklistProjectLabel}`, 14, y);
    y += 10;
    y = checklistLinesBlock(
      doc,
      'Items to verify on the plan set',
      params.checklistLines ?? [],
      y,
      pageWidth,
    );
    y += 6;

    if (params.analysis.checklistVerification?.length) {
      if (y > 220) {
        doc.addPage();
        y = 20;
      }
      y = checklistVerificationBlock(doc, y, pageWidth, params.analysis.checklistVerification);
      y += 6;
    }
  }

  if (y > 230) {
    doc.addPage();
    y = 20;
  }
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Disclaimer', 14, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const disclaimer = [
    'This report was generated by an AI-assisted review from rasterized plan images. It does not constitute legal,',
    'engineering, or code official approval. Conditions in the field, local amendments, and complete drawing sets',
    'may change conclusions. Verify all critical items with the architect/engineer of record and the authority having jurisdiction.',
  ].join(' ');
  y = addWrapped(doc, disclaimer, y, pageWidth - 28, 4);

  const out = doc.output('arraybuffer');
  return Buffer.from(out);
}

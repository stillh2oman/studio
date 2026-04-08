import { convert } from "html-to-text";
import type { PDFFont, PDFPage } from "pdf-lib";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getDropboxUpstreamUserAgent, isDropboxUrl, toDirectDropboxFileUrl } from "@/lib/dropbox-utils";
import { formatAgreementDateLong } from "@/lib/planport-agreement-date";

/** US Letter — pdf-lib only (no PDFKit: serverless bundles omit pdfkit’s .afm font files). */
const PAGE_W = 612;
const PAGE_H = 792;
const PAGE_MARGIN = 54;

export type ContractTemplateKind = "html" | "pdf_form";

/** Use in HTML templates as {{clientSignerName}} until the client signs; draft PDF uses this literal. */
export const CLIENT_SIGNER_PLACEHOLDER = "____________________________";

export function applyTemplateHtml(html: string, vars: Record<string, string>): string {
  let s = html;
  for (const [k, v] of Object.entries(vars)) {
    const re = new RegExp(`\\{\\{${escapeRegExp(k)}\\}\\}`, "g");
    s = s.replace(re, v);
  }
  return s;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function fetchPdfBytes(url: string): Promise<Buffer> {
  const u = url.trim();
  const resolved = isDropboxUrl(u) ? toDirectDropboxFileUrl(u) : u;
  const r = await fetch(resolved, {
    headers: { "User-Agent": getDropboxUpstreamUserAgent(), Accept: "application/pdf,*/*" },
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw new Error(`Failed to download PDF (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

/**
 * Fill AcroForm fields. `acroFieldMap`: PDF field name → PlanPort variable key (e.g. clientDisplayName).
 */
export async function buildFilledPdfFormDraftBuffer(
  sourcePdfUrl: string,
  acroFieldMap: Record<string, string> | undefined,
  vars: Record<string, string>
): Promise<Buffer> {
  const bytes = await fetchPdfBytes(sourcePdfUrl);
  const pdfDoc = await PDFDocument.load(bytes);
  try {
    const form = pdfDoc.getForm();
    const map = acroFieldMap && Object.keys(acroFieldMap).length ? acroFieldMap : {};
    for (const [fieldName, varKey] of Object.entries(map)) {
      const value = vars[varKey] ?? "";
      try {
        const tf = form.getTextField(fieldName);
        tf.setText(value);
      } catch {
        try {
          const cb = form.getCheckBox(fieldName);
          if (/^(true|yes|1|on)$/i.test(value.trim())) cb.check();
        } catch {
          /* unknown field type */
        }
      }
    }
    form.flatten();
  } catch {
    /* no AcroForm */
  }
  return Buffer.from(await pdfDoc.save());
}

function breakLongToken(token: string, maxWidth: number, font: PDFFont, size: number): string[] {
  if (font.widthOfTextAtSize(token, size) <= maxWidth) return [token];
  const out: string[] = [];
  let chunk = "";
  for (const ch of token) {
    const next = chunk + ch;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || chunk === "") {
      chunk = next;
    } else {
      out.push(chunk);
      chunk = ch;
    }
  }
  if (chunk) out.push(chunk);
  return out;
}

/** Word-wrap a single paragraph to lines that fit `maxWidth` (points). */
function wrapParagraphToLines(text: string, maxWidth: number, font: PDFFont, size: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = words[0]!;
  for (let i = 1; i < words.length; i++) {
    const w = words[i]!;
    const test = `${line} ${w}`;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      line = test;
    } else {
      if (font.widthOfTextAtSize(line, size) > maxWidth) {
        lines.push(...breakLongToken(line, maxWidth, font, size));
      } else {
        lines.push(line);
      }
      line = w;
    }
  }
  if (font.widthOfTextAtSize(line, size) > maxWidth) {
    lines.push(...breakLongToken(line, maxWidth, font, size));
  } else {
    lines.push(line);
  }
  return lines;
}

type TextLayoutCtx = {
  pdfDoc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  cursorY: number;
};

function ensureVerticalSpace(ctx: TextLayoutCtx, needFromBaseline: number): void {
  const bottom = PAGE_MARGIN;
  if (ctx.cursorY - needFromBaseline < bottom) {
    ctx.page = ctx.pdfDoc.addPage([PAGE_W, PAGE_H]);
    ctx.cursorY = PAGE_H - PAGE_MARGIN - 11 * 0.85;
  }
}

function drawTextLine(ctx: TextLayoutCtx, text: string, size: number, color = rgb(0, 0, 0)): void {
  const lineHeight = size * 1.25;
  ensureVerticalSpace(ctx, lineHeight);
  ctx.page.drawText(text, {
    x: PAGE_MARGIN,
    y: ctx.cursorY,
    size,
    font: ctx.font,
    color,
  });
  ctx.cursorY -= lineHeight;
}

async function buildPdfFromPlainText(
  plain: string,
  signatureBlock?: {
    clientSignerName: string;
    leadDesignerName: string;
    clientPng: Buffer;
    designerPng: Buffer;
  }
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bodySize = 11;
  const contentW = PAGE_W - 2 * PAGE_MARGIN;
  const lineHeightBody = bodySize * 1.25;

  const ctx: TextLayoutCtx = {
    pdfDoc,
    page: pdfDoc.addPage([PAGE_W, PAGE_H]),
    font,
    cursorY: PAGE_H - PAGE_MARGIN - bodySize * 0.85,
  };

  const paragraphs = plain.split(/\n/);
  for (const para of paragraphs) {
    if (para.trim() === "") {
      ctx.cursorY -= lineHeightBody * 0.35;
      continue;
    }
    const lines = wrapParagraphToLines(para, contentW, font, bodySize);
    for (const line of lines) {
      drawTextLine(ctx, line, bodySize);
    }
  }

  if (signatureBlock) {
    ctx.cursorY -= lineHeightBody * 1.5;
    const labelSize = 10;
    const imgW = 180;

    drawTextLine(ctx, "Client signature", labelSize);
    ctx.cursorY += labelSize * 0.15;

    const cImg = await pdfDoc.embedPng(signatureBlock.clientPng);
    const cH = (cImg.height * imgW) / cImg.width;
    ensureVerticalSpace(ctx, cH + 8);
    ctx.page.drawImage(cImg, {
      x: PAGE_MARGIN,
      y: ctx.cursorY - cH,
      width: imgW,
      height: cH,
    });
    ctx.cursorY -= cH + 12;

    drawTextLine(ctx, `Printed name: ${signatureBlock.clientSignerName}`, labelSize);
    ctx.cursorY -= lineHeightBody * 0.25;

    drawTextLine(ctx, "Designer signature", labelSize);
    ctx.cursorY += labelSize * 0.15;

    const dImg = await pdfDoc.embedPng(signatureBlock.designerPng);
    const dH = (dImg.height * imgW) / dImg.width;
    ensureVerticalSpace(ctx, dH + 8);
    ctx.page.drawImage(dImg, {
      x: PAGE_MARGIN,
      y: ctx.cursorY - dH,
      width: imgW,
      height: dH,
    });
    ctx.cursorY -= dH + 12;

    drawTextLine(ctx, `Lead designer: ${signatureBlock.leadDesignerName}`, labelSize);
    ctx.cursorY -= lineHeightBody * 0.35;

    const foot = `Fully executed electronically on ${new Date().toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    })}.`;
    drawTextLine(ctx, foot, 8, rgb(0.35, 0.35, 0.35));
  }

  return Buffer.from(await pdfDoc.save());
}

export async function htmlToPdfBufferFromPlainText(plainText: string): Promise<Buffer> {
  return buildPdfFromPlainText(plainText);
}

export async function htmlContractDraftToPdfBuffer(html: string): Promise<Buffer> {
  const plain = convert(html, {
    wordwrap: 100,
    preserveNewlines: true,
    selectors: [{ selector: "a", options: { ignoreHref: true } }],
  });
  return buildPdfFromPlainText(plain);
}

export async function htmlContractExecutedToPdfBuffer(
  bodyHtml: string,
  opts: {
    clientSignerName: string;
    leadDesignerName: string;
    clientPng: Buffer;
    designerPng: Buffer;
  }
): Promise<Buffer> {
  const plain = convert(bodyHtml, {
    wordwrap: 100,
    preserveNewlines: true,
    selectors: [{ selector: "a", options: { ignoreHref: true } }],
  });
  return buildPdfFromPlainText(plain, opts);
}

export function pngDataUrlToBuffer(dataUrl: string): Buffer {
  const m = dataUrl.match(/^data:image\/png;base64,(.+)$/i);
  if (!m) throw new Error("Signature must be a PNG data URL");
  return Buffer.from(m[1], "base64");
}

export async function burnSignaturesIntoPdfBuffer(
  pdfBuffer: Buffer,
  opts: {
    clientSignerName: string;
    leadDesignerName: string;
    clientPng: Buffer;
    designerPng: Buffer;
  }
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const page = pages[pages.length - 1]!;
  const w = page.getWidth();
  const leftX = 50;
  const rightX = Math.max(leftX + 200, w / 2 - 10);
  const sigW = Math.min(175, w / 2 - 70);
  const sigH = 52;
  const imgBottomY = 115;
  const cImg = await pdfDoc.embedPng(opts.clientPng);
  const dImg = await pdfDoc.embedPng(opts.designerPng);
  page.drawText(`Client: ${opts.clientSignerName}`, { x: leftX, y: imgBottomY + sigH + 12, size: 9, font });
  page.drawImage(cImg, { x: leftX, y: imgBottomY, width: sigW, height: sigH });
  page.drawText(`Designer: ${opts.leadDesignerName}`, { x: rightX, y: imgBottomY + sigH + 12, size: 9, font });
  page.drawImage(dImg, { x: rightX, y: imgBottomY, width: sigW, height: sigH });
  page.drawText(`Executed electronically ${new Date().toLocaleString()}`, {
    x: leftX,
    y: 32,
    size: 8,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
  return Buffer.from(await pdfDoc.save());
}

export function parseAcroFieldMapJson(json: string | undefined): Record<string, string> | undefined {
  if (!json?.trim()) return undefined;
  try {
    const o = JSON.parse(json) as unknown;
    if (typeof o !== "object" || o === null) return undefined;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) {
      if (typeof k === "string" && typeof v === "string" && k.trim() && v.trim()) {
        out[k.trim()] = v.trim();
      }
    }
    return Object.keys(out).length ? out : undefined;
  } catch {
    return undefined;
  }
}

export function buildContractVarMap(opts: {
  clientDisplayName: string;
  agreementDate: string;
  projectLocation: string;
  projectName: string;
  leadDesignerName: string;
  clientSignerName: string;
}): Record<string, string> {
  return {
    clientDisplayName: opts.clientDisplayName,
    agreementDate: opts.agreementDate,
    agreementDateLong: formatAgreementDateLong(opts.agreementDate),
    projectLocation: opts.projectLocation,
    projectName: opts.projectName,
    leadDesignerName: opts.leadDesignerName,
    clientSignerName: opts.clientSignerName,
  };
}

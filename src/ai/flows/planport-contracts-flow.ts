"use server";

import { randomBytes } from "node:crypto";
import { FieldValue, type DocumentData, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { assertPlanportAdmin, getPlanportAdminFirestore } from "@/lib/firebase-admin-app";
import { PLANPORT_CLIENT_ROOT } from "@/lib/planport-project-paths";
import {
  CONTRACT_TEMPLATES_COLLECTION,
  OUTBOUND_CONTRACTS_COLLECTION,
  PROJECT_DOCUMENTS_SUBCOLLECTION,
  PROJECT_SIGNING_REQUESTS_SUBCOLLECTION,
} from "@/lib/planport-contract-types";
import { getPlanportPublicAppUrl } from "@/lib/planport-public-url";
import { uploadMirroredPublicPdf } from "@/lib/mirror-image-storage";
import {
  applyTemplateHtml,
  buildContractVarMap,
  buildFilledPdfFormDraftBuffer,
  burnSignaturesIntoPdfBuffer,
  CLIENT_SIGNER_PLACEHOLDER,
  fetchPdfBytes,
  htmlContractDraftToPdfBuffer,
  htmlContractExecutedToPdfBuffer,
  parseAcroFieldMapJson,
  pngDataUrlToBuffer,
  type ContractTemplateKind,
} from "@/lib/planport-contract-pdf";
import {
  DEFAULT_CONTRACT_TEMPLATE_SLUGS,
  getDefaultContractTemplate,
} from "@/lib/default-contract-templates";

const BUILTIN_TEMPLATE_ID_PREFIX = "__builtin__:";

function projectSigningRequestRef(db: Firestore, clientId: string, projectId: string, contractId: string) {
  return db
    .collection(PLANPORT_CLIENT_ROOT)
    .doc(clientId)
    .collection("projects")
    .doc(projectId)
    .collection(PROJECT_SIGNING_REQUESTS_SUBCOLLECTION)
    .doc(contractId);
}

function tsIso(v: unknown): string {
  if (typeof v === "string" && v.trim()) return v;
  if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: () => Date }).toDate === "function") {
    try {
      return (v as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return new Date().toISOString();
    }
  }
  return new Date().toISOString();
}

// —— Templates ——

export async function listContractTemplates(
  idToken: string
): Promise<
  | {
      items: {
        id: string;
        title: string;
        description?: string;
        templateKind: ContractTemplateKind;
        pdfUrl: string;
        bodyHtmlPreview?: string;
        defaultSlug?: string;
        createdAt: string;
      }[];
    }
  | { error: string }
> {
  try {
    await assertPlanportAdmin(idToken);
    const db = getPlanportAdminFirestore();
    const snap = await db.collection(CONTRACT_TEMPLATES_COLLECTION).limit(80).get();
    const installedDefaultSlugs = new Set<string>();
    for (const d of snap.docs) {
      const slug = d.data().defaultSlug;
      if (typeof slug === "string" && slug.trim()) installedDefaultSlugs.add(slug.trim());
    }

    const items = snap.docs
      .map((d) => {
        const x = d.data();
        const kindRaw = String(x.templateKind ?? "pdf_form");
        const templateKind: ContractTemplateKind = kindRaw === "html" ? "html" : "pdf_form";
        const bodyHtml = typeof x.bodyHtml === "string" ? x.bodyHtml : "";
        const defaultSlug = typeof x.defaultSlug === "string" && x.defaultSlug.trim() ? x.defaultSlug.trim() : undefined;
        return {
          id: d.id,
          title: String(x.title ?? ""),
          description: x.description ? String(x.description) : undefined,
          templateKind,
          pdfUrl: String(x.pdfUrl ?? ""),
          ...(templateKind === "html" && bodyHtml
            ? { bodyHtmlPreview: bodyHtml.slice(0, 160) + (bodyHtml.length > 160 ? "…" : "") }
            : {}),
          ...(defaultSlug ? { defaultSlug } : {}),
          createdAt: tsIso(x.createdAt),
          _ts: (x.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0,
        };
      })
      .sort((a, b) => b._ts - a._ts)
      .slice(0, 50)
      .map(({ _ts: _, ...rest }) => rest);

    /** Lets send dialogs list design agreements even before admin clicks “install built-in”. */
    const syntheticBuiltins: (typeof items)[number][] = [];
    for (const slug of DEFAULT_CONTRACT_TEMPLATE_SLUGS) {
      if (installedDefaultSlugs.has(slug)) continue;
      const def = getDefaultContractTemplate(slug);
      if (!def) continue;
      syntheticBuiltins.push({
        id: `${BUILTIN_TEMPLATE_ID_PREFIX}${slug}`,
        title: def.title,
        description: def.description,
        templateKind: "html",
        pdfUrl: "",
        createdAt: new Date(0).toISOString(),
        defaultSlug: slug,
      });
    }

    return { items: [...items, ...syntheticBuiltins] };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to list templates." };
  }
}

const addTemplateSchema = z
  .object({
    templateKind: z.enum(["html", "pdf_form"]).optional(),
    title: z.string().min(2),
    pdfUrl: z.string().optional(),
    bodyHtml: z.string().optional(),
    acroFieldMapJson: z.string().max(20000).optional(),
    description: z.string().max(2000).optional(),
  })
  .superRefine((data, ctx) => {
    const kind = data.templateKind ?? "pdf_form";
    if (kind === "pdf_form") {
      const u = data.pdfUrl?.trim() ?? "";
      if (u.length < 12 || !/^https?:\/\//i.test(u)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "PDF URL is required for PDF templates (http/https).",
          path: ["pdfUrl"],
        });
      }
    } else {
      const h = data.bodyHtml?.trim() ?? "";
      if (h.length < 40) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "HTML body must be at least 40 characters.",
          path: ["bodyHtml"],
        });
      }
    }
  });

export async function addContractTemplate(
  idToken: string,
  raw: z.infer<typeof addTemplateSchema>
): Promise<{ ok: true; id: string } | { error: string }> {
  const parsed = addTemplateSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(" ") };
  }
  try {
    await assertPlanportAdmin(idToken);
    const db = getPlanportAdminFirestore();
    const now = FieldValue.serverTimestamp();
    const kind: ContractTemplateKind = parsed.data.templateKind ?? "pdf_form";
    const acroFieldMap = parseAcroFieldMapJson(parsed.data.acroFieldMapJson);
    const base = {
      title: parsed.data.title.trim(),
      templateKind: kind,
      ...(parsed.data.description?.trim() ? { description: parsed.data.description.trim() } : {}),
      createdAt: now,
      updatedAt: now,
    };
    const ref =
      kind === "html"
        ? await db.collection(CONTRACT_TEMPLATES_COLLECTION).add({
            ...base,
            bodyHtml: parsed.data.bodyHtml!.trim(),
          })
        : await db.collection(CONTRACT_TEMPLATES_COLLECTION).add({
            ...base,
            pdfUrl: parsed.data.pdfUrl!.trim(),
            ...(acroFieldMap ? { acroFieldMap } : {}),
          });
    return { ok: true, id: ref.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to add template." };
  }
}

export async function deleteContractTemplate(
  idToken: string,
  templateId: string
): Promise<{ ok: true } | { error: string }> {
  if (!templateId.trim()) return { error: "Missing template id." };
  try {
    await assertPlanportAdmin(idToken);
    await getPlanportAdminFirestore().collection(CONTRACT_TEMPLATES_COLLECTION).doc(templateId).delete();
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete template." };
  }
}

/** Adds a built-in HTML template if not already present (matched by defaultSlug). */
export async function installDefaultContractTemplate(
  idToken: string,
  slug: string
): Promise<{ ok: true; id: string } | { ok: true; already: true; id: string } | { error: string }> {
  const trimmed = slug.trim();
  if (!trimmed) return { error: "Missing template slug." };
  try {
    await assertPlanportAdmin(idToken);
    const def = getDefaultContractTemplate(trimmed);
    if (!def) return { error: "Unknown built-in template." };
    const db = getPlanportAdminFirestore();
    const existing = await db
      .collection(CONTRACT_TEMPLATES_COLLECTION)
      .where("defaultSlug", "==", trimmed)
      .limit(1)
      .get();
    if (!existing.empty) {
      return { ok: true, already: true, id: existing.docs[0]!.id };
    }
    const now = FieldValue.serverTimestamp();
    const ref = await db.collection(CONTRACT_TEMPLATES_COLLECTION).add({
      title: def.title,
      description: def.description,
      templateKind: "html",
      bodyHtml: def.bodyHtml,
      defaultSlug: trimmed,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true, id: ref.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to install template." };
  }
}

// —— Create / send ——

const createSendSchema = z.object({
  templateId: z.string().min(1),
  clientId: z.string().min(1),
  projectId: z.string().min(1),
  agreementDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export async function createContractForSignature(
  idToken: string,
  raw: z.infer<typeof createSendSchema>
): Promise<{ ok: true; contractId: string; signUrl: string } | { error: string }> {
  const parsed = createSendSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(" ") };
  }
  try {
    const admin = await assertPlanportAdmin(idToken);
    const db = getPlanportAdminFirestore();

    let templateId = parsed.data.templateId.trim();
    if (templateId.startsWith(BUILTIN_TEMPLATE_ID_PREFIX)) {
      const slug = templateId.slice(BUILTIN_TEMPLATE_ID_PREFIX.length).trim();
      if (!slug) return { error: "Invalid built-in template reference." };
      const inst = await installDefaultContractTemplate(idToken, slug);
      if ("error" in inst) return { error: inst.error };
      templateId = inst.id;
    }

    const tRef = db.collection(CONTRACT_TEMPLATES_COLLECTION).doc(templateId);
    const tSnap = await tRef.get();
    if (!tSnap.exists) return { error: "Template not found." };
    const t = tSnap.data()!;
    const templateKind: ContractTemplateKind =
      String(t.templateKind ?? "pdf_form") === "html" ? "html" : "pdf_form";
    const templatePdfUrl = String(t.pdfUrl ?? "").trim();
    const bodyHtmlSource =
      templateKind === "html" ? String(t.bodyHtml ?? "").trim() : "";
    if (templateKind === "html" && !bodyHtmlSource) {
      return { error: "This HTML template has no body content." };
    }
    if (templateKind === "pdf_form" && !templatePdfUrl) {
      return { error: "Template has no PDF URL." };
    }

    const clientRef = db.collection(PLANPORT_CLIENT_ROOT).doc(parsed.data.clientId);
    const clientSnap = await clientRef.get();
    if (!clientSnap.exists) return { error: "Client not found." };
    const c = clientSnap.data()!;
    const husband = String(c.husbandName ?? "").trim();
    const wife = String(c.wifeName ?? "").trim();
    const clientDisplayName = wife ? `${husband} & ${wife}` : husband || "Client";

    const projRef = clientRef.collection("projects").doc(parsed.data.projectId);
    const projSnap = await projRef.get();
    if (!projSnap.exists) return { error: "Project not found." };
    const p = projSnap.data()!;
    const projectName = String(p.name ?? "").trim() || "Project";
    const projectLocation = String(p.address ?? "").trim() || String(c.address ?? "").trim() || "—";
    const leadDesignerName = String(p.designerName ?? "").trim() || "Jeff Dillon";

    const agreementDate =
      parsed.data.agreementDate?.trim() ?? new Date().toISOString().slice(0, 10);

    const signToken = randomBytes(32).toString("hex");
    const now = FieldValue.serverTimestamp();

    const varsDraft = buildContractVarMap({
      clientDisplayName,
      agreementDate,
      projectLocation,
      projectName,
      leadDesignerName,
      clientSignerName: CLIENT_SIGNER_PLACEHOLDER,
    });

    const cRef = db.collection(OUTBOUND_CONTRACTS_COLLECTION).doc();
    const contractId = cRef.id;

    let draftBuffer: Buffer;
    if (templateKind === "html") {
      const draftHtml = applyTemplateHtml(bodyHtmlSource, varsDraft);
      draftBuffer = await htmlContractDraftToPdfBuffer(draftHtml);
    } else {
      const acroMap =
        t.acroFieldMap && typeof t.acroFieldMap === "object" && !Array.isArray(t.acroFieldMap)
          ? (t.acroFieldMap as Record<string, string>)
          : undefined;
      draftBuffer = await buildFilledPdfFormDraftBuffer(templatePdfUrl, acroMap, varsDraft);
    }

    const draftPdfUrl = await uploadMirroredPublicPdf(`contract-drafts/${contractId}.pdf`, draftBuffer);

    const contractPayload = {
      templateId,
      templateTitle: String(t.title ?? "Contract"),
      pdfUrl: templateKind === "pdf_form" ? templatePdfUrl : "",
      templateKind,
      ...(templateKind === "html" ? { bodyHtmlSource } : {}),
      draftPdfUrl,
      clientId: parsed.data.clientId,
      projectId: parsed.data.projectId,
      projectName,
      clientDisplayName,
      agreementDate,
      projectLocation,
      leadDesignerName,
      status: "awaiting_client" as const,
      signToken,
      createdAt: now,
      sentAt: now,
      createdByUid: admin.uid,
    };

    const signingHubPayload = {
      outboundContractId: contractId,
      templateTitle: contractPayload.templateTitle,
      signToken,
      status: "awaiting_client" as const,
      agreementDate,
      projectName,
      createdAt: now,
    };

    const batch = db.batch();
    batch.set(cRef, contractPayload);
    batch.set(
      projectSigningRequestRef(db, parsed.data.clientId, parsed.data.projectId, contractId),
      signingHubPayload
    );
    await batch.commit();

    const base = getPlanportPublicAppUrl();
    const signUrl = `${base}/contract-sign/${signToken}`;

    return { ok: true, contractId, signUrl };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create contract." };
  }
}

/** @deprecated Use createContractForSignature — email is no longer sent. */
export async function createAndSendContractForSignature(
  idToken: string,
  raw: z.infer<typeof createSendSchema>
): Promise<{ ok: true; contractId: string; signUrl: string } | { error: string }> {
  return createContractForSignature(idToken, raw);
}

// —— Viewable document (public sign + admin preview) ——

type OutboundViewOk = {
  ok: true;
  templateTitle: string;
  templateKind: ContractTemplateKind;
  pdfUrl: string;
  bodyHtml?: string;
};

type OutboundViewErr = { ok: false; error: "no_html" | "no_pdf" };

function buildViewableContractFromOutbound(
  x: DocumentData,
  clientSignerNameMode: "placeholder" | "from_doc"
): OutboundViewOk | OutboundViewErr {
  const templateTitle = String(x.templateTitle ?? "Contract");
  const templateKind: ContractTemplateKind =
    String(x.templateKind ?? "pdf_form") === "html" ? "html" : "pdf_form";

  const executed = String(x.executedPdfUrl ?? "").trim();
  if (executed) {
    return { ok: true, templateTitle, templateKind, pdfUrl: executed };
  }

  const clientSignerName =
    clientSignerNameMode === "from_doc"
      ? String(x.clientSignerName ?? "").trim() || CLIENT_SIGNER_PLACEHOLDER
      : CLIENT_SIGNER_PLACEHOLDER;

  if (templateKind === "html") {
    const src = String(x.bodyHtmlSource ?? "").trim();
    if (!src) return { ok: false, error: "no_html" };
    const vars = buildContractVarMap({
      clientDisplayName: String(x.clientDisplayName ?? ""),
      agreementDate: String(x.agreementDate ?? ""),
      projectLocation: String(x.projectLocation ?? ""),
      projectName: String(x.projectName ?? ""),
      leadDesignerName: String(x.leadDesignerName ?? ""),
      clientSignerName,
    });
    return {
      ok: true,
      templateTitle,
      templateKind,
      pdfUrl: "",
      bodyHtml: applyTemplateHtml(src, vars),
    };
  }

  const pdfUrl = String(x.draftPdfUrl ?? x.pdfUrl ?? "").trim();
  if (!pdfUrl) return { ok: false, error: "no_pdf" };
  return { ok: true, templateTitle, templateKind, pdfUrl };
}

// —— Public sign (token only) ——

export type ContractSignPayload = {
  templateTitle: string;
  /** `pdf_form` drafts: pre-filled PDF URL. Empty for HTML templates (client views HTML only until fully executed). */
  pdfUrl: string;
  templateKind: ContractTemplateKind;
  /** Filled agreement HTML when `templateKind === "html"`. */
  bodyHtml?: string;
  clientDisplayName: string;
  agreementDate: string;
  projectLocation: string;
  projectName: string;
  leadDesignerName: string;
  status: string;
};

export async function getContractSignPayload(
  token: string
): Promise<{ payload: ContractSignPayload } | { error: string }> {
  const t = token?.trim();
  if (!t || t.length < 16) return { error: "Invalid link." };
  try {
    const db = getPlanportAdminFirestore();
    const snap = await db
      .collection(OUTBOUND_CONTRACTS_COLLECTION)
      .where("signToken", "==", t)
      .limit(1)
      .get();
    if (snap.empty) return { error: "This signing link is invalid or has expired." };
    const d = snap.docs[0]!;
    const x = d.data();
    const status = String(x.status ?? "");
    const inner = buildViewableContractFromOutbound(x, "placeholder");
    if (!inner.ok) {
      return {
        error:
          inner.error === "no_html"
            ? "This agreement has no document content. Contact the studio."
            : "This contract has no PDF to display. Contact the studio.",
      };
    }
    return {
      payload: {
        templateTitle: inner.templateTitle,
        clientDisplayName: String(x.clientDisplayName ?? ""),
        agreementDate: String(x.agreementDate ?? ""),
        projectLocation: String(x.projectLocation ?? ""),
        projectName: String(x.projectName ?? ""),
        leadDesignerName: String(x.leadDesignerName ?? ""),
        status,
        templateKind: inner.templateKind,
        pdfUrl: inner.pdfUrl,
        ...(inner.bodyHtml ? { bodyHtml: inner.bodyHtml } : {}),
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not load contract." };
  }
}

const clientSignSchema = z.object({
  token: z.string().min(16),
  signerPrintName: z.string().min(2),
  signaturePngDataUrl: z.string().min(100),
  consent: z.literal(true),
});

export async function submitClientContractSignature(
  raw: z.infer<typeof clientSignSchema>
): Promise<{ ok: true } | { error: string }> {
  const parsed = clientSignSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(" ") };
  }
  try {
    const db = getPlanportAdminFirestore();
    const snap = await db
      .collection(OUTBOUND_CONTRACTS_COLLECTION)
      .where("signToken", "==", parsed.data.token.trim())
      .limit(1)
      .get();
    if (snap.empty) return { error: "Invalid or expired link." };
    const docRef = snap.docs[0]!.ref;
    const x = snap.docs[0]!.data();
    if (x.status !== "awaiting_client") {
      return { error: "This document has already been signed or is no longer awaiting your signature." };
    }

    await docRef.update({
      status: "client_signed",
      clientSignerName: parsed.data.signerPrintName.trim(),
      clientSignatureDataUrl: parsed.data.signaturePngDataUrl,
      clientSignedAt: FieldValue.serverTimestamp(),
    });

    const clientId = String(x.clientId ?? "").trim();
    const projectId = String(x.projectId ?? "").trim();
    const contractId = docRef.id;
    if (clientId && projectId) {
      const sigRef = projectSigningRequestRef(db, clientId, projectId, contractId);
      const sigSnap = await sigRef.get();
      if (sigSnap.exists) {
        await sigRef.update({
          status: "client_signed",
          clientSignedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save signature." };
  }
}

const designerSignSchema = z.object({
  contractId: z.string().min(1),
  signaturePngDataUrl: z.string().min(100),
});

export async function designerCompleteContract(
  idToken: string,
  raw: z.infer<typeof designerSignSchema>
): Promise<{ ok: true } | { error: string }> {
  const parsed = designerSignSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(" ") };
  }
  try {
    await assertPlanportAdmin(idToken);
    const db = getPlanportAdminFirestore();
    const docRef = db.collection(OUTBOUND_CONTRACTS_COLLECTION).doc(parsed.data.contractId);
    const snap = await docRef.get();
    if (!snap.exists) return { error: "Contract not found." };
    const x = snap.data()!;
    if (x.status !== "client_signed") {
      return { error: "Contract is not waiting for designer signature." };
    }

    const clientId = String(x.clientId ?? "");
    const projectId = String(x.projectId ?? "");
    if (!clientId || !projectId) return { error: "Contract is missing client or project." };

    const clientSignerName = String(x.clientSignerName ?? "").trim();
    if (!clientSignerName) return { error: "Client signer name is missing." };

    let clientPng: Buffer;
    let designerPng: Buffer;
    try {
      clientPng = pngDataUrlToBuffer(String(x.clientSignatureDataUrl ?? ""));
      designerPng = pngDataUrlToBuffer(parsed.data.signaturePngDataUrl);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Invalid signature image data." };
    }

    const templateKind: ContractTemplateKind =
      String(x.templateKind ?? "pdf_form") === "html" ? "html" : "pdf_form";
    const leadDesignerName = String(x.leadDesignerName ?? "").trim() || "Lead designer";

    let executedBuffer: Buffer;
    if (templateKind === "html") {
      const src = String(x.bodyHtmlSource ?? "").trim();
      if (!src) {
        return { error: "Contract HTML snapshot is missing; cannot build the executed PDF." };
      }
      const vars = buildContractVarMap({
        clientDisplayName: String(x.clientDisplayName ?? ""),
        agreementDate: String(x.agreementDate ?? ""),
        projectLocation: String(x.projectLocation ?? ""),
        projectName: String(x.projectName ?? ""),
        leadDesignerName,
        clientSignerName,
      });
      const finalHtml = applyTemplateHtml(src, vars);
      executedBuffer = await htmlContractExecutedToPdfBuffer(finalHtml, {
        clientSignerName,
        leadDesignerName,
        clientPng,
        designerPng,
      });
    } else {
      const draftUrl = String(x.draftPdfUrl ?? "").trim() || String(x.pdfUrl ?? "").trim();
      if (!draftUrl) return { error: "No PDF is available to finalize." };
      const draftBuf = await fetchPdfBytes(draftUrl);
      executedBuffer = await burnSignaturesIntoPdfBuffer(draftBuf, {
        clientSignerName,
        leadDesignerName,
        clientPng,
        designerPng,
      });
    }

    const executedPdfUrl = await uploadMirroredPublicPdf(
      `executed-contracts/${clientId}/${parsed.data.contractId}.pdf`,
      executedBuffer
    );

    const completedAt = new Date().toISOString();
    const docId = `contract-${parsed.data.contractId}`;
    const projectDocName = `${String(x.templateTitle ?? "Agreement")} (fully executed)`;

    const docPayload = {
      name: projectDocName,
      kind: "signed_contract" as const,
      url: executedPdfUrl,
      contractId: parsed.data.contractId,
      agreementDate: String(x.agreementDate ?? ""),
      projectLocation: String(x.projectLocation ?? ""),
      clientDisplayName: String(x.clientDisplayName ?? ""),
      clientSignedAt: tsIso(x.clientSignedAt),
      designerSignedAt: completedAt,
      leadDesignerName,
      uploadedAt: completedAt,
    };

    await db
      .collection(PLANPORT_CLIENT_ROOT)
      .doc(clientId)
      .collection("projects")
      .doc(projectId)
      .collection(PROJECT_DOCUMENTS_SUBCOLLECTION)
      .doc(docId)
      .set(docPayload);

    await docRef.update({
      status: "completed",
      designerSignatureDataUrl: parsed.data.signaturePngDataUrl,
      designerSignedAt: FieldValue.serverTimestamp(),
      projectDocumentId: docId,
      executedPdfUrl,
    });

    const sigRef = projectSigningRequestRef(db, clientId, projectId, parsed.data.contractId);
    const sigSnap = await sigRef.get();
    if (sigSnap.exists) {
      await sigRef.update({
        status: "completed",
        designerSignedAt: FieldValue.serverTimestamp(),
      });
    }

    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to complete contract." };
  }
}

export type AdminContractViewPayload = {
  templateTitle: string;
  templateKind: ContractTemplateKind;
  /** Draft, template, or fully executed PDF URL. */
  pdfUrl: string;
  bodyHtml?: string;
};

/** Admin preview: same content the client sees (HTML draft or PDF), or the executed PDF when filed. */
export async function getAdminOutboundContractView(
  idToken: string,
  contractId: string
): Promise<{ payload: AdminContractViewPayload } | { error: string }> {
  const id = contractId?.trim();
  if (!id) return { error: "Missing contract id." };
  try {
    await assertPlanportAdmin(idToken);
    const db = getPlanportAdminFirestore();
    const snap = await db.collection(OUTBOUND_CONTRACTS_COLLECTION).doc(id).get();
    if (!snap.exists) return { error: "Contract not found." };
    const inner = buildViewableContractFromOutbound(snap.data()!, "from_doc");
    if (!inner.ok) {
      return {
        error:
          inner.error === "no_html"
            ? "This agreement has no document content."
            : "No PDF is available for this contract.",
      };
    }
    return {
      payload: {
        templateTitle: inner.templateTitle,
        templateKind: inner.templateKind,
        pdfUrl: inner.pdfUrl,
        ...(inner.bodyHtml ? { bodyHtml: inner.bodyHtml } : {}),
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not load contract." };
  }
}

export async function listRecentOutboundContracts(
  idToken: string
): Promise<
  | {
      items: {
        id: string;
        templateTitle: string;
        clientDisplayName: string;
        projectName: string;
        status: string;
        agreementDate: string;
        signToken: string;
        createdAt: string;
      }[];
    }
  | { error: string }
> {
  try {
    await assertPlanportAdmin(idToken);
    const db = getPlanportAdminFirestore();
    const snap = await db.collection(OUTBOUND_CONTRACTS_COLLECTION).limit(60).get();
    const items = snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: d.id,
          templateTitle: String(x.templateTitle ?? ""),
          clientDisplayName: String(x.clientDisplayName ?? ""),
          projectName: String(x.projectName ?? ""),
          status: String(x.status ?? ""),
          agreementDate: String(x.agreementDate ?? ""),
          signToken: String(x.signToken ?? ""),
          createdAt: tsIso(x.createdAt),
          _ts: (x.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0,
        };
      })
      .sort((a, b) => b._ts - a._ts)
      .slice(0, 40)
      .map(({ _ts: _, ...rest }) => rest);
    return { items };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to list contracts." };
  }
}

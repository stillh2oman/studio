"use server";

import { z } from "zod";
import type { Firestore } from "firebase-admin/firestore";
import {
  getPlanportAdminFirestore,
  verifyIdToken,
  isPlanportAdminDecoded,
} from "@/lib/firebase-admin-app";
import { PLANPORT_CLIENT_ROOT, PLANPORT_GC_ROOT } from "@/lib/planport-project-paths";
import { PLANPORT_INSPIRATION_SUBCOLLECTION } from "@/lib/planport-inspiration";
import {
  sendFirmChatNotification,
  type FirmChatAttachment,
} from "@/ai/flows/send-contact-form";

const MAX_FILE_BYTES = 12 * 1024 * 1024;
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png"]);

const httpUrlSchema = z
  .string()
  .trim()
  .min(1)
  .refine((u) => {
    try {
      const parsed = new URL(u);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, "Enter a valid http(s) URL");

const linkSubmission = z.object({
  kind: z.literal("link"),
  url: httpUrlSchema,
  title: z.string().trim().max(200).optional(),
});

const fileSubmission = z.object({
  kind: z.literal("file"),
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(260)
    .refine((n) => !/[\\/]/.test(n), "Invalid file name"),
  dataUri: z.string().min(20),
});

const inputSchema = z.object({
  idToken: z.string().min(10),
  hubType: z.enum(["client", "gc"]),
  hubId: z.string().min(1),
  projectId: z.string().min(1),
  projectName: z.string().max(500).optional(),
  projectAddress: z.string().max(500).optional(),
  hubDisplayLabel: z.string().max(500).optional(),
  designerEmail: z.string().email().optional(),
  optionalContactEmail: z.string().email().optional(),
  optionalContactName: z.string().trim().max(200).optional(),
  submission: z.discriminatedUnion("kind", [linkSubmission, fileSubmission]),
});

export type SubmitProjectInspirationInput = z.infer<typeof inputSchema>;

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseDataUri(dataUri: string): { mime: string; base64: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUri);
  if (!match) return null;
  return { mime: match[1].trim().toLowerCase(), base64: match[2].replace(/\s/g, "") };
}

async function mirrorInspirationDoc(
  adminDb: Firestore,
  params: {
    hubType: "client" | "gc";
    hubId: string;
    projectId: string;
    docId: string;
    data: Record<string, unknown>;
  }
): Promise<void> {
  const { hubType, hubId, projectId, docId, data } = params;

  if (hubType === "client") {
    const projSnap = await adminDb
      .doc(`${PLANPORT_CLIENT_ROOT}/${hubId}/projects/${projectId}`)
      .get();
    const proj = projSnap.data();
    if (proj?.contractorSyncEnabled === true) {
      const gcId =
        typeof proj.syncedContractorId === "string" ? proj.syncedContractorId.trim() : "";
      if (gcId) {
        await adminDb
          .doc(
            `${PLANPORT_GC_ROOT}/${gcId}/projects/${projectId}/${PLANPORT_INSPIRATION_SUBCOLLECTION}/${docId}`
          )
          .set(data);
      }
    }
    return;
  }

  const projSnap = await adminDb
    .doc(`${PLANPORT_GC_ROOT}/${hubId}/projects/${projectId}`)
    .get();
  const proj = projSnap.data();
  if (!proj) return;
  const clientId =
    typeof proj.individualClientId === "string" ? proj.individualClientId.trim() : "";
  if (!clientId) return;

  let shouldMirror = false;
  if (proj.contractorSyncEnabled === true) {
    shouldMirror = true;
  } else {
    const clientProj = await adminDb
      .doc(`${PLANPORT_CLIENT_ROOT}/${clientId}/projects/${projectId}`)
      .get();
    const c = clientProj.data();
    if (c?.contractorSyncEnabled === true && c?.syncedContractorId === hubId) {
      shouldMirror = true;
    }
  }

  if (shouldMirror) {
    await adminDb
      .doc(
        `${PLANPORT_CLIENT_ROOT}/${clientId}/projects/${projectId}/${PLANPORT_INSPIRATION_SUBCOLLECTION}/${docId}`
      )
      .set(data);
  }
}

export async function submitProjectInspiration(
  raw: SubmitProjectInspirationInput
): Promise<{
  success: boolean;
  message: string;
  id?: string;
  emailSent?: boolean;
  emailWarning?: string;
}> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((e) => e.message).join(" ");
    return { success: false, message: msg || "Invalid request." };
  }

  const body = parsed.data;
  let decoded;
  try {
    decoded = await verifyIdToken(body.idToken);
  } catch {
    return { success: false, message: "Your session expired. Refresh the page and try again." };
  }

  const adminDb = getPlanportAdminFirestore();
  const root = body.hubType === "client" ? PLANPORT_CLIENT_ROOT : PLANPORT_GC_ROOT;
  const projPath = `${root}/${body.hubId}/projects/${body.projectId}`;
  const projSnap = await adminDb.doc(projPath).get();
  if (!projSnap.exists) {
    return { success: false, message: "Project not found." };
  }

  const uploadedAt = new Date().toISOString();
  const firebaseMeta = decoded.firebase as { sign_in_provider?: string } | undefined;
  const anon = firebaseMeta?.sign_in_provider === "anonymous";
  const tokenEmail = decoded.email?.trim() || "";
  let uploadedByLabel = tokenEmail || (anon ? "Guest (access code)" : "Hub visitor");
  if (body.optionalContactName?.trim()) {
    uploadedByLabel = `${body.optionalContactName.trim()}${tokenEmail ? ` · ${tokenEmail}` : ""}`;
  }

  const baseDoc: Record<string, unknown> = {
    kind: body.submission.kind,
    uploadedAt,
    uploadedByUid: decoded.uid,
    uploadedByLabel,
    contactEmail:
      body.optionalContactEmail?.trim() || (tokenEmail || undefined) || null,
  };

  let attachments: FirmChatAttachment[] | undefined;
  if (body.submission.kind === "link") {
    baseDoc.url = body.submission.url;
    if (body.submission.title?.trim()) {
      baseDoc.title = body.submission.title.trim();
    }
  } else {
    const parsedUri = parseDataUri(body.submission.dataUri);
    if (!parsedUri) {
      return {
        success: false,
        message: "Could not read the file. Try again or use a smaller file.",
      };
    }
    if (!ALLOWED_MIME.has(parsedUri.mime)) {
      return {
        success: false,
        message: "Only PDF, JPG, and PNG files are allowed for inspiration uploads.",
      };
    }
    let buf: Buffer;
    try {
      buf = Buffer.from(parsedUri.base64, "base64");
    } catch {
      return { success: false, message: "Invalid file encoding." };
    }
    if (buf.length > MAX_FILE_BYTES) {
      return { success: false, message: "File is too large (max 12 MB)." };
    }
    baseDoc.fileName = body.submission.fileName;
    baseDoc.mimeType = parsedUri.mime;
    baseDoc.deliveredByEmail = true;
    attachments = [
      {
        filename: body.submission.fileName,
        contentBase64: parsedUri.base64,
      },
    ];
  }

  const colPath = `${projPath}/${PLANPORT_INSPIRATION_SUBCOLLECTION}`;
  const docRef = adminDb.collection(colPath).doc();
  const docId = docRef.id;
  const fullDoc = { id: docId, ...baseDoc };
  await docRef.set(fullDoc);
  await mirrorInspirationDoc(adminDb, {
    hubType: body.hubType,
    hubId: body.hubId,
    projectId: body.projectId,
    docId,
    data: fullDoc,
  });

  const isStaff = await isPlanportAdminDecoded(decoded);
  let emailSent = false;
  let emailWarning: string | undefined;

  if (!isStaff) {
    const to =
      body.designerEmail?.trim() ||
      process.env.LEAD_DESIGNER_EMAIL?.trim() ||
      "jeff@designersink.us";
    const projectLabel = body.projectName?.trim() || body.projectId;
    const hubPart = body.hubDisplayLabel?.trim()
      ? `<p><strong>Hub:</strong> ${escHtml(body.hubDisplayLabel.trim())}</p>`
      : "";
    const addrPart = body.projectAddress?.trim()
      ? `<p><strong>Address:</strong> ${escHtml(body.projectAddress.trim())}</p>`
      : "";
    const contactExtra =
      anon && body.optionalContactEmail?.trim()
        ? `<p><strong>Contact email (guest):</strong> ${escHtml(body.optionalContactEmail.trim())}</p>`
        : "";

    let safeLinkHref = "";
    if (body.submission.kind === "link") {
      try {
        safeLinkHref = new URL(body.submission.url).href.replace(/"/g, "%22");
      } catch {
        safeLinkHref = "";
      }
    }

    let detailHtml = "";
    if (body.submission.kind === "link") {
      detailHtml = `
        <p><strong>Type:</strong> Inspiration link</p>
        <p><strong>URL:</strong> <a href="${safeLinkHref}">${escHtml(body.submission.url)}</a></p>
        ${
          body.submission.title?.trim()
            ? `<p><strong>Title:</strong> ${escHtml(body.submission.title.trim())}</p>`
            : ""
        }
      `;
    } else {
      detailHtml = `
        <p><strong>Type:</strong> Inspiration file (${escHtml(body.submission.fileName)})</p>
        <p>The file is attached to this email.</p>
      `;
    }

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #eee; padding: 20px;">
        <h2 style="color: #2E4B66;">Firm Chat — New client inspiration</h2>
        <p>A client added inspiration in the project hub.</p>
        <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 16px;">
          <p><strong>Project:</strong> ${escHtml(projectLabel)}</p>
          ${addrPart}
          ${hubPart}
          <p><strong>From:</strong> ${escHtml(uploadedByLabel)}</p>
          ${contactExtra}
        </div>
        ${detailHtml}
      </div>
    `;

    const subj = `New inspiration · ${projectLabel}`;
    const res = await sendFirmChatNotification({
      to,
      subject: subj,
      html,
      attachments,
    });
    emailSent = res.success;
    if (!res.success) {
      emailWarning = res.message;
    }
  }

  return {
    success: true,
    message: "Your inspiration was saved.",
    id: docId,
    emailSent,
    emailWarning,
  };
}

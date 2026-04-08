/**
 * Contract templates and outbound signing workflow (PlanPort Firestore).
 */

export const CONTRACT_TEMPLATES_COLLECTION = "contractTemplates";
export const OUTBOUND_CONTRACTS_COLLECTION = "outboundContracts";
export const PROJECT_DOCUMENTS_SUBCOLLECTION = "documents";
/** Client-visible mirror of an outbound contract for the project hub (no email). */
export const PROJECT_SIGNING_REQUESTS_SUBCOLLECTION = "signingRequests";

export type ContractTemplateKind = "html" | "pdf_form";

export type ContractTemplateRecord = {
  id: string;
  title: string;
  description?: string;
  templateKind?: ContractTemplateKind;
  /** Public HTTPS or Dropbox URL to the source PDF (pdf_form templates). */
  pdfUrl?: string;
  /** Rich text / HTML with {{clientDisplayName}}, {{agreementDate}}, etc. (html templates). */
  bodyHtml?: string;
  /** JSON object: AcroForm field name → variable key (e.g. clientDisplayName). */
  acroFieldMap?: Record<string, string>;
  /** If set, installed from PlanPort defaults (e.g. commercial-design-service). */
  defaultSlug?: string;
  createdAt: string;
  updatedAt: string;
};

export type OutboundContractStatus =
  | "awaiting_client"
  | "client_signed"
  | "completed";

export type OutboundContractRecord = {
  id: string;
  templateId: string;
  templateTitle: string;
  /** Original template PDF URL (pdf_form); may be empty for html-only templates. */
  pdfUrl: string;
  templateKind?: ContractTemplateKind;
  /** Snapshot of HTML source at send time (placeholders intact) for executed PDF regeneration. */
  bodyHtmlSource?: string;
  /** Pre-filled draft shown to the client (Firebase Storage URL). */
  draftPdfUrl?: string;
  clientId: string;
  projectId: string;
  projectName: string;
  clientDisplayName: string;
  agreementDate: string;
  projectLocation: string;
  leadDesignerName: string;
  status: OutboundContractStatus;
  signToken: string;
  createdAt: string;
  sentAt?: string;
  recipientEmails?: string[];
  clientSignerName?: string;
  clientSignatureDataUrl?: string;
  clientSignedAt?: string;
  designerSignatureDataUrl?: string;
  designerSignedAt?: string;
  /** Firestore document id under project documents when completed. */
  projectDocumentId?: string;
  /** Final executed PDF in Storage (optional; project document uses same URL). */
  executedPdfUrl?: string;
};

/** Stored under individualClients/{clientId}/projects/{projectId}/signingRequests */
export type ProjectSigningRequestRecord = {
  id: string;
  outboundContractId: string;
  templateTitle: string;
  signToken: string;
  status: OutboundContractStatus;
  agreementDate: string;
  projectName: string;
  createdAt: string;
  clientSignedAt?: string;
  designerSignedAt?: string;
};

/** Stored under individualClients/{clientId}/projects/{projectId}/documents */
export type ProjectDocumentRecord = {
  id: string;
  name: string;
  kind: "signed_contract" | "link";
  /** For signed_contract: executed PDF with signatures burned in. */
  url: string;
  contractId?: string;
  agreementDate?: string;
  projectLocation?: string;
  clientDisplayName?: string;
  clientSignedAt?: string;
  designerSignedAt?: string;
  leadDesignerName?: string;
  uploadedAt: string;
};

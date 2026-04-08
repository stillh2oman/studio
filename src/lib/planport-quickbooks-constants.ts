/** PlanPort Firestore: QuickBooks integration + invoice ↔ project links (server-only writes via Admin SDK). */
export const QB_INTEGRATIONS_COLLECTION = "integrations";
export const QB_INTEGRATION_DOC_ID = "quickbooks";
export const QB_INVOICE_PROJECT_LINKS_COLLECTION = "qbInvoiceProjectLinks";

export type QbInvoiceLinkStatus =
  | "suggested"
  | "unmatched"
  | "approved"
  | "rejected";

export type QbInvoiceLinkMatchSource = "email_auto" | "manual";

export type QbDesignerLineMatch = "none" | "dillon" | "walthall" | "both";

export type QbInvoiceProjectLinkDoc = {
  realmId: string;
  qbInvoiceId: string;
  qbDocNumber?: string | null;
  qbTxnDate?: string | null;
  qbTotalAmt?: number | null;
  /** Open balance from QuickBooks (0 = paid). */
  qbBalance?: number | null;
  /** Product/Service line names contain "Dillon" and/or "Walthall" (case-insensitive). */
  qbDesignerLineMatch?: QbDesignerLineMatch | null;
  qbCustomerId?: string | null;
  customerDisplayName?: string | null;
  /** Normalized billing email from Invoice or Customer (lowercase trim). */
  billEmailNorm?: string | null;
  hubType: "client" | "gc";
  hubId: string;
  projectId: string;
  projectName: string;
  hubLabel: string;
  status: QbInvoiceLinkStatus;
  matchSource: QbInvoiceLinkMatchSource;
  /** When multiple PlanPort projects share the same email; admin should verify. */
  emailMatchAmbiguous?: boolean;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string | null;
  approvedByUid?: string | null;
  rejectedAt?: string | null;
  rejectedByUid?: string | null;
};

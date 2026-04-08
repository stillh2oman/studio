/** QuickBooks invoice Line[] → designer filters (Product/Service names). */

import type { QbDesignerLineMatch } from "@/lib/planport-quickbooks-constants";

export function itemNamesFromInvoiceLines(lineField: unknown): string[] {
  if (!Array.isArray(lineField)) return [];
  const names: string[] = [];
  for (const raw of lineField) {
    if (!raw || typeof raw !== "object") continue;
    const line = raw as Record<string, unknown>;
    const sales = line.SalesItemLineDetail as Record<string, unknown> | undefined;
    const itemRef = sales?.ItemRef as { name?: string } | undefined;
    if (itemRef?.name) names.push(String(itemRef.name));
    if (typeof line.Description === "string" && line.Description.trim()) {
      names.push(line.Description.trim());
    }
  }
  return names;
}

export function computeDesignerLineMatch(names: string[]): QbDesignerLineMatch {
  const blob = names.join(" ").toLowerCase();
  const hasDillon = blob.includes("dillon");
  const hasWalthall = blob.includes("walthall");
  if (hasDillon && hasWalthall) return "both";
  if (hasDillon) return "dillon";
  if (hasWalthall) return "walthall";
  return "none";
}

export function designerMatchFromInvoiceLines(lineField: unknown): QbDesignerLineMatch {
  return computeDesignerLineMatch(itemNamesFromInvoiceLines(lineField));
}

export function parseInvoiceBalance(inv: { Balance?: string | number | null }): number | null {
  if (inv.Balance == null) return null;
  const raw = inv.Balance;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

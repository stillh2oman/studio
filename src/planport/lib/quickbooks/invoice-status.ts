export type QbBillingBadgeKind = "paid" | "past_due" | "due_soon" | "current";

export function computeQbBillingStatus(
  balance: number,
  dueDateRaw: string | null | undefined
): { kind: QbBillingBadgeKind; label: string; daysOverdue: number } {
  if (balance === 0) {
    return { kind: "paid", label: "Paid", daysOverdue: 0 };
  }
  const due = dueDateRaw ? new Date(dueDateRaw) : null;
  if (!due || Number.isNaN(due.getTime())) {
    return { kind: "current", label: "Current", daysOverdue: 0 };
  }
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const daysOverdue = Math.floor(
    (startOfToday.getTime() - startOfDue.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysOverdue > 11) {
    return { kind: "past_due", label: `Past Due (${daysOverdue} days)`, daysOverdue };
  }
  if (daysOverdue > 0) {
    return { kind: "due_soon", label: "Due Soon", daysOverdue };
  }
  return { kind: "current", label: "Current", daysOverdue: 0 };
}

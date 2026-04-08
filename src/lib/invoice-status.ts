import { differenceInDays, parseISO } from 'date-fns';
import type { InvoiceStatus } from '@/lib/types';

export type InvoiceStatusEntry = {
  status: InvoiceStatus;
  sentDate?: string | null;
};

function parseBillingCalendarDate(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  try {
    if (dateStr.includes('T')) return parseISO(dateStr);
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
        return new Date(y, m - 1, d);
      }
    }
    return parseISO(dateStr);
  } catch {
    return null;
  }
}

/** Unpaid + Invoice Sent + 11+ full calendar days after Invoice Sent date → Past Due. Uses sentDate only, not work/entry date. */
export function getEffectiveInvoiceStatus(entry: InvoiceStatusEntry): InvoiceStatus {
  if (entry.status === 'Paid') return 'Paid';
  if (entry.status === 'Not Sent') return 'Not Sent';

  if (entry.status === 'Invoice Sent') {
    const sent = parseBillingCalendarDate(entry.sentDate ?? null);
    if (sent) {
      const daysSinceSent = differenceInDays(new Date(), sent);
      if (daysSinceSent >= 11) return 'Past Due';
    }
    return 'Invoice Sent';
  }

  return entry.status;
}

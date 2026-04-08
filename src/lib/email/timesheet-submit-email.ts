import { Resend } from 'resend';

const NOTIFY = ['jeff@designersink.us', 'tammidillon73@gmail.com'] as const;

function getResend() {
  const key =
    process.env.RESEND_API_KEY?.trim() ||
    're_iTftkq3s_KcGq6Dw9rZz9f6JY7vK2D11A';
  return new Resend(key);
}

export type TimesheetSubmitStats = {
  billable: number;
  nonBillable: number;
  holiday: number;
  pto: number;
  overtime: number;
};

export async function sendTimesheetSubmitEmails(params: {
  employeeName: string;
  periodStart: string;
  periodEnd: string;
  stats: TimesheetSubmitStats;
  submittedAt: string;
}): Promise<{ success: boolean; error?: string }> {
  const resend = getResend();
  const { employeeName, periodStart, periodEnd, stats, submittedAt } = params;
  const subject = `Timesheet Submission: ${employeeName} (${periodStart})`;
  const html = `
        <div style="font-family: sans-serif; color: #1F2A2E;">
          <h2 style="color: #8E2431;">Timesheet Submittal</h2>
          <p>The following timesheet has been finalized and submitted for payroll processing.</p>
          <div style="background: #f4f4f4; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Employee:</strong> ${escapeHtml(employeeName)}</p>
            <p><strong>Period:</strong> ${escapeHtml(periodStart)} to ${escapeHtml(periodEnd)}</p>
            <p><strong>Submitted at:</strong> ${escapeHtml(submittedAt)}</p>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 15px 0;" />
            <p><strong>Billable:</strong> ${stats.billable.toFixed(2)}h</p>
            <p><strong>Non-Billable:</strong> ${stats.nonBillable.toFixed(2)}h</p>
            <p><strong>Holiday:</strong> ${stats.holiday.toFixed(2)}h</p>
            <p><strong>PTO:</strong> ${stats.pto.toFixed(2)}h</p>
            <p style="color: #FAA172;"><strong>Overtime:</strong> ${stats.overtime.toFixed(2)}h</p>
          </div>
          <p style="font-size: 12px;">The PDF is stored in Ledger under Reports → Timesheet PDF archive.</p>
        </div>
      `;

  try {
    const { error } = await resend.emails.send({
      from: "Designer's Ink <onboarding@resend.dev>",
      to: [...NOTIFY],
      subject,
      html,
    });
    if (error) {
      console.error('[sendTimesheetSubmitEmails]', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Email send failed';
    console.error('[sendTimesheetSubmitEmails]', e);
    return { success: false, error: message };
  }
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

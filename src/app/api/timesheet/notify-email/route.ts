import { NextResponse } from 'next/server';
import {
  sendTimesheetSubmitEmails,
  type TimesheetSubmitStats,
} from '@/lib/email/timesheet-submit-email';

export const dynamic = 'force-dynamic';

type Body = {
  employeeName?: string;
  periodStart?: string;
  periodEnd?: string;
  submittedAt?: string;
  stats?: Partial<TimesheetSubmitStats>;
};

/** Payroll notification only (no Storage) — used when client uploads PDF or Admin Storage fails. */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const employeeName = String(body.employeeName || '').trim();
  const periodStart = String(body.periodStart || '').trim();
  const periodEnd = String(body.periodEnd || '').trim();
  const submittedAt = String(body.submittedAt || '').trim();
  if (!employeeName || !periodStart || !periodEnd || !submittedAt) {
    return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 });
  }

  const s = body.stats || {};
  const stats: TimesheetSubmitStats = {
    billable: Number(s.billable) || 0,
    nonBillable: Number(s.nonBillable) || 0,
    holiday: Number(s.holiday) || 0,
    pto: Number(s.pto) || 0,
    overtime: Number(s.overtime) || 0,
  };

  const result = await sendTimesheetSubmitEmails({
    employeeName,
    periodStart,
    periodEnd,
    submittedAt,
    stats,
  });

  return NextResponse.json(result);
}

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getAdminFirestore, getAdminStorageBucket } from '@/lib/firebase-admin';
import { sendTimesheetSubmitEmails, type TimesheetSubmitStats } from '@/lib/email/timesheet-submit-email';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Uploads submitted timesheet PDF with Firebase Admin (no browser Auth required),
 * writes pay_period_submissions + timesheet_report_archive, and emails Jeff + Tammi.
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const firmId = String(form.get('firmId') || '').trim();
  const employeeId = String(form.get('employeeId') || '').trim();
  const payPeriodId = String(form.get('payPeriodId') || '').trim();
  const employeeName = String(form.get('employeeName') || '').trim();
  const periodStart = String(form.get('periodStart') || '').trim();
  const periodEnd = String(form.get('periodEnd') || '').trim();
  const submittedAt = String(form.get('submittedAt') || '').trim();
  const statsRaw = String(form.get('stats') || '{}');

  if (!firmId || !employeeId || !payPeriodId || !employeeName || !periodStart || !periodEnd || !submittedAt) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const file = form.get('file');
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'Missing PDF file' }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length < 5 || buf.length > MAX_BYTES) {
    return NextResponse.json({ error: 'PDF size invalid' }, { status: 400 });
  }
  if (buf.subarray(0, 4).toString() !== '%PDF') {
    return NextResponse.json({ error: 'Not a PDF file' }, { status: 400 });
  }

  let stats: TimesheetSubmitStats = {
    billable: 0,
    nonBillable: 0,
    holiday: 0,
    pto: 0,
    overtime: 0,
  };
  try {
    const parsed = JSON.parse(statsRaw) as Partial<TimesheetSubmitStats>;
    stats = {
      billable: Number(parsed.billable) || 0,
      nonBillable: Number(parsed.nonBillable) || 0,
      holiday: Number(parsed.holiday) || 0,
      pto: Number(parsed.pto) || 0,
      overtime: Number(parsed.overtime) || 0,
    };
  } catch {
    // keep defaults
  }

  const archiveDocId = `${employeeId}_${payPeriodId}_${Date.now()}`;
  const storagePath = `timesheet_reports/${firmId}/${archiveDocId}.pdf`;
  const submissionDocId = `${employeeId}_${payPeriodId}`;

  let downloadUrl: string | undefined;
  let storageUploadError: string | undefined;
  try {
    const bucket = getAdminStorageBucket();
    const token = randomUUID();
    const dest = bucket.file(storagePath);
    await dest.save(buf, {
      resumable: false,
      metadata: {
        contentType: 'application/pdf',
        metadata: {
          firebaseStorageDownloadTokens: token,
        },
      },
    });
    const bucketName = bucket.name;
    const encoded = encodeURIComponent(storagePath);
    downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Storage upload failed';
    console.error('[submit-archive] storage', e);
    const impersonationHint =
      /impersonat|gaia id/i.test(message)
        ? ' Use a service account JSON for Admin, not user impersonation. The app will try to upload the PDF from the browser next.'
        : '';
    const permissionHint = /PERMISSION_DENIED|permission denied|insufficient permissions/i.test(message)
      ? ' In Google Cloud → IAM, grant the App Hosting / Cloud Run runtime service account Storage Object Admin on your Firebase bucket (and Firestore access for this API).'
      : ' Check GOOGLE_APPLICATION_CREDENTIALS / Storage rules for the default bucket.';
    storageUploadError = `Admin PDF upload failed: ${message}${impersonationHint}${permissionHint}`;
  }

  const createdAt = new Date().toISOString();

  try {
    const db = getAdminFirestore();
    const batch = db.batch();
    const subRef = db.doc(`employees/${firmId}/pay_period_submissions/${submissionDocId}`);
    batch.set(
      subRef,
      {
        id: submissionDocId,
        employeeId,
        payPeriodId,
        employeeName,
        submittedAt,
      },
      { merge: true },
    );

    const archRef = db.doc(`employees/${firmId}/timesheet_report_archive/${archiveDocId}`);
    batch.set(archRef, {
      id: archiveDocId,
      employeeId,
      payPeriodId,
      employeeName,
      periodStart,
      periodEnd,
      submittedAt,
      createdAt,
      storagePath,
      ...(downloadUrl ? { downloadUrl } : {}),
      ...(storageUploadError ? { uploadError: storageUploadError } : {}),
    });

    await batch.commit();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Firestore write failed';
    console.error('[submit-archive] firestore', e);
    const hint = /PERMISSION_DENIED|permission denied|insufficient permissions/i.test(message)
      ? ' Grant the App Hosting (or Cloud Run) default service account roles: Cloud Datastore User (or Firebase Admin) on this project.'
      : '';
    return NextResponse.json({ error: `${message}${hint ? ` ${hint}` : ''}`, success: false }, { status: 500 });
  }

  const emailResult = await sendTimesheetSubmitEmails({
    employeeName,
    periodStart,
    periodEnd,
    stats,
    submittedAt,
  });

  return NextResponse.json({
    success: true,
    downloadUrl,
    docId: archiveDocId,
    storagePath,
    uploadError: storageUploadError,
    emailSent: emailResult.success,
    emailError: emailResult.error,
  });
}

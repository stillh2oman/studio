/**
 * Browser fallback when Firebase Admin Storage fails (e.g. bad ADC / impersonation of a user email).
 */
import { getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, setDoc, updateDoc, deleteField, type Firestore } from 'firebase/firestore';

export type TimesheetArchiveMeta = {
  employeeId: string;
  payPeriodId: string;
  employeeName: string;
  periodStart: string;
  periodEnd: string;
  submittedAt: string;
  stats?: {
    billable: number;
    nonBillable: number;
    holiday: number;
    pto: number;
    overtime: number;
  };
};

export async function archiveTimesheetPdfFromBrowser(
  firestore: Firestore,
  dataRootId: string,
  pdfBlob: Blob,
  meta: TimesheetArchiveMeta,
): Promise<{ success: boolean; downloadUrl?: string; uploadError?: string }> {
  const app = getApp();
  const auth = getAuth(app);
  if (!auth.currentUser) {
    return {
      success: false,
      uploadError:
        'Browser upload needs Firebase sign-in: enable Anonymous in Firebase Console (Authentication → Sign-in method), then refresh and submit again — or fix server IAM so Admin can write Storage/Firestore (App Hosting service account → Storage Object Admin + Cloud Datastore User).',
    };
  }

  const docId = `${meta.employeeId}_${meta.payPeriodId}_${Date.now()}`;
  const storagePath = `timesheet_reports/${dataRootId}/${docId}.pdf`;
  let downloadUrl: string | undefined;

  try {
    const storage = getStorage(app);
    const sRef = ref(storage, storagePath);
    await uploadBytes(sRef, pdfBlob, { contentType: 'application/pdf' });
    downloadUrl = await getDownloadURL(sRef);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Storage upload failed';
    return { success: false, uploadError: msg };
  }

  const submissionDocId = `${meta.employeeId}_${meta.payPeriodId}`;

  try {
    await setDoc(
      doc(firestore, 'employees', dataRootId, 'pay_period_submissions', submissionDocId),
      {
        id: submissionDocId,
        employeeId: meta.employeeId,
        payPeriodId: meta.payPeriodId,
        employeeName: meta.employeeName,
        submittedAt: meta.submittedAt,
      },
      { merge: true },
    );

    await setDoc(doc(firestore, 'employees', dataRootId, 'timesheet_report_archive', docId), {
      id: docId,
      employeeId: meta.employeeId,
      payPeriodId: meta.payPeriodId,
      employeeName: meta.employeeName,
      periodStart: meta.periodStart,
      periodEnd: meta.periodEnd,
      submittedAt: meta.submittedAt,
      createdAt: new Date().toISOString(),
      storagePath,
      downloadUrl,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Firestore write failed';
    return { success: false, downloadUrl, uploadError: msg };
  }

  let uploadError: string | undefined;
  try {
    const emailRes = await fetch('/api/timesheet/notify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeName: meta.employeeName,
        periodStart: meta.periodStart,
        periodEnd: meta.periodEnd,
        submittedAt: meta.submittedAt,
        stats: meta.stats || {},
      }),
    });
    const emailJson = (await emailRes.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
    };
    if (!emailJson.success && emailJson.error) {
      uploadError = `PDF archived; email failed: ${emailJson.error}`;
    }
  } catch {
    uploadError = 'PDF archived; email notification request failed.';
  }

  return { success: true, downloadUrl, uploadError };
}

/** After server saved Firestore metadata but Admin Storage failed, upload PDF from the browser and patch the archive row. */
export async function patchTimesheetArchivePdfFromBrowser(
  firestore: Firestore,
  dataRootId: string,
  pdfBlob: Blob,
  archiveDocId: string,
  storagePath: string,
): Promise<{ downloadUrl?: string; error?: string }> {
  const app = getApp();
  const auth = getAuth(app);
  if (!auth.currentUser) {
    return {
      error:
        'No Firebase sign-in — enable Anonymous auth in Firebase Console, then log out and back in so timesheet PDFs can upload.',
    };
  }
  try {
    const storage = getStorage(app);
    const sRef = ref(storage, storagePath);
    await uploadBytes(sRef, pdfBlob, { contentType: 'application/pdf' });
    const downloadUrl = await getDownloadURL(sRef);
    await updateDoc(
      doc(firestore, 'employees', dataRootId, 'timesheet_report_archive', archiveDocId),
      {
        downloadUrl,
        uploadError: deleteField(),
      },
    );
    return { downloadUrl };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Browser PDF upload failed' };
  }
}

import { NextResponse } from "next/server";
import {
  tryParsePlanportSyncEnvelopeV2,
  buildLedgerUpsertPatchesFromEnvelopeV2,
} from "@/lib/handoff/planport-ledger/v2";
import { getAdminFirestore } from "@/lib/firebase-admin";
import type { Client, Project } from "@/lib/types";

/**
 * Optional server-side intake for PlanPort → Ledger sync (separate Firebase projects).
 *
 * - Without `LEDGER_SYNC_RECEIVE_SECRET`: rejects (401) unless explicitly opened in dev — actually reject if no secret in production.
 * - With secret + `LEDGER_SYNC_APPLY_ON_RECEIVE=1` + `LEDGER_SYNC_DATA_ROOT_ID`: applies merge (non-destructive) using the same rules as the import UI.
 *
 * Env:
 * - `LEDGER_SYNC_RECEIVE_SECRET` — shared secret; PlanPort server action sends `x-sync-secret`.
 * - `LEDGER_SYNC_DATA_ROOT_ID` — `employees/{id}` data root (boss id).
 * - `LEDGER_SYNC_APPLY_ON_RECEIVE` — set to `1` to write Firestore (requires Admin SDK env from `firebase-admin.ts`).
 */

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: Request) {
  const secret = process.env.LEDGER_SYNC_RECEIVE_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "LEDGER_SYNC_RECEIVE_SECRET is not configured on Ledger." },
      { status: 503 },
    );
  }
  if (req.headers.get("x-sync-secret") !== secret) {
    return unauthorized();
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = tryParsePlanportSyncEnvelopeV2(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const apply = process.env.LEDGER_SYNC_APPLY_ON_RECEIVE === "1";
  const dataRootId = process.env.LEDGER_SYNC_DATA_ROOT_ID?.trim();

  if (!apply || !dataRootId) {
    return NextResponse.json({
      ok: true,
      validated: true,
      applied: false,
      hint: "Set LEDGER_SYNC_APPLY_ON_RECEIVE=1 and LEDGER_SYNC_DATA_ROOT_ID to persist from this endpoint.",
    });
  }

  try {
    const db = getAdminFirestore();
    const clientsCol = db.collection("employees").doc(dataRootId).collection("clients");
    const projectsCol = db.collection("employees").doc(dataRootId).collection("projects");

    const clientSnap = await clientsCol.where("externalId", "==", parsed.data.client.externalId).limit(1).get();
    const existingClient: Client | null = clientSnap.empty
      ? null
      : ({ id: clientSnap.docs[0].id, ...(clientSnap.docs[0].data() as object) } as Client);

    const projectSnap = await projectsCol.where("externalId", "==", parsed.data.project.externalId).limit(1).get();
    const existingProject: Project | null = projectSnap.empty
      ? null
      : ({ id: projectSnap.docs[0].id, ...(projectSnap.docs[0].data() as object) } as Project);

    const report = buildLedgerUpsertPatchesFromEnvelopeV2(parsed.data, existingClient, existingProject);

    const batch = db.batch();
    let clientId = existingClient?.id;

    if (!clientId) {
      const ref = clientsCol.doc();
      clientId = ref.id;
      batch.set(ref, { ...stripUndefined(report.clientPatch), id: clientId }, { merge: true });
    } else {
      batch.set(clientsCol.doc(clientId), { ...stripUndefined(report.clientPatch), id: clientId }, { merge: true });
    }

    let projectId = existingProject?.id;
    const projectPatch = stripUndefined(report.projectPatch) as Record<string, unknown>;
    if (!projectId) {
      const pref = projectsCol.doc();
      projectId = pref.id;
      batch.set(
        pref,
        {
          ...projectPatch,
          id: projectId,
          clientId,
          nature: Array.isArray(projectPatch.nature) ? projectPatch.nature : [],
        },
        { merge: true },
      );
    } else {
      batch.set(
        projectsCol.doc(projectId),
        {
          ...projectPatch,
          id: projectId,
          clientId,
          nature: existingProject?.nature?.length ? existingProject.nature : [],
        },
        { merge: true },
      );
    }

    await batch.commit();

    return NextResponse.json({
      ok: true,
      validated: true,
      applied: true,
      clientId,
      projectId,
      clientConflicts: report.clientConflicts,
      projectConflicts: report.projectConflicts,
      warnings: report.warnings,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

function stripUndefined<T extends Record<string, unknown>>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

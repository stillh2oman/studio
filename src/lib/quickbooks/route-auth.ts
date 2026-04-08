import type { DecodedIdToken } from "firebase-admin/auth";
import { NextRequest, NextResponse } from "next/server";
import { assertPlanportAdmin, verifyIdToken } from "@/lib/firebase-admin-app";

/** Any valid Firebase ID token (used for hub-facing read-only endpoints). */
export async function requireFirebaseAuthBearer(
  req: NextRequest
): Promise<{ ok: true; decoded: DecodedIdToken } | { ok: false; res: NextResponse }> {
  const h = req.headers.get("authorization");
  const m = /^Bearer\s+(\S+)$/i.exec(h || "");
  if (!m?.[1]) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Missing Authorization Bearer token." }, { status: 401 }),
    };
  }
  try {
    const decoded = await verifyIdToken(m[1]);
    return { ok: true, decoded };
  } catch {
    return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
}

export async function requirePlanportAdminBearer(
  req: NextRequest
): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  const h = req.headers.get("authorization");
  const m = /^Bearer\s+(\S+)$/i.exec(h || "");
  if (!m?.[1]) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Missing Authorization Bearer token." }, { status: 401 }),
    };
  }
  try {
    await assertPlanportAdmin(m[1]);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Forbidden";
    const status = msg === "Unauthorized" ? 401 : 403;
    return { ok: false, res: NextResponse.json({ error: msg }, { status }) };
  }
}

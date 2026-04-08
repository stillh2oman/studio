import { NextRequest, NextResponse } from "next/server";
import { assertPlanportAdmin } from "@/lib/firebase-admin-app";
import { mirrorDropboxUrlToFirebaseStorage } from "@/lib/mirror-image-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const idToken = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;

  try {
    await assertPlanportAdmin(idToken);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (msg === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Any other error here is a server misconfiguration (e.g. Admin SDK env missing).
    return NextResponse.json(
      { error: msg || "Server misconfigured for image ingest" },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sourceUrl =
    typeof body === "object" &&
    body !== null &&
    typeof (body as { sourceUrl?: unknown }).sourceUrl === "string"
      ? (body as { sourceUrl: string }).sourceUrl.trim()
      : "";

  if (!sourceUrl) {
    return NextResponse.json({ error: "sourceUrl is required" }, { status: 400 });
  }

  try {
    const url = await mirrorDropboxUrlToFirebaseStorage(sourceUrl);
    return NextResponse.json({ url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Mirror failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

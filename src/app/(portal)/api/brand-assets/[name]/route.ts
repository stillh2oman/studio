import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

/**
 * Serves PlanPort branding PNGs through the Next server (not Hosting static only).
 * Firebase Hosting + Web Frameworks sometimes fails to expose /public files on the
 * Cloud Run origin behind planport.designersink.us while next dev works locally.
 */
const ALLOWED = new Set(["planport-logo.png", "designers-ink-banner.png"]);

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ name: string }> }
) {
  const { name } = await context.params;
  if (!name || !ALLOWED.has(name)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const filePath = path.join(process.cwd(), "public", "branding", name);
  try {
    const buf = await readFile(filePath);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

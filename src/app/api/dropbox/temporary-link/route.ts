import { NextResponse } from "next/server";
import { callDropboxApi } from "@/lib/dropbox-auth";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { path?: string };
    const path = String(body.path || "").trim();
    if (!path) {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }

    const result = await callDropboxApi("https://api.dropboxapi.com/2/files/get_temporary_link", { path });
    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.data?.error || result.data?.error_summary || "Dropbox error",
          raw: result.data,
        },
        { status: result.status },
      );
    }

    return NextResponse.json({ link: result.data.link });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}


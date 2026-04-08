import { NextResponse } from "next/server";
import { callDropboxApi } from "@/lib/dropbox-auth";

function sanitizeFilename(name: string) {
  return name.replace(/[^\w.\-() ]+/g, "_").trim() || "download";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const path = String(searchParams.get("path") || "").trim();
    const name = sanitizeFilename(String(searchParams.get("name") || ""));
    if (!path) {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }

    const linkResult = await callDropboxApi(
      "https://api.dropboxapi.com/2/files/get_temporary_link",
      { path },
    );
    if (!linkResult.ok) {
      return NextResponse.json(
        {
          error: linkResult.data?.error || linkResult.data?.error_summary || "Dropbox error",
          raw: linkResult.data,
        },
        { status: linkResult.status },
      );
    }

    const tempLink = String(linkResult.data?.link || "").trim();
    if (!tempLink) {
      return NextResponse.json({ error: "No temporary link returned" }, { status: 502 });
    }

    const fileResp = await fetch(tempLink);
    if (!fileResp.ok) {
      return NextResponse.json({ error: `Failed to fetch file (${fileResp.status})` }, { status: 502 });
    }

    const contentType = fileResp.headers.get("content-type") || "application/octet-stream";
    const fileName = name || path.split("/").pop() || "download";
    const headers = new Headers();
    headers.set("content-type", contentType);
    headers.set("content-disposition", `inline; filename="${sanitizeFilename(fileName)}"`);
    headers.set("cache-control", "no-store");

    return new NextResponse(fileResp.body, { status: 200, headers });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}


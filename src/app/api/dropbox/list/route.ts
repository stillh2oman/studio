import { NextResponse } from "next/server";
import { callDropboxApi } from "@/lib/dropbox-auth";

type ListRequest =
  | { path: string; recursive?: boolean; cursor?: never }
  | { cursor: string; path?: never; recursive?: never };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<ListRequest>;
    const cursor = (body as any).cursor ? String((body as any).cursor).trim() : "";
    const path = (body as any).path ? String((body as any).path).trim() : "";

    const isContinue = !!cursor;
    if (!isContinue && !path) {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }

    const recursive = (body as any).recursive !== false;

    const endpoint = isContinue
      ? "https://api.dropboxapi.com/2/files/list_folder/continue"
      : "https://api.dropboxapi.com/2/files/list_folder";

    const payload = isContinue
      ? { cursor }
      : {
          path,
          recursive,
          include_media_info: true,
          include_deleted: false,
        };

    const result = await callDropboxApi(endpoint, payload);
    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.data?.error || result.data?.error_summary || "Dropbox error",
          raw: result.data,
        },
        { status: result.status },
      );
    }

    // Note: This may return folders as well; caller can filter.
    return NextResponse.json(result.data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}


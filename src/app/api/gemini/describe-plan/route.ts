import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const MAX_BYTES = 12 * 1024 * 1024; // keep request size sane

function guessMime(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

async function embedWithFallback(ai: GoogleGenAI, text: string) {
  const models = ["gemini-embedding-001", "text-embedding-004"];
  for (const model of models) {
    try {
      const emb = await ai.models.embedContent({
        model,
        contents: text,
      } as any);
      const vector =
        (emb as any)?.embeddings?.[0]?.values ??
        (emb as any)?.embedding?.values ??
        (emb as any)?.embedding;
      if (Array.isArray(vector)) return vector;
    } catch {
      // Try next embedding model.
    }
  }
  return undefined;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing GEMINI_API_KEY" }, { status: 500 });
    }

    const body = (await req.json()) as {
      name?: string;
      downloadUrl?: string;
      projectName?: string;
    };

    const name = String(body.name || "").trim() || "file";
    const downloadUrl = String(body.downloadUrl || "").trim();
    if (!downloadUrl) {
      return NextResponse.json({ error: "Missing downloadUrl" }, { status: 400 });
    }

    const fileResp = await fetch(downloadUrl);
    if (!fileResp.ok) {
      return NextResponse.json(
        { error: `Failed to download file (${fileResp.status})` },
        { status: 502 },
      );
    }

    const buf = Buffer.from(await fileResp.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large to index (${Math.round(buf.byteLength / (1024 * 1024))}MB)` },
        { status: 413 },
      );
    }

    const mimeType = guessMime(name);
    const base64 = buf.toString("base64");

    const ai = new GoogleGenAI({ apiKey });

    const prompt = [
      "You are building an Architectural Memory Bank for a residential design firm.",
      "Given a blueprint (PDF) or rendering (image), produce a searchable description.",
      "Return STRICT JSON only (no markdown), with this exact shape:",
      '{ "description": string, "spaces": string[], "features": string[], "keywords": string[] }',
      "",
      body.projectName ? `Project: ${body.projectName}` : "",
      `Filename: ${name}`,
      "",
      "Guidelines:",
      "- description: 5-12 sentences, plain English, focusing on layout, adjacencies, and notable architectural moves.",
      "- spaces: list of rooms/spaces explicitly seen or strongly implied (e.g., \"great room\", \"mudroom\").",
      "- features: architectural features (e.g., \"vaulted ceiling\", \"center core\", \"open concept\").",
      "- keywords: short search terms, include synonyms (e.g., \"great room\", \"open plan\").",
      "- If unsure, leave arrays empty rather than guessing wildly.",
    ]
      .filter(Boolean)
      .join("\n");

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: base64 } },
          ],
        },
      ],
    });

    const text = String(result.text || "").trim();
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      return NextResponse.json({ error: "Gemini returned non-JSON", raw: text }, { status: 502 });
    }

    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as {
      description: string;
      spaces: string[];
      features: string[];
      keywords: string[];
    };

    // Optional embedding for local similarity search
    let embedding: number[] | undefined;
    try {
      const embedText = [
        parsed.description || "",
        ...(parsed.spaces || []),
        ...(parsed.features || []),
        ...(parsed.keywords || []),
      ]
        .filter(Boolean)
        .join("\n");

      embedding = await embedWithFallback(ai, embedText);
    } catch {
      // Embeddings are optional; proceed without them.
    }

    return NextResponse.json({ ...parsed, embedding });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}


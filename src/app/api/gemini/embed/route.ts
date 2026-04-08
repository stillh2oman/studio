import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

async function embedWithFallback(ai: GoogleGenAI, text: string) {
  const models = ["gemini-embedding-001", "text-embedding-004"];
  let lastError = "Unknown embedding error";

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

      if (Array.isArray(vector)) {
        return { vector, model };
      }
      lastError = `No vector returned by ${model}`;
    } catch (e: any) {
      lastError = e?.message || String(e);
    }
  }

  throw new Error(lastError);
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing GEMINI_API_KEY" }, { status: 500 });
    }

    const body = (await req.json()) as { text?: string };
    const text = String(body.text || "").trim();
    if (!text) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const { vector, model } = await embedWithFallback(ai, text);

    return NextResponse.json({ embedding: vector, model });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}


import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

type MeetingSummaryResponse = {
  title: string;
  summary: string;
  actionItems: string[];
  decisions: string[];
  risks: string[];
};

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GEMINI_API_KEY" },
        { status: 500 },
      );
    }

    const body = (await req.json()) as {
      transcript?: string;
      context?: { projectName?: string; attendees?: string; date?: string };
    };

    const transcript = (body.transcript || "").trim();
    if (!transcript) {
      return NextResponse.json({ error: "Missing transcript" }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Gemini models evolve; use modern defaults first.
    const candidateModels = ["gemini-2.5-flash", "gemini-2.0-flash"];

    const projectName = body.context?.projectName?.trim();
    const attendees = body.context?.attendees?.trim();
    const date = body.context?.date?.trim();

    const prompt = [
      "You are an assistant that summarizes meeting transcripts for a project management ledger.",
      "Return STRICT JSON only, no markdown, no code fences, no extra keys.",
      "JSON shape:",
      '{ "title": string, "summary": string, "actionItems": string[], "decisions": string[], "risks": string[] }',
      "",
      projectName ? `Project: ${projectName}` : "",
      attendees ? `Attendees: ${attendees}` : "",
      date ? `Date: ${date}` : "",
      "",
      "Guidelines:",
      "- actionItems must be concrete, phrased as verbs, include owner if stated.",
      "- keep summary <= 8 sentences.",
      "- if unknown, leave arrays empty rather than guessing.",
      "",
      "Transcript:",
      transcript,
    ]
      .filter(Boolean)
      .join("\n");

    let text: string | null = null;
    let lastErr: any = null;
    for (const modelId of candidateModels) {
      try {
        const result = await ai.models.generateContent({
          model: modelId,
          contents: prompt,
        });
        text = String(result.text || "").trim();
        break;
      } catch (e: any) {
        lastErr = e;
        // If the model isn't found, keep trying.
        const msg = String(e?.message || "");
        if (msg.includes("404") || msg.toLowerCase().includes("not found")) continue;
        throw e;
      }
    }

    if (!text) {
      return NextResponse.json(
        {
          error: "No compatible Gemini model found for this API key/project.",
          tried: candidateModels,
          rawError: String(lastErr?.message || lastErr || ""),
          hint:
            "Verify your API key is from Google AI Studio and that the Gemini API is enabled for that key/project.",
        },
        { status: 502 },
      );
    }

    // Best-effort JSON extraction (model can sometimes prepend text).
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      return NextResponse.json(
        { error: "Gemini returned non-JSON output", raw: text },
        { status: 502 },
      );
    }

    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as MeetingSummaryResponse;

    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500 },
    );
  }
}


import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import type { AiProjectStatusPayload } from '@/lib/ai-project-status-report';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing GEMINI_API_KEY on the server' }, { status: 500 });
    }

    const body = (await req.json()) as {
      projects?: AiProjectStatusPayload[];
      weekOf?: string;
    };

    const projects = Array.isArray(body.projects) ? body.projects : [];
    if (!projects.length) {
      return NextResponse.json({ error: 'No active projects to include' }, { status: 400 });
    }

    const jsonPayload = JSON.stringify(projects).slice(0, 100_000);
    const weekOf = String(body.weekOf || '').trim() || new Date().toISOString().slice(0, 10);

    const prompt = [
      'You are writing a weekly executive status report for a design / architecture firm.',
      'Audience: firm owner. Tone: professional, concise, actionable.',
      'Output ONLY GitHub-flavored Markdown (no JSON, no code fences wrapping the whole doc).',
      '',
      'Structure:',
      '- Start with one short executive summary paragraph (3–5 sentences) across all projects.',
      '- Then for EACH project, use:',
      '## [Project name]',
      '**Client:** …',
      '### Project status',
      'Summarize current workflow status, designer, location if useful, and last status touchpoint if provided.',
      '### Outstanding tasks',
      'Bullet list from the data; if none, say "None listed."',
      '### Billing & hours',
      'Mention total billed hours, approximate open / uninvoiced totals if meaningful, and number of billing entries.',
      '### Recent notes',
      'Synthesize recent project notes; if none, say "No recent notes in ledger."',
      '',
      'Rules:',
      '- Do not invent dollar amounts or tasks not implied by the data.',
      '- If data is thin, say so briefly.',
      '- Keep the full report under ~1200 words when possible.',
      '',
      `Week reference (report date context): ${weekOf}`,
      '',
      'DATA (JSON array of projects):',
      jsonPayload,
    ].join('\n');

    const ai = new GoogleGenAI({ apiKey });
    const candidateModels = ['gemini-2.5-flash', 'gemini-2.0-flash'];

    let text: string | null = null;
    let lastErr: unknown = null;
    for (const modelId of candidateModels) {
      try {
        const result = await ai.models.generateContent({
          model: modelId,
          contents: prompt,
        });
        text = String(result.text || '').trim();
        break;
      } catch (e: unknown) {
        lastErr = e;
        const msg = String((e as { message?: string })?.message || '');
        if (msg.includes('404') || msg.toLowerCase().includes('not found')) continue;
        throw e;
      }
    }

    if (!text) {
      return NextResponse.json(
        {
          error: 'No compatible Gemini model responded',
          rawError: String((lastErr as { message?: string })?.message || lastErr || ''),
        },
        { status: 502 },
      );
    }

    const generatedAt = new Date().toISOString();
    return NextResponse.json({ markdown: text, generatedAt });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { GOOGLE_CALENDAR_TIME_ZONE } from '@/lib/google-calendar-constants';

export const dynamic = 'force-dynamic';

export type CommandScheduleBlock = {
  taskId: string;
  title: string;
  startTime: string;
  endTime: string;
  notes: string;
  category: 'admin' | 'project_task';
};

type CommandScheduleResponse = {
  blocks: CommandScheduleBlock[];
  summary: string;
};

export async function GET() {
  return NextResponse.json({
    ok: true,
    geminiConfigured: !!process.env.GEMINI_API_KEY,
  });
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing GEMINI_API_KEY' }, { status: 500 });
    }

    const body = (await req.json()) as {
      planningAnchorDate?: string;
      horizonDays?: number;
      tasks?: Array<{
        id: string;
        name?: string;
        description?: string;
        priority?: string;
        deadline?: string;
        isHardDeadline?: boolean;
        estimatedHours?: number;
        category?: string;
        status?: string;
      }>;
      busySlots?: Array<{ startTime: string; endTime: string; title?: string }>;
    };

    const horizonDays = Math.min(14, Math.max(1, Number(body.horizonDays) || 7));
    const anchor =
      (body.planningAnchorDate || '').trim() || new Date().toISOString().slice(0, 10);
    const tasks = Array.isArray(body.tasks) ? body.tasks : [];
    const busySlots = Array.isArray(body.busySlots) ? body.busySlots : [];

    const ai = new GoogleGenAI({ apiKey });
    const candidateModels = ['gemini-2.5-flash', 'gemini-2.0-flash'];

    // Keep payload small to avoid upstream 502s/timeouts.
    const tasksSlim = tasks
      .slice(0, 60)
      .map((t) => ({
        id: String(t.id || '').trim(),
        name: String(t.name || '').slice(0, 120),
        priority: String(t.priority || ''),
        deadline: String(t.deadline || ''),
        isHardDeadline: !!t.isHardDeadline,
        estimatedHours: Number(t.estimatedHours || 0),
        status: String(t.status || ''),
      }));
    const busySlim = busySlots
      .slice(0, 120)
      .map((b) => ({
        startTime: String(b.startTime || ''),
        endTime: String(b.endTime || ''),
        title: String(b.title || '').slice(0, 120),
      }));

    const prompt = [
      'You are a scheduling assistant for a design-firm principal.',
      'Return STRICT JSON only — no markdown, no code fences, no text before or after the JSON.',
      'JSON shape:',
      '{ "blocks": Block[], "summary": string }',
      'Block shape:',
      '{ "taskId": string, "title": string, "startTime": string, "endTime": string, "notes": string, "category": "admin" | "project_task" }',
      '',
      'Rules (must follow):',
      `- Time zone for all startTime/endTime: ${GOOGLE_CALENDAR_TIME_ZONE}. Use ISO 8601 with numeric offset (e.g. 2026-03-31T13:30:00-05:00). Never use "Z" only — always include the correct offset for Central Time.`,
      '- Normal work window each day: from 13:30 (1:30 PM) until 04:30 the *next* calendar morning. That overnight block is one continuous shift.',
      '- From 13:30 until about 18:00 (6:00 PM) local, prefer **administrative** work: email, billing, planning, misc ops. Use category "admin" for those blocks.',
      '- After ~18:00 until end of shift (~04:30 next day), schedule **project_task** blocks from the task list.',
      '- Respect **busySlots** as hard exclusions — do not overlap them at all.',
      '- Sort project work by: (1) tasks with isHardDeadline true and nearest deadline first, (2) High priority, (3) deadline date, (4) Medium/Low.',
      '- Use each task\'s estimatedHours as a guide for block length; if missing, assume 1 hour. Split large work across multiple days if needed.',
      '- taskId must match an input task id exactly when the block is for that task. For pure admin with no task, use taskId "" and a clear title.',
      `- Plan from anchor date ${anchor} for ${horizonDays} calendar days of coverage (you may place blocks on the next morning after a late night).`,
      '- Keep blocks between 30 minutes and 4 hours each where possible.',
      '- summary: 2–4 sentences explaining the plan.',
      '',
      `Anchor date (YYYY-MM-DD): ${anchor}`,
      `Horizon days: ${horizonDays}`,
      '',
      'Busy slots (do not overlap):',
      JSON.stringify(busySlim),
      '',
      'Tasks:',
      JSON.stringify(tasksSlim),
    ].join('\n');

    let text: string | null = null;
    let lastErr: unknown = null;
    for (const modelId of candidateModels) {
      try {
        const result = await Promise.race([
          ai.models.generateContent({
            model: modelId,
            contents: prompt,
          }),
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error('Gemini request timed out')), 25000),
          ),
        ]);
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
          error: 'No compatible Gemini model found for this API key/project.',
          rawError: String((lastErr as { message?: string })?.message || lastErr || ''),
        },
        { status: 502 },
      );
    }

    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      return NextResponse.json({ error: 'Gemini returned non-JSON output', raw: text }, { status: 502 });
    }

    let parsed: CommandScheduleResponse;
    try {
      parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as CommandScheduleResponse;
    } catch {
      return NextResponse.json(
        { error: 'Gemini returned invalid JSON', raw: text.slice(0, 2000) },
        { status: 502 },
      );
    }
    const blocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
    const normalized: CommandScheduleBlock[] = blocks
      .map((b) => ({
        taskId: String(b.taskId || '').trim(),
        title: String(b.title || 'Block').trim() || 'Block',
        startTime: String(b.startTime || '').trim(),
        endTime: String(b.endTime || '').trim(),
        notes: String(b.notes || '').trim(),
        category: b.category === 'admin' ? 'admin' : 'project_task',
      }))
      .filter((b) => b.startTime && b.endTime);

    return NextResponse.json({
      blocks: normalized,
      summary: String(parsed.summary || '').trim() || 'Schedule generated.',
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

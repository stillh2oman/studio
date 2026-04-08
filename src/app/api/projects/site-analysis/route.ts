import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const PERPLEXITY_TIMEOUT_MS = 90_000;

/**
 * Research memo for a project site address (assessor, GIS, zoning, codes, utilities, flood, HOA).
 * Uses Perplexity Sonar with web search — verify all links and jurisdictional details with the AHJ.
 */
export async function POST(req: Request) {
  try {
    const apiKey = process.env.PERPLEXITY_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'PERPLEXITY_API_KEY is not configured on the server.' }, { status: 503 });
    }

    let body: { address?: string; projectName?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const address = String(body.address || '').trim();
    const projectName = String(body.projectName || '').trim();
    if (!address) {
      return NextResponse.json({ error: 'A site address is required.' }, { status: 400 });
    }

    const system = [
      'You are a research assistant for US architectural and land-development site due diligence.',
      'Use web search to find current official resources (prefer .gov, county, and utility domains).',
      'Do not invent parcel numbers, zone codes, or URLs. If unsure, say so and name the office to call.',
      'Underground utility locations are not available online; always recommend 811 / One Call before digging.',
      'Output Markdown only (headings, bullets, links). No JSON wrapper.',
    ].join('\n');

    const user = [
      `Produce an in-depth **site intelligence memo** for this address in the United States:`,
      '',
      `**Address:** ${address}`,
      projectName ? `**Project name (context):** ${projectName}` : '',
      '',
      'Cover the following with clear `##` section headings and bullet lists where helpful:',
      '',
      '1. **Jurisdiction summary** — City / county / any overlay districts likely to regulate this parcel.',
      '2. **Property & assessor** — Direct link(s) to the county or city assessor / real property / parcel search if you can identify them; describe typical data available (owner, APN, assessed value, legal description).',
      '3. **GIS & mapping** — County or regional GIS / parcel viewer links; ortho imagery; contour / topo sources if applicable.',
      '4. **Zoning & development standards** — Which body likely sets zoning; how to confirm the zone for this parcel; setbacks, height, lot coverage, parking — explain that exact numbers require confirming the zone and any overlays; link to zoning map or code portal if found.',
      '5. **Building codes** — Likely building department; adopted code family (e.g. IRC/IBC) and edition year **if** findable from official sources; note local amendments and that the Authority Having Jurisdiction (AHJ) is definitive.',
      '6. **Utilities** — Electric, gas, water, sewer providers for this area with account / new service or map portal links when available; explicitly state that precise underground routes need 811 and as-builts.',
      '7. **Flood & environmental** — FEMA NFHL / Flood Map Service Center usage; any known state/local floodplain or coastal layers; wetlands / critical area pointers if relevant to typical due diligence.',
      '8. **HOA & private restrictions** — How to discover (recorded declarations, title, seller); caveats for remodels and setbacks.',
      '9. **Architect-oriented site placement checklist** — Practical bullets: access, driveway, topography, drainage, solar orientation, trees, easements, fire access, ADU rules if commonly regulated locally, neighbor impacts.',
      '10. **Disclaimer** — Short note that this is research assistance only; codes and maps change; verify with the AHJ, surveyor, and title before design or construction.',
      '',
      'Use real `https://` links when you have them from search. If a link cannot be verified, omit it and name the agency instead.',
    ]
      .filter(Boolean)
      .join('\n');

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), PERPLEXITY_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch('https://api.perplexity.ai/v1/sonar', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar-pro',
          temperature: 0.2,
          max_tokens: 3500,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: ac.signal,
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      const message = err instanceof Error ? err.message : String(err);
      if (name === 'AbortError') {
        return NextResponse.json(
          {
            error: 'Perplexity request timed out. Try again; if this persists, the host may be blocking outbound calls to api.perplexity.ai.',
          },
          { status: 504 },
        );
      }
      return NextResponse.json(
        {
          error: 'Could not reach Perplexity from the server.',
          detail: message.slice(0, 300),
        },
        { status: 502 },
      );
    } finally {
      clearTimeout(t);
    }

    const raw = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        { error: `Perplexity request failed (${res.status}).`, detail: raw.slice(0, 500) },
        { status: 502 },
      );
    }

    let data: { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> };
    try {
      data = JSON.parse(raw) as typeof data;
    } catch {
      return NextResponse.json({ error: 'Invalid response from Perplexity.' }, { status: 502 });
    }

    const content = data?.choices?.[0]?.message?.content;
    const textOut =
      typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.map((c) => (typeof c?.text === 'string' ? c.text : '')).join('')
          : '';

    if (!textOut.trim()) {
      return NextResponse.json({ error: 'Empty analysis from model.' }, { status: 502 });
    }

    return NextResponse.json({ markdown: textOut.trim() });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[site-analysis]', e);
    return NextResponse.json(
      { error: 'Site analysis failed unexpectedly.', detail: message.slice(0, 400) },
      { status: 500 },
    );
  }
}

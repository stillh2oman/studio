import { NextRequest } from 'next/server';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export async function GET(req: NextRequest) {
  try {
    const rawUrl = req.nextUrl.searchParams.get('url') || '';
    if (!rawUrl) {
      return new Response('Missing url parameter', { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return new Response('Invalid url parameter', { status: 400 });
    }

    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return new Response('Unsupported protocol', { status: 400 });
    }

    const upstream = await fetch(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'user-agent': 'DesignersInk-LogoProxy/1.0',
        'accept': 'image/*,*/*;q=0.8',
      },
      cache: 'no-store',
    });

    if (!upstream.ok) {
      return new Response(`Upstream error: ${upstream.status}`, { status: 502 });
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return new Response('Upstream did not return an image', { status: 415 });
    }

    const body = await upstream.arrayBuffer();
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': contentType,
        'cache-control': 'public, max-age=600, stale-while-revalidate=86400',
      },
    });
  } catch {
    return new Response('Logo proxy failed', { status: 500 });
  }
}


import { NextResponse, type NextRequest } from 'next/server';

/* ==========================================================================
   Same-origin thumbnail proxy.

   Used only by the ambient-glow palette extraction, which needs to read the
   image's pixels from a canvas. i.ytimg.com does not send CORS headers, so a
   canvas built from it directly is tainted and getImageData throws.

   This is not an image optimiser — the bytes pass through untouched — so it
   costs no transformation quota. Display thumbnails go straight to Google's
   CDN and never come through here.
   ========================================================================== */

const ALLOWED_SIZES = new Set(['default', 'mqdefault', 'hqdefault', 'sddefault', 'maxresdefault']);

export const revalidate = 86400;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const id = params.get('v')?.trim();
  const size = params.get('size')?.trim() || 'mqdefault';

  // Strict allow-list on both inputs: this endpoint must only ever be able to
  // reach i.ytimg.com, never an arbitrary URL supplied by a caller.
  if (!id || !/^[\w-]{6,20}$/.test(id) || !ALLOWED_SIZES.has(size)) {
    return new NextResponse('Bad request', { status: 400 });
  }

  try {
    const upstream = await fetch(`https://i.ytimg.com/vi/${id}/${size}.jpg`, {
      next: { revalidate: 86400 },
    });

    if (!upstream.ok) return new NextResponse('Not found', { status: 404 });

    return new NextResponse(upstream.body, {
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable',
        // The whole point: make the pixels readable from a canvas.
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return new NextResponse('Upstream failed', { status: 502 });
  }
}

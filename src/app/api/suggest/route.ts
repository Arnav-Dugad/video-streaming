import { NextResponse, type NextRequest } from 'next/server';

/* ==========================================================================
   Query autocomplete.

   YouTube's own suggestion endpoint is not part of the documented Data API,
   but it is public, unauthenticated and costs no quota — which is why every
   search box on the web uses it. It is proxied here rather than called from
   the browser because it does not send CORS headers.

   It is treated as strictly best-effort: any failure returns an empty list and
   the palette falls back to live video results, so the UI never depends on it.
   ========================================================================== */

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length > 100) return NextResponse.json({ suggestions: [] });

  const url =
    'https://suggestqueries.google.com/complete/search' +
    `?client=firefox&ds=yt&hl=en&q=${encodeURIComponent(q)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 3600 },
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    clearTimeout(timeout);

    if (!res.ok) return NextResponse.json({ suggestions: [] });

    // Response shape is [query, [suggestion, ...]].
    const data = (await res.json()) as [string, string[]];
    const suggestions = Array.isArray(data?.[1]) ? data[1].slice(0, 8) : [];

    return NextResponse.json(
      { suggestions },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
    );
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}

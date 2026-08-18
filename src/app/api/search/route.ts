import { NextResponse, type NextRequest } from 'next/server';
import { searchVideos, type SearchOptions } from '@/lib/youtube';

/** Client-side search (command palette, infinite scroll). Server-side pages
 *  call `searchVideos` directly and never hit this. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = params.get('q')?.trim();

  if (!q) return NextResponse.json({ items: [] });
  if (q.length > 120) {
    return NextResponse.json({ error: 'Query too long' }, { status: 400 });
  }

  const maxResults = Math.min(Math.max(Number(params.get('limit') ?? 12), 1), 50);

  const opts: SearchOptions = {
    q,
    maxResults,
    pageToken: params.get('pageToken') ?? undefined,
    order: (params.get('order') as SearchOptions['order']) ?? 'relevance',
    videoDuration: (params.get('duration') as SearchOptions['videoDuration']) ?? 'any',
    publishedAfter: params.get('after') ?? undefined,
    channelId: params.get('channelId') ?? undefined,
    videoDefinition: (params.get('definition') as SearchOptions['videoDefinition']) ?? undefined,
    videoCaption: (params.get('caption') as SearchOptions['videoCaption']) ?? undefined,
    regionCode: params.get('region') ?? undefined,
    relevanceLanguage: params.get('lang') ?? undefined,
    safeSearch: (params.get('safe') as SearchOptions['safeSearch']) ?? undefined,
  };

  try {
    const page = await searchVideos(opts);
    return NextResponse.json(page, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' },
    });
  } catch (err) {
    console.error('[api/search]', err);
    return NextResponse.json({ items: [], error: 'Search is unavailable right now.' }, { status: 502 });
  }
}

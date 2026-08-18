import { NextResponse, type NextRequest } from 'next/server';
import { getVideosByIds } from '@/lib/youtube';

/** Hydrates a list of ids into full video records. Used by client surfaces
 *  that only store ids (playlists, rooms, watch-later). */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('ids') ?? '';
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);

  if (ids.length === 0) return NextResponse.json({ items: [] });

  try {
    const items = await getVideosByIds(ids);
    return NextResponse.json(
      { items },
      { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' } },
    );
  } catch (err) {
    console.error('[api/videos]', err);
    return NextResponse.json({ items: [] }, { status: 502 });
  }
}

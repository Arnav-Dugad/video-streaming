import { NextResponse, type NextRequest } from 'next/server';
import { authedFetch, NotConnectedError } from '@/lib/youtube-oauth';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The viewer's real YouTube subscriptions. Distinct from PRISM's own
 *  follow list, which is Firestore-backed and needs no Google account. */
export async function GET(request: NextRequest) {
  const pageToken = request.nextUrl.searchParams.get('pageToken') ?? undefined;

  try {
    const data = await authedFetch<{ items?: any[]; nextPageToken?: string }>('subscriptions', {
      part: 'snippet',
      mine: 'true',
      maxResults: 50,
      order: 'alphabetical',
      pageToken,
    });

    const items = (data.items ?? []).map((item) => ({
      channelId: item.snippet?.resourceId?.channelId ?? '',
      channelTitle: item.snippet?.title ?? '',
      avatar: item.snippet?.thumbnails?.default?.url ?? '',
      description: item.snippet?.description ?? '',
    })).filter((c) => c.channelId);

    return NextResponse.json({ items, nextPageToken: data.nextPageToken });
  } catch (err) {
    if (err instanceof NotConnectedError) {
      return NextResponse.json({ error: 'not_connected', items: [] }, { status: 401 });
    }
    console.error('[youtube-oauth] subscriptions', (err as Error).message);
    return NextResponse.json({ error: 'failed', items: [] }, { status: 502 });
  }
}

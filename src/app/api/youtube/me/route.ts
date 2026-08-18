import { NextResponse } from 'next/server';
import { authedFetch, isConnected, isOAuthConfigured, NotConnectedError } from '@/lib/youtube-oauth';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Connection status plus the connected channel, so the UI can name the
 *  account rather than saying an anonymous "connected". */
export async function GET() {
  if (!isOAuthConfigured()) {
    return NextResponse.json({ configured: false, connected: false });
  }
  if (!(await isConnected())) {
    return NextResponse.json({ configured: true, connected: false });
  }

  try {
    const data = await authedFetch<{ items?: any[] }>('channels', {
      part: 'snippet,statistics',
      mine: 'true',
    });

    const channel = data.items?.[0];
    return NextResponse.json({
      configured: true,
      connected: true,
      channel: channel
        ? {
            id: channel.id,
            title: channel.snippet?.title ?? '',
            avatar: channel.snippet?.thumbnails?.default?.url ?? '',
            subscriberCount: Number(channel.statistics?.subscriberCount ?? 0),
          }
        : null,
    });
  } catch (err) {
    if (err instanceof NotConnectedError) {
      return NextResponse.json({ configured: true, connected: false });
    }
    console.error('[youtube-oauth] me', (err as Error).message);
    return NextResponse.json({ configured: true, connected: true, channel: null });
  }
}

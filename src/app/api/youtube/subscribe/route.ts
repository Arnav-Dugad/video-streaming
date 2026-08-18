import { NextResponse, type NextRequest } from 'next/server';
import { authedFetch, NotConnectedError } from '@/lib/youtube-oauth';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Subscribe to, or unsubscribe from, a channel on the connected account. */
export async function POST(request: NextRequest) {
  let body: { channelId?: string; subscribe?: boolean };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }

  const { channelId, subscribe } = body;
  if (!channelId || !/^UC[\w-]{20,24}$/.test(channelId)) {
    return NextResponse.json({ error: 'bad_channel' }, { status: 400 });
  }

  try {
    if (subscribe) {
      await authedFetch('subscriptions', { part: 'snippet' }, {
        method: 'POST',
        body: { snippet: { resourceId: { kind: 'youtube#channel', channelId } } },
      });
      return NextResponse.json({ subscribed: true });
    }

    // Unsubscribing needs the *subscription* id, not the channel id, so the
    // existing subscription has to be looked up first.
    const existing = await authedFetch<{ items?: any[] }>('subscriptions', {
      part: 'id',
      mine: 'true',
      forChannelId: channelId,
      maxResults: 1,
    });

    const subscriptionId = existing.items?.[0]?.id;
    if (!subscriptionId) return NextResponse.json({ subscribed: false });

    await authedFetch('subscriptions', { id: subscriptionId }, { method: 'DELETE' });
    return NextResponse.json({ subscribed: false });
  } catch (err) {
    if (err instanceof NotConnectedError) {
      return NextResponse.json({ error: 'not_connected' }, { status: 401 });
    }
    const message = (err as Error).message;
    console.error('[youtube-oauth] subscribe', message);
    // A duplicate subscription is not a failure from the viewer's side.
    if (/subscriptionDuplicate/i.test(message)) return NextResponse.json({ subscribed: true });
    return NextResponse.json({ error: 'failed' }, { status: 502 });
  }
}

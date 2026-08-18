import { NextResponse, type NextRequest } from 'next/server';
import { authedFetch, NotConnectedError } from '@/lib/youtube-oauth';

/* eslint-disable @typescript-eslint/no-explicit-any */

const MAX_LENGTH = 2000;

/** Posts a top-level comment as the connected account. */
export async function POST(request: NextRequest) {
  let body: { videoId?: string; text?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }

  const videoId = body.videoId?.trim();
  const text = body.text?.trim();

  if (!videoId || !/^[\w-]{6,20}$/.test(videoId)) {
    return NextResponse.json({ error: 'bad_video' }, { status: 400 });
  }
  if (!text) return NextResponse.json({ error: 'empty' }, { status: 400 });
  if (text.length > MAX_LENGTH) return NextResponse.json({ error: 'too_long' }, { status: 400 });

  try {
    const created = await authedFetch<any>('commentThreads', { part: 'snippet' }, {
      method: 'POST',
      body: { snippet: { videoId, topLevelComment: { snippet: { textOriginal: text } } } },
    });

    const snippet = created?.snippet?.topLevelComment?.snippet ?? {};
    return NextResponse.json({
      comment: {
        id: created?.id ?? crypto.randomUUID(),
        author: snippet.authorDisplayName ?? 'You',
        authorAvatar: snippet.authorProfileImageUrl ?? '',
        text: snippet.textOriginal ?? text,
        likeCount: 0,
        publishedAt: snippet.publishedAt ?? new Date().toISOString(),
        replyCount: 0,
      },
    });
  } catch (err) {
    if (err instanceof NotConnectedError) {
      return NextResponse.json({ error: 'not_connected' }, { status: 401 });
    }
    const message = (err as Error).message;
    console.error('[youtube-oauth] comment', message);
    // Comments being disabled is the single most common failure here, and it
    // is the viewer's business rather than a server fault.
    if (/commentsDisabled|forbidden/i.test(message)) {
      return NextResponse.json({ error: 'comments_disabled' }, { status: 403 });
    }
    return NextResponse.json({ error: 'failed' }, { status: 502 });
  }
}

import { NextResponse, type NextRequest } from 'next/server';

import { getChannelUploads, searchVideos } from '@/lib/youtube';
import type { SmartRule, Video } from '@/lib/types';

/* ==========================================================================
   Resolves a smart playlist's rule into videos.

   Channel-scoped rules walk each channel's uploads playlist, which costs one
   quota unit per channel. The equivalent search would cost 100 per channel, so
   the shape of this endpoint is what makes smart playlists affordable to
   refresh on every visit rather than on a schedule.

   `excludeWatched` is deliberately *not* handled here — it needs the viewer's
   history, which lives in Firestore under their own uid and has no business
   being read by a shared, cacheable route. The client filters it.
   ========================================================================== */

const MAX_CHANNELS = 10;
const MAX_LIMIT = 60;

function isValidRule(rule: unknown): rule is SmartRule {
  if (!rule || typeof rule !== 'object') return false;
  const r = rule as Partial<SmartRule>;
  if (!Array.isArray(r.channelIds)) return false;
  if (r.channelIds.length > MAX_CHANNELS) return false;
  if (r.channelIds.some((id) => typeof id !== 'string' || !/^UC[\w-]{20,24}$/.test(id))) return false;
  if (r.query !== undefined && (typeof r.query !== 'string' || r.query.length > 120)) return false;
  return true;
}

export async function POST(request: NextRequest) {
  let rule: unknown;
  try { rule = (await request.json())?.rule; }
  catch { return NextResponse.json({ error: 'bad_request', items: [] }, { status: 400 }); }

  if (!isValidRule(rule)) {
    return NextResponse.json({ error: 'bad_rule', items: [] }, { status: 400 });
  }

  const limit = Math.min(Math.max(rule.limit ?? 40, 1), MAX_LIMIT);

  try {
    let pool: Video[] = [];

    if (rule.channelIds.length > 0) {
      // Over-fetch per channel: the duration and recency filters below can
      // reject most of a channel's recent uploads, and returning four videos
      // because the filters were strict looks broken rather than selective.
      const perChannel = Math.max(12, Math.ceil((limit * 2) / rule.channelIds.length));
      const pages = await Promise.all(
        rule.channelIds.map((id) =>
          getChannelUploads(id, undefined, Math.min(perChannel, 50))
            .then((p) => p.items)
            .catch(() => [] as Video[]),
        ),
      );
      pool = pages.flat();

      // A query alongside channels narrows within them rather than searching
      // the whole catalogue — that is what people mean by combining the two.
      if (rule.query?.trim()) {
        const terms = rule.query.toLowerCase().split(/\s+/).filter(Boolean);
        pool = pool.filter((v) => {
          const hay = `${v.title} ${v.description} ${(v.tags ?? []).join(' ')}`.toLowerCase();
          return terms.every((t) => hay.includes(t));
        });
      }
    } else if (rule.query?.trim()) {
      const page = await searchVideos({
        q: rule.query,
        maxResults: Math.min(limit * 2, 50),
        order: rule.order === 'relevance' ? 'relevance' : rule.order,
      });
      pool = page.items;
    } else {
      return NextResponse.json({ items: [] });
    }

    const cutoff = rule.publishedWithinDays
      ? Date.now() - rule.publishedWithinDays * 86_400_000
      : null;

    const filtered = pool.filter((v) => {
      const seconds = v.durationSeconds ?? 0;
      if (rule.minSeconds && seconds < rule.minSeconds) return false;
      if (rule.maxSeconds && seconds > rule.maxSeconds) return false;
      if (cutoff && new Date(v.publishedAt).getTime() < cutoff) return false;
      return true;
    });

    // Channels are fetched in parallel, so the merged pool is grouped by
    // channel until it is sorted — without this a five-channel rule reads as
    // five blocks rather than one list.
    const sorted = [...filtered].sort((a, b) =>
      rule.order === 'viewCount'
        ? (b.viewCount ?? 0) - (a.viewCount ?? 0)
        : new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );

    const seen = new Set<string>();
    const items = sorted.filter((v) => (seen.has(v.id) ? false : (seen.add(v.id), true))).slice(0, limit);

    return NextResponse.json(
      { items },
      { headers: { 'Cache-Control': 'private, max-age=300' } },
    );
  } catch (err) {
    console.error('[api/smart]', (err as Error).message);
    return NextResponse.json({ error: 'failed', items: [] }, { status: 502 });
  }
}

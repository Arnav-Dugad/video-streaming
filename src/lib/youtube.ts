import 'server-only';

import type { Channel, Comment, Paged, Video } from './types';
import { parseISODuration } from './format';
import { DEMO_CATALOGUE, demoChannels, demoComments } from './demo-catalogue';

/* ==========================================================================
   YouTube Data API v3 client.

   Runs server-side only so the key is never shipped to the browser. Two
   details worth knowing:

   1. Quota. The default project allowance is 10,000 units/day. `search.list`
      costs 100 units a call; `videos.list` costs 1. So the client is built to
      prefer videos.list wherever possible and to cache aggressively.
   2. `search.list?relatedToVideoId` was removed by Google in August 2023.
      There is no replacement endpoint. Related videos here are *derived* —
      see `getRelated` — from the source video's tags and title, which is what
      the remaining public surface allows.
   ========================================================================== */

const BASE = 'https://www.googleapis.com/youtube/v3';

/** Supports a comma-separated list so a deployment can rotate across several
 *  projects and multiply its daily quota. */
function keys(): string[] {
  const raw = process.env.YOUTUBE_API_KEY ?? '';
  return raw.split(',').map((k) => k.trim()).filter(Boolean);
}

export function hasLiveApi(): boolean {
  return keys().length > 0;
}

class QuotaError extends Error {}

interface FetchOpts {
  /** Seconds. Search is volatile; a video's metadata is not. */
  revalidate?: number;
}

let keyCursor = 0;

async function ytFetch<T>(
  endpoint: string,
  params: Record<string, string | number | undefined>,
  opts: FetchOpts = {},
): Promise<T> {
  const available = keys();
  if (available.length === 0) throw new QuotaError('No YOUTUBE_API_KEY configured');

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }

  let lastError: Error | null = null;

  // Try every key once, starting where the last successful call left off, so a
  // key that has blown its quota doesn't poison every subsequent request.
  for (let attempt = 0; attempt < available.length; attempt++) {
    const key = available[(keyCursor + attempt) % available.length];
    qs.set('key', key);

    let res: Response;
    try {
      res = await fetch(`${BASE}/${endpoint}?${qs}`, {
        next: { revalidate: opts.revalidate ?? 900 },
      });
    } catch (err) {
      lastError = err as Error;
      continue;
    }

    if (res.ok) {
      keyCursor = (keyCursor + attempt) % available.length;
      return (await res.json()) as T;
    }

    const body = await res.text();
    // 403 quotaExceeded / dailyLimitExceeded -> try the next key.
    if (res.status === 403 && /quota|dailyLimit|rateLimit/i.test(body)) {
      lastError = new QuotaError(`Quota exhausted on key #${attempt + 1}`);
      continue;
    }
    throw new Error(`YouTube ${endpoint} ${res.status}: ${body.slice(0, 300)}`);
  }

  throw lastError ?? new QuotaError('All API keys exhausted');
}

/* ------------------------------- mapping -------------------------------- */

/* eslint-disable @typescript-eslint/no-explicit-any */

function pickThumb(t: any, ...preferred: string[]): string {
  for (const size of preferred) if (t?.[size]?.url) return t[size].url;
  for (const size of ['maxres', 'standard', 'high', 'medium', 'default']) {
    if (t?.[size]?.url) return t[size].url;
  }
  return '';
}

function mapVideo(item: any): Video {
  const id: string = typeof item.id === 'string' ? item.id : item.id?.videoId ?? '';
  const sn = item.snippet ?? {};
  const st = item.statistics ?? {};
  const cd = item.contentDetails ?? {};
  const duration: string | undefined = cd.duration;

  return {
    id,
    title: decodeEntities(sn.title ?? ''),
    description: sn.description ?? '',
    channelId: sn.channelId ?? '',
    channelTitle: decodeEntities(sn.channelTitle ?? ''),
    publishedAt: sn.publishedAt ?? new Date().toISOString(),
    thumbnail: pickThumb(sn.thumbnails, 'medium', 'high'),
    thumbnailHq: pickThumb(sn.thumbnails, 'maxres', 'standard', 'high'),
    duration,
    durationSeconds: duration ? parseISODuration(duration) : undefined,
    viewCount: st.viewCount !== undefined ? Number(st.viewCount) : undefined,
    likeCount: st.likeCount !== undefined ? Number(st.likeCount) : undefined,
    commentCount: st.commentCount !== undefined ? Number(st.commentCount) : undefined,
    tags: sn.tags,
    categoryId: sn.categoryId,
    live: sn.liveBroadcastContent === 'live',
  };
}

function mapChannel(item: any): Channel {
  const sn = item.snippet ?? {};
  const st = item.statistics ?? {};
  return {
    id: item.id,
    title: decodeEntities(sn.title ?? ''),
    description: sn.description ?? '',
    avatar: pickThumb(sn.thumbnails, 'high', 'medium'),
    banner: item.brandingSettings?.image?.bannerExternalUrl,
    subscriberCount: st.hiddenSubscriberCount ? undefined : Number(st.subscriberCount ?? 0),
    videoCount: Number(st.videoCount ?? 0),
    viewCount: Number(st.viewCount ?? 0),
    customUrl: sn.customUrl,
    publishedAt: sn.publishedAt,
  };
}

function mapComment(item: any): Comment {
  const top = item.snippet?.topLevelComment?.snippet ?? {};
  return {
    id: item.id,
    author: decodeEntities(top.authorDisplayName ?? ''),
    authorAvatar: top.authorProfileImageUrl ?? '',
    authorChannelId: top.authorChannelId?.value,
    text: stripHtml(top.textDisplay ?? top.textOriginal ?? ''),
    likeCount: Number(top.likeCount ?? 0),
    publishedAt: top.publishedAt ?? '',
    replyCount: Number(item.snippet?.totalReplyCount ?? 0),
  };
}

/** The API double-encodes entities in titles ("Rock &amp;amp; Roll"). */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(s: string): string {
  return decodeEntities(s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''));
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/* ------------------------------ public API ------------------------------ */

/** Wraps a live call so a missing key or a blown quota degrades to the seeded
 *  catalogue instead of a 500. The UI shows a banner when this kicks in. */
async function withFallback<T>(live: () => Promise<T>, demo: () => T): Promise<T> {
  if (!hasLiveApi()) return demo();
  try {
    return await live();
  } catch (err) {
    if (err instanceof QuotaError) return demo();
    console.error('[youtube]', (err as Error).message);
    return demo();
  }
}

export interface SearchOptions {
  q: string;
  pageToken?: string;
  maxResults?: number;
  order?: 'relevance' | 'date' | 'viewCount' | 'rating' | 'title';
  /** 'any' | 'short' (<4m) | 'medium' (4–20m) | 'long' (>20m) */
  videoDuration?: 'any' | 'short' | 'medium' | 'long';
  publishedAfter?: string;
  channelId?: string;
  type?: 'video' | 'channel' | 'playlist';
}

export async function searchVideos(opts: SearchOptions): Promise<Paged<Video>> {
  return withFallback(
    async () => {
      const page = await ytFetch<{ items: unknown[]; nextPageToken?: string; pageInfo?: { totalResults: number } }>(
        'search',
        {
          part: 'snippet',
          q: opts.q,
          type: opts.type ?? 'video',
          maxResults: opts.maxResults ?? 24,
          pageToken: opts.pageToken,
          order: opts.order ?? 'relevance',
          videoDuration: opts.videoDuration && opts.videoDuration !== 'any' ? opts.videoDuration : undefined,
          publishedAfter: opts.publishedAfter,
          channelId: opts.channelId,
          videoEmbeddable: opts.type === 'video' || !opts.type ? 'true' : undefined,
          safeSearch: 'moderate',
        },
        { revalidate: 600 },
      );

      const shallow = (page.items ?? []).map(mapVideo).filter((v) => v.id);
      // search.list omits duration and stats; one cheap videos.list backfills them.
      const hydrated = await hydrate(shallow);
      return { items: hydrated, nextPageToken: page.nextPageToken, totalResults: page.pageInfo?.totalResults };
    },
    () => ({ items: demoSearch(opts.q, opts.maxResults ?? 24) }),
  );
}

/** search.list returns snippets only. Backfill duration + statistics with a
 *  single 1-unit videos.list rather than N calls. */
async function hydrate(videos: Video[]): Promise<Video[]> {
  const ids = videos.map((v) => v.id).filter(Boolean);
  if (ids.length === 0) return videos;
  try {
    const detail = await getVideosByIds(ids);
    const byId = new Map(detail.map((v) => [v.id, v]));
    return videos.map((v) => {
      const d = byId.get(v.id);
      return d ? { ...v, ...d, thumbnailHq: d.thumbnailHq || v.thumbnailHq } : v;
    });
  } catch {
    return videos;
  }
}

export async function getVideosByIds(ids: string[]): Promise<Video[]> {
  if (ids.length === 0) return [];
  return withFallback(
    async () => {
      // videos.list caps at 50 ids per request.
      const batches: string[][] = [];
      for (let i = 0; i < ids.length; i += 50) batches.push(ids.slice(i, i + 50));

      const pages = await Promise.all(
        batches.map((batch) =>
          ytFetch<{ items: unknown[] }>(
            'videos',
            { part: 'snippet,contentDetails,statistics', id: batch.join(',') },
            { revalidate: 1800 },
          ),
        ),
      );

      const mapped = pages.flatMap((p) => (p.items ?? []).map(mapVideo));
      // Preserve caller ordering — the API returns its own.
      const byId = new Map(mapped.map((v) => [v.id, v]));
      return ids.map((id) => byId.get(id)).filter((v): v is Video => Boolean(v));
    },
    () => {
      const byId = new Map(DEMO_CATALOGUE.map((v) => [v.id, v]));
      return ids.map((id) => byId.get(id)).filter((v): v is Video => Boolean(v));
    },
  );
}

export async function getVideo(id: string): Promise<Video | null> {
  const [v] = await getVideosByIds([id]);
  return v ?? null;
}

export async function getTrending(
  regionCode = 'US',
  categoryId?: string,
  maxResults = 24,
): Promise<Video[]> {
  return withFallback(
    async () => {
      const page = await ytFetch<{ items: unknown[] }>(
        'videos',
        {
          part: 'snippet,contentDetails,statistics',
          chart: 'mostPopular',
          regionCode,
          videoCategoryId: categoryId,
          maxResults,
        },
        { revalidate: 1800 },
      );
      return (page.items ?? []).map(mapVideo);
    },
    () => demoTrending(categoryId, maxResults),
  );
}

export async function getChannel(id: string): Promise<Channel | null> {
  return withFallback(
    async () => {
      const page = await ytFetch<{ items: unknown[] }>(
        'channels',
        { part: 'snippet,statistics,brandingSettings', id },
        { revalidate: 3600 },
      );
      const item = (page.items ?? [])[0];
      return item ? mapChannel(item) : null;
    },
    () => demoChannels().find((c) => c.id === id) ?? null,
  );
}

export async function getChannelsByIds(ids: string[]): Promise<Channel[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  return withFallback(
    async () => {
      const page = await ytFetch<{ items: unknown[] }>(
        'channels',
        { part: 'snippet,statistics', id: unique.slice(0, 50).join(',') },
        { revalidate: 3600 },
      );
      return (page.items ?? []).map(mapChannel);
    },
    () => demoChannels().filter((c) => unique.includes(c.id)),
  );
}

/** Every channel's uploads live in a playlist whose id is the channel id with
 *  the second character switched from C to U. Walking that playlist costs 1
 *  unit; search.list?channelId costs 100. */
export async function getChannelUploads(
  channelId: string,
  pageToken?: string,
  maxResults = 24,
): Promise<Paged<Video>> {
  const uploadsId = `UU${channelId.slice(2)}`;
  return withFallback(
    async () => {
      const page = await ytFetch<{ items: { contentDetails?: { videoId: string } }[]; nextPageToken?: string }>(
        'playlistItems',
        { part: 'contentDetails', playlistId: uploadsId, maxResults, pageToken },
        { revalidate: 1800 },
      );
      const ids = (page.items ?? []).map((i) => i.contentDetails?.videoId).filter((x): x is string => Boolean(x));
      return { items: await getVideosByIds(ids), nextPageToken: page.nextPageToken };
    },
    () => ({ items: DEMO_CATALOGUE.filter((v) => v.channelId === channelId).slice(0, maxResults) }),
  );
}

/**
 * Related videos.
 *
 * `search.list?relatedToVideoId` was deprecated and switched off in August
 * 2023 — there is no drop-in replacement in the public API. This reconstructs
 * a related set from signals the API still exposes: the video's own tags
 * (highest signal), then its title's distinctive words, scoped to the same
 * category. The source video and anything from the same upload are filtered
 * out so the rail never shows you what you're already watching.
 */
export async function getRelated(video: Video, maxResults = 20): Promise<Video[]> {
  const query = buildRelatedQuery(video);

  return withFallback(
    async () => {
      const [bySubject, byChannel] = await Promise.all([
        searchVideos({ q: query, maxResults: maxResults + 6 }),
        getChannelUploads(video.channelId, undefined, 8).catch(() => ({ items: [] as Video[] })),
      ]);

      const seen = new Set<string>([video.id]);
      const out: Video[] = [];

      // Interleave: two topical, then one more from the same creator. Keeps the
      // rail from collapsing into a single channel's back catalogue.
      const a = bySubject.items.filter((v) => v.id !== video.id);
      const b = byChannel.items.filter((v) => v.id !== video.id);
      let ai = 0;
      let bi = 0;
      while (out.length < maxResults && (ai < a.length || bi < b.length)) {
        for (let k = 0; k < 2 && ai < a.length; k++) {
          const v = a[ai++];
          if (!seen.has(v.id)) { seen.add(v.id); out.push(v); }
        }
        if (bi < b.length) {
          const v = b[bi++];
          if (!seen.has(v.id)) { seen.add(v.id); out.push(v); }
        }
      }
      return out.slice(0, maxResults);
    },
    () =>
      DEMO_CATALOGUE
        .filter((v) => v.id !== video.id)
        .sort((x, y) => relatedScore(video, y) - relatedScore(video, x))
        .slice(0, maxResults),
  );
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'at',
  'by', 'from', 'is', 'it', 'this', 'that', 'how', 'why', 'what', 'you', 'your',
  'official', 'video', 'hd', 'full', 'new', 'best', 'ft', 'feat', 'part', 'ep',
  'episode', 'vs', 'live', 'lyrics', 'audio', 'trailer', '4k', '2024', '2025', '2026',
]);

function buildRelatedQuery(video: Video): string {
  const tagTerms = (video.tags ?? [])
    .filter((t) => t.length > 2 && t.split(' ').length <= 3)
    .slice(0, 4);

  if (tagTerms.length >= 2) return tagTerms.join(' ');

  const titleTerms = video.title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .slice(0, 5);

  return [...tagTerms, ...titleTerms].join(' ') || video.channelTitle;
}

function relatedScore(source: Video, candidate: Video): number {
  let score = 0;
  if (candidate.categoryId && candidate.categoryId === source.categoryId) score += 4;
  if (candidate.channelId === source.channelId) score += 3;
  const st = new Set((source.tags ?? []).map((t) => t.toLowerCase()));
  for (const t of candidate.tags ?? []) if (st.has(t.toLowerCase())) score += 2;
  return score;
}

export async function getComments(
  videoId: string,
  pageToken?: string,
  order: 'relevance' | 'time' = 'relevance',
): Promise<Paged<Comment>> {
  return withFallback(
    async () => {
      const page = await ytFetch<{ items: unknown[]; nextPageToken?: string }>(
        'commentThreads',
        { part: 'snippet', videoId, maxResults: 20, order, textFormat: 'plainText', pageToken },
        { revalidate: 600 },
      );
      return { items: (page.items ?? []).map(mapComment), nextPageToken: page.nextPageToken };
    },
    // Comments are frequently disabled; an empty list is a valid state the UI
    // already handles, so a failure here is never fatal.
    () => ({ items: demoComments(videoId) }),
  ).catch(() => ({ items: [] }));
}

export interface Category { id: string; title: string }

export async function getCategories(regionCode = 'US'): Promise<Category[]> {
  return withFallback(
    async () => {
      const page = await ytFetch<{ items: { id: string; snippet: { title: string; assignable: boolean } }[] }>(
        'videoCategories',
        { part: 'snippet', regionCode },
        { revalidate: 86400 },
      );
      return (page.items ?? [])
        .filter((i) => i.snippet.assignable)
        .map((i) => ({ id: i.id, title: i.snippet.title }));
    },
    () => STATIC_CATEGORIES,
  );
}

export const STATIC_CATEGORIES: Category[] = [
  { id: '10', title: 'Music' },
  { id: '20', title: 'Gaming' },
  { id: '24', title: 'Entertainment' },
  { id: '28', title: 'Science & Technology' },
  { id: '17', title: 'Sports' },
  { id: '22', title: 'People & Blogs' },
  { id: '23', title: 'Comedy' },
  { id: '25', title: 'News & Politics' },
  { id: '26', title: 'Howto & Style' },
  { id: '27', title: 'Education' },
  { id: '1', title: 'Film & Animation' },
  { id: '2', title: 'Autos & Vehicles' },
  { id: '15', title: 'Pets & Animals' },
  { id: '19', title: 'Travel & Events' },
];

/* ------------------------------ demo mode ------------------------------- */

function demoSearch(q: string, limit: number): Video[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return DEMO_CATALOGUE.slice(0, limit);
  const scored = DEMO_CATALOGUE.map((v) => {
    const hay = `${v.title} ${v.channelTitle} ${(v.tags ?? []).join(' ')} ${v.description}`.toLowerCase();
    const score = terms.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
    return { v, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.v.viewCount ?? 0) - (a.v.viewCount ?? 0));

  // Never dead-end on an empty result in demo mode — fall back to popularity.
  const results = scored.length > 0 ? scored.map((x) => x.v) : DEMO_CATALOGUE;
  return results.slice(0, limit);
}

function demoTrending(categoryId: string | undefined, limit: number): Video[] {
  const pool = categoryId ? DEMO_CATALOGUE.filter((v) => v.categoryId === categoryId) : DEMO_CATALOGUE;
  const source = pool.length > 0 ? pool : DEMO_CATALOGUE;
  return [...source].sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0)).slice(0, limit);
}

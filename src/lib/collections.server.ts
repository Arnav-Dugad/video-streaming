import 'server-only';

import { getTrending, searchVideos } from './youtube';
import type { Video } from './types';
import {
  STRUCTURAL, titleCase, topicHue, topicSlug, type Collection,
} from './collections';

/* ==========================================================================
   Collection discovery.

   Topic collections are not written by hand. They are found by counting how
   many *distinct* trending videos carry each tag, which is the closest thing
   the Data API offers to "what is the internet actually about this week".

   The filtering matters more than the counting. Raw YouTube tags are mostly
   noise: channel names used as self-branding, single letters, the word
   "video", and long keyword-stuffed phrases. What survives the filters below
   is roughly what a person would name if you asked them what was going on.
   ========================================================================== */

/** Terms that are frequent everywhere and therefore describe nothing. */
const NOISE = new Set([
  'video', 'videos', 'youtube', 'new', 'best', 'top', 'official', 'hd', 'full',
  'the', 'and', 'for', 'with', 'how', 'what', 'why', 'you', 'your', 'this',
  'that', 'from', 'out', 'now', 'live', 'free', 'watch', 'online', 'channel',
  'subscribe', 'like', 'vlog', 'vlogs', 'funny', 'viral', 'trending', 'shorts',
  'short', 'clip', 'clips', 'compilation', 'reaction', 'review', 'tutorial',
  'music', 'song', 'songs', 'audio', 'lyrics', 'mix', 'remix', 'cover',
  'movie', 'film', 'trailer', 'scene', 'part', 'episode', 'season', 'series',
  'day', 'time', 'life', 'world', 'people', 'man', 'girl', 'boy', 'kids',
  '2024', '2025', '2026', '2027', 'hindi', 'english',
]);

interface TopicCandidate {
  tag: string;
  /** Number of distinct videos carrying it. */
  videos: number;
  /** Highest view count among those videos — used to pick a lead channel. */
  peakViews: number;
  leadChannel: string;
}

function collectTopics(videos: Video[]): TopicCandidate[] {
  const byTag = new Map<string, TopicCandidate>();
  const channelNames = new Set(videos.map((v) => v.channelTitle.toLowerCase()));

  for (const video of videos) {
    // A tag repeated within one video must not count twice.
    const seen = new Set<string>();

    for (const raw of video.tags ?? []) {
      const tag = raw.toLowerCase().trim().replace(/\s+/g, ' ');
      if (seen.has(tag)) continue;
      seen.add(tag);

      if (tag.length < 3 || tag.length > 26) continue;
      if (!/[a-z]/.test(tag)) continue;
      if (tag.split(' ').length > 3) continue;
      if (NOISE.has(tag)) continue;
      // Every word being noise means the phrase is noise too.
      if (tag.split(' ').every((w) => NOISE.has(w))) continue;
      // Channels tag their own name on everything; that is branding, not topic.
      if (channelNames.has(tag)) continue;

      const existing = byTag.get(tag);
      const views = video.viewCount ?? 0;
      if (existing) {
        existing.videos += 1;
        if (views > existing.peakViews) {
          existing.peakViews = views;
          existing.leadChannel = video.channelTitle;
        }
      } else {
        byTag.set(tag, { tag, videos: 1, peakViews: views, leadChannel: video.channelTitle });
      }
    }
  }

  return [...byTag.values()]
    .filter((t) => t.videos >= 3)
    .sort((a, b) => b.videos - a.videos || b.peakViews - a.peakViews);
}

/** Drops candidates that restate one already chosen — "formula 1" alongside
 *  "formula1" alongside "f1 racing" is one topic, not three. */
function dedupe(candidates: TopicCandidate[], limit: number): TopicCandidate[] {
  const chosen: TopicCandidate[] = [];

  for (const candidate of candidates) {
    const compact = candidate.tag.replace(/\s/g, '');
    const clashes = chosen.some((c) => {
      const other = c.tag.replace(/\s/g, '');
      return compact.includes(other) || other.includes(compact);
    });
    if (clashes) continue;
    chosen.push(candidate);
    if (chosen.length >= limit) break;
  }

  return chosen;
}

function describe(topic: TopicCandidate): { blurb: string; intro: string } {
  const name = titleCase(topic.tag);
  return {
    blurb: `${topic.videos} videos trending on this right now, led by ${topic.leadChannel}.`,
    intro:
      `${name} surfaced here because ${topic.videos} separate videos currently on the trending chart are tagged with it — ` +
      `the busiest of them from ${topic.leadChannel}. Nobody chose this collection; it exists because enough creators ` +
      `are publishing about the same thing at the same time. It will be gone when they stop.`,
  };
}

/**
 * The live collection set: the four structural rules, plus whatever topics the
 * trending chart is currently clustered around.
 *
 * Falls back to the structural set alone if trending is unavailable — an empty
 * collections page would be worse than a shorter one.
 */
export async function buildCollections(limit = 6): Promise<Collection[]> {
  let topics: TopicCandidate[] = [];

  try {
    // A wider sample than one page: tags cluster differently per category, and
    // three categories give a broader read than the mixed chart alone.
    const [chart, tech, music] = await Promise.all([
      getTrending('US', undefined, 50),
      getTrending('US', '28', 25).catch(() => [] as Video[]),
      getTrending('US', '10', 25).catch(() => [] as Video[]),
    ]);

    const pool = [...chart, ...tech, ...music];
    const unique = [...new Map(pool.map((v) => [v.id, v])).values()];
    topics = dedupe(collectTopics(unique), limit);
  } catch {
    topics = [];
  }

  const generated: Collection[] = topics.map((topic) => {
    const { blurb, intro } = describe(topic);
    return {
      slug: topicSlug(topic.tag),
      kind: 'topic' as const,
      title: titleCase(topic.tag),
      blurb,
      intro,
      hue: topicHue(topic.tag),
      rule: { query: topic.tag },
      meta: { count: topic.videos, leadChannel: topic.leadChannel },
    };
  });

  return [...STRUCTURAL, ...generated];
}

/** Runs a collection's rule and returns its videos. */
export async function resolveCollection(collection: Collection, max = 32): Promise<Video[]> {
  const { rule } = collection;

  if (rule.fromTrending) {
    const items = await getTrending('US', rule.categoryId, max).catch(() => [] as Video[]);
    return rule.order === 'viewCount'
      ? [...items].sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
      : items;
  }

  const publishedAfter = rule.withinHours
    ? new Date(Date.now() - rule.withinHours * 3_600_000).toISOString()
    : undefined;

  const page = await searchVideos({
    q: rule.query ?? '',
    maxResults: max,
    videoDuration: rule.duration ?? 'any',
    order: rule.order ?? 'relevance',
    publishedAfter,
  }).catch(() => ({ items: [] as Video[] }));

  return page.items;
}

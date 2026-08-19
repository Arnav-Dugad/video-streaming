import type { Metadata } from 'next';

import { searchVideos } from '@/lib/youtube';
import { ShortsFeed } from '@/components/shorts/ShortsFeed';
import type { Video } from '@/lib/types';

export const revalidate = 900;

export const metadata: Metadata = {
  title: 'Shorts',
  description: 'Short-form video, one at a time, full bleed.',
};

/* A few seed queries so the opening reel is not one subject. `videoDuration:
   short` is the API's own under-four-minutes filter — real Shorts are a
   YouTube surface with no public endpoint, so this is short-form video rather
   than a mirror of that shelf, which the page says plainly. */
const SEEDS = [
  'short film',
  'satisfying craft',
  'quick explainer',
  'one minute recipe',
  'street performance',
];

export default async function ShortsPage() {
  const pages = await Promise.all(
    SEEDS.map((q) =>
      searchVideos({ q, maxResults: 8, videoDuration: 'short', order: 'viewCount' })
        .then((p) => p.items)
        .catch(() => [] as Video[]),
    ),
  );

  // Interleave so the reel alternates subjects instead of playing five of one.
  const seen = new Set<string>();
  const reel: Video[] = [];
  for (let i = 0; i < 8; i++) {
    for (const page of pages) {
      const video = page[i];
      if (!video || seen.has(video.id)) continue;
      // Anything over four minutes is not a short, whatever the filter said.
      if ((video.durationSeconds ?? 0) > 245) continue;
      seen.add(video.id);
      reel.push(video);
    }
  }

  return <ShortsFeed initial={reel} seeds={SEEDS} />;
}

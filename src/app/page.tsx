import { Suspense } from 'react';

import { getTrending, searchVideos, hasLiveApi } from '@/lib/youtube';
import { buildCollections } from '@/lib/collections.server';
import { Hero } from '@/components/home/Hero';
import { MoodPicker } from '@/components/home/MoodPicker';
import { CollectionCards } from '@/components/home/CollectionCards';
import { Manifesto } from '@/components/home/Manifesto';
import { DemoBanner } from '@/components/home/DemoBanner';
import { ContinueWatching } from '@/components/home/ContinueWatching';
import { ForYou } from '@/components/home/ForYou';
import { Rail, RailItem } from '@/components/video/Rail';
import { VideoCard } from '@/components/video/VideoCard';
import { RailSkeleton } from '@/components/ui/Skeleton';
import type { Video } from '@/lib/types';

/** Revalidate hourly. Trending genuinely does not move faster than that, and
 *  it keeps the daily API quota out of danger on a public deployment. */
export const revalidate = 3600;

export default async function HomePage() {
  // One await for the whole page — these are independent, so serialising them
  // would add a full round trip per rail for no reason.
  const [trending, music, tech, talks, collections] = await Promise.all([
    getTrending('US', undefined, 24),
    getTrending('US', '10', 14).catch(() => [] as Video[]),
    searchVideos({ q: 'engineering deep dive explained', maxResults: 14 }).then((p) => p.items).catch(() => [] as Video[]),
    searchVideos({ q: 'talk lecture interview long form', maxResults: 14, videoDuration: 'long' }).then((p) => p.items).catch(() => [] as Video[]),
    buildCollections(4).catch(() => []),
  ]);

  const spotlight = trending.slice(0, 5);
  const rest = trending.slice(5);

  return (
    <>
      {!hasLiveApi() && <DemoBanner />}

      {spotlight.length > 0 && <Hero videos={spotlight} />}

      <Suspense fallback={<div className="gutter-wide py-8"><RailSkeleton count={4} /></div>}>
        <ContinueWatching />
      </Suspense>

      {/* Personalised rail. This page is a shared static render, so weighting
          cannot happen server-side without giving every visitor one person's
          taste — it runs in the browser against the signed-in profile. */}
      <ForYou />

      {rest.length > 0 && (
        <Rail
          eyebrow="Right now"
          title="Trending"
          href="/trending"
          meta={`Top ${Math.min(rest.length, 10)}`}
          className="py-12"
        >
          {rest.slice(0, 10).map((v, i) => (
            <RailItem key={v.id}>
              <VideoCard video={v} rank={i + 1} priority={i < 3} />
            </RailItem>
          ))}
        </Rail>
      )}

      <MoodPicker />

      <CollectionCards collections={collections} limit={4} />

      {music.length > 0 && (
        <Rail eyebrow="Sound" title="Music worth the volume" href="/browse?category=10" className="py-12">
          {music.map((v) => <RailItem key={v.id}><VideoCard video={v} /></RailItem>)}
        </Rail>
      )}

      <Manifesto />

      {tech.length > 0 && (
        <Rail eyebrow="Understand" title="Taken apart properly" href="/browse?category=28" className="py-12">
          {tech.map((v) => <RailItem key={v.id}><VideoCard video={v} /></RailItem>)}
        </Rail>
      )}

      {talks.length > 0 && (
        <Rail eyebrow="Settle in" title="The long form" href="/collections/the-long-read" className="py-12 pb-6">
          {talks.map((v) => <RailItem key={v.id}><VideoCard video={v} /></RailItem>)}
        </Rail>
      )}
    </>
  );
}

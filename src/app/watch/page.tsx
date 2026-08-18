import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { getChannel, getComments, getRelated, getVideo } from '@/lib/youtube';
import { WatchStage } from '@/components/watch/WatchStage';
import { WatchActions } from '@/components/watch/WatchActions';
import { Description } from '@/components/watch/Description';
import { Comments } from '@/components/watch/Comments';
import { UpNext } from '@/components/watch/UpNext';
import { hmsToSeconds } from '@/lib/format';

export const revalidate = 1800;

type SearchParams = Promise<{ v?: string; t?: string }>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { v } = await searchParams;
  if (!v) return { title: 'Watch' };
  const video = await getVideo(v).catch(() => null);
  if (!video) return { title: 'Video not found' };
  return {
    title: video.title,
    description: video.description.slice(0, 180) || `${video.channelTitle} on PRISM`,
    openGraph: {
      title: video.title,
      description: video.description.slice(0, 180),
      // A generated card rather than the raw thumbnail: it carries the title,
      // channel and duration, so a shared link reads as a link to *this*
      // video rather than an untitled still.
      images: [{ url: `/api/og?v=${video.id}`, width: 1200, height: 630, alt: video.title }],
      type: 'video.other',
    },
    twitter: {
      card: 'summary_large_image',
      title: video.title,
      description: video.description.slice(0, 180),
      images: [`/api/og?v=${video.id}`],
    },
  };
}

/** `?t=` accepts both raw seconds and 1h2m3s / 1:02:03, matching what people
 *  paste in from elsewhere. */
function parseStart(t?: string): number | undefined {
  if (!t) return undefined;
  if (/^\d+$/.test(t)) return Number(t);
  if (/^(\d{1,2}:)?\d{1,2}:\d{2}$/.test(t)) return hmsToSeconds(t);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  if (m && (m[1] || m[2] || m[3])) return +(m[1] ?? 0) * 3600 + +(m[2] ?? 0) * 60 + +(m[3] ?? 0);
  return undefined;
}

export default async function WatchPage({ searchParams }: { searchParams: SearchParams }) {
  const { v, t } = await searchParams;
  if (!v || !/^[\w-]{6,20}$/.test(v)) notFound();

  const video = await getVideo(v);
  if (!video) notFound();

  // Related and comments are independent of each other and of the channel.
  const [related, comments, channel] = await Promise.all([
    getRelated(video, 20).catch(() => []),
    getComments(video.id).catch(() => ({ items: [] })),
    video.channelId ? getChannel(video.channelId).catch(() => null) : Promise.resolve(null),
  ]);

  const startAt = parseStart(t);

  return (
    <div className="gutter-wide py-5 sm:py-7">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_23rem] xl:gap-7 2xl:grid-cols-[minmax(0,1fr)_25rem]">
        {/* ------------------------------ main ------------------------------ */}
        <div className="min-w-0">
          <WatchStage video={video} upNext={related.slice(0, 12)} startAt={startAt} />

          <nav aria-label="Breadcrumb" className="mt-5 flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
            <Link href="/browse" className="transition-colors hover:text-cream-dim">Browse</Link>
            <ChevronRight className="h-3 w-3" />
            <Link href={`/channel/${video.channelId}`} className="truncate transition-colors hover:text-cream-dim">
              {video.channelTitle}
            </Link>
          </nav>

          <h1 className="mt-2.5 text-[clamp(1.25rem,2.4vw,1.6rem)] font-semibold leading-[1.25] tracking-[-0.015em] text-cream">
            {video.title}
          </h1>

          <div className="mt-4">
            <WatchActions video={video} channel={channel} />
          </div>

          <div className="mt-5">
            <Description video={video} />
          </div>

          {/* Up next moves inline below the fold on narrow screens. */}
          <div className="mt-8 xl:hidden">
            <UpNext videos={related} />
          </div>

          <div className="mt-10 max-w-3xl">
            <Comments comments={comments.items} total={video.commentCount} videoId={video.id} />
          </div>
        </div>

        {/* ----------------------------- sidebar ---------------------------- */}
        <aside className="hidden xl:block">
          <div className="sticky top-24">
            <UpNext videos={related} />
          </div>
        </aside>
      </div>
    </div>
  );
}

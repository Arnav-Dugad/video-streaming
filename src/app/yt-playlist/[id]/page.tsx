import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ListVideo } from 'lucide-react';

import { getPlaylist } from '@/lib/youtube';
import { Thumbnail } from '@/components/ui/Thumbnail';
import { EmptyState } from '@/components/ui/PageHeader';
import { PlaylistPlayAll } from '@/components/video/PlaylistPlayAll';
import { formatDuration, formatDate, pluralise } from '@/lib/format';
import { Reveal, RevealText } from '@/components/ui/Reveal';

/* A real YouTube playlist, as opposed to /playlist/[id] which is a PRISM
   playlist stored in Firestore. Two different things that both deserve a page. */

export const revalidate = 1800;

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const { playlist } = await getPlaylist(id).catch(() => ({ playlist: null }));
  if (!playlist) return { title: 'Playlist not found' };
  return {
    title: playlist.title,
    description: playlist.description.slice(0, 180) || `${playlist.channelTitle} on PRISM`,
  };
}

export default async function YouTubePlaylistPage({ params }: { params: Params }) {
  const { id } = await params;
  // YouTube playlist ids are PL…, UU…, LL…, FL…, RD… and a few others.
  if (!/^[\w-]{12,64}$/.test(id)) notFound();

  const { playlist, videos } = await getPlaylist(id);
  if (!playlist) notFound();

  const totalSeconds = videos.reduce((sum, v) => sum + (v.durationSeconds ?? 0), 0);

  return (
    <div className="gutter-wide py-8">
      <Link
        href="/browse"
        className="group mb-7 inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-cream"
      >
        <ArrowLeft className="h-3 w-3 transition-transform duration-300 group-hover:-translate-x-1" />
        Browse
      </Link>

      <div className="grid gap-8 lg:grid-cols-[22rem_1fr] lg:gap-12">
        <header className="lg:sticky lg:top-24 lg:self-start">
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-ink-800 ring-1 ring-inset ring-cream/[0.06]">
            <Thumbnail src={playlist.thumbnail} alt={playlist.title} sizes="360px" priority />
          </div>

          <p className="eyebrow mt-5 flex items-center gap-1.5">
            <ListVideo className="h-3 w-3" /> YouTube playlist
          </p>
          <h1 className="display mt-2 text-[clamp(1.6rem,3.2vw,2.3rem)] text-cream">
            <RevealText text={playlist.title} />
          </h1>

          <Link
            href={`/channel/${playlist.channelId}`}
            className="mt-3 inline-block text-[13.5px] text-cream-dim transition-colors hover:text-cream"
          >
            {playlist.channelTitle}
          </Link>

          <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[11px] text-faint tnum">
            <span>{pluralise(playlist.itemCount ?? videos.length, 'video')}</span>
            {totalSeconds > 0 && (<><span className="text-faint/50">·</span><span>{formatDuration(totalSeconds)}</span></>)}
            {playlist.publishedAt && (<><span className="text-faint/50">·</span><span>{formatDate(playlist.publishedAt)}</span></>)}
          </p>

          {playlist.description && (
            <Reveal delay={0.1}>
              <p className="clamp-3 mt-4 whitespace-pre-wrap text-[13px] leading-relaxed text-muted">
                {playlist.description}
              </p>
            </Reveal>
          )}

          <div className="mt-6">
            <PlaylistPlayAll videos={videos} />
          </div>
        </header>

        <section>
          {videos.length === 0 ? (
            <EmptyState
              icon={<ListVideo className="h-6 w-6" />}
              title="Nothing playable in this playlist"
              body="Its videos may be private, deleted, or blocked from embedding."
            />
          ) : (
            <ol className="space-y-1">
              {videos.map((v, i) => (
                <li key={v.id}>
                  <Link
                    href={`/watch?v=${v.id}`}
                    className="group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-ink-800/60"
                  >
                    <span className="w-6 shrink-0 text-center font-mono text-[11px] text-faint tnum">{i + 1}</span>
                    <span className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-ink-800 sm:w-40">
                      <Thumbnail src={v.thumbnail} alt="" sizes="180px" reveal={false} />
                      {v.durationSeconds ? (
                        <span className="absolute bottom-1 right-1 rounded bg-ink-950/85 px-1 py-px font-mono text-[10px] text-cream tnum">
                          {formatDuration(v.durationSeconds)}
                        </span>
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="clamp-2 block text-[13.5px] font-medium leading-snug text-cream">{v.title}</span>
                      <span className="mt-1 block truncate text-[12px] text-muted">{v.channelTitle}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

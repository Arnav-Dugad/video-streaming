import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import { Video as VideoIcon } from 'lucide-react';

import { getChannel, getChannelPlaylists, getChannelUploads } from '@/lib/youtube';
import { VideoGrid } from '@/components/video/VideoGrid';
import { EmptyState } from '@/components/ui/PageHeader';
import { Avatar } from '@/components/ui/Avatar';
import { SubscribeButton } from '@/components/channel/SubscribeButton';
import { PlaylistCard } from '@/components/video/ChannelCard';
import { compactNumber, formatDate, subscriberLabel } from '@/lib/format';
import { Reveal } from '@/components/ui/Reveal';

export const revalidate = 3600;

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const channel = await getChannel(id).catch(() => null);
  if (!channel) return { title: 'Channel not found' };
  return {
    title: channel.title,
    description: channel.description.slice(0, 180) || `${channel.title} on PRISM`,
    openGraph: { title: channel.title, images: channel.avatar ? [channel.avatar] : undefined },
  };
}

export default async function ChannelPage({ params }: { params: Params }) {
  const { id } = await params;
  if (!/^UC[\w-]{20,24}$/.test(id)) notFound();

  const channel = await getChannel(id);
  if (!channel) notFound();

  const [uploads, playlists] = await Promise.all([
    getChannelUploads(id, undefined, 36).catch(() => ({ items: [] })),
    getChannelPlaylists(id, 12).catch(() => []),
  ]);

  return (
    <>
      {/* ------------------------------ banner ----------------------------- */}
      <div className="relative h-40 overflow-hidden bg-ink-850 sm:h-56 lg:h-72">
        {channel.banner ? (
          <Image
            src={`${channel.banner}=w2560-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj`}
            alt=""
            fill
            priority
            unoptimized
            className="object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(80% 140% at 20% 0%, rgba(255,74,46,0.20), transparent 60%),' +
                'radial-gradient(60% 120% at 85% 10%, rgba(157,180,255,0.16), transparent 62%)',
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/40 to-transparent" />
      </div>

      {/* ------------------------------ identity --------------------------- */}
      {/* `relative z-10` is load-bearing: the banner above is positioned, so
          without this the negatively-margined header paints *underneath* it and
          the channel title disappears into the banner's gradient. */}
      <header className="gutter-wide relative z-10 -mt-12 pb-8 sm:-mt-16">
        <Reveal className="flex flex-wrap items-end gap-5">
          <div className="rounded-full bg-ink-950 p-1">
            <Avatar src={channel.avatar} name={channel.title} size={104} className="sm:h-[128px] sm:w-[128px]" />
          </div>

          <div className="min-w-0 flex-1 pb-1">
            <h1 className="display text-[clamp(1.85rem,4.2vw,3rem)] text-cream">{channel.title}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[11.5px] text-muted tnum">
              {channel.customUrl && <span className="text-cream-dim">{channel.customUrl}</span>}
              {channel.subscriberCount !== undefined && (<><Sep /><span>{subscriberLabel(channel.subscriberCount)}</span></>)}
              {channel.videoCount ? (<><Sep /><span>{compactNumber(channel.videoCount)} videos</span></>) : null}
              {channel.viewCount ? (<><Sep /><span>{compactNumber(channel.viewCount)} total views</span></>) : null}
              {channel.publishedAt && (<><Sep /><span>Joined {formatDate(channel.publishedAt)}</span></>)}
            </p>
          </div>

          <div className="pb-2">
            <SubscribeButton channel={{ id: channel.id, title: channel.title, avatar: channel.avatar }} />
          </div>
        </Reveal>

        {channel.description && (
          <Reveal delay={0.1}>
            <p className="clamp-3 mt-6 max-w-3xl whitespace-pre-wrap text-[13.5px] leading-[1.7] text-muted">
              {channel.description}
            </p>
          </Reveal>
        )}
      </header>

      <div className="gutter-wide">
        <div className="hairline-t" />
      </div>

      {/* ------------------------------ uploads ---------------------------- */}
      <section className="gutter-wide py-9">
        <div className="mb-6 flex items-baseline gap-3">
          <h2 className="text-[15px] font-medium text-cream">Videos</h2>
          <span className="font-mono text-[11px] text-faint tnum">
            {uploads.items.length} most recent
          </span>
        </div>

        <VideoGrid
          videos={uploads.items}
          emptyState={
            <EmptyState
              icon={<VideoIcon className="h-6 w-6" />}
              title="No public uploads"
              body="This channel has not published any videos, or its uploads playlist is private."
            />
          }
        />
      </section>

      {playlists.length > 0 && (
        <section className="gutter-wide pb-12">
          <div className="hairline-t mb-9" />
          <div className="mb-6 flex items-baseline gap-3">
            <h2 className="text-[15px] font-medium text-cream">Playlists</h2>
            <span className="font-mono text-[11px] text-faint tnum">{playlists.length}</span>
          </div>
          <div className="grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {playlists.map((p, i) => <PlaylistCard key={p.id} playlist={p} index={i} />)}
          </div>
        </section>
      )}
    </>
  );
}

function Sep() { return <span className="text-faint/50" aria-hidden>·</span>; }

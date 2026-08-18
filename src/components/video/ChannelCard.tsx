'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { ArrowRight, ListVideo } from 'lucide-react';

import { Avatar } from '@/components/ui/Avatar';
import { Thumbnail } from '@/components/ui/Thumbnail';
import { compactNumber, subscriberLabel, pluralise } from '@/lib/format';
import type { Channel, PlaylistSummary } from '@/lib/types';

/** A channel in a result list: avatar, real subscriber and video counts, and
 *  enough description to tell two similarly-named channels apart. */
export function ChannelCard({ channel, index = 0 }: { channel: Channel; index?: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: Math.min(index, 8) * 0.04, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link
        href={`/channel/${channel.id}`}
        data-cursor="Open"
        className="group flex items-center gap-4 rounded-2xl border border-line p-4 transition-[border-color,background-color] duration-300 hover:border-line-strong hover:bg-cream/[0.03] sm:gap-6 sm:p-5"
      >
        <Avatar
          src={channel.avatar}
          name={channel.title}
          size={72}
          className="shrink-0 transition-transform duration-500 group-hover:scale-105 sm:h-[88px] sm:w-[88px]"
        />

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-medium text-cream">{channel.title}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono text-[11px] text-muted tnum">
            {channel.customUrl && <span className="text-cream-dim">{channel.customUrl}</span>}
            {channel.subscriberCount !== undefined && (
              <>
                {channel.customUrl && <span className="text-faint/50">·</span>}
                <span>{subscriberLabel(channel.subscriberCount)}</span>
              </>
            )}
            {channel.videoCount ? (
              <>
                <span className="text-faint/50">·</span>
                <span>{compactNumber(channel.videoCount)} videos</span>
              </>
            ) : null}
          </p>
          {channel.description && (
            <p className="clamp-2 mt-2 text-[12.5px] leading-relaxed text-muted">{channel.description}</p>
          )}
        </div>

        <ArrowRight className="hidden h-4 w-4 shrink-0 text-faint transition-transform duration-300 group-hover:translate-x-1 sm:block" />
      </Link>
    </motion.article>
  );
}

/** A YouTube playlist in a result list. */
export function PlaylistCard({ playlist, index = 0 }: { playlist: PlaylistSummary; index?: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: Math.min(index, 8) * 0.04, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link
        href={`/yt-playlist/${playlist.id}`}
        data-cursor="Open"
        className="group block"
      >
        <div className="relative aspect-video w-full overflow-hidden rounded-card bg-ink-800 ring-1 ring-inset ring-cream/[0.06]">
          <Thumbnail
            src={playlist.thumbnail}
            alt={playlist.title}
            sizes="(max-width: 640px) 100vw, 25vw"
            className="transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]"
          />
          {/* The stacked edge is what tells a playlist apart from a video at a
              glance, before any label is read. */}
          <span className="absolute inset-y-0 right-0 flex w-[38%] flex-col items-center justify-center gap-1 bg-ink-950/80 backdrop-blur-sm">
            <ListVideo className="h-4 w-4 text-cream" />
            <span className="font-mono text-[10.5px] text-cream-dim tnum">
              {playlist.itemCount !== undefined ? pluralise(playlist.itemCount, 'video') : 'Playlist'}
            </span>
          </span>
        </div>

        <h3 className="clamp-2 mt-3 text-[14px] font-medium leading-[1.4] text-cream">{playlist.title}</h3>
        <p className="mt-1.5 truncate text-[12.5px] text-muted">{playlist.channelTitle}</p>
      </Link>
    </motion.article>
  );
}

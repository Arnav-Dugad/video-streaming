'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bookmark, BookmarkCheck, Clock, ListPlus, Radio, Share2 } from 'lucide-react';

import { Thumbnail } from '@/components/ui/Thumbnail';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/cn';
import { formatDuration, timeAgo, viewLabel } from '@/lib/format';
import type { Video } from '@/lib/types';
import { useIsTouch, usePrefersReducedMotion } from '@/hooks/useMediaQuery';
import { useAuth } from '@/components/providers/AuthProvider';
import { toggleInCollection } from '@/lib/db';
import { toast } from '@/lib/store';

/* ==========================================================================
   The card everything else is built from.

   Two details do most of the work:

   1. Hover preview. After 620ms of sustained hover, a muted embed replaces the
      still and starts a few seconds in — far enough to skip the intro card.
      The delay matters: fire immediately and a mouse crossing the grid spawns
      a dozen iframes.
   2. Resume bar. If the video is in the viewer's history, a vermilion rule
      across the bottom of the still shows exactly how far in they got — the
      single most useful piece of state a streaming grid can carry.
   ========================================================================== */

const HOVER_DELAY = 620;

interface Props {
  video: Video;
  /** Seconds watched, from history. Renders the resume bar. */
  progress?: number;
  priority?: boolean;
  /** 'grid' is the default 16:9 card. 'row' is the compact horizontal one
   *  used in up-next rails and search results. */
  layout?: 'grid' | 'row';
  className?: string;
  showChannel?: boolean;
  /** Ordinal badge for ranked rails (Trending top 10). */
  rank?: number;
  onSelect?(video: Video): void;
}

export function VideoCard({
  video, progress, priority, layout = 'grid', className, showChannel = true, rank, onSelect,
}: Props) {
  const [preview, setPreview] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touch = useIsTouch();
  const reduced = usePrefersReducedMotion();
  const { user } = useAuth();

  const duration = video.durationSeconds ?? 0;
  const pct = progress && duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;
  const href = `/watch?v=${video.id}`;

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const enter = () => {
    if (touch || reduced) return;
    setHovered(true);
    timer.current = setTimeout(() => setPreview(true), HOVER_DELAY);
  };

  const leave = () => {
    setHovered(false);
    if (timer.current) clearTimeout(timer.current);
    setPreview(false);
  };

  const save = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) { toast('Sign in to save videos', { tone: 'neutral' }); return; }
    try {
      const nowSaved = await toggleInCollection(user.uid, 'saved', video);
      setSaved(nowSaved);
      toast(nowSaved ? 'Saved to Watch Later' : 'Removed from Watch Later', { tone: 'success' });
    } catch {
      toast('Could not save right now', { tone: 'error' });
    }
  };

  const share = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}${href}`;
    try {
      if (navigator.share) await navigator.share({ title: video.title, url });
      else { await navigator.clipboard.writeText(url); toast('Link copied', { tone: 'success' }); }
    } catch { /* user dismissed the share sheet */ }
  };

  /* ------------------------------- row ---------------------------------- */

  if (layout === 'row') {
    return (
      <Link
        href={href}
        onClick={() => onSelect?.(video)}
        className={cn('group flex gap-3 rounded-xl p-2 -m-2 transition-colors duration-300 hover:bg-ink-800/70', className)}
      >
        <div className="relative aspect-video w-[9.5rem] shrink-0 overflow-hidden rounded-lg bg-ink-800 sm:w-[10.5rem]">
          <Thumbnail src={video.thumbnail} alt="" sizes="180px" />
          <DurationBadge seconds={duration} live={video.live} />
          {pct > 0 && <ProgressRule pct={pct} />}
        </div>
        <div className="min-w-0 flex-1 py-0.5">
          <h3 className="clamp-2 text-[13.5px] font-medium leading-[1.35] text-cream transition-colors group-hover:text-white">
            {video.title}
          </h3>
          <p className="mt-1.5 truncate text-[12px] text-muted">{video.channelTitle}</p>
          <p className="mt-0.5 truncate font-mono text-[11px] text-faint tnum">
            {viewLabel(video.viewCount)} · {timeAgo(video.publishedAt)}
          </p>
        </div>
      </Link>
    );
  }

  /* ------------------------------- grid --------------------------------- */

  return (
    <motion.article
      className={cn('group relative', className)}
      onMouseEnter={enter}
      onMouseLeave={leave}
      animate={reduced ? undefined : { y: hovered ? -4 : 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
    >
      <Link href={href} onClick={() => onSelect?.(video)} className="block" data-cursor="Watch">
        <div
          className={cn(
            'relative aspect-video w-full overflow-hidden rounded-card bg-ink-800',
            'ring-1 ring-inset ring-cream/[0.06] transition-shadow duration-500',
            hovered && 'shadow-float',
          )}
        >
          <Thumbnail
            src={video.thumbnailHq || video.thumbnail}
            alt={video.title}
            priority={priority}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className={cn('transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)]', hovered && 'scale-[1.06]')}
          />

          {/* Muted preview — only ever one per card, torn down on leave. */}
          <AnimatePresence>
            {preview && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45 }}
                className="absolute inset-0"
              >
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&playsinline=1&start=${previewStart(duration)}&disablekb=1`}
                  title=""
                  aria-hidden
                  tabIndex={-1}
                  allow="autoplay; encrypted-media"
                  /* 1.35x overscan hides the embed's own letterboxing. */
                  className="pointer-events-none absolute left-1/2 top-1/2 h-[135%] w-[135%] -translate-x-1/2 -translate-y-1/2 border-0"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Scrim only appears on hover, so the artwork is never dulled at rest. */}
          <div
            className={cn(
              'pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950/75 via-transparent to-transparent',
              'opacity-0 transition-opacity duration-400',
              hovered && 'opacity-100',
            )}
          />

          {rank !== undefined && (
            <span className="pointer-events-none absolute -left-1 bottom-0 select-none font-display text-[5.5rem] leading-[0.72] text-cream/95 mix-blend-overlay drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
              {rank}
            </span>
          )}

          <DurationBadge seconds={duration} live={video.live} hidden={preview} />

          {/* Quick actions — revealed on hover, never on touch (no hover state). */}
          {!touch && (
            <div
              className={cn(
                'absolute right-2 top-2 flex flex-col gap-1.5 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                hovered ? 'translate-x-0 opacity-100' : 'translate-x-2 opacity-0',
              )}
            >
              <QuickAction onClick={save} label={saved ? 'Remove from Watch Later' : 'Watch Later'}>
                {saved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
              </QuickAction>
              <QuickAction onClick={share} label="Share">
                <Share2 className="h-3.5 w-3.5" />
              </QuickAction>
            </div>
          )}

          {pct > 0 && <ProgressRule pct={pct} tall />}
        </div>
      </Link>

      <div className="mt-3 flex gap-3">
        {showChannel && (
          <Link
            href={`/channel/${video.channelId}`}
            className="mt-0.5 shrink-0 transition-transform duration-300 hover:scale-105"
            aria-label={video.channelTitle}
          >
            <Avatar src={video.channelAvatar} name={video.channelTitle} size={32} />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <Link href={href} onClick={() => onSelect?.(video)}>
            <h3 className="clamp-2 text-[14px] font-medium leading-[1.4] tracking-[-0.005em] text-cream transition-colors duration-300 group-hover:text-white">
              {video.title}
            </h3>
          </Link>
          {showChannel && (
            <Link
              href={`/channel/${video.channelId}`}
              className="mt-1.5 block truncate text-[12.5px] text-muted transition-colors hover:text-cream-dim"
            >
              {video.channelTitle}
            </Link>
          )}
          <p className="mt-1 truncate font-mono text-[11px] tracking-tight text-faint tnum">
            {viewLabel(video.viewCount)}
            <span className="mx-1.5 opacity-50">·</span>
            {timeAgo(video.publishedAt)}
            {pct > 0 && (
              <>
                <span className="mx-1.5 opacity-50">·</span>
                <span className="text-flare">{Math.round(pct)}% watched</span>
              </>
            )}
          </p>
        </div>
      </div>
    </motion.article>
  );
}

/* ------------------------------- pieces --------------------------------- */

/** Start previews past the intro, but never past the end of a short clip. */
function previewStart(duration: number): number {
  if (duration <= 30) return 0;
  return Math.min(Math.floor(duration * 0.18), 45);
}

function DurationBadge({ seconds, live, hidden }: { seconds: number; live?: boolean; hidden?: boolean }) {
  if (live) {
    return (
      <span className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-md bg-live px-1.5 py-[3px] font-mono text-[10px] font-semibold uppercase tracking-wider text-white">
        <Radio className="h-2.5 w-2.5" /> Live
      </span>
    );
  }
  if (!seconds) return null;
  return (
    <span
      className={cn(
        'absolute bottom-2 right-2 rounded-md bg-ink-950/85 px-1.5 py-[3px] font-mono text-[10.5px] font-medium text-cream backdrop-blur-sm tnum',
        'transition-opacity duration-300',
        hidden && 'opacity-0',
      )}
    >
      {formatDuration(seconds)}
    </span>
  );
}

function ProgressRule({ pct, tall }: { pct: number; tall?: boolean }) {
  return (
    <div className={cn('absolute inset-x-0 bottom-0 bg-cream/20', tall ? 'h-[3px]' : 'h-[2px]')}>
      <div className="h-full bg-flare shadow-[0_0_8px_rgba(255,74,46,0.6)]" style={{ width: `${pct}%` }} />
    </div>
  );
}

function QuickAction({
  children, label, onClick,
}: { children: React.ReactNode; label: string; onClick(e: React.MouseEvent): void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-7 w-7 place-items-center rounded-lg bg-ink-950/80 text-cream-dim backdrop-blur-sm transition-[background-color,color,transform] duration-200 hover:bg-ink-950 hover:text-cream active:scale-90"
    >
      {children}
    </button>
  );
}

export { Clock, ListPlus };

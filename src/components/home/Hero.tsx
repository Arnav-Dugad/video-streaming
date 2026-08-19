'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { Bookmark, Info, Play } from 'lucide-react';

import { Thumbnail } from '@/components/ui/Thumbnail';
import { Magnetic } from '@/components/ui/Magnetic';
import { cn } from '@/lib/cn';
import { compactNumber, formatDuration, timeAgo } from '@/lib/format';
import type { Video } from '@/lib/types';
import { useAuth } from '@/components/providers/AuthProvider';
import { toggleInCollection } from '@/lib/db';
import { toast } from '@/lib/store';
import { useIsTouch } from '@/hooks/useMediaQuery';

/* ==========================================================================
   Spotlight.

   A rotating feature that behaves like a title sequence rather than a
   carousel: the still cross-dissolves, a muted preview fades up behind the
   copy after a beat, and the copy itself re-types on each change. Rotation
   pauses on hover, on focus, and whenever the tab is hidden — an auto-advance
   that keeps running while you are reading is the thing that makes carousels
   universally hated.
   ========================================================================== */

const DWELL = 9000;
const PREVIEW_AFTER = 2400;

export function Hero({ videos }: { videos: Video[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  /** Index the muted preview has been armed for — derived, never reset. */
  const [previewFor, setPreviewFor] = useState<number | null>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [elapsed, setElapsed] = useState(0);

  const rootRef = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const touch = useIsTouch();
  const { user } = useAuth();

  const slides = videos.slice(0, 5);
  const active = slides[index];

  const { scrollYProgress } = useScroll({ target: rootRef, offset: ['start start', 'end start'] });
  const bgY = useTransform(scrollYProgress, [0, 1], ['0%', '18%']);
  const copyY = useTransform(scrollYProgress, [0, 1], ['0%', '48%']);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.65], [1, 0]);

  /* ---------------------------- rotation -------------------------------- */

  useEffect(() => {
    if (paused || reduced || slides.length < 2) return;
    const started = Date.now();
    const tick = setInterval(() => setElapsed(Date.now() - started), 90);
    const advance = setTimeout(() => {
      setIndex((i) => (i + 1) % slides.length);
      setElapsed(0);
    }, DWELL);
    return () => { clearInterval(tick); clearTimeout(advance); };
  }, [index, paused, reduced, slides.length]);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (reduced || touch) return;
    const t = setTimeout(() => setPreviewFor(index), PREVIEW_AFTER);
    return () => clearTimeout(t);
  }, [index, reduced, touch]);

  const preview = previewFor === index;

  if (!active) return null;

  const save = async () => {
    if (!user) { toast('Sign in to save videos'); return; }
    try {
      const now = await toggleInCollection(user.uid, 'saved', active);
      setSaved((s) => ({ ...s, [active.id]: now }));
      toast(now ? 'Saved to Watch Later' : 'Removed from Watch Later', { tone: 'success' });
    } catch { toast('Could not save right now', { tone: 'error' }); }
  };

  return (
    <section
      ref={rootRef}
      // `isolate` is load-bearing. The backdrop below sits at -z-10, and
      // without a stacking context here it escapes all the way past <body>
      // and paints behind its background colour — invisible.
      className="relative isolate -mt-16 flex min-h-[max(34rem,88svh)] flex-col justify-end overflow-hidden sm:-mt-[68px]"
      aria-roledescription="carousel"
      aria-label="Featured"
    >
      {/* ---------------------------- backdrop --------------------------- */}
      <motion.div style={{ y: reduced ? undefined : bgY }} className="absolute inset-0 -z-10">
        <AnimatePresence mode="sync">
          <motion.div
            key={active.id}
            initial={{ opacity: 0, scale: 1.08 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { duration: 1.1 }, scale: { duration: 9, ease: 'linear' } }}
            className="absolute inset-0"
          >
            <Thumbnail
              src={active.thumbnailHq || active.thumbnail}
              alt=""
              priority
              sizes="100vw"
              reveal={false}
              className="object-cover"
            />
          </motion.div>
        </AnimatePresence>

        <AnimatePresence>
          {preview && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.4 }}
              className="absolute inset-0"
            >
              <iframe
                key={active.id}
                src={`https://www.youtube-nocookie.com/embed/${active.id}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&playsinline=1&loop=1&playlist=${active.id}&start=${Math.min(30, Math.floor((active.durationSeconds ?? 60) * 0.2))}&disablekb=1`}
                title=""
                aria-hidden
                tabIndex={-1}
                allow="autoplay; encrypted-media"
                className="pointer-events-none absolute left-1/2 top-1/2 h-[calc(100vw*9/16*1.3)] min-h-[130%] w-[130%] -translate-x-1/2 -translate-y-1/2 border-0"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Two-axis scrim: vertical for legibility, horizontal so the copy
            column always sits on near-black regardless of the artwork. */}
        {/* Vertical scrim for the copy at the bottom, horizontal scrim only
            across the left column where the headline sits. The right side is
            left almost clear so the footage is actually watchable — two heavy
            stacked scrims made a playing video look like a still. */}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/45 to-ink-950/35" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/45 via-40% to-transparent" />
      </motion.div>

      {/* ------------------------------ copy ----------------------------- */}
      <motion.div
        style={{ y: reduced ? undefined : copyY, opacity: reduced ? undefined : copyOpacity }}
        className="gutter-wide relative pb-10 pt-32 sm:pb-14"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        <div className="max-w-3xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={active.id}
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.62, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="flex items-center gap-2 rounded-full border border-flare/35 bg-flare/10 px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-flare">
                  <span className="h-1.5 w-1.5 rounded-full bg-flare animate-[pulse-ring_2.4s_ease-out_infinite]" />
                  In the spotlight
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-cream-dim">
                  {active.channelTitle}
                </span>
              </div>

              <h1 className="display text-[clamp(2.4rem,6.4vw,4.75rem)] text-cream drop-shadow-[0_2px_24px_rgba(0,0,0,0.6)]">
                {active.title}
              </h1>

              {blurbFor(active.description, active.title) && (
                <p className="mt-5 max-w-xl clamp-2 text-[14.5px] leading-relaxed text-cream-dim/90">
                  {blurbFor(active.description, active.title)}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11.5px] text-muted tnum">
                {active.durationSeconds ? <span>{formatDuration(active.durationSeconds)}</span> : null}
                <Dot />
                <span>{compactNumber(active.viewCount)} views</span>
                <Dot />
                <span>{timeAgo(active.publishedAt)}</span>
                {active.likeCount ? (<><Dot /><span>{compactNumber(active.likeCount)} likes</span></>) : null}
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Magnetic strength={0.22}>
              <Link
                href={`/watch?v=${active.id}`}
                data-cursor="Play"
                className="group inline-flex h-12 items-center gap-3 rounded-xl bg-cream px-6 text-[15px] font-semibold text-ink-950 transition-[background-color,transform] duration-300 hover:bg-white active:scale-[0.97]"
              >
                <Play className="h-4 w-4 fill-current transition-transform duration-300 group-hover:scale-110" />
                Watch now
              </Link>
            </Magnetic>

            <button
              onClick={save}
              className="inline-flex h-12 items-center gap-2.5 rounded-xl border border-line-strong px-5 text-[14px] font-medium text-cream backdrop-blur-sm transition-[background-color,border-color] duration-300 hover:border-cream/35 hover:bg-cream/[0.06]"
            >
              <Bookmark className={cn('h-4 w-4', saved[active.id] && 'fill-flare text-flare')} />
              {saved[active.id] ? 'Saved' : 'Watch later'}
            </button>

            <Link
              href={`/channel/${active.channelId}`}
              className="inline-flex h-12 items-center gap-2.5 rounded-xl px-4 text-[14px] text-cream-dim transition-colors duration-300 hover:text-cream"
            >
              <Info className="h-4 w-4" />
              About the channel
            </Link>
          </div>
        </div>

        {/* ---------------------------- selector -------------------------- */}
        {slides.length > 1 && (
          <div className="mt-12 flex items-end gap-3 overflow-x-auto no-scrollbar pb-1">
            {slides.map((v, i) => {
              const isActive = i === index;
              const pct = isActive && !paused && !reduced ? Math.min(100, (elapsed / DWELL) * 100) : 0;
              return (
                <button
                  key={v.id}
                  onClick={() => { setIndex(i); setElapsed(0); }}
                  aria-label={`Show ${v.title}`}
                  aria-current={isActive}
                  className={cn(
                    'group relative shrink-0 overflow-hidden rounded-lg transition-[width,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                    isActive ? 'w-32 opacity-100 sm:w-40' : 'w-20 opacity-45 hover:opacity-80 sm:w-24',
                  )}
                >
                  <span className="relative block aspect-video w-full overflow-hidden rounded-lg bg-ink-800 ring-1 ring-inset ring-cream/10">
                    <Thumbnail src={v.thumbnail} alt="" sizes="160px" reveal={false} />
                  </span>
                  <span className="absolute inset-x-0 bottom-0 h-[3px] bg-cream/20">
                    <span
                      className="block h-full bg-flare transition-[width] duration-100 ease-linear"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </motion.div>
    </section>
  );
}

function Dot() {
  return <span className="text-faint/60" aria-hidden>·</span>;
}

/** Uploaders very often paste the title back in as the first line of the
 *  description. Repeating it under a 4rem headline looks like a bug. */
function blurbFor(description: string, title: string): string | null {
  const line = description.split('\n').find((l) => l.trim().length > 0)?.trim();
  if (!line) return null;
  const normalise = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const a = normalise(line);
  const b = normalise(title);
  if (a === b || a.includes(b) || b.includes(a)) return null;
  return line;
}

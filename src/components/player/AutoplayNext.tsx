'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Play, X } from 'lucide-react';

import { Thumbnail } from '@/components/ui/Thumbnail';
import { formatDuration } from '@/lib/format';
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery';
import type { Video } from '@/lib/types';

/* ==========================================================================
   The "up next in 5" card.

   Shown over the finished frame rather than jumping straight to the next
   video, because an autoplay you cannot catch is the thing people actually
   dislike about autoplay. Any interaction anywhere on the card cancels it,
   and the ring makes the remaining time legible rather than a surprise.

   Reduced motion gets a plain countdown instead of a sweeping ring — the
   information is the same, the movement is not.
   ========================================================================== */

const SECONDS = 5;
const RADIUS = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface Props {
  next: Video;
  onPlay(): void;
  onCancel(): void;
}

export function AutoplayNext({ next, onPlay, onCancel }: Props) {
  const [remaining, setRemaining] = useState(SECONDS);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      const left = SECONDS - (Date.now() - started) / 1000;
      if (left <= 0) { clearInterval(id); onPlay(); }
      else setRemaining(left);
    }, 100);
    return () => clearInterval(id);
  }, [onPlay]);

  // Escape is the reflex for "stop what you are about to do".
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const progress = Math.max(0, Math.min(1, remaining / SECONDS));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 z-20 grid place-items-center bg-ink-950/88 backdrop-blur-sm"
      role="dialog"
      aria-label="Up next"
    >
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="flex w-[min(30rem,88%)] flex-col items-center gap-4 text-center sm:flex-row sm:text-left"
      >
        <button
          onClick={onPlay}
          className="group relative aspect-video w-40 shrink-0 overflow-hidden rounded-xl bg-ink-800 ring-1 ring-inset ring-cream/10"
          aria-label={`Play ${next.title} now`}
        >
          <Thumbnail src={next.thumbnail} alt="" sizes="200px" reveal={false} />
          <span className="absolute inset-0 grid place-items-center bg-ink-950/45 transition-colors group-hover:bg-ink-950/20">
            {reduced ? (
              <span className="font-mono text-2xl font-semibold text-cream tnum">
                {Math.ceil(remaining)}
              </span>
            ) : (
              <span className="relative grid h-14 w-14 place-items-center">
                <svg viewBox="0 0 56 56" className="absolute inset-0 -rotate-90" aria-hidden>
                  <circle cx="28" cy="28" r={RADIUS} fill="none" stroke="rgba(244,241,234,0.22)" strokeWidth="2.5" />
                  <circle
                    cx="28" cy="28" r={RADIUS} fill="none"
                    stroke="#FF4A2E" strokeWidth="2.5" strokeLinecap="round"
                    strokeDasharray={CIRCUMFERENCE}
                    // Driven by the same clock as the label, so the ring and
                    // the number can never disagree.
                    strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
                    style={{ transition: 'stroke-dashoffset 100ms linear' }}
                  />
                </svg>
                <Play className="ml-0.5 h-5 w-5 fill-cream text-cream" />
              </span>
            )}
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <p className="eyebrow mb-1.5">
            Up next in {Math.ceil(remaining)}s
          </p>
          <p className="clamp-2 text-[14px] font-medium leading-snug text-cream">{next.title}</p>
          <p className="mt-1 truncate font-mono text-[11px] text-faint tnum">
            {next.channelTitle}
            {next.durationSeconds ? ` · ${formatDuration(next.durationSeconds)}` : ''}
          </p>

          <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
            <button
              onClick={onPlay}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-cream px-3 text-[12.5px] font-medium text-ink-950 transition-colors hover:bg-white"
            >
              <Play className="h-3.5 w-3.5 fill-current" /> Play now
            </button>
            <button
              onClick={onCancel}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[12.5px] text-cream-dim transition-colors hover:border-line-strong hover:text-cream"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';

import { watchRoomReactions } from '@/lib/db';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { RoomReaction } from '@/lib/types';

/* ==========================================================================
   Where the room reacted.

   Every reaction is already pinned to the second of the video it was sent at,
   which means a room that has watched something once carries a record of where
   it laughed. Plotted under the scrubber, that record becomes navigation: the
   tall part of the ribbon is the bit worth going back to.

   Buckets are sized in seconds rather than as a fixed count, so a four-minute
   video and a two-hour one both get bars wide enough to hit. Heights are
   normalised against the busiest bucket — the shape is what carries meaning,
   not the absolute counts, and a room of three people would otherwise draw a
   flat line.
   ========================================================================== */

const BUCKETS = 90;
const MIN_TO_SHOW = 3;

interface Props {
  roomId: string;
  duration: number;
  /** Seek, when this viewer is allowed to drive. */
  onSeek?(seconds: number): void;
}

export function ReactionRibbon({ roomId, duration, onSeek }: Props) {
  const [reactions, setReactions] = useState<RoomReaction[]>([]);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => watchRoomReactions(roomId, setReactions, 250), [roomId]);

  const { bars, peak } = useMemo(() => {
    if (duration <= 0 || reactions.length < MIN_TO_SHOW) {
      return { bars: [] as { count: number; emoji: string }[], peak: 0 };
    }

    const span = duration / BUCKETS;
    const tally = Array.from({ length: BUCKETS }, () => new Map<string, number>());

    for (const r of reactions) {
      if (!Number.isFinite(r.atSecond)) continue;
      const i = Math.min(BUCKETS - 1, Math.max(0, Math.floor(r.atSecond / span)));
      const bucket = tally[i];
      bucket.set(r.emoji, (bucket.get(r.emoji) ?? 0) + 1);
    }

    const bars = tally.map((bucket) => {
      let count = 0;
      let emoji = '';
      let best = 0;
      for (const [e, n] of bucket) {
        count += n;
        // The bar is labelled with whatever the room felt most of, there.
        if (n > best) { best = n; emoji = e; }
      }
      return { count, emoji };
    });

    return { bars, peak: Math.max(...bars.map((b) => b.count), 0) };
  }, [reactions, duration]);

  if (bars.length === 0 || peak === 0) return null;

  const span = duration / BUCKETS;

  return (
    <div className="mt-1.5">
      <div
        className="relative flex h-6 items-end gap-px"
        onMouseLeave={() => setHover(null)}
        role="group"
        aria-label="Where the room reacted"
      >
        {bars.map((bar, i) => {
          const height = bar.count === 0 ? 0 : 0.18 + 0.82 * (bar.count / peak);
          return (
            <button
              key={i}
              type="button"
              disabled={!onSeek || bar.count === 0}
              onMouseEnter={() => bar.count > 0 && setHover(i)}
              onFocus={() => bar.count > 0 && setHover(i)}
              onClick={() => onSeek?.(i * span)}
              // Empty buckets keep their slot so the ribbon stays aligned to
              // the scrubber above it, but draw nothing and take no clicks.
              aria-label={bar.count > 0 ? `${bar.count} at ${formatDuration(i * span)}` : undefined}
              tabIndex={bar.count > 0 && onSeek ? 0 : -1}
              className={cn(
                'group relative h-full flex-1 rounded-[1px]',
                onSeek && bar.count > 0 ? 'cursor-pointer' : 'cursor-default',
              )}
            >
              <motion.span
                className={cn(
                  'absolute bottom-0 left-0 right-0 rounded-[1px] transition-colors duration-200',
                  hover === i ? 'bg-flare' : 'bg-flare/35',
                )}
                initial={{ height: 0 }}
                animate={{ height: `${height * 100}%` }}
                transition={{ duration: 0.5, delay: Math.min(i, 40) * 0.006, ease: [0.16, 1, 0.3, 1] }}
              />
            </button>
          );
        })}

        {hover !== null && bars[hover] && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            // Clamped so the label never hangs off either end of the ribbon.
            style={{ left: `${Math.min(92, Math.max(8, ((hover + 0.5) / BUCKETS) * 100))}%` }}
            className="pointer-events-none absolute -top-8 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-ink-950/95 px-2 py-1 backdrop-blur-sm"
          >
            <span className="text-[12px]">{bars[hover].emoji}</span>
            <span className="ml-1.5 font-mono text-[10.5px] text-cream-dim tnum">
              {bars[hover].count}
            </span>
            <span className="ml-1.5 font-mono text-[10.5px] text-faint tnum">
              {formatDuration(hover * span)}
            </span>
          </motion.div>
        )}
      </div>

      <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-faint">
        Where the room reacted
      </p>
    </div>
  );
}

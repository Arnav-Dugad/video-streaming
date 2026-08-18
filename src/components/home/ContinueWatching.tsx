'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { Play, X } from 'lucide-react';

import { useAuth } from '@/components/providers/AuthProvider';
import { getContinueWatching, removeFromHistory } from '@/lib/db';
import { Thumbnail } from '@/components/ui/Thumbnail';
import { Rail, RailItem } from '@/components/video/Rail';
import { RailSkeleton } from '@/components/ui/Skeleton';
import { formatDuration } from '@/lib/format';
import type { HistoryEntry } from '@/lib/types';
import { toast } from '@/lib/store';

/** Only renders when there is something to resume — an empty "Continue
 *  watching" rail is worse than no rail. */
export function ContinueWatching() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    // Signed-out renders null below, so there is nothing to reset here.
    if (authLoading || !user) return;
    let alive = true;
    getContinueWatching(user.uid)
      .then((rows) => alive && setItems(rows))
      .catch(() => alive && setItems([]));
    return () => { alive = false; };
  }, [user, authLoading]);

  const dismiss = async (videoId: string) => {
    if (!user) return;
    const previous = items;
    setItems((rows) => rows?.filter((r) => r.videoId !== videoId) ?? null);
    try {
      await removeFromHistory(user.uid, videoId);
    } catch {
      setItems(previous ?? null);
      toast('Could not remove that', { tone: 'error' });
    }
  };

  if (!user || items === null) {
    return user ? <div className="gutter-wide py-8"><RailSkeleton count={4} /></div> : null;
  }
  if (items.length === 0) return null;

  return (
    <Rail
      eyebrow="Where you left off"
      title="Continue watching"
      href="/library?tab=history"
      hrefLabel="Full history"
      meta={`${items.length}`}
      className="py-10"
    >
      <AnimatePresence mode="popLayout">
        {items.map((entry) => {
          const pct = entry.durationSeconds > 0
            ? Math.min(100, (entry.progress / entry.durationSeconds) * 100)
            : 0;
          const remaining = Math.max(0, entry.durationSeconds - entry.progress);

          return (
            <motion.div
              key={entry.videoId}
              layout
              exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.24 } }}
              className="w-[clamp(15rem,26vw,20.5rem)] shrink-0 snap-start"
            >
              <RailItem className="w-full">
                <article className="group relative">
                  <Link href={`/watch?v=${entry.videoId}&t=${Math.floor(entry.progress)}`} data-cursor="Resume">
                    <div className="relative aspect-video w-full overflow-hidden rounded-card bg-ink-800 ring-1 ring-inset ring-cream/[0.06]">
                      <Thumbnail
                        src={entry.thumbnail}
                        alt={entry.title}
                        sizes="330px"
                        className="transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-ink-950/85 via-ink-950/10 to-transparent" />

                      <span className="absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-cream/95 opacity-0 transition-[opacity,transform] duration-400 group-hover:opacity-100 group-hover:scale-105">
                        <Play className="ml-0.5 h-4 w-4 fill-ink-950 text-ink-950" />
                      </span>

                      <span className="absolute bottom-2.5 right-2.5 rounded-md bg-ink-950/85 px-1.5 py-[3px] font-mono text-[10.5px] text-cream backdrop-blur-sm tnum">
                        {formatDuration(remaining)} left
                      </span>

                      <span className="absolute inset-x-0 bottom-0 h-[3px] bg-cream/20">
                        <span className="block h-full bg-flare shadow-[0_0_8px_rgba(255,74,46,0.6)]" style={{ width: `${pct}%` }} />
                      </span>
                    </div>
                  </Link>

                  <button
                    onClick={() => dismiss(entry.videoId)}
                    aria-label="Remove from Continue watching"
                    className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-ink-950/80 text-cream-dim opacity-0 backdrop-blur-sm transition-[opacity,background-color] duration-300 hover:bg-ink-950 hover:text-cream group-hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>

                  <Link href={`/watch?v=${entry.videoId}&t=${Math.floor(entry.progress)}`}>
                    <h3 className="clamp-2 mt-3 text-[13.5px] font-medium leading-snug text-cream">{entry.title}</h3>
                  </Link>
                  <p className="mt-1 truncate text-[12px] text-muted">{entry.channelTitle}</p>
                </article>
              </RailItem>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </Rail>
  );
}

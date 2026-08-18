'use client';

import { useState } from 'react';
import { motion } from 'motion/react';

import { VideoCard } from '@/components/video/VideoCard';
import { usePlayer } from '@/lib/store';
import { cn } from '@/lib/cn';
import type { Video } from '@/lib/types';

/** The queue rail. Autoplay is a toggle here rather than a buried setting,
 *  because it is the one preference people change constantly. */
export function UpNext({ videos }: { videos: Video[] }) {
  const [autoplay, setAutoplay] = useState(true);
  const setQueue = usePlayer((s) => s.setQueue);

  if (videos.length === 0) return null;

  return (
    <section aria-label="Up next">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Up next</p>
          <p className="mt-1 text-[12px] text-faint">
            Assembled from this video&apos;s topics and creator
          </p>
        </div>
        <button
          role="switch"
          aria-checked={autoplay}
          onClick={() => {
            const next = !autoplay;
            setAutoplay(next);
            setQueue(next ? videos.slice(0, 12) : []);
          }}
          className="flex shrink-0 items-center gap-2 text-[12px] text-muted transition-colors hover:text-cream"
        >
          Autoplay
          <span className={cn(
            'relative h-[18px] w-8 rounded-full transition-colors duration-300',
            autoplay ? 'bg-flare' : 'bg-ink-600',
          )}>
            <motion.span
              layout
              transition={{ type: 'spring', stiffness: 500, damping: 34 }}
              className={cn(
                'absolute top-[2px] h-[14px] w-[14px] rounded-full bg-cream',
                autoplay ? 'left-[16px]' : 'left-[2px]',
              )}
            />
          </span>
        </button>
      </header>

      <div className="flex flex-col gap-1">
        {videos.map((v) => <VideoCard key={v.id} video={v} layout="row" />)}
      </div>
    </section>
  );
}

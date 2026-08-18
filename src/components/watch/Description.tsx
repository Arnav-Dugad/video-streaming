'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ListTree } from 'lucide-react';

import { usePlayer } from '@/lib/store';
import { extractChapters, formatDate, parseDescription, compactNumber, formatDuration } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Video } from '@/lib/types';

/** Renders the description as safe segments — links and timestamps become
 *  interactive, everything else stays plain text. No HTML is ever injected. */
export function Description({ video }: { video: Video }) {
  const [open, setOpen] = useState(false);
  const requestSeek = usePlayer((s) => s.requestSeek);
  const isCurrent = usePlayer((s) => s.video?.id === video.id);

  const segments = parseDescription(video.description);
  const chapters = extractChapters(video.description, video.durationSeconds ?? 0);
  const seek = (seconds: number) => {
    if (!isCurrent) return;
    requestSeek(seconds);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="rounded-2xl border border-line bg-ink-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11.5px] text-cream-dim tnum">
        <span className="font-medium text-cream">{compactNumber(video.viewCount)} views</span>
        <span className="text-faint">·</span>
        <span>{formatDate(video.publishedAt)}</span>
        {video.likeCount ? (
          <><span className="text-faint">·</span><span>{compactNumber(video.likeCount)} likes</span></>
        ) : null}
      </div>

      <div className={cn('relative mt-3', !open && 'max-h-[4.6rem] overflow-hidden')}>
        <p className="whitespace-pre-wrap text-[13.5px] leading-[1.65] text-cream-dim">
          {segments.length === 0 && <span className="text-faint">No description provided.</span>}
          {segments.map((seg, i) => {
            if (seg.kind === 'link') {
              return (
                <a
                  key={i}
                  href={seg.href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-halo underline decoration-halo/30 underline-offset-2 transition-colors hover:decoration-halo"
                >
                  {seg.value}
                </a>
              );
            }
            if (seg.kind === 'timestamp') {
              return (
                <button
                  key={i}
                  onClick={() => seek(seg.seconds)}
                  className="font-mono text-flare underline decoration-flare/30 underline-offset-2 transition-colors hover:decoration-flare tnum"
                >
                  {seg.value}
                </button>
              );
            }
            return <span key={i}>{seg.value}</span>;
          })}
        </p>
        {!open && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-ink-900 to-transparent" />
        )}
      </div>

      {(video.description?.length ?? 0) > 180 && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted transition-colors hover:text-cream"
        >
          {open ? 'Show less' : 'Show more'}
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-300', open && 'rotate-180')} />
        </button>
      )}

      <AnimatePresence>
        {chapters.length > 0 && open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-5 border-t border-line pt-4">
              <p className="eyebrow mb-3 flex items-center gap-1.5">
                <ListTree className="h-3 w-3" /> {chapters.length} chapters
              </p>
              <ol className="grid gap-0.5 sm:grid-cols-2">
                {chapters.map((c) => (
                  <li key={c.seconds}>
                    <button
                      onClick={() => seek(c.seconds)}
                      className="group flex w-full items-baseline gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-cream/[0.05]"
                    >
                      <span className="shrink-0 font-mono text-[11px] text-flare tnum">
                        {formatDuration(c.seconds)}
                      </span>
                      <span className="truncate text-[13px] text-cream-dim transition-colors group-hover:text-cream">
                        {c.label}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

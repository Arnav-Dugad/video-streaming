'use client';

import { useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { ListTree, Play } from 'lucide-react';

import { usePlayer } from '@/lib/store';
import { extractChapters, formatDuration } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Video } from '@/lib/types';

/* ==========================================================================
   Chapter navigation.

   Chapters are a community convention, not an API field — a description line
   beginning with a timestamp. `extractChapters` only accepts a list that
   starts at zero, is strictly monotonic and has at least three marks, so a
   video that merely mentions "see 4:12" never sprouts a fake chapter panel.

   The active chapter tracks playback and scrolls itself into view, but only
   while the list is not being hovered — yanking the panel out from under
   someone's cursor mid-scan is the classic failure of an auto-scrolling list.
   ========================================================================== */

export function ChapterList({ video }: { video: Video }) {
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const isCurrent = usePlayer((s) => s.video?.id === video.id);
  const requestSeek = usePlayer((s) => s.requestSeek);

  const listRef = useRef<HTMLOListElement>(null);
  const hovering = useRef(false);

  const chapters = useMemo(
    () => extractChapters(video.description, video.durationSeconds ?? duration),
    [video.description, video.durationSeconds, duration],
  );

  const total = video.durationSeconds || duration || 0;

  const activeIndex = useMemo(() => {
    if (!isCurrent || chapters.length === 0) return -1;
    let found = -1;
    for (let i = 0; i < chapters.length; i++) {
      if (chapters[i].seconds <= position) found = i;
      else break;
    }
    return found;
  }, [chapters, position, isCurrent]);

  useEffect(() => {
    if (activeIndex < 0 || hovering.current) return;
    listRef.current
      ?.querySelector(`[data-chapter="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIndex]);

  if (chapters.length === 0) return null;

  const seek = (seconds: number) => {
    requestSeek(seconds);
    if (!isCurrent) return;
    // Bring the player back into view when jumping from far down the page.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-line" aria-label="Chapters">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <p className="eyebrow flex items-center gap-1.5">
          <ListTree className="h-3 w-3" /> Chapters
        </p>
        <span className="font-mono text-[10.5px] text-faint tnum">{chapters.length}</span>
      </header>

      <ol
        ref={listRef}
        className="max-h-[22rem] overflow-y-auto p-1.5"
        onMouseEnter={() => { hovering.current = true; }}
        onMouseLeave={() => { hovering.current = false; }}
      >
        {chapters.map((chapter, i) => {
          const next = chapters[i + 1]?.seconds ?? total;
          const length = Math.max(0, next - chapter.seconds);
          const active = i === activeIndex;

          // How far through this chapter playback is, for the fill behind it.
          const within = active && length > 0
            ? Math.max(0, Math.min(1, (position - chapter.seconds) / length))
            : 0;

          return (
            <li key={`${chapter.seconds}-${i}`} data-chapter={i}>
              <button
                onClick={() => seek(chapter.seconds)}
                aria-current={active}
                className={cn(
                  'group relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-left transition-colors',
                  active ? 'bg-flare/[0.09]' : 'hover:bg-cream/[0.05]',
                )}
              >
                {/* Progress through the current chapter, behind the text. */}
                {active && (
                  <motion.span
                    className="absolute inset-y-0 left-0 bg-flare/[0.10]"
                    style={{ width: `${within * 100}%` }}
                    aria-hidden
                  />
                )}

                <span
                  className={cn(
                    'relative grid h-7 w-7 shrink-0 place-items-center rounded-lg font-mono text-[10px] tnum transition-colors',
                    active ? 'bg-flare text-white' : 'bg-ink-800 text-muted group-hover:text-cream',
                  )}
                >
                  {active
                    ? <Play className="h-3 w-3 fill-current" />
                    : String(i + 1).padStart(2, '0')}
                </span>

                <span className="relative min-w-0 flex-1">
                  <span
                    className={cn(
                      'clamp-2 block text-[13px] leading-snug transition-colors',
                      active ? 'font-medium text-cream' : 'text-cream-dim group-hover:text-cream',
                    )}
                  >
                    {chapter.label}
                  </span>
                </span>

                <span className="relative shrink-0 text-right">
                  <span className={cn('block font-mono text-[11px] tnum', active ? 'text-flare' : 'text-faint')}>
                    {formatDuration(chapter.seconds)}
                  </span>
                  {length > 0 && (
                    <span className="block font-mono text-[9.5px] text-faint/70 tnum">
                      {formatDuration(length)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

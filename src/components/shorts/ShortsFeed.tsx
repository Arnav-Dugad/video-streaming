'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

import { ShortCard } from './ShortCard';
import { EmptyState } from '@/components/ui/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { useSearchDefaults } from '@/hooks/usePreferences';
import { useKeyboard } from '@/hooks/useKeyboard';
import { cn } from '@/lib/cn';
import type { Video } from '@/lib/types';

/* ==========================================================================
   The reel.

   A native scroll-snap column, not a JS carousel: trackpad, touch, keyboard
   and the scrollbar all behave the way the platform already does, and momentum
   scrolling on iOS stays intact.

   Which card is "active" — and therefore the only one with a live player — is
   decided by an IntersectionObserver against the scroll container rather than
   by scroll maths, so it stays correct through fling scrolling, resizes and
   keyboard jumps alike.
   ========================================================================== */

const LOAD_AHEAD = 4;

export function ShortsFeed({ initial, seeds }: { initial: Video[]; seeds: string[] }) {
  const [videos, setVideos] = useState<Video[]>(initial);
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [loading, setLoading] = useState(false);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const exhausted = useRef(false);
  const searchDefaults = useSearchDefaults();

  /* ---------------------------- which is active -------------------------- */

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;

    const io = new IntersectionObserver(
      (entries) => {
        // The most-visible card wins, so a half-scrolled position never leaves
        // two players live or none.
        const best = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!best) return;
        const next = Number((best.target as HTMLElement).dataset.index);
        if (!Number.isNaN(next)) setIndex(next);
      },
      { root, threshold: [0.5, 0.75, 0.95] },
    );

    root.querySelectorAll('[data-index]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [videos.length]);

  /* ------------------------------ paging --------------------------------- */

  const go = useCallback((delta: number) => {
    const root = scrollerRef.current;
    if (!root) return;
    const target = Math.max(0, Math.min(videos.length - 1, index + delta));
    root.querySelector(`[data-index="${target}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [index, videos.length]);

  useKeyboard([
    { key: 'arrowdown', run: () => go(1) },
    { key: 'arrowup', run: () => go(-1) },
    { key: 'j', run: () => go(1) },
    { key: 'k', run: () => go(-1) },
    { key: 'm', run: () => setMuted((v) => !v) },
  ], videos.length > 0);

  /* ------------------------------ more ----------------------------------- */

  useEffect(() => {
    if (exhausted.current || loading) return;
    if (index < videos.length - LOAD_AHEAD) return;

    const controller = new AbortController();
    // Deferred so this is not a synchronous setState inside the effect body,
    // which would cascade a render before the first has painted.
    queueMicrotask(() => !controller.signal.aborted && setLoading(true));
    // Rotate the seed so a long session keeps widening rather than looping
    // through the same five subjects.
    const seed = seeds[Math.floor(videos.length / 8) % seeds.length];
    const qs = new URLSearchParams({ q: seed, limit: '12', duration: 'short', order: 'viewCount', ...searchDefaults });

    fetch(`/api/search?${qs}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d: { items?: Video[] }) => {
        const seen = new Set(videos.map((v) => v.id));
        const fresh = (d.items ?? []).filter(
          (v) => !seen.has(v.id) && (v.durationSeconds ?? 0) <= 245,
        );
        if (fresh.length === 0) exhausted.current = true;
        else setVideos((prev) => [...prev, ...fresh]);
        setLoading(false);
      })
      .catch((err: Error) => { if (err.name !== 'AbortError') { exhausted.current = true; setLoading(false); } });

    return () => controller.abort();
  }, [index, videos, loading, seeds, searchDefaults]);

  const advance = useCallback(() => go(1), [go]);

  if (videos.length === 0) {
    return (
      <div className="gutter-wide py-20">
        <EmptyState
          title="No shorts right now"
          body="Short-form results came back empty. This is the API's under-four-minutes filter, not YouTube's Shorts shelf — that shelf has no public endpoint."
          action={<ButtonLink href="/trending" size="sm">See what is trending</ButtonLink>}
        />
      </div>
    );
  }

  return (
    <div className="gutter-wide py-4">
      <div className="relative mx-auto w-full max-w-[26rem]">
        <div
          ref={scrollerRef}
          className="no-scrollbar h-[calc(100svh-7rem)] snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-2xl"
          tabIndex={0}
          aria-label="Shorts reel"
        >
          {videos.map((video, i) => (
            <div
              key={video.id}
              data-index={i}
              className="h-full w-full snap-start snap-always pb-3 last:pb-0"
            >
              <ShortCard
                video={video}
                // Only the visible card gets a player; the rest are stills.
                active={i === index}
                muted={muted}
                onToggleMuted={() => setMuted((v) => !v)}
                onEnded={advance}
              />
            </div>
          ))}

          {loading && (
            <div className="grid h-24 place-items-center">
              <Loader2 className="h-4 w-4 animate-spin text-flare" />
            </div>
          )}
        </div>

        {/* Desktop paging. Hidden on touch, where the gesture is the control. */}
        <div className="pointer-events-none absolute -right-14 top-1/2 hidden -translate-y-1/2 flex-col gap-2 lg:flex">
          <PageButton dir={-1} disabled={index === 0} onClick={() => go(-1)} />
          <PageButton dir={1} disabled={index >= videos.length - 1} onClick={() => go(1)} />
        </div>
      </div>

      <p className="mx-auto mt-3 max-w-[26rem] text-center font-mono text-[10.5px] text-faint">
        {index + 1} / {videos.length} · ↑↓ to move · M for sound
      </p>
    </div>
  );
}

function PageButton({ dir, disabled, onClick }: { dir: -1 | 1; disabled: boolean; onClick(): void }) {
  const Icon = dir === -1 ? ChevronUp : ChevronDown;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === -1 ? 'Previous short' : 'Next short'}
      className={cn(
        'pointer-events-auto grid h-10 w-10 place-items-center rounded-full border border-line-strong text-cream-dim',
        'transition-[opacity,background-color,color] duration-300 hover:bg-cream/10 hover:text-cream',
        disabled && 'pointer-events-none opacity-25',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

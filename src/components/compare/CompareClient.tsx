'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import {
  Link2, Link2Off, Pause, Play, Plus, RotateCcw, RotateCw, SplitSquareHorizontal,
} from 'lucide-react';

import { ComparePane, type PaneHandle } from './ComparePane';
import { PageHeader, EmptyState } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { extractVideoId } from '@/lib/video-id';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/cn';
import { toast } from '@/lib/store';
import type { Video } from '@/lib/types';

/* ==========================================================================
   Compare mode.

   Two players, one transport. The interesting part is the offset: two
   recordings of the same thing almost never start at the same moment — a
   remake has a longer cold open, one concert upload includes the walk-on — so
   locking them at t=0 lines up nothing. The offset is what makes the lock
   useful, and it is adjustable while playing.

   Exactly one side is audible at a time. Two soundtracks at once is not a
   comparison, it is noise.
   ========================================================================== */

const NUDGES = [-10, -5, -1, 1, 5, 10];

interface Props {
  initialA: Video | null;
  initialB: Video | null;
}

export function CompareClient({ initialA, initialB }: Props) {
  const router = useRouter();

  const [a, setA] = useState<Video | null>(initialA);
  const [b, setB] = useState<Video | null>(initialB);
  const [linked, setLinked] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [offset, setOffset] = useState(0);
  const [audio, setAudio] = useState<'a' | 'b'>('a');

  const handleA = useRef<PaneHandle | null>(null);
  const handleB = useRef<PaneHandle | null>(null);

  const onReadyA = useCallback((h: PaneHandle) => { handleA.current = h; }, []);
  const onReadyB = useCallback((h: PaneHandle) => { handleB.current = h; }, []);

  /* ----------------------------- transport ------------------------------ */

  const both = useCallback((fn: (h: PaneHandle) => void, onlyLinked = true) => {
    if (handleA.current) fn(handleA.current);
    if (handleB.current && (linked || !onlyLinked)) fn(handleB.current);
  }, [linked]);

  const toggle = useCallback(() => {
    const next = !playing;
    setPlaying(next);
    both((h) => (next ? h.play() : h.pause()), false);
  }, [playing, both]);

  const seekTo = useCallback((seconds: number) => {
    handleA.current?.seek(seconds);
    if (linked) handleB.current?.seek(seconds + offset);
  }, [linked, offset]);

  const nudge = useCallback((delta: number) => {
    const now = handleA.current?.time() ?? 0;
    seekTo(now + delta);
  }, [seekTo]);

  /* Re-align B whenever the offset changes, so dragging the offset while
     paused shows the effect immediately rather than on the next seek. */
  useEffect(() => {
    if (!linked) return;
    const now = handleA.current?.time();
    if (typeof now === 'number') handleB.current?.seek(now + offset);
  }, [offset, linked]);

  /* A locked pair drifts: two players buffer independently, so after a few
     minutes they are seconds apart. Nudging B back onto A's clock once a
     second is imperceptible and keeps the lock honest. */
  useEffect(() => {
    if (!linked || !playing) return;
    const id = setInterval(() => {
      const ta = handleA.current?.time();
      const tb = handleB.current?.time();
      if (typeof ta !== 'number' || typeof tb !== 'number') return;
      if (Math.abs(tb - (ta + offset)) > 0.7) handleB.current?.seek(ta + offset);
    }, 1000);
    return () => clearInterval(id);
  }, [linked, playing, offset]);

  /* ------------------------------ picking ------------------------------- */

  const [pasteA, setPasteA] = useState('');
  const [pasteB, setPasteB] = useState('');
  const [loadingSide, setLoadingSide] = useState<'a' | 'b' | null>(null);

  const pick = async (side: 'a' | 'b', raw: string) => {
    const id = extractVideoId(raw);
    if (!id) { toast('Paste a YouTube link or a video id', { tone: 'error' }); return; }

    setLoadingSide(side);
    try {
      const res = await fetch(`/api/videos?ids=${id}`);
      const data = (await res.json()) as { items?: Video[] };
      const video = data.items?.[0];
      if (!video) { toast('Could not find that video', { tone: 'error' }); return; }

      if (side === 'a') { setA(video); setPasteA(''); } else { setB(video); setPasteB(''); }
      // Keep the URL shareable — a comparison is worth sending to someone.
      const next = new URLSearchParams();
      const nextA = side === 'a' ? video.id : a?.id;
      const nextB = side === 'b' ? video.id : b?.id;
      if (nextA) next.set('a', nextA);
      if (nextB) next.set('b', nextB);
      router.replace(`/compare?${next}`, { scroll: false });
    } catch {
      toast('Could not load that video', { tone: 'error' });
    } finally {
      setLoadingSide(null);
    }
  };

  const clear = (side: 'a' | 'b') => {
    if (side === 'a') { setA(null); handleA.current = null; } else { setB(null); handleB.current = null; }
    const next = new URLSearchParams();
    const nextA = side === 'a' ? undefined : a?.id;
    const nextB = side === 'b' ? undefined : b?.id;
    if (nextA) next.set('a', nextA);
    if (nextB) next.set('b', nextB);
    router.replace(next.toString() ? `/compare?${next}` : '/compare', { scroll: false });
  };

  const ready = Boolean(a && b);

  return (
    <>
      <PageHeader
        eyebrow="Two at once"
        title="Compare"
        lede="Two reviews of the same thing, two angles of the same concert, a remake beside the original. Lock them together and set an offset so they actually line up."
      />

      <div className="gutter-wide pb-16">
        <div className="grid gap-5 lg:grid-cols-2">
          {a ? (
            <ComparePane
              video={a}
              label="A"
              audible={audio === 'a'}
              onToggleAudio={() => setAudio('a')}
              onClear={() => clear('a')}
              onReady={onReadyA}
            />
          ) : (
            <SlotPicker
              label="A"
              value={pasteA}
              loading={loadingSide === 'a'}
              onChange={setPasteA}
              onSubmit={() => pick('a', pasteA)}
            />
          )}

          {b ? (
            <ComparePane
              video={b}
              label="B"
              audible={audio === 'b'}
              onToggleAudio={() => setAudio('b')}
              onClear={() => clear('b')}
              onReady={onReadyB}
            />
          ) : (
            <SlotPicker
              label="B"
              value={pasteB}
              loading={loadingSide === 'b'}
              onChange={setPasteB}
              onSubmit={() => pick('b', pasteB)}
            />
          )}
        </div>

        {/* ---------------------------- transport --------------------------- */}
        {ready && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 rounded-2xl border border-line bg-ink-850/60 p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={toggle} size="md">
                {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
                {playing ? 'Pause both' : 'Play both'}
              </Button>

              <Button onClick={() => nudge(-10)} variant="outline" size="md">
                <RotateCcw className="h-4 w-4" /> 10s
              </Button>
              <Button onClick={() => nudge(10)} variant="outline" size="md">
                <RotateCw className="h-4 w-4" /> 10s
              </Button>
              <Button onClick={() => seekTo(0)} variant="ghost" size="md">Restart</Button>

              <button
                onClick={() => setLinked((v) => !v)}
                aria-pressed={linked}
                className={cn(
                  'ml-auto inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-[13px] font-medium transition-[background-color,border-color,color]',
                  linked
                    ? 'border-flare/45 bg-flare/12 text-flare'
                    : 'border-line text-cream-dim hover:border-line-strong hover:text-cream',
                )}
              >
                {linked ? <Link2 className="h-4 w-4" /> : <Link2Off className="h-4 w-4" />}
                {linked ? 'Locked together' : 'Independent'}
              </button>
            </div>

            {/* ----------------------------- offset -------------------------- */}
            <div className={cn('mt-5 transition-opacity duration-300', !linked && 'pointer-events-none opacity-35')}>
              <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-3">
                <p className="text-[13px] text-cream">
                  B starts{' '}
                  <span className="font-mono text-flare tnum">
                    {offset === 0 ? 'at the same moment' : `${offset > 0 ? '+' : ''}${formatDuration(Math.abs(offset))} ${offset > 0 ? 'later' : 'earlier'}`}
                  </span>
                </p>
                <p className="text-[11.5px] text-muted">
                  Two uploads of the same thing rarely start together — this is what makes the lock useful.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {NUDGES.map((n) => (
                  <button
                    key={n}
                    onClick={() => setOffset((o) => o + n)}
                    className="rounded-lg border border-line px-2.5 py-1.5 font-mono text-[11.5px] text-cream-dim transition-colors hover:border-line-strong hover:text-cream"
                  >
                    {n > 0 ? `+${n}s` : `${n}s`}
                  </button>
                ))}
                {offset !== 0 && (
                  <button
                    onClick={() => setOffset(0)}
                    className="rounded-lg px-2.5 py-1.5 text-[11.5px] text-muted transition-colors hover:text-flare"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            <p className="mt-4 text-[11.5px] leading-relaxed text-faint">
              Sound comes from {audio === 'a' ? 'A' : 'B'} only — tap the speaker on either
              pane to switch. Two soundtracks at once is not a comparison.
            </p>
          </motion.div>
        )}

        {!ready && (
          <div className="mt-8">
            <EmptyState
              icon={<SplitSquareHorizontal className="h-6 w-6" />}
              title="Drop two videos in"
              body="Paste a YouTube link into each side. The URL updates as you go, so a comparison can be shared."
            />
          </div>
        )}
      </div>
    </>
  );
}

function SlotPicker({
  label, value, loading, onChange, onSubmit,
}: {
  label: string; value: string; loading: boolean;
  onChange(v: string): void; onSubmit(): void;
}) {
  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 rounded-card border border-dashed border-line p-6">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">
        Side {label}
      </span>
      <div className="flex w-full max-w-sm gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
          placeholder="Paste a YouTube link"
          aria-label={`Video for side ${label}`}
          className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-ink-850 px-3.5 text-[13px] text-cream outline-none transition-colors placeholder:text-faint focus:border-flare/60"
        />
        <Button onClick={onSubmit} loading={loading} size="md" className="shrink-0">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

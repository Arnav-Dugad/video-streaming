'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Volume2, VolumeX, X } from 'lucide-react';

import { loadYouTubeApi, PlayerState, type YTPlayer } from '@/hooks/useYouTubeApi';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Video } from '@/lib/types';

/* ==========================================================================
   One side of a comparison.

   Each pane owns its player and exposes it upward through `onReady`, so the
   parent can drive both from one transport without either pane knowing the
   other exists.
   ========================================================================== */

export interface PaneHandle {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  time(): number;
  duration(): number;
  setMuted(muted: boolean): void;
  setRate(rate: number): void;
}

interface Props {
  video: Video;
  label: string;
  audible: boolean;
  onToggleAudio(): void;
  onClear(): void;
  onReady(handle: PaneHandle): void;
  onEnded?(): void;
}

export function ComparePane({ video, label, audible, onToggleAudio, onClear, onReady, onEnded }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [position, setPosition] = useState(0);

  // Handlers are bound once at construction, so the live callbacks are read
  // through a ref rather than closed over.
  const callbacks = useRef({ onReady, onEnded });
  useEffect(() => { callbacks.current = { onReady, onEnded }; }, [onReady, onEnded]);

  useEffect(() => {
    if (!mountRef.current) return;
    let cancelled = false;

    const host = document.createElement('div');
    host.style.width = '100%';
    host.style.height = '100%';
    mountRef.current.appendChild(host);

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        playerRef.current = new YT.Player(host, {
          videoId: video.id,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: 0, controls: 0, modestbranding: 1, rel: 0,
            playsinline: 1, disablekb: 1, iv_load_policy: 3,
            origin: window.location.origin,
          },
          events: {
            onReady: (e: { target: YTPlayer }) => {
              if (cancelled) return;
              setReady(true);
              const p = e.target;
              callbacks.current.onReady({
                play: () => p.playVideo(),
                pause: () => p.pauseVideo(),
                seek: (s) => p.seekTo(Math.max(0, s), true),
                time: () => { try { return p.getCurrentTime(); } catch { return 0; } },
                duration: () => { try { return p.getDuration(); } catch { return 0; } },
                setMuted: (m) => (m ? p.mute() : p.unMute()),
                setRate: (r) => p.setPlaybackRate(r),
              });
            },
            onStateChange: (e: { data: number }) => {
              if (!cancelled && e.data === PlayerState.ENDED) callbacks.current.onEnded?.();
            },
          },
        }) as YTPlayer;
      })
      .catch(() => { /* the pane shows its still and the error is visible */ });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [video.id]);

  useEffect(() => {
    const id = setInterval(() => {
      const p = playerRef.current;
      if (!p?.getCurrentTime) return;
      try { setPosition(p.getCurrentTime()); } catch { /* torn down */ }
    }, 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const p = playerRef.current;
    if (!p || !ready) return;
    // Exactly one side is audible at a time, or the two tracks fight.
    try { if (audible) p.unMute(); else p.mute(); } catch { /* not ready */ }
  }, [audible, ready]);

  return (
    <div className="min-w-0">
      <div className="relative aspect-video w-full overflow-hidden rounded-card bg-black ring-1 ring-inset ring-cream/[0.06]">
        <div ref={mountRef} className="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:border-0" />

        {!ready && (
          <div className="absolute inset-0 grid place-items-center bg-ink-900">
            <Loader2 className="h-5 w-5 animate-spin text-flare" />
          </div>
        )}

        <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-ink-950/85 px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-cream backdrop-blur-sm">
          {label}
        </span>

        <div className="absolute right-3 top-3 flex gap-1.5">
          <button
            onClick={onToggleAudio}
            aria-label={audible ? `Mute ${label}` : `Listen to ${label}`}
            aria-pressed={audible}
            className={cn(
              'grid h-8 w-8 place-items-center rounded-lg backdrop-blur-sm transition-colors',
              audible ? 'bg-flare text-white' : 'bg-ink-950/80 text-cream-dim hover:text-cream',
            )}
          >
            {audible ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={onClear}
            aria-label={`Remove ${label}`}
            className="grid h-8 w-8 place-items-center rounded-lg bg-ink-950/80 text-cream-dim backdrop-blur-sm transition-colors hover:text-flare"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <span className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-ink-950/85 px-2 py-1 font-mono text-[11px] text-cream backdrop-blur-sm tnum">
          {formatDuration(position)}
          <span className="mx-1 text-faint">/</span>
          <span className="text-faint">{formatDuration(video.durationSeconds ?? 0)}</span>
        </span>
      </div>

      <h2 className="clamp-2 mt-3 text-[13.5px] font-medium leading-snug text-cream">{video.title}</h2>
      <p className="mt-1 truncate text-[12px] text-muted">{video.channelTitle}</p>
    </div>
  );
}

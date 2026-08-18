'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { animate, motion, useMotionValue } from 'motion/react';
import { Maximize2, Minimize2, X, SkipForward } from 'lucide-react';

import { loadYouTubeApi, PlayerState, type YTPlayer } from '@/hooks/useYouTubeApi';
import { usePlayer, type Rect } from '@/lib/store';
import { useAuth } from '@/components/providers/AuthProvider';
import { historyEntryFrom, recordProgress } from '@/lib/db';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useAmbientPalette } from '@/hooks/useAmbientPalette';
import { PlayerControls } from './PlayerControls';
import { cn } from '@/lib/cn';

/* ==========================================================================
   The single player instance for the whole application.

   Mounted once at the root. It positions itself over whatever inline slot the
   current page publishes, and flies to a corner dock when that slot goes away
   — which is what happens the moment you navigate off /watch. The iframe is
   never unmounted in between, so audio never stutters and the video never
   reloads or restarts.

   Positioning uses motion values written two different ways on purpose:
     · mode change  -> spring-animated (the dock/undock flight)
     · slot movement -> written instantly (scrolling must not lag by a frame)
   Springing during scroll is the thing that makes these players feel broken.
   ========================================================================== */

const DOCK_WIDTH = 384;
const DOCK_MARGIN = 20;
const DOCK_BOTTOM = 20;

function dockRect(mobile: boolean): Rect {
  if (typeof window === 'undefined') return { top: 0, left: 0, width: DOCK_WIDTH, height: 216 };
  if (mobile) {
    const width = window.innerWidth - DOCK_MARGIN * 2;
    const height = width * (9 / 16);
    return { top: window.innerHeight - height - DOCK_BOTTOM - 56, left: DOCK_MARGIN, width, height };
  }
  const width = Math.min(DOCK_WIDTH, window.innerWidth - DOCK_MARGIN * 2);
  const height = width * (9 / 16);
  return {
    top: window.innerHeight - height - DOCK_BOTTOM,
    left: window.innerWidth - width - DOCK_MARGIN,
    width,
    height,
  };
}

function theatreRect(): Rect {
  if (typeof window === 'undefined') return { top: 0, left: 0, width: 0, height: 0 };
  return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
}

export function PlayerHost() {
  const router = useRouter();
  const pathname = usePathname();
  const mobile = useIsMobile();
  const { user, profile } = useAuth();

  const video = usePlayer((s) => s.video);
  const slot = usePlayer((s) => s.slot);
  const mode = usePlayer((s) => s.mode);
  const ambient = usePlayer((s) => s.ambient);
  const setMode = usePlayer((s) => s.setMode);
  const setPlaying = usePlayer((s) => s.setPlaying);
  const setProgress = usePlayer((s) => s.setProgress);
  const setReady = usePlayer((s) => s.setReady);
  const close = usePlayer((s) => s.close);

  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const currentId = useRef<string | null>(null);
  // Keyed by video id so an error on one video never leaks onto the next —
  // which is what an effect-based reset was doing before.
  const [apiError, setApiError] = useState<{ videoId: string; message: string } | null>(null);
  const [dockHover, setDockHover] = useState(false);

  // Only extracted while it will actually be shown — the glow is inline-only.
  const palette = useAmbientPalette(
    video?.thumbnailHq || video?.thumbnail,
    ambient && mode === 'inline',
  );

  // Saved preferences only exist once the profile has loaded, which is after
  // the store has already been initialised with its defaults.
  useEffect(() => {
    if (!profile) return;
    const s = usePlayer.getState();
    s.setAmbient(profile.preferences.ambientGlow);
    if (profile.preferences.defaultQuality) {
      s.setQuality(profile.preferences.defaultQuality, s.actualQuality);
    }
  }, [profile]);

  /* --------------------------- positioning ------------------------------ */

  const top = useMotionValue(0);
  const left = useMotionValue(0);
  const width = useMotionValue(0);
  const height = useMotionValue(0);
  const radius = useMotionValue(14);
  const lastMode = useRef<string>('');
  const positioned = useRef(false);

  const applyRect = useCallback(
    (r: Rect, animated: boolean, corner: number) => {
      const pairs: [ReturnType<typeof useMotionValue<number>>, number][] = [
        [top, r.top], [left, r.left], [width, r.width], [height, r.height], [radius, corner],
      ];
      for (const [mv, target] of pairs) {
        if (animated) animate(mv, target, { type: 'spring', stiffness: 260, damping: 30, mass: 0.85 });
        else mv.set(target);
      }
    },
    [top, left, width, height, radius],
  );

  useEffect(() => {
    if (!video) return;

    const compute = (): { rect: Rect; corner: number } => {
      if (mode === 'theatre') return { rect: theatreRect(), corner: 0 };
      if (mode === 'inline' && slot) return { rect: slot, corner: 14 };
      return { rect: dockRect(mobile), corner: 12 };
    };

    const { rect, corner } = compute();
    const modeChanged = lastMode.current !== mode;
    // First paint should land in place, not fly in from 0,0.
    applyRect(rect, positioned.current && modeChanged, corner);
    lastMode.current = mode;
    positioned.current = true;
  }, [video, mode, slot, mobile, applyRect]);

  // The dock is viewport-anchored, so it has to follow window resizes itself.
  useEffect(() => {
    if (mode !== 'docked' && mode !== 'theatre') return;
    const onResize = () => applyRect(mode === 'theatre' ? theatreRect() : dockRect(mobile), false, mode === 'theatre' ? 0 : 12);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [mode, mobile, applyRect]);

  /* ------------------------------ actions ------------------------------- */

  const handleEnded = useCallback(() => {
    const s = usePlayer.getState();
    if (user && s.video) {
      recordProgress(user.uid, historyEntryFrom(s.video, s.video.durationSeconds ?? s.duration)).catch(() => {});
    }
    const next = s.playNext();
    if (next && pathname === '/watch') {
      router.push(`/watch?v=${next.id}`);
    }
  }, [pathname, router, user]);

  const api = useCallback(() => playerRef.current, []);

  /* ------------------------- player lifecycle --------------------------- */

  useEffect(() => {
    if (!video || !mountRef.current) return;
    let cancelled = false;

    // Already running: swap the source rather than rebuilding the player.
    if (playerRef.current && currentId.current !== video.id) {
      const startAt = usePlayer.getState().consumeSeek() ?? 0;
      playerRef.current.loadVideoById({ videoId: video.id, startSeconds: startAt });
      currentId.current = video.id;
      return;
    }
    if (playerRef.current) return;

    // YT replaces the element it is given with an iframe, so hand it a node
    // React does not own. Letting React manage it causes removeChild crashes.
    const host = document.createElement('div');
    host.style.width = '100%';
    host.style.height = '100%';
    mountRef.current.appendChild(host);

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        const startAt = usePlayer.getState().consumeSeek() ?? 0;

        playerRef.current = new YT.Player(host, {
          videoId: video.id,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: 1,
            // Our own controls are drawn on top; YouTube's are always hidden.
            controls: 0,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            iv_load_policy: 3,
            disablekb: 1,
            enablejsapi: 1,
            start: Math.floor(startAt),
            origin: window.location.origin,
          },
          events: {
            onReady: (e: { target: YTPlayer }) => {
              if (cancelled) return;
              currentId.current = video.id;
              const s = usePlayer.getState();
              e.target.setVolume(s.volume);
              if (s.muted) e.target.mute();
              setReady(true);
              e.target.playVideo();
            },
            onStateChange: (e: { data: number; target: YTPlayer }) => {
              if (cancelled) return;
              if (e.data === PlayerState.PLAYING) setPlaying(true);
              if (e.data === PlayerState.PAUSED) setPlaying(false);
              if (e.data === PlayerState.ENDED) {
                setPlaying(false);
                handleEnded();
              }
            },
            onError: () => {
              setApiError({
                videoId: video.id,
                message: 'This video cannot be played here. The owner may have disabled embedding.',
              });
            },
          },
        }) as YTPlayer;
      })
      .catch((err: Error) => !cancelled && setApiError({ videoId: video.id, message: err.message }));

    return () => { cancelled = true; };
    // The player is deliberately rebuilt only when the video identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.id]);

  // Tear the player down only when playback is genuinely finished with.
  useEffect(() => {
    if (video) return;
    playerRef.current?.destroy();
    playerRef.current = null;
    currentId.current = null;
    positioned.current = false;
    if (mountRef.current) mountRef.current.innerHTML = '';
  }, [video]);

  /* --------------------------- progress loop ---------------------------- */

  const lastWrite = useRef(0);

  useEffect(() => {
    if (!video) return;

    const id = setInterval(() => {
      const p = playerRef.current;
      if (!p?.getCurrentTime) return;
      let position = 0;
      let duration = 0;
      let buffered = 0;
      try {
        position = p.getCurrentTime();
        duration = p.getDuration();
        buffered = p.getVideoLoadedFraction();
      } catch { return; }
      if (!Number.isFinite(position)) return;

      setProgress(position, duration || video.durationSeconds || 0, buffered);

      // Persist watch position at most once every 8s, and only while actually
      // playing — otherwise a paused tab writes to Firestore forever.
      const now = Date.now();
      if (user && usePlayer.getState().playing && position > 5 && now - lastWrite.current > 8000) {
        lastWrite.current = now;
        recordProgress(
          user.uid,
          historyEntryFrom({ ...video, durationSeconds: duration || video.durationSeconds }, position),
        ).catch(() => { /* offline or rules — resumes on the next tick */ });
      }
    }, 250);

    return () => clearInterval(id);
  }, [video, user, setProgress]);

  // Flush the final position when the tab goes away.
  useEffect(() => {
    if (!video || !user) return;
    const flush = () => {
      const p = playerRef.current;
      if (!p?.getCurrentTime) return;
      try {
        const position = p.getCurrentTime();
        if (position > 5) {
          recordProgress(user.uid, historyEntryFrom(video, position)).catch(() => {});
        }
      } catch { /* player already gone */ }
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [video, user]);

  /* ------------------------------- render ------------------------------- */

  if (!video) return null;

  const docked = mode === 'docked';
  const theatre = mode === 'theatre';

  return (
    <>
      {/* Theatre backdrop */}
      {theatre && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] bg-ink-950"
          onClick={() => setMode(slot ? 'inline' : 'docked')}
        />
      )}

      <motion.div
        style={{ top, left, width, height, borderRadius: radius }}
        className={cn(
          'fixed z-[80] overflow-hidden bg-black',
          docked && 'shadow-float ring-1 ring-line-strong',
        )}
        onMouseEnter={() => setDockHover(true)}
        onMouseLeave={() => setDockHover(false)}
      >
        {/* Ambient glow. Three radial gradients built from the frame's own
            dominant colours, rather than a blurred copy of the bitmap —
            same effect, a fraction of the compositor cost, and the colours can
            transition between videos instead of cross-fading two images.
            Inline only: noise in a corner dock, pointless in theatre. */}
        {ambient && mode === 'inline' && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -inset-28 -z-10 animate-[drift_26s_ease-in-out_infinite_alternate]"
            initial={false}
            animate={{ opacity: palette.ready ? 0.5 : 0.32 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            style={{
              background:
                `radial-gradient(38% 46% at 22% 28%, ${palette.colors[0]} 0%, transparent 68%),` +
                `radial-gradient(42% 40% at 78% 32%, ${palette.colors[1]} 0%, transparent 66%),` +
                `radial-gradient(46% 48% at 50% 82%, ${palette.colors[2]} 0%, transparent 70%)`,
              filter: 'blur(56px)',
              // Colour transitions are cheap; re-blurring a bitmap is not.
              transition: 'background 900ms ease-out',
            }}
          />
        )}

        <div ref={mountRef} className="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:border-0" />

        {apiError?.videoId === video.id && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-ink-900/95 p-6 text-center">
            <div className="max-w-sm">
              <p className="text-sm text-cream">{apiError.message}</p>
              <a
                href={`https://www.youtube.com/watch?v=${video.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-[13px] text-flare underline underline-offset-4"
              >
                Open on YouTube
              </a>
            </div>
          </div>
        )}

        {/* Docked chrome: a compact strip, distinct from the full control bar. */}
        {docked ? (
          <div
            className={cn(
              'absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-ink-950/90 via-transparent to-ink-950/70',
              'transition-opacity duration-300',
              dockHover ? 'opacity-100' : 'opacity-0',
            )}
          >
            <div className="flex items-start justify-between gap-2 p-2">
              <p className="clamp-2 flex-1 px-1 pt-0.5 text-[11.5px] font-medium leading-tight text-cream">
                {video.title}
              </p>
              <div className="flex shrink-0 gap-1">
                <DockButton label="Expand" onClick={() => router.push(`/watch?v=${video.id}`)}>
                  <Maximize2 className="h-3.5 w-3.5" />
                </DockButton>
                <DockButton label="Close player" onClick={close}>
                  <X className="h-3.5 w-3.5" />
                </DockButton>
              </div>
            </div>
            <PlayerControls api={api} compact />
          </div>
        ) : (
          <PlayerControls api={api} onExitTheatre={theatre ? () => setMode(slot ? 'inline' : 'docked') : undefined} />
        )}
      </motion.div>
    </>
  );
}

function DockButton({ children, label, onClick }: { children: React.ReactNode; label: string; onClick(): void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-6 w-6 place-items-center rounded-md bg-ink-950/70 text-cream-dim backdrop-blur-sm transition-colors hover:bg-ink-950 hover:text-cream"
    >
      {children}
    </button>
  );
}

export { SkipForward, Minimize2 };

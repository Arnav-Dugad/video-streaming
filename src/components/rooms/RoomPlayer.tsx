'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from 'lucide-react';

import { loadYouTubeApi, PlayerState, type YTPlayer } from '@/hooks/useYouTubeApi';
import { syncRoomPlayback } from '@/lib/db';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Room } from '@/lib/types';

/* ==========================================================================
   Synced playback.

   One authority: the host. The host's player writes {playing, position} to the
   room document on every transport action and on a 4s heartbeat. Guests hold a
   read-only player that follows.

   Drift correction has a deliberate dead zone. Seeking a guest on every tiny
   difference produces a permanent stutter, because a seek itself costs time.
   Guests only re-seek when they are more than DRIFT_LIMIT out — and the
   heartbeat carries the host's *projected* position (its stored position plus
   the time since it was written), so network latency doesn't accumulate.
   ========================================================================== */

const DRIFT_LIMIT = 1.6;
const HEARTBEAT_MS = 4000;

interface Props {
  room: Room;
  isHost: boolean;
}

export function RoomPlayer({ room, isHost }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const loadedId = useRef<string | null>(null);
  const suppress = useRef(false);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(room.playing);
  const [position, setPosition] = useState(room.positionSeconds);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Where the host believes playback is, right now. */
  const projected = useCallback(() => {
    if (!room.playing) return room.positionSeconds;
    return room.positionSeconds + Math.max(0, (Date.now() - room.updatedAt) / 1000);
  }, [room.playing, room.positionSeconds, room.updatedAt]);

  /* ---------------------------- bootstrap ------------------------------- */

  useEffect(() => {
    if (!mountRef.current || playerRef.current) return;
    let cancelled = false;

    const host = document.createElement('div');
    host.style.width = '100%';
    host.style.height = '100%';
    mountRef.current.appendChild(host);

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        playerRef.current = new YT.Player(host, {
          videoId: room.videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: 0, controls: 0, modestbranding: 1, rel: 0,
            playsinline: 1, disablekb: 1, iv_load_policy: 3,
            origin: window.location.origin,
          },
          events: {
            onReady: (e: { target: YTPlayer }) => {
              if (cancelled) return;
              loadedId.current = room.videoId;
              setReady(true);
              setDuration(e.target.getDuration());
              e.target.seekTo(projected(), true);
              if (room.playing) e.target.playVideo();
            },
            onStateChange: (e: { data: number }) => {
              if (cancelled) return;
              if (e.data === PlayerState.PLAYING) setPlaying(true);
              if (e.data === PlayerState.PAUSED) setPlaying(false);
              // A guest pausing on their own end is corrected by the next
              // heartbeat; only the host's transport is authoritative.
            },
            onError: () => setError('This video cannot be embedded. The host can pick another.'),
          },
        }) as YTPlayer;
      })
      .catch((err: Error) => !cancelled && setError(err.message));

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------- local ticker ----------------------------- */

  useEffect(() => {
    const id = setInterval(() => {
      const p = playerRef.current;
      if (!p?.getCurrentTime) return;
      try {
        setPosition(p.getCurrentTime());
        const d = p.getDuration();
        if (d) setDuration(d);
      } catch { /* player torn down mid-tick */ }
    }, 300);
    return () => clearInterval(id);
  }, []);

  /* ------------------------- host: publish state ------------------------ */

  const publish = useCallback(async (overrides?: { playing?: boolean; positionSeconds?: number }) => {
    if (!isHost) return;
    const p = playerRef.current;
    if (!p?.getCurrentTime) return;
    try {
      await syncRoomPlayback(room.id, {
        playing: overrides?.playing ?? playing,
        positionSeconds: overrides?.positionSeconds ?? p.getCurrentTime(),
      });
    } catch { /* transient — the next heartbeat re-publishes */ }
  }, [isHost, room.id, playing]);

  useEffect(() => {
    if (!isHost || !ready) return;
    const id = setInterval(() => publish(), HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [isHost, ready, publish]);

  /* ------------------------ guest: follow the host ---------------------- */

  useEffect(() => {
    if (isHost || !ready) return;
    const p = playerRef.current;
    if (!p) return;

    // The host switched video.
    if (loadedId.current !== room.videoId) {
      loadedId.current = room.videoId;
      p.loadVideoById({ videoId: room.videoId, startSeconds: projected() });
      return;
    }

    suppress.current = true;

    try {
      const target = projected();
      const drift = Math.abs(p.getCurrentTime() - target);
      if (drift > DRIFT_LIMIT) p.seekTo(target, true);

      const state = p.getPlayerState();
      if (room.playing && state !== PlayerState.PLAYING && state !== PlayerState.BUFFERING) p.playVideo();
      if (!room.playing && state === PlayerState.PLAYING) p.pauseVideo();
    } catch { /* not ready yet */ }

    const t = setTimeout(() => { suppress.current = false; }, 400);
    return () => clearTimeout(t);
  }, [isHost, ready, room.playing, room.positionSeconds, room.updatedAt, room.videoId, projected]);

  /* ------------------------------ controls ------------------------------ */

  const toggle = () => {
    const p = playerRef.current;
    if (!p || !isHost) return;
    if (playing) { p.pauseVideo(); setPlaying(false); publish({ playing: false }); }
    else { p.playVideo(); setPlaying(true); publish({ playing: true }); }
  };

  const nudge = (delta: number) => {
    const p = playerRef.current;
    if (!p || !isHost) return;
    const target = Math.max(0, Math.min(duration || Infinity, p.getCurrentTime() + delta));
    p.seekTo(target, true);
    publish({ positionSeconds: target });
  };

  const scrub = (fraction: number) => {
    const p = playerRef.current;
    if (!p || !isHost || !duration) return;
    const target = fraction * duration;
    p.seekTo(target, true);
    setPosition(target);
    publish({ positionSeconds: target });
  };

  const toggleMute = () => {
    const p = playerRef.current;
    if (!p) return;
    if (muted) { p.unMute(); setMuted(false); } else { p.mute(); setMuted(true); }
  };

  const pct = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-black">
      <div className="relative aspect-video w-full">
        <div ref={mountRef} className="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:border-0" />

        {!ready && !error && (
          <div className="absolute inset-0 grid place-items-center bg-ink-900">
            <Loader2 className="h-5 w-5 animate-spin text-flare" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center bg-ink-900 p-6 text-center">
            <p className="max-w-sm text-[13px] text-cream-dim">{error}</p>
          </div>
        )}

        {/* Guests get a transparent shield: the host drives, and a stray click
            on the embed would desync them from everyone else. */}
        {!isHost && <div className="absolute inset-0" aria-hidden />}
      </div>

      <div className="border-t border-line bg-ink-900 px-3 py-2.5 sm:px-4">
        <div
          className={cn('group relative h-1 w-full rounded-full bg-cream/15', isHost ? 'cursor-pointer' : 'cursor-not-allowed')}
          onClick={(e) => {
            if (!isHost) return;
            const r = e.currentTarget.getBoundingClientRect();
            scrub(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
          }}
          role={isHost ? 'slider' : undefined}
          aria-label={isHost ? 'Seek for everyone' : undefined}
          aria-valuenow={Math.round(position)}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
        >
          <div className="h-full rounded-full bg-flare transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>

        <div className="mt-2.5 flex items-center gap-1">
          <Btn onClick={toggle} disabled={!isHost} label={playing ? 'Pause for everyone' : 'Play for everyone'}>
            {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
          </Btn>
          <Btn onClick={() => nudge(-10)} disabled={!isHost} label="Back 10 seconds">
            <RotateCcw className="h-4 w-4" />
          </Btn>
          <Btn onClick={() => nudge(10)} disabled={!isHost} label="Forward 10 seconds">
            <RotateCw className="h-4 w-4" />
          </Btn>
          <Btn onClick={toggleMute} label={muted ? 'Unmute' : 'Mute'}>
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Btn>

          <span className="ml-2 font-mono text-[11.5px] text-cream-dim tnum">
            {formatDuration(position)}<span className="mx-1 text-faint">/</span>
            <span className="text-faint">{formatDuration(duration)}</span>
          </span>

          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            {isHost ? 'You are the host' : 'Following the host'}
          </span>
        </div>
      </div>
    </div>
  );
}

function Btn({
  children, onClick, disabled, label,
}: { children: React.ReactNode; onClick(): void; disabled?: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={disabled ? 'Only the host controls playback' : label}
      className={cn(
        'grid h-8 w-8 place-items-center rounded-lg text-cream-dim transition-[background-color,color,transform] duration-200',
        'hover:bg-cream/10 hover:text-cream active:scale-90',
        disabled && 'pointer-events-none opacity-30',
      )}
    >
      {children}
    </button>
  );
}

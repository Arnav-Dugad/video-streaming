'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, Pause, Play, Radio, RotateCcw, RotateCw, SkipBack } from 'lucide-react';

import { loadYouTubeApi, PlayerState, type YTPlayer } from '@/hooks/useYouTubeApi';
import { advanceRoomQueue, setBuffering, syncRoomPlayback } from '@/lib/db';
import { serverClock } from '@/lib/server-clock';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/cn';
import { RoomReactions } from './RoomReactions';
import { RoomViewerControls } from './RoomViewerControls';
import { ReactionRibbon } from './ReactionRibbon';
import type { Room } from '@/lib/types';

/* ==========================================================================
   Synced playback.

   One authority: the host. Its player writes {playing, position} to the room
   document on every transport action and on a heartbeat; guests hold a
   read-only player that follows.

   Three things make this accurate rather than approximately accurate:

   1. A shared clock. Elapsed time is measured against Google's clock, not the
      viewer's — see lib/server-clock.ts. Comparing two consumer machines'
      `Date.now()` used to fold their skew straight into the sync error, and
      that skew is routinely larger than the drift being corrected.

   2. A position stamped at sample time. The host records its own reading of
      the shared clock at the instant it sampled `getCurrentTime()`, so the
      write's flight time never gets projected forward as playback time.

   3. Correction by playback rate, not by seeking. A seek is a visible event —
      it stalls, it re-buffers, and it costs more time than the drift it was
      fixing, which is why a naive follower stutters forever. Under a second
      of drift the guest instead runs at 1.02x or 0.98x and glides back into
      place, invisibly, usually within a few seconds. Seeking is reserved for
      real discontinuities.

   YouTube's IFrame API documents `setPlaybackRate` as advisory — a player may
   snap to its supported list. So the first correction reads the rate back and
   remembers whether trimming works at all; where it doesn't, the guest falls
   back to seek-only correction with a tighter dead zone.
   ========================================================================== */

/** Beyond this, gliding back would take too long — seek instead. */
const SEEK_LIMIT = 1.25;
/** Below this, leave it alone. Chasing noise is what makes players stutter. */
const DEAD_ZONE = 0.12;
/** Fraction of a second of drift corrected per second of playback. */
const TRIM = 0.02;
const TRIM_MAX = 0.05;
/** Ignore drift readings for this long after a seek — the player is settling. */
const SETTLE_MS = 900;
/** A seek lands slightly in the past by the time it completes. */
const SEEK_LEAD = 0.2;
const HEARTBEAT_MS = 3000;
/** How long a stall must last before the room is told about it. */
const STALL_MS = 900;
/* Far enough in that arriving means missing something. Below this, catching up
   is a two-second scrub and offering a choice would just be a dialog in the
   way. */
const CATCHUP_THRESHOLD = 90;

/* The embed picks its rendition from the size of its *own* window, not from
   how large it looks on screen — so a 900px-wide iframe is never offered more
   than 720p. Giving it a real 1920x1080 box and scaling that down visually is
   what makes the quality selector able to reach 1080p and above. Same trick as
   the main player; see PlayerHost for the long version. */
const VIRTUAL_WIDTH = 1920;
const VIRTUAL_HEIGHT = 1080;

interface Props {
  room: Room;
  isHost: boolean;
  uid: string;
  name: string;
}

export function RoomPlayer({ room, isHost, uid, name }: Props) {
  const clock = serverClock(room.id);
  /** Host controls default to on — a watch party where everyone sits at a
   *  different second is just several people watching alone. */
  const synced = room.hostControls !== false;

  /* Which lane this viewer is in.
   *
   *  'live' is the room. 'solo' is the private lane a late arrival can take:
   *  they watch from the top at their own pace, with the room carrying on
   *  without them, and rejoin when they are ready. Dropping somebody forty
   *  minutes into something they have not seen is the standing failure of
   *  every watch-party feature, and "you had to be here on time" is not an
   *  answer. */
  const [lane, setLane] = useState<'live' | 'solo'>('live');
  /** Shown once, on arrival, when there is enough behind us to be worth it. */
  const [offer, setOffer] = useState(false);
  const offered = useRef(false);

  const follows = synced && !isHost && lane === 'live';

  // The player's event handlers are bound once at construction, so they close
  // over whatever these were then. Mirroring into a ref keeps them current
  // without rebuilding the player on every prop change.
  const context = useRef({ isHost, roomId: room.id, uid, synced, follows });
  useEffect(() => {
    context.current = { isHost, roomId: room.id, uid, synced, follows };
  }, [isHost, room.id, uid, synced, follows]);

  const onEnded = useCallback(() => {
    if (!context.current.isHost) return;
    advanceRoomQueue(context.current.roomId).catch(() => { /* next heartbeat retries */ });
  }, []);

  const mountRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const loadedId = useRef<string | null>(null);
  const settleUntil = useRef(0);
  /** null = untested, true/false = whether this player honours fine rates. */
  const canTrim = useRef<boolean | null>(null);
  const trimming = useRef(false);
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announcedStall = useRef(false);
  /** Set when the host pauses *for* a buffering guest, so it knows to resume. */
  const heldForBuffer = useRef(false);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(room.playing);
  const [position, setPosition] = useState(room.positionSeconds);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** Live drift in seconds, for the accuracy read-out. */
  const [drift, setDrift] = useState(0);
  /** Size of the visible stage, for scaling and centring the oversized
   *  surface. Both axes matter: in fullscreen the stage is the shape of the
   *  screen, which is rarely 16:9. */
  const [stage, setStage] = useState({ width: 0, height: 0 });

  /** Where the host believes playback is, right now, on the shared clock. */
  const projected = useCallback(() => {
    if (!room.playing) return room.positionSeconds;
    // Rooms written by older builds carry no sample stamp; `updatedAt` is the
    // next best reference, just biased late by the write's flight time.
    const base = room.positionAtServerMs ?? room.updatedAt;
    const elapsed = (clock.now() - base) / 1000;
    // A negative elapsed means the clock estimate is still settling; clamping
    // is better than seeking backwards over an estimation artefact.
    return room.positionSeconds + Math.min(Math.max(0, elapsed), 60 * 60);
  }, [room.playing, room.positionSeconds, room.positionAtServerMs, room.updatedAt, clock]);

  /* ------------------------- stall announcements ------------------------ */

  /** Tell the room when this player has been stuck loading long enough to be
   *  worth waiting for. Short hitches are filtered out — announcing every
   *  200ms rebuffer would flap the room document and pause everybody. */
  const announceStall = useCallback((stalled: boolean) => {
    const { roomId, uid: me, synced: on, follows: inLane, isHost: host } = context.current;
    // Only somebody the room is actually waiting for should say so: a viewer
    // in their own lane, or a room with sync off, holds nobody up.
    if (!on || (!inLane && !host)) return;

    if (stallTimer.current) { clearTimeout(stallTimer.current); stallTimer.current = null; }

    if (stalled) {
      stallTimer.current = setTimeout(() => {
        announcedStall.current = true;
        setBuffering(roomId, me, true).catch(() => { /* advisory */ });
      }, STALL_MS);
    } else if (announcedStall.current) {
      announcedStall.current = false;
      setBuffering(roomId, me, false).catch(() => { /* advisory */ });
    }
  }, []);

  // Leaving the room while stalled would leave everyone waiting on a ghost.
  useEffect(() => () => {
    if (announcedStall.current) setBuffering(room.id, uid, false).catch(() => {});
  }, [room.id, uid]);

  // Measured rather than assumed: the stage is a different size inline, in a
  // narrow column and in fullscreen, and the scale has to follow all three.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setStage({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
              settleUntil.current = Date.now() + SETTLE_MS;
              if (room.playing) e.target.playVideo();
            },
            onStateChange: (e: { data: number }) => {
              if (cancelled) return;
              if (e.data === PlayerState.PLAYING) setPlaying(true);
              if (e.data === PlayerState.PAUSED) setPlaying(false);
              if (e.data === PlayerState.ENDED) {
                setPlaying(false);
                // Only the host advances. Every guest also sees ENDED, and if
                // they all wrote the next video the queue would jump several
                // items at once.
                onEnded();
              }
              announceStall(e.data === PlayerState.BUFFERING);
            },
            onError: () => setError('This video cannot be embedded. The host can pick another.'),
          },
        }) as YTPlayer;
      })
      .catch((err: Error) => !cancelled && setError(err.message));

    return () => {
      cancelled = true;
      if (stallTimer.current) clearTimeout(stallTimer.current);
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
        const at = p.getCurrentTime();
        setPosition(at);
        const d = p.getDuration();
        if (d) setDuration(d);
        if (follows && room.playing) setDrift(at - projected());
      } catch { /* player torn down mid-tick */ }
    }, 250);
    return () => clearInterval(id);
  }, [follows, room.playing, projected]);

  /* --------------------------- late arrivals ---------------------------- */

  useEffect(() => {
    if (offered.current || !ready || isHost || !synced) return;
    if (!room.playing) return;
    if (projected() < CATCHUP_THRESHOLD) return;
    offered.current = true;
    // Deferred: this reacts to the room's state arriving, not to a render
    // input, and a synchronous setState here would cascade a second pass.
    queueMicrotask(() => setOffer(true));
  }, [ready, isHost, synced, room.playing, projected]);

  const joinLive = useCallback(() => {
    setOffer(false);
    setLane('live');
    const p = playerRef.current;
    if (!p) return;
    try {
      p.seekTo(projected() + SEEK_LEAD, true);
      settleUntil.current = Date.now() + SETTLE_MS;
      if (room.playing) p.playVideo();
    } catch { /* the follow effect will correct it */ }
  }, [projected, room.playing]);

  const startOver = useCallback(() => {
    setOffer(false);
    setLane('solo');
    const p = playerRef.current;
    if (!p) return;
    try {
      if (trimming.current) { p.setPlaybackRate(1); trimming.current = false; }
      p.seekTo(0, true);
      settleUntil.current = Date.now() + SETTLE_MS;
      p.playVideo();
    } catch { /* nothing else to do */ }
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
    if (!isHost || !ready || !synced) return;
    const id = setInterval(() => publish(), HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [isHost, ready, synced, publish]);

  /* --------------------- host: wait for a stalled guest ----------------- */

  const waiting = (room.buffering ?? []).filter((id) => id !== uid && room.members?.[id]);

  useEffect(() => {
    if (!isHost || !ready || !synced) return;
    const p = playerRef.current;
    if (!p) return;

    if (waiting.length > 0 && room.playing) {
      // Hold the room rather than leaving somebody permanently behind. The
      // flag is what distinguishes this from a deliberate pause, so the room
      // only auto-resumes from a pause it caused itself.
      heldForBuffer.current = true;
      p.pauseVideo();
      publish({ playing: false });
    } else if (waiting.length === 0 && heldForBuffer.current) {
      heldForBuffer.current = false;
      p.playVideo();
      publish({ playing: true });
    }
    // `waiting` is derived; its contents are what matter, not its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, ready, synced, room.playing, waiting.join(','), publish]);

  /* ------------------------ guest: follow the host ---------------------- */

  useEffect(() => {
    if (!follows || !ready) return;
    const p = playerRef.current;
    if (!p) return;

    // The host switched video.
    if (loadedId.current !== room.videoId) {
      loadedId.current = room.videoId;
      p.loadVideoById({ videoId: room.videoId, startSeconds: projected() });
      settleUntil.current = Date.now() + SETTLE_MS;
      return;
    }

    try {
      const state = p.getPlayerState();
      if (room.playing && state !== PlayerState.PLAYING && state !== PlayerState.BUFFERING) p.playVideo();
      if (!room.playing && state === PlayerState.PLAYING) p.pauseVideo();

      // While paused, land exactly on the host's frame — there is no drift to
      // glide away, and a visible jump costs nothing when nothing is moving.
      if (!room.playing) {
        const target = room.positionSeconds;
        if (Math.abs(p.getCurrentTime() - target) > 0.35) {
          p.seekTo(target, true);
          settleUntil.current = Date.now() + SETTLE_MS;
        }
        if (trimming.current) { p.setPlaybackRate(1); trimming.current = false; }
      }
    } catch { /* not ready yet */ }
  }, [follows, ready, room.playing, room.positionSeconds, room.videoId, projected]);

  /* ------------------- guest: continuous drift correction --------------- */

  useEffect(() => {
    if (!follows || !ready) return;

    const id = setInterval(() => {
      const p = playerRef.current;
      if (!p?.getCurrentTime) return;
      if (!room.playing) return;
      if (Date.now() < settleUntil.current) return;

      try {
        if (p.getPlayerState() === PlayerState.BUFFERING) return;

        const d = p.getCurrentTime() - projected();
        const size = Math.abs(d);

        if (size > SEEK_LIMIT) {
          // A real discontinuity — the host scrubbed, or this tab was asleep.
          // Aim slightly ahead, because the seek itself takes time.
          p.seekTo(projected() + SEEK_LEAD, true);
          settleUntil.current = Date.now() + SETTLE_MS;
          if (trimming.current) { p.setPlaybackRate(1); trimming.current = false; }
          return;
        }

        if (canTrim.current === false) {
          // No fine rate control on this player: seek, but only once the drift
          // is big enough that a jump is less disruptive than staying wrong.
          if (size > 0.5) {
            p.seekTo(projected() + SEEK_LEAD, true);
            settleUntil.current = Date.now() + SETTLE_MS;
          }
          return;
        }

        if (size < DEAD_ZONE) {
          if (trimming.current) { p.setPlaybackRate(1); trimming.current = false; }
          return;
        }

        // Behind the host (d < 0) means run slightly fast, and vice versa.
        const rate = 1 - Math.max(-TRIM_MAX, Math.min(TRIM_MAX, d * TRIM * 10));
        p.setPlaybackRate(Number(rate.toFixed(3)));
        trimming.current = true;

        if (canTrim.current === null) {
          // Confirm the player actually took a fractional rate rather than
          // snapping to its nearest supported step.
          canTrim.current = Math.abs(p.getPlaybackRate() - 1) > 0.001;
          if (!canTrim.current) { p.setPlaybackRate(1); trimming.current = false; }
        }
      } catch { /* torn down mid-tick */ }
    }, 500);

    return () => {
      clearInterval(id);
      const p = playerRef.current;
      if (p && trimming.current) {
        try { p.setPlaybackRate(1); } catch { /* gone */ }
        trimming.current = false;
      }
    };
  }, [follows, ready, room.playing, projected]);

  // Handing control back to a guest must not leave their player running at a
  // trim rate for the rest of the session.
  useEffect(() => {
    if (follows) return;
    const p = playerRef.current;
    if (p && trimming.current) {
      try { p.setPlaybackRate(1); } catch { /* gone */ }
      trimming.current = false;
    }
  }, [follows]);

  /* ------------------------------ controls ------------------------------ */

  // A viewer in their own lane drives their own player — nothing they do
  // reaches the room, because only the host ever publishes.
  const canDrive = isHost || !synced || lane === 'solo';

  const toggle = () => {
    const p = playerRef.current;
    if (!p || !canDrive) return;
    heldForBuffer.current = false;
    if (playing) { p.pauseVideo(); setPlaying(false); publish({ playing: false }); }
    else { p.playVideo(); setPlaying(true); publish({ playing: true }); }
  };

  const nudge = (delta: number) => {
    const p = playerRef.current;
    if (!p || !canDrive) return;
    const target = Math.max(0, Math.min(duration || Infinity, p.getCurrentTime() + delta));
    p.seekTo(target, true);
    settleUntil.current = Date.now() + SETTLE_MS;
    publish({ positionSeconds: target });
  };

  const scrub = (fraction: number) => {
    const p = playerRef.current;
    if (!p || !canDrive || !duration) return;
    const target = fraction * duration;
    p.seekTo(target, true);
    settleUntil.current = Date.now() + SETTLE_MS;
    setPosition(target);
    publish({ positionSeconds: target });
  };

  const api = useCallback(() => playerRef.current, []);

  const pct = duration > 0 ? (position / duration) * 100 : 0;
  const driftMs = follows ? Math.round(Math.abs(drift) * 1000) : 0;
  const locked = follows && driftMs <= 120;

  /* Fit a 1920x1080 surface inside the stage. Below 1:1 the embed needs the
     oversize trick to be offered anything above 720p; at or beyond it the
     frame is already large enough natively, and scaling would only cost
     sharpness, so the surface just fills the box instead. */
  const fit = stage.width > 0 && stage.height > 0
    ? Math.min(stage.width / VIRTUAL_WIDTH, stage.height / VIRTUAL_HEIGHT)
    : 0;
  const oversized = fit > 0 && fit < 1;
  const surface = oversized
    ? {
        width: VIRTUAL_WIDTH,
        height: VIRTUAL_HEIGHT,
        transform: `translate(${(stage.width - VIRTUAL_WIDTH * fit) / 2}px, ${(stage.height - VIRTUAL_HEIGHT * fit) / 2}px) scale(${fit})`,
      }
    : { width: '100%', height: '100%' };

  return (
    <div
      ref={shellRef}
      className="room-player flex flex-col overflow-hidden rounded-2xl border border-line bg-black"
    >
      <div ref={stageRef} className="room-stage relative aspect-video w-full overflow-hidden">
        <div
          ref={mountRef}
          className="pointer-events-none absolute left-0 top-0 origin-top-left [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:border-0"
          style={surface}
        />

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

        {/* The embed itself never takes clicks — our own controls are the only
            way to drive it, which is also what keeps a guest from desyncing
            everybody with a stray click on YouTube's invisible chrome. */}

        {/* Waiting for somebody is the one thing worth interrupting the video
            for — otherwise nobody understands why it stopped. */}
        {waiting.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
            <span className="flex items-center gap-2 rounded-full bg-ink-950/85 px-3 py-1.5 text-[11.5px] text-cream-dim backdrop-blur-sm">
              <Loader2 className="h-3 w-3 animate-spin text-flare" />
              Waiting for {waiting.map((id) => room.members?.[id]?.name ?? 'someone').join(', ')}
            </span>
          </div>
        )}

        {/* Arriving late. Offered rather than decided: some people would
            rather see the end with everyone than the beginning alone. */}
        <AnimatePresence>
          {offer && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 z-20 grid place-items-center bg-ink-950/85 p-6 backdrop-blur-sm"
            >
              <motion.div
                initial={{ y: 14, scale: 0.97 }}
                animate={{ y: 0, scale: 1 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="w-full max-w-sm text-center"
              >
                <p className="eyebrow">You are arriving late</p>
                <h3 className="mt-2 text-[17px] font-medium leading-snug text-cream">
                  The room is {formatDuration(projected())} in
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">
                  Catch up with everyone, or start from the top on your own and
                  rejoin whenever you like.
                </p>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <button
                    onClick={joinLive}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-flare px-4 text-[13px] font-medium text-white transition-transform duration-200 active:scale-95"
                  >
                    <Radio className="h-4 w-4" /> Join the room
                  </button>
                  <button
                    onClick={startOver}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-line px-4 text-[13px] text-cream-dim transition-[border-color,background-color] hover:border-line-strong hover:bg-cream/[0.05]"
                  >
                    <SkipBack className="h-4 w-4" /> Start from the beginning
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* In your own lane: a standing reminder that the room is elsewhere,
            and one tap back to it. */}
        {lane === 'solo' && !offer && (
          <div className="absolute inset-x-0 top-0 flex justify-center p-3">
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-2.5 rounded-full border border-line bg-ink-950/85 py-1 pl-3 pr-1 backdrop-blur-sm"
            >
              <span className="text-[11.5px] text-cream-dim">
                Watching on your own
                {room.playing && projected() > position + 5 && (
                  <span className="ml-1.5 font-mono text-[10.5px] text-faint tnum">
                    {formatDuration(Math.max(0, projected() - position))} behind
                  </span>
                )}
              </span>
              <button
                onClick={joinLive}
                className="rounded-full bg-flare/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-flare transition-colors hover:bg-flare/25"
              >
                Rejoin
              </button>
            </motion.div>
          </div>
        )}

        <RoomReactions
          roomId={room.id}
          uid={uid}
          name={name}
          currentSecond={position}
        />
      </div>

      <div className="border-t border-line bg-ink-900 px-3 py-2.5 sm:px-4">
        <div
          className={cn('group relative h-1 w-full rounded-full bg-cream/15', canDrive ? 'cursor-pointer' : 'cursor-not-allowed')}
          onClick={(e) => {
            if (!canDrive) return;
            const r = e.currentTarget.getBoundingClientRect();
            scrub(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
          }}
          role={canDrive ? 'slider' : undefined}
          aria-label={canDrive ? (synced ? 'Seek for everyone' : 'Seek') : undefined}
          aria-valuenow={Math.round(position)}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
        >
          <div className="h-full rounded-full bg-flare transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>

        <ReactionRibbon
          roomId={room.id}
          duration={duration}
          onSeek={canDrive ? (seconds) => {
            const p = playerRef.current;
            if (!p) return;
            p.seekTo(seconds, true);
            settleUntil.current = Date.now() + SETTLE_MS;
            setPosition(seconds);
            publish({ positionSeconds: seconds });
          } : undefined}
        />

        <div className="mt-2.5 flex items-center gap-1">
          <Btn onClick={toggle} disabled={!canDrive} synced={synced}
            label={playing ? (synced ? 'Pause for everyone' : 'Pause') : (synced ? 'Play for everyone' : 'Play')}>
            {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
          </Btn>
          <Btn onClick={() => nudge(-10)} disabled={!canDrive} synced={synced} label="Back 10 seconds">
            <RotateCcw className="h-4 w-4" />
          </Btn>
          <Btn onClick={() => nudge(10)} disabled={!canDrive} synced={synced} label="Forward 10 seconds">
            <RotateCw className="h-4 w-4" />
          </Btn>
          <span className="ml-2 font-mono text-[11.5px] text-cream-dim tnum">
            {formatDuration(position)}<span className="mx-1 text-faint">/</span>
            <span className="text-faint">{formatDuration(duration)}</span>
          </span>

          {/* Volume, subtitles, rendition and fullscreen belong to whoever is
              watching, host or not — none of them are things the rest of the
              room can feel. Only the transport above is shared. */}
          <div className="ml-auto flex items-center gap-1">
            <RoomViewerControls
              api={api}
              ready={ready}
              surfaceRef={shellRef}
              videoId={room.videoId}
            />
          </div>

          {/* The sync read-out. Drift is the one number that says whether this
              is actually working, so it is on screen rather than in a log. */}
          <span className="ml-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em]">
            {follows ? (
              <>
                <span
                  className={cn('h-1.5 w-1.5 rounded-full transition-colors duration-500',
                    locked ? 'bg-mint' : 'bg-flare')}
                  aria-hidden
                />
                <span className={locked ? 'text-mint' : 'text-flare'} title="Difference from the host's position">
                  {locked ? 'In sync' : `${driftMs} ms off`}
                </span>
              </>
            ) : (
              <span className="text-faint">
                {isHost
                  ? (synced ? 'You are the host' : 'Host · free play')
                  : lane === 'solo' ? 'Your own lane' : 'Free play'}
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

function Btn({
  children, onClick, disabled, label, synced,
}: {
  children: React.ReactNode; onClick(): void; disabled?: boolean; label: string; synced: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={disabled ? (synced ? 'Only the host controls playback' : label) : label}
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

'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import {
  Bookmark, BookmarkCheck, Loader2, Play, Share2, ThumbsUp, Volume2, VolumeX,
} from 'lucide-react';

import { loadYouTubeApi, PlayerState, type YTPlayer } from '@/hooks/useYouTubeApi';
import { Thumbnail } from '@/components/ui/Thumbnail';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/components/providers/AuthProvider';
import { toggleInCollection } from '@/lib/db';
import { compactNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import { toast } from '@/lib/store';
import type { Video } from '@/lib/types';

/* ==========================================================================
   One short.

   The player is only constructed while the card is the active one, and torn
   down as soon as it is not — a reel of thirty live iframes would use a
   gigabyte of memory and saturate the network. Everything off-screen is a
   still image.

   Sound is off until the viewer asks for it, and the choice is remembered
   across cards, because autoplaying audio on scroll is the single most
   disliked behaviour in every short-form feed.
   ========================================================================== */

interface Props {
  video: Video;
  active: boolean;
  muted: boolean;
  onToggleMuted(): void;
  onEnded(): void;
}

export function ShortCard({ video, active, muted, onToggleMuted, onEnded }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [saved, setSaved] = useState(false);
  const { user } = useAuth();

  const callbacks = useRef({ onEnded });
  useEffect(() => { callbacks.current = { onEnded }; }, [onEnded]);

  /* ------------------------- construct / destroy ------------------------- */

  useEffect(() => {
    if (!active || !mountRef.current) return;
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
            autoplay: 1, controls: 0, modestbranding: 1, rel: 0,
            playsinline: 1, disablekb: 1, iv_load_policy: 3,
            // Shorts loop; that is the whole grammar of the format.
            loop: 1, playlist: video.id,
            origin: window.location.origin,
          },
          events: {
            onReady: (e: { target: YTPlayer }) => {
              if (cancelled) return;
              setReady(true);
              // Muted first, always — a browser will refuse to autoplay with
              // sound anyway, and an unexpected blast is worse than silence.
              e.target.mute();
              e.target.playVideo();
            },
            onStateChange: (e: { data: number }) => {
              if (cancelled) return;
              if (e.data === PlayerState.PLAYING) setPlaying(true);
              if (e.data === PlayerState.PAUSED) setPlaying(false);
              if (e.data === PlayerState.ENDED) callbacks.current.onEnded();
            },
          },
        }) as YTPlayer;
      })
      .catch(() => { /* the still stays up; nothing to recover */ });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      setReady(false);
    };
  }, [active, video.id]);

  useEffect(() => {
    const p = playerRef.current;
    if (!p || !ready) return;
    try { if (muted) p.mute(); else p.unMute(); } catch { /* not ready */ }
  }, [muted, ready]);

  /* ------------------------------- actions ------------------------------- */

  const toggle = () => {
    const p = playerRef.current;
    if (!p) return;
    if (playing) { p.pauseVideo(); setPlaying(false); } else { p.playVideo(); setPlaying(true); }
  };

  const save = async () => {
    if (!user) { toast('Sign in to save videos'); return; }
    try {
      const now = await toggleInCollection(user.uid, 'saved', video);
      setSaved(now);
      toast(now ? 'Saved to Watch Later' : 'Removed from Watch Later', { tone: 'success' });
    } catch { toast('Could not save that', { tone: 'error' }); }
  };

  const share = async () => {
    const url = `${window.location.origin}/watch?v=${video.id}`;
    try {
      if (navigator.share) await navigator.share({ title: video.title, url });
      else { await navigator.clipboard.writeText(url); toast('Link copied', { tone: 'success' }); }
    } catch { /* dismissed */ }
  };

  return (
    <article className="relative h-full w-full snap-start snap-always overflow-hidden rounded-2xl bg-ink-900">
      {/* The still stays behind the player: it covers the load, and for every
          inactive card it is the whole card. */}
      <div className="absolute inset-0">
        <Thumbnail
          src={video.thumbnailHq || video.thumbnail}
          alt={video.title}
          sizes="(max-width: 640px) 100vw, 420px"
          className="scale-110 blur-xl"
          reveal={false}
        />
        <div className="absolute inset-0 bg-ink-950/55" />
      </div>

      {/* Portrait-fitted still, so a landscape source is letterboxed against
          its own blurred self rather than cropped to nothing. */}
      <div className="absolute inset-0 grid place-items-center">
        <div className="relative aspect-video w-full">
          <Thumbnail src={video.thumbnailHq || video.thumbnail} alt="" sizes="420px" reveal={false} />
        </div>
      </div>

      {active && (
        <div
          ref={mountRef}
          className="absolute inset-0 grid place-items-center [&_iframe]:aspect-video [&_iframe]:h-auto [&_iframe]:w-full [&_iframe]:border-0"
        />
      )}

      {active && !ready && (
        <div className="absolute inset-0 grid place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-flare" />
        </div>
      )}

      {/* Tap anywhere to pause. */}
      <button
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        className="absolute inset-0 cursor-default"
        tabIndex={-1}
      />

      {!playing && active && (
        <motion.span
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          className="pointer-events-none absolute inset-0 grid place-items-center"
        >
          <span className="grid h-16 w-16 place-items-center rounded-full bg-ink-950/60 ring-1 ring-cream/15 backdrop-blur-md">
            <Play className="ml-0.5 h-6 w-6 fill-cream text-cream" />
          </span>
        </motion.span>
      )}

      {/* --------------------------- rail --------------------------------- */}
      <div className="absolute bottom-4 right-3 flex flex-col gap-3">
        <Rail label={muted ? 'Unmute' : 'Mute'} onClick={onToggleMuted} active={!muted}>
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </Rail>
        <Rail label="Like" onClick={save} active={saved} count={compactNumber(video.likeCount ?? 0)}>
          <ThumbsUp className={cn('h-5 w-5', saved && 'fill-current')} />
        </Rail>
        <Rail label="Watch later" onClick={save} active={saved}>
          {saved ? <BookmarkCheck className="h-5 w-5" /> : <Bookmark className="h-5 w-5" />}
        </Rail>
        <Rail label="Share" onClick={share}>
          <Share2 className="h-5 w-5" />
        </Rail>
      </div>

      {/* --------------------------- caption ------------------------------ */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950 via-ink-950/70 to-transparent p-4 pr-16 pt-16">
        <Link
          href={`/channel/${video.channelId}`}
          className="pointer-events-auto mb-2.5 inline-flex items-center gap-2"
        >
          <Avatar src={video.channelAvatar} name={video.channelTitle} size={26} />
          <span className="text-[12.5px] font-medium text-cream">{video.channelTitle}</span>
        </Link>
        <Link href={`/watch?v=${video.id}`} className="pointer-events-auto block">
          <h2 className="clamp-2 text-[13.5px] font-medium leading-snug text-cream">{video.title}</h2>
        </Link>
        <p className="mt-1.5 font-mono text-[10.5px] text-faint tnum">
          {compactNumber(video.viewCount)} views
        </p>
      </div>
    </article>
  );
}

function Rail({
  children, label, onClick, active, count,
}: {
  children: React.ReactNode; label: string; onClick(): void;
  active?: boolean; count?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex flex-col items-center gap-1"
    >
      <span
        className={cn(
          'grid h-11 w-11 place-items-center rounded-full bg-ink-950/60 backdrop-blur-sm transition-[background-color,color,transform] duration-200 active:scale-90',
          active ? 'text-flare' : 'text-cream',
        )}
      >
        {children}
      </span>
      {count && <span className="font-mono text-[10px] text-cream-dim tnum">{count}</span>}
    </button>
  );
}

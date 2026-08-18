'use client';

import { useEffect, useRef, useState } from 'react';

import { loadYouTubeApi, type YTPlayer } from '@/hooks/useYouTubeApi';

/* ==========================================================================
   Frame preview for the scrubber.

   YouTube's own storyboards are sprite sheets described in the InnerTube
   player response, and their URLs carry a signature you cannot obtain without
   impersonating the web client — so they are off the table for anything that
   should still work next month.

   This does something the storyboards cannot: it shows the *actual* frame at
   the hovered position, at full resolution, by holding a second muted player
   and seeking it. Slower than a sprite sheet, so seeks are debounced and the
   player is only created once someone actually touches the scrubber — a page
   where nobody scrubs never pays for it.
   ========================================================================== */

const SEEK_DEBOUNCE = 130;

interface Props {
  videoId: string;
  /** Position being hovered, or null when the pointer has left the track. */
  seconds: number | null;
}

export function ScrubPreview({ videoId, seconds }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  /* Keyed by video id rather than a boolean, so switching videos invalidates
     readiness by itself and the teardown effect never has to reset state. */
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const ready = readyFor === videoId;
  const pending = useRef<number | null>(null);

  /* The player is built on the first hover and kept for the lifetime of the
     video. Creating it up front would load a second copy of every video
     anyone opens, whether or not they ever scrub. */
  useEffect(() => {
    if (seconds === null || playerRef.current || !mountRef.current) return;

    let cancelled = false;
    const host = document.createElement('div');
    host.style.width = '100%';
    host.style.height = '100%';
    mountRef.current.appendChild(host);

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        playerRef.current = new YT.Player(host, {
          videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: 0, controls: 0, modestbranding: 1, rel: 0,
            playsinline: 1, disablekb: 1, iv_load_policy: 3, mute: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (e: { target: YTPlayer }) => {
              if (cancelled) return;
              e.target.mute();
              // Pausing immediately is what turns this into a frame viewer
              // rather than a second copy of the video playing silently.
              e.target.seekTo(pending.current ?? 0, true);
              e.target.pauseVideo();
              setReadyFor(videoId);
            },
          },
        }) as YTPlayer;
      })
      .catch(() => { /* preview is a nicety; the timecode still shows */ });

    return () => { cancelled = true; };
  }, [seconds, videoId]);

  // Rebuild when the video changes, rather than seeking the wrong one.
  useEffect(() => {
    playerRef.current?.destroy();
    playerRef.current = null;
    if (mountRef.current) mountRef.current.innerHTML = '';
  }, [videoId]);

  useEffect(() => () => { playerRef.current?.destroy(); playerRef.current = null; }, []);

  /* Debounced seek. Dragging across a long video fires hundreds of positions;
     seeking on each one would queue requests faster than they complete and the
     preview would lag further behind the further you scrubbed. */
  useEffect(() => {
    if (seconds === null) return;
    pending.current = seconds;
    const p = playerRef.current;
    if (!p || !ready) return;

    const t = setTimeout(() => {
      try {
        p.seekTo(seconds, true);
        p.pauseVideo();
      } catch { /* torn down mid-seek */ }
    }, SEEK_DEBOUNCE);

    return () => clearTimeout(t);
  }, [seconds, ready]);

  return (
    <div
      className="relative aspect-video w-40 overflow-hidden rounded-md bg-ink-800 sm:w-48"
      aria-hidden
    >
      <div
        ref={mountRef}
        className="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:border-0"
      />
      {!ready && <div className="absolute inset-0 skeleton" />}
    </div>
  );
}

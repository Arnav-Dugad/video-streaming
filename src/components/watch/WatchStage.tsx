'use client';

import { useEffect, ViewTransition } from 'react';
import { usePlayerSlot } from '@/hooks/usePlayerSlot';
import { usePlayer } from '@/lib/store';
import { useAuth } from '@/components/providers/AuthProvider';
import { getProgress } from '@/lib/db';
import type { Video } from '@/lib/types';

/* ==========================================================================
   The inline stage on the watch page.

   Renders nothing but an empty 16:9 box and publishes its rectangle. The
   actual player is <PlayerHost> at the root of the app, which flies onto this
   box. That indirection is what lets playback survive navigation.

   Resume order of precedence: an explicit ?t= in the URL wins (someone shared
   a timestamp), otherwise the viewer's own saved position, otherwise zero.
   ========================================================================== */

interface Props {
  video: Video;
  upNext: Video[];
  /** Seconds, from ?t= in the URL. */
  startAt?: number;
}

export function WatchStage({ video, upNext, startAt }: Props) {
  const ref = usePlayerSlot<HTMLDivElement>();
  const load = usePlayer((s) => s.load);
  const setQueue = usePlayer((s) => s.setQueue);
  const currentId = usePlayer((s) => s.video?.id);
  const { user, loading } = useAuth();

  useEffect(() => {
    if (currentId === video.id) { setQueue(upNext); return; }

    let cancelled = false;

    const start = async () => {
      if (startAt && startAt > 0) return startAt;
      if (loading || !user) return 0;
      try {
        const entry = await getProgress(user.uid, video.id);
        if (!entry || entry.completed) return 0;
        return entry.progress;
      } catch { return 0; }
    };

    start().then((seconds) => {
      if (!cancelled) load(video, { startAt: seconds, queue: upNext });
    });

    return () => { cancelled = true; };
    // upNext is derived from video.id upstream, so it is not a trigger here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id, user, loading, startAt]);

  return (
    <ViewTransition name={`video-${video.id}`} share="morph" default="none">
      <div
        ref={ref}
        className="relative aspect-video w-full overflow-hidden rounded-card bg-black ring-1 ring-inset ring-cream/[0.06]"
        // The host paints over this; keep it as a matching placeholder so there
        // is never a flash of page background underneath during the flight.
        aria-label="Video player"
      />
    </ViewTransition>
  );
}

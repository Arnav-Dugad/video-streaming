'use client';

import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/components/providers/AuthProvider';
import { getHistory } from '@/lib/db';
import { useSearchDefaults } from '@/hooks/usePreferences';
import { Rail, RailItem } from '@/components/video/Rail';
import { VideoCard } from '@/components/video/VideoCard';
import { RailSkeleton } from '@/components/ui/Skeleton';
import type { Video } from '@/lib/types';

/* ==========================================================================
   The personalised rail.

   Weighting cannot happen on the server: the home page is one shared static
   render revalidated hourly, so anything computed there would hand every
   visitor the same person's taste. This runs in the browser instead, against
   the signed-in profile.

   The signal is two-part. Declared interests come from the profile — what the
   viewer says they want. Observed interest comes from which channels they
   actually finished watching, which is usually the more honest of the two, so
   it is weighted higher when the two disagree.
   ========================================================================== */

interface Signal { term: string; weight: number }

export function ForYou() {
  const { user, profile, loading } = useAuth();
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [signals, setSignals] = useState<Signal[] | null>(null);
  const searchDefaults = useSearchDefaults();

  const interests = useMemo(() => profile?.interests ?? [], [profile]);

  /* ------------------------- build the signal --------------------------- */

  useEffect(() => {
    if (loading || !user) return;
    let alive = true;

    getHistory(user.uid, 60)
      .then((history) => {
        if (!alive) return;

        // Channels the viewer actually finished carry more weight than ones
        // they merely opened.
        const byChannel = new Map<string, number>();
        for (const entry of history) {
          if (!entry.channelTitle) continue;
          const score = entry.completed ? 3 : entry.progress > 120 ? 2 : 1;
          byChannel.set(entry.channelTitle, (byChannel.get(entry.channelTitle) ?? 0) + score);
        }

        const observed: Signal[] = [...byChannel.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([term, weight]) => ({ term, weight: weight + 2 }));

        const declared: Signal[] = interests.map((term) => ({ term, weight: 2 }));

        setSignals([...observed, ...declared].sort((a, b) => b.weight - a.weight).slice(0, 4));
      })
      .catch(() => alive && setSignals(interests.map((term) => ({ term, weight: 1 }))));

    return () => { alive = false; };
  }, [user, loading, interests]);

  /* ---------------------------- fetch ----------------------------------- */

  useEffect(() => {
    if (!signals || signals.length === 0) return;
    const controller = new AbortController();

    // One query per signal, interleaved — a single combined query would return
    // the intersection of the viewer's interests, which is usually empty.
    Promise.all(
      signals.slice(0, 3).map((s) => {
        const qs = new URLSearchParams({ q: s.term, limit: '6', ...searchDefaults });
        return fetch(`/api/search?${qs}`, { signal: controller.signal })
          .then((r) => r.json())
          .then((d: { items?: Video[] }) => d.items ?? [])
          .catch(() => [] as Video[]);
      }),
    ).then((groups) => {
      const seen = new Set<string>();
      const out: Video[] = [];
      // Round-robin so the rail opens with the strongest signal but never
      // becomes a single query's result list.
      for (let i = 0; i < 6; i++) {
        for (const group of groups) {
          const v = group[i];
          if (v && !seen.has(v.id)) { seen.add(v.id); out.push(v); }
        }
      }
      setVideos(out.slice(0, 14));
    });

    return () => controller.abort();
  }, [signals, searchDefaults]);

  if (!user || (signals !== null && signals.length === 0)) return null;
  if (videos === null) return <div className="gutter-wide py-8"><RailSkeleton count={4} /></div>;
  if (videos.length === 0) return null;

  const shown = signals?.slice(0, 3).map((s) => s.term) ?? [];

  return (
    <Rail
      eyebrow="Built from what you watch"
      title="For you"
      href="/profile"
      hrefLabel="Tune this"
      meta={shown.join(' · ')}
      className="py-10"
    >
      {videos.map((v) => <RailItem key={v.id}><VideoCard video={v} /></RailItem>)}
    </Rail>
  );
}

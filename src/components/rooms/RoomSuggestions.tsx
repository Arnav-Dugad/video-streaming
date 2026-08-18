'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Sparkles } from 'lucide-react';

import { addToRoomQueue, roomQueueItem } from '@/lib/db';
import { Thumbnail } from '@/components/ui/Thumbnail';
import { formatDuration } from '@/lib/format';
import { toast } from '@/lib/store';
import { cn } from '@/lib/cn';
import type { Room, Video } from '@/lib/types';
import type { User } from 'firebase/auth';

/* ==========================================================================
   What this room might like.

   Each member's watch history is readable only by them — correctly — so this
   does not read anyone's history. Instead every member contributes a short
   taste signal when they join (their five most-watched channel names), and
   the room finds common ground in the overlap.

   Channels named by more than one member come first, because that is the
   whole point: a room's best pick is rarely anybody's personal top result,
   it is the thing more than one person already likes.
   ========================================================================== */

interface Suggestion {
  video: Video;
  /** Why it is here, in plain words. */
  reason: string;
  shared: boolean;
}

export function RoomSuggestions({
  room, user, isHost,
}: { room: Room; user: User; isHost: boolean }) {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  /* --------------------------- find the overlap -------------------------- */

  const terms = useMemo(() => {
    const members = Object.values(room.members ?? {});
    const counts = new Map<string, number>();
    for (const member of members) {
      // One member cannot vote twice for the same channel.
      for (const channel of new Set(member.taste ?? [])) {
        counts.set(channel, (counts.get(channel) ?? 0) + 1);
      }
    }

    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const shared = ranked.filter(([, n]) => n >= 2);
    // With no overlap — a brand new room, or members with nothing in common —
    // fall back to the union rather than showing nothing.
    const pool = shared.length > 0 ? shared : ranked;

    return pool.slice(0, 3).map(([channel, n]) => ({
      channel,
      shared: n >= 2,
      others: n - 1,
    }));
  }, [room.members]);

  /* ------------------------------- fetch --------------------------------- */

  useEffect(() => {
    const controller = new AbortController();

    if (terms.length === 0) {
      // Deferred rather than set synchronously, so this does not cascade a
      // second render before the first has painted.
      queueMicrotask(() => !controller.signal.aborted && setSuggestions([]));
      return () => controller.abort();
    }

    Promise.all(
      terms.map((t) =>
        fetch(`/api/search?q=${encodeURIComponent(t.channel)}&limit=4`, { signal: controller.signal })
          .then((r) => r.json())
          .then((d: { items?: Video[] }) => ({ term: t, items: d.items ?? [] }))
          .catch(() => ({ term: t, items: [] as Video[] })),
      ),
    ).then((groups) => {
      const queued = new Set([room.videoId, ...(room.queue ?? []).map((q) => q.videoId)]);
      const seen = new Set<string>();
      const out: Suggestion[] = [];

      // Round-robin so one popular channel cannot fill the whole rail.
      for (let i = 0; i < 4; i++) {
        for (const group of groups) {
          const video = group.items[i];
          if (!video || seen.has(video.id) || queued.has(video.id)) continue;
          seen.add(video.id);
          out.push({
            video,
            shared: group.term.shared,
            reason: group.term.shared
              ? `${group.term.others + 1} of you watch ${group.term.channel}`
              : `Someone here watches ${group.term.channel}`,
          });
        }
      }
      setSuggestions(out.slice(0, 6));
    });

    return () => controller.abort();
  }, [terms, room.videoId, room.queue]);

  const queue = async (suggestion: Suggestion) => {
    setAdding(suggestion.video.id);
    try {
      const added = await addToRoomQueue(
        room.id,
        roomQueueItem(suggestion.video, { uid: user.uid, name: user.displayName ?? 'Viewer' }),
      );
      toast(added ? 'Added to the room queue' : 'That is already queued', {
        tone: added ? 'success' : 'neutral',
      });
    } catch {
      toast('Could not add that', { tone: 'error' });
    } finally {
      setAdding(null);
    }
  };

  if (suggestions === null) {
    return (
      <section className="rounded-2xl border border-line p-4">
        <p className="flex items-center gap-2 text-[12.5px] text-faint">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking for common ground…
        </p>
      </section>
    );
  }

  if (suggestions.length === 0) return null;

  const anyShared = suggestions.some((s) => s.shared);

  return (
    <section className="rounded-2xl border border-line">
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="eyebrow flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" /> What this room might like
          </p>
          <p className="mt-1 text-[11.5px] text-muted">
            {anyShared
              ? 'Built from channels more than one of you already watches.'
              : 'Nobody overlaps yet, so this is drawn from everyone individually.'}
          </p>
        </div>
      </header>

      <ul className="divide-y divide-line/60">
        {suggestions.map((s) => (
          <li key={s.video.id}>
            <div className="group flex items-center gap-3 p-2.5">
              <span className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-ink-800">
                <Thumbnail src={s.video.thumbnail} alt="" sizes="120px" reveal={false} />
                {s.video.durationSeconds ? (
                  <span className="absolute bottom-1 right-1 rounded bg-ink-950/85 px-1 py-px font-mono text-[9.5px] text-cream tnum">
                    {formatDuration(s.video.durationSeconds)}
                  </span>
                ) : null}
              </span>

              <span className="min-w-0 flex-1">
                <span className="clamp-2 block text-[12.5px] font-medium leading-snug text-cream">
                  {s.video.title}
                </span>
                <span
                  className={cn(
                    'mt-1 block truncate font-mono text-[10px]',
                    s.shared ? 'text-flare' : 'text-faint',
                  )}
                >
                  {s.reason}
                </span>
              </span>

              <button
                onClick={() => queue(s)}
                disabled={adding === s.video.id}
                aria-label={`Queue ${s.video.title}`}
                title={isHost ? 'Add to the room queue' : 'Suggest to the room'}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line text-cream-dim transition-colors hover:border-line-strong hover:text-cream disabled:opacity-40"
              >
                {adding === s.video.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Plus className="h-3.5 w-3.5" />}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

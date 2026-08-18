'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ListPlus, Loader2, Play, Plus, X } from 'lucide-react';

import { addToRoomQueue, advanceRoomQueue, removeFromRoomQueue, roomQueueItem } from '@/lib/db';
import { Thumbnail } from '@/components/ui/Thumbnail';
import { formatDuration } from '@/lib/format';
import { extractVideoId } from '@/lib/video-id';
import { toast } from '@/lib/store';
import { cn } from '@/lib/cn';
import type { Room, Video } from '@/lib/types';
import type { User } from 'firebase/auth';

/* ==========================================================================
   Room queue.

   Anyone in the room can put something forward; only the host can play or
   drop it. That split is enforced in the Firestore rules, not here — this UI
   only decides what to show, never what is permitted.
   ========================================================================== */

export function RoomQueue({ room, user, isHost }: { room: Room; user: User; isHost: boolean }) {
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);

  const queue = room.queue ?? [];

  const add = async () => {
    const id = extractVideoId(url);
    if (!id) { toast('Paste a YouTube link or a video id', { tone: 'error' }); return; }

    setAdding(true);
    try {
      const res = await fetch(`/api/videos?ids=${id}`);
      const data = (await res.json()) as { items?: Video[] };
      const video = data.items?.[0];
      if (!video) { toast('Could not find that video', { tone: 'error' }); return; }

      const added = await addToRoomQueue(
        room.id,
        roomQueueItem(video, { uid: user.uid, name: user.displayName ?? 'Viewer' }),
      );
      if (added) { setUrl(''); toast(`Queued “${video.title.slice(0, 40)}”`, { tone: 'success' }); }
      else toast('That is already queued', { tone: 'neutral' });
    } catch {
      toast('Could not add that to the queue', { tone: 'error' });
    } finally {
      setAdding(false);
    }
  };

  const playNow = async () => {
    try { await advanceRoomQueue(room.id); }
    catch { toast('Could not skip ahead', { tone: 'error' }); }
  };

  const drop = async (videoId: string) => {
    try { await removeFromRoomQueue(room.id, videoId); }
    catch { toast('Could not remove that', { tone: 'error' }); }
  };

  return (
    <section className="rounded-2xl border border-line">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <p className="eyebrow">Up next in this room</p>
        <span className="font-mono text-[10.5px] text-faint tnum">{queue.length}</span>
      </header>

      <div className="border-b border-line p-2.5">
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Paste a YouTube link to queue it"
            aria-label="Queue a video"
            className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-ink-850 px-3.5 text-[13px] text-cream outline-none transition-colors placeholder:text-faint focus:border-flare/60"
          />
          <button
            onClick={add}
            disabled={adding || !url.trim()}
            aria-label="Add to queue"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cream text-ink-950 transition-[background-color,opacity] hover:bg-white disabled:opacity-30"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-2 px-0.5 text-[11.5px] text-faint">
          {isHost
            ? 'Plays automatically when the current video ends.'
            : 'Anyone can queue. Only the host can skip or remove.'}
        </p>
      </div>

      <div className="max-h-72 overflow-y-auto p-2">
        {queue.length === 0 && (
          <p className="px-2 py-6 text-center text-[12.5px] text-faint">
            Nothing queued. When this video ends, the room stops here.
          </p>
        )}

        <ol className="space-y-1">
          <AnimatePresence mode="popLayout">
            {queue.map((item, i) => (
              <motion.li
                key={item.videoId}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="group flex items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-ink-800/70">
                  <span className="w-4 shrink-0 text-center font-mono text-[10.5px] text-faint tnum">{i + 1}</span>
                  <span className="relative aspect-video w-20 shrink-0 overflow-hidden rounded bg-ink-800">
                    <Thumbnail src={item.thumbnail} alt="" sizes="100px" reveal={false} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="clamp-2 block text-[12.5px] font-medium leading-snug text-cream">{item.title}</span>
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-faint tnum">
                      {item.durationSeconds > 0 ? `${formatDuration(item.durationSeconds)} · ` : ''}
                      added by {item.addedByUid === user.uid ? 'you' : item.addedByName}
                    </span>
                  </span>

                  {isHost && (
                    <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      {i === 0 && (
                        <button
                          onClick={playNow}
                          aria-label="Play this now"
                          title="Play this now"
                          className="grid h-7 w-7 place-items-center rounded-lg text-cream-dim transition-colors hover:bg-cream/10 hover:text-cream"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" />
                        </button>
                      )}
                      <button
                        onClick={() => drop(item.videoId)}
                        aria-label={`Remove ${item.title}`}
                        className={cn(
                          'grid h-7 w-7 place-items-center rounded-lg text-faint transition-colors hover:text-flare',
                        )}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  )}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      </div>
    </section>
  );
}

export { ListPlus };

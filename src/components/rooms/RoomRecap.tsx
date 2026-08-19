'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { ArrowLeft, Crown, Play, RotateCcw, Trash2 } from 'lucide-react';

import { deleteRoom, reopenRoom } from '@/lib/db';
import { Avatar } from '@/components/ui/Avatar';
import { Thumbnail } from '@/components/ui/Thumbnail';
import { RoomChat } from './RoomChat';
import { formatDuration, timeAgo } from '@/lib/format';
import { toast } from '@/lib/store';
import { cn } from '@/lib/cn';
import type { Room } from '@/lib/types';
import type { User } from 'firebase/auth';

/* ==========================================================================
   What a room was.

   Closing used to delete the document, which threw away the only record that
   the evening had happened. A closed room keeps everything — who was there,
   what you got through, the whole chat log pinned to the seconds it was sent
   at — and simply stops being live. The host can reopen it, which turns "one
   more episode next week" into a link rather than a new room.
   ========================================================================== */

interface Props {
  room: Room;
  roomId: string;
  user: User;
}

export function RoomRecap({ room, roomId, user }: Props) {
  const router = useRouter();
  const isHost = room.hostUid === user.uid;
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const members = Object.entries(room.members ?? {});
  const watched = [...(room.watched ?? [])].reverse();
  // The video the room was on when it closed is not in the log — the log is
  // written when a room *moves on* from something, and this one it never did.
  const stoppedOn = {
    videoId: room.videoId,
    title: room.videoTitle,
    thumbnail: room.videoThumbnail,
    seconds: room.positionSeconds,
    at: room.closedAt ?? room.updatedAt,
  };
  const reel = [stoppedOn, ...watched];

  const reopen = async () => {
    setBusy(true);
    try {
      await reopenRoom(roomId);
      toast('Room is open again');
    } catch {
      toast('Could not reopen this room', { tone: 'error' });
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!armed) {
      setArmed(true);
      window.setTimeout(() => setArmed(false), 4000);
      return;
    }
    setBusy(true);
    try {
      await deleteRoom(roomId);
      toast('Room deleted');
      router.push('/rooms');
    } catch {
      toast('Could not delete this room', { tone: 'error' });
      setBusy(false);
    }
  };

  return (
    <div className="gutter-wide py-6">
      <Link
        href="/rooms"
        className="group mb-5 inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-cream"
      >
        <ArrowLeft className="h-3 w-3 transition-transform duration-300 group-hover:-translate-x-1" />
        All rooms
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow">Closed {timeAgo(room.closedAt ?? room.updatedAt)}</p>
              <h1 className="mt-1.5 text-[clamp(1.3rem,2.6vw,1.9rem)] font-semibold leading-tight tracking-[-0.015em] text-cream">
                {room.title}
              </h1>
              <p className="mt-1.5 text-[13px] text-muted">
                {reel.length} {reel.length === 1 ? 'video' : 'videos'} · hosted by {room.hostName}
              </p>
            </div>

            {isHost && (
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={reopen}
                  disabled={busy}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-flare px-4 text-[13px] font-medium text-white transition-transform duration-200 active:scale-95 disabled:opacity-50"
                >
                  <RotateCcw className="h-4 w-4" /> Open it again
                </button>
                <button
                  onClick={remove}
                  disabled={busy}
                  className={cn(
                    'inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-[13px] transition-colors',
                    armed ? 'bg-flare/15 text-flare' : 'text-muted hover:text-flare',
                  )}
                >
                  <Trash2 className="h-4 w-4" /> {armed ? 'Delete for good?' : 'Delete'}
                </button>
              </div>
            )}
          </div>

          {/* ---------------------------- the reel ------------------------- */}
          <section className="mt-6" aria-label="What this room watched">
            <p className="eyebrow mb-3">What you watched</p>
            <ul className="space-y-1">
              {reel.map((item, i) => (
                <motion.li
                  key={`${item.videoId}-${i}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: Math.min(i, 10) * 0.045, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Link
                    href={`/watch?v=${item.videoId}`}
                    className="group flex items-center gap-3 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-cream/[0.04]"
                  >
                    <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-ink-800">
                      <Thumbnail src={item.thumbnail} alt="" sizes="112px" />
                      <span className="absolute inset-0 grid place-items-center bg-ink-950/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                        <Play className="h-4 w-4 fill-current text-cream" />
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="clamp-2 text-[13.5px] leading-snug text-cream-dim transition-colors group-hover:text-cream">
                        {item.title}
                      </p>
                      <p className="mt-1 font-mono text-[10.5px] text-faint tnum">
                        {i === 0 ? 'Stopped at' : 'Watched to'} {formatDuration(item.seconds)}
                      </p>
                    </div>
                  </Link>
                </motion.li>
              ))}
            </ul>
          </section>

          {/* ---------------------------- who was in ----------------------- */}
          <section className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
            <span className="eyebrow">Who was there</span>
            <div className="flex flex-wrap items-center gap-2">
              {members.map(([uid, m]) => (
                <span key={uid} className="flex items-center gap-1.5 rounded-full border border-line py-1 pl-1 pr-2.5">
                  <Avatar src={m.photo} name={m.name} size={20} />
                  <span className="text-[12px] text-cream-dim">{uid === user.uid ? 'You' : m.name}</span>
                  {uid === room.hostUid && <Crown className="h-3 w-3 text-flare" aria-label="Host" />}
                </span>
              ))}
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:h-[calc(100svh-8rem)]">
          <RoomChat roomId={roomId} user={user} currentSecond={0} />
        </aside>
      </div>
    </div>
  );
}

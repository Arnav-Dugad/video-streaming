'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { ArrowLeft, Check, Copy, Crown, DoorOpen, Loader2, Users } from 'lucide-react';

import { useAuth } from '@/components/providers/AuthProvider';
import { isFirebaseConfigured } from '@/lib/firebase';
import { joinRoom, leaveRoom, watchRoom } from '@/lib/db';
import { RoomPlayer } from './RoomPlayer';
import { RoomChat } from './RoomChat';
import { Avatar } from '@/components/ui/Avatar';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/PageHeader';
import { toast } from '@/lib/store';
import type { Room } from '@/lib/types';

export function RoomClient({ roomId }: { roomId: string }) {
  const { user, loading, configured } = useAuth();
  const router = useRouter();
  // `undefined` means "still loading"; `null` means "no such room".
  const [room, setRoom] = useState<Room | null | undefined>(
    isFirebaseConfigured ? undefined : null,
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!configured) return;
    return watchRoom(roomId, setRoom);
  }, [roomId, configured]);

  // Register as a member once, on arrival.
  useEffect(() => {
    if (!user || !room) return;
    if (room.members?.[user.uid]) return;
    joinRoom(roomId, { uid: user.uid, name: user.displayName ?? 'Viewer', photo: user.photoURL })
      .catch(() => toast('Could not join this room', { tone: 'error' }));
  }, [user, room, roomId]);

  if (!configured) {
    return (
      <div className="gutter-wide py-20">
        <EmptyState
          title="Rooms need Firebase"
          body="Watch parties are backed by Firestore's real-time listeners. Add Firebase credentials to switch them on."
          action={<ButtonLink href="/browse" variant="outline" size="sm">Keep browsing</ButtonLink>}
        />
      </div>
    );
  }

  if (loading || room === undefined) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-flare" />
      </div>
    );
  }

  if (room === null) {
    return (
      <div className="gutter-wide py-20">
        <EmptyState
          icon={<DoorOpen className="h-6 w-6" />}
          title="This room is gone"
          body="It was closed, or the link is wrong. Rooms disappear when the host leaves."
          action={<ButtonLink href="/rooms" size="sm">Back to rooms</ButtonLink>}
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="gutter-wide py-20">
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="Sign in to join this room"
          body={`“${room.title}” is watching ${room.videoTitle}.`}
          action={<ButtonLink href={`/signin?next=/rooms/${roomId}`} size="sm">Sign in to join</ButtonLink>}
        />
      </div>
    );
  }

  const isHost = room.hostUid === user.uid;
  const members = Object.entries(room.members ?? {});

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { toast('Could not copy the code', { tone: 'error' }); }
  };

  const leave = async () => {
    try { await leaveRoom(roomId, user.uid); } catch { /* best effort */ }
    router.push('/rooms');
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
          <RoomPlayer room={room} isHost={isHost} />

          <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-[clamp(1.15rem,2.2vw,1.5rem)] font-semibold leading-tight tracking-[-0.015em] text-cream">
                {room.videoTitle}
              </h1>
              <p className="mt-1.5 text-[13px] text-muted">
                {room.title} · hosted by {room.hostName}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={copyCode}
                className="inline-flex h-10 items-center gap-2.5 rounded-xl border border-line px-3.5 transition-[border-color,background-color] hover:border-line-strong hover:bg-cream/[0.04]"
              >
                <span className="font-mono text-[15px] font-semibold tracking-[0.2em] text-cream">{room.code}</span>
                {copied ? <Check className="h-3.5 w-3.5 text-mint" /> : <Copy className="h-3.5 w-3.5 text-muted" />}
              </motion.button>
              <button
                onClick={leave}
                className="inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-[13px] text-muted transition-colors hover:text-flare"
              >
                <DoorOpen className="h-4 w-4" /> Leave
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
            <span className="eyebrow">In the room</span>
            <div className="flex flex-wrap items-center gap-2">
              {members.map(([uid, m]) => (
                <span key={uid} className="flex items-center gap-1.5 rounded-full border border-line py-1 pl-1 pr-2.5">
                  <Avatar src={m.photo} name={m.name} size={20} />
                  <span className="text-[12px] text-cream-dim">{uid === user.uid ? 'You' : m.name}</span>
                  {uid === room.hostUid && <Crown className="h-3 w-3 text-flare" aria-label="Host" />}
                </span>
              ))}
            </div>
            <span className="ml-auto font-mono text-[10.5px] text-faint tnum">
              {members.length} {members.length === 1 ? 'person' : 'people'}
            </span>
          </div>

          {!isHost && (
            <p className="mt-3 text-[12px] text-faint">
              The host controls playback. Your player follows theirs automatically and
              corrects itself if it drifts more than a second and a half.
            </p>
          )}
        </div>

        <aside className="lg:h-[calc(100svh-8rem)] lg:sticky lg:top-24">
          <RoomChat roomId={roomId} user={user} currentSecond={room.positionSeconds} />
        </aside>
      </div>
    </div>
  );
}

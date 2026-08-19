'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft, Check, Copy, Crown, DoorOpen, Loader2, Radio, Trash2, UserPlus, Users,
} from 'lucide-react';

import { useAuth } from '@/components/providers/AuthProvider';
import { isFirebaseConfigured } from '@/lib/firebase';
import { deleteRoom, joinRoom, leaveRoom, setHostControls, tasteSignal, watchRoom } from '@/lib/db';
import { releaseClock } from '@/lib/server-clock';
import { RoomPlayer } from './RoomPlayer';
import { RoomChat } from './RoomChat';
import { RoomQueue } from './RoomQueue';
import { RoomSuggestions } from './RoomSuggestions';
import { FriendsPanel } from './FriendsPanel';
import { Avatar } from '@/components/ui/Avatar';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/PageHeader';
import { toast } from '@/lib/store';
import { cn } from '@/lib/cn';
import type { Room } from '@/lib/types';

export function RoomClient({ roomId }: { roomId: string }) {
  const { user, profile, loading, configured } = useAuth();
  const router = useRouter();
  // `undefined` means "still loading"; `null` means "no such room".
  const [room, setRoom] = useState<Room | null | undefined>(
    isFirebaseConfigured ? undefined : null,
  );
  const [copied, setCopied] = useState(false);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (!configured) return;
    return watchRoom(roomId, setRoom);
  }, [roomId, configured]);

  // The clock estimate belongs to this visit. Keeping it across a full
  // navigation away would seed the next one with a stale skew.
  useEffect(() => () => releaseClock(roomId), [roomId]);

  // Register as a member once, on arrival, contributing a short taste signal
  // so the room can find common ground without anyone's history being shared.
  useEffect(() => {
    if (!user || !room) return;
    if (room.members?.[user.uid]) return;

    let alive = true;
    tasteSignal(user.uid)
      .catch(() => [] as string[])
      .then((taste) => {
        if (!alive) return;
        return joinRoom(roomId, {
          uid: user.uid,
          name: user.displayName ?? 'Viewer',
          photo: user.photoURL,
          taste,
        });
      })
      .catch(() => toast('Could not join this room', { tone: 'error' }));

    return () => { alive = false; };
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
          body="It was closed, or the link is wrong. Rooms disappear when the host closes them."
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
  const synced = room.hostControls !== false;
  const members = Object.entries(room.members ?? {});

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { toast('Could not copy the code', { tone: 'error' }); }
  };

  const toggleControls = async () => {
    try {
      await setHostControls(roomId, !synced);
      toast(synced ? 'Everyone drives their own player now' : 'You are driving for everyone');
    } catch { toast('Could not change that', { tone: 'error' }); }
  };

  const leave = async () => {
    try { await leaveRoom(roomId, user.uid); } catch { /* best effort */ }
    router.push('/rooms');
  };

  const close = async () => {
    try {
      await deleteRoom(roomId);
      toast('Room closed');
    } catch { toast('Could not close the room', { tone: 'error' }); }
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
          <RoomPlayer
            room={room}
            isHost={isHost}
            uid={user.uid}
            name={user.displayName ?? 'Viewer'}
          />

          <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-[clamp(1.15rem,2.2vw,1.5rem)] font-semibold leading-tight tracking-[-0.015em] text-cream">
                {room.videoTitle}
              </h1>
              <p className="mt-1.5 text-[13px] text-muted">
                {room.title} · hosted by {room.hostName}
              </p>
            </div>

            <div className="relative flex shrink-0 items-center gap-2">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={copyCode}
                className="inline-flex h-10 items-center gap-2.5 rounded-xl border border-line px-3.5 transition-[border-color,background-color] hover:border-line-strong hover:bg-cream/[0.04]"
              >
                <span className="font-mono text-[15px] font-semibold tracking-[0.2em] text-cream">{room.code}</span>
                {copied ? <Check className="h-3.5 w-3.5 text-mint" /> : <Copy className="h-3.5 w-3.5 text-muted" />}
              </motion.button>

              {profile && (
                <button
                  onClick={() => setInviting((v) => !v)}
                  aria-expanded={inviting}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-line px-3.5 text-[13px] text-cream-dim transition-[border-color,background-color] hover:border-line-strong hover:bg-cream/[0.04]"
                >
                  <UserPlus className="h-4 w-4" /> Invite
                </button>
              )}

              {isHost ? (
                <button
                  onClick={close}
                  className="inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-[13px] text-muted transition-colors hover:text-flare"
                >
                  <Trash2 className="h-4 w-4" /> Close
                </button>
              ) : (
                <button
                  onClick={leave}
                  className="inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-[13px] text-muted transition-colors hover:text-flare"
                >
                  <DoorOpen className="h-4 w-4" /> Leave
                </button>
              )}

              <AnimatePresence>
                {inviting && profile && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setInviting(false)}
                      aria-hidden
                    />
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.97 }}
                      transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-3rem))] origin-top-right rounded-2xl bg-ink-900 shadow-[0_28px_70px_-24px_rgba(0,0,0,0.9)]"
                    >
                      <FriendsPanel profile={profile} room={room} />
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* ------------------------- who is here ------------------------- */}
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
            <span className="eyebrow">In the room</span>
            <div className="flex flex-wrap items-center gap-2">
              {members.map(([uid, m]) => {
                const loadingNow = room.buffering?.includes(uid);
                return (
                  <span
                    key={uid}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 transition-colors duration-500',
                      loadingNow ? 'border-flare/50 bg-flare/[0.06]' : 'border-line',
                    )}
                    title={loadingNow ? 'Loading — the room is waiting' : undefined}
                  >
                    <Avatar src={m.photo} name={m.name} size={20} />
                    <span className="text-[12px] text-cream-dim">{uid === user.uid ? 'You' : m.name}</span>
                    {uid === room.hostUid && <Crown className="h-3 w-3 text-flare" aria-label="Host" />}
                    {loadingNow && <Loader2 className="h-3 w-3 animate-spin text-flare" />}
                  </span>
                );
              })}
            </div>
            <span className="ml-auto font-mono text-[10.5px] text-faint tnum">
              {members.length} {members.length === 1 ? 'person' : 'people'}
            </span>
          </div>

          {/* ----------------------- the sync switch ----------------------- */}
          {isHost ? (
            <button
              onClick={toggleControls}
              className="group mt-3 flex w-full items-center gap-3.5 rounded-xl border border-line px-4 py-3 text-left transition-[border-color,background-color] hover:border-line-strong hover:bg-cream/[0.03]"
            >
              <Radio className={cn('h-4 w-4 shrink-0 transition-colors duration-500', synced ? 'text-flare' : 'text-faint')} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-cream">
                  {synced ? 'You are driving for everyone' : 'Everyone drives their own player'}
                </span>
                <span className="mt-0.5 block text-[12px] leading-relaxed text-muted">
                  {synced
                    ? 'Play, pause and seek land on every screen within a frame or two — and the room holds if someone is still loading.'
                    : 'The room still shares this video, the queue and the chat. Positions are nobody else’s business.'}
                </span>
              </span>
              <span
                className={cn(
                  'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-400',
                  synced ? 'bg-flare' : 'bg-cream/15',
                )}
                aria-hidden
              >
                <motion.span
                  layout
                  transition={{ type: 'spring', stiffness: 520, damping: 34 }}
                  className={cn(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-ink-950',
                    synced ? 'left-[1.125rem]' : 'left-0.5',
                  )}
                />
              </span>
            </button>
          ) : (
            <p className="mt-3 text-[12px] leading-relaxed text-faint">
              {synced
                ? 'The host is driving. Your player follows theirs against a shared clock and trims its own speed to stay locked on, rather than jumping.'
                : 'The host has left playback to you. Everyone here is watching the same video at their own pace.'}
            </p>
          )}

          <div className="mt-5 space-y-5">
            <RoomQueue room={room} user={user} isHost={isHost} />
            <RoomSuggestions room={room} user={user} isHost={isHost} />
          </div>
        </div>

        <aside className="lg:h-[calc(100svh-8rem)] lg:sticky lg:top-24">
          <RoomChat roomId={roomId} user={user} currentSecond={room.positionSeconds} />
        </aside>
      </div>
    </div>
  );
}

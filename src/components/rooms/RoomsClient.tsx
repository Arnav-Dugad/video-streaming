'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, DoorOpen, Loader2, Plus, Trash2, Users } from 'lucide-react';

import { useAuth } from '@/components/providers/AuthProvider';
import { isFirebaseConfigured } from '@/lib/firebase';
import { createRoom, deleteRoom, findRoomByCode, listMyRooms, listPublicRooms } from '@/lib/db';
import { RoomInvites } from './RoomInvites';
import { FriendsPanel } from './FriendsPanel';
import { PageHeader, EmptyState } from '@/components/ui/PageHeader';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Thumbnail } from '@/components/ui/Thumbnail';
import { Avatar } from '@/components/ui/Avatar';
import { timeAgo } from '@/lib/format';
import { toast } from '@/lib/store';
import { extractVideoId } from '@/lib/video-id';
import { cn } from '@/lib/cn';
import type { Room, Video } from '@/lib/types';

export function RoomsClient() {
  const { user, profile, configured } = useAuth();
  const router = useRouter();

  const [rooms, setRooms] = useState<Room[] | null>(isFirebaseConfigured ? null : []);
  const [mine, setMine] = useState<Room[] | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (!configured) return;
    listPublicRooms().then(setRooms).catch(() => setRooms([]));
  }, [configured]);

  useEffect(() => {
    // Clearing on sign-out is a reaction to an external change, not a render
    // input — deferring keeps it out of the render pass.
    if (!configured || !user) { queueMicrotask(() => setMine(null)); return; }
    listMyRooms(user.uid).then(setMine).catch(() => setMine([]));
  }, [configured, user]);

  /** Closing a room evicts everybody in it, so it takes two clicks — the
   *  button becomes its own confirmation rather than throwing up a dialog,
   *  and forgetting about it disarms after four seconds. */
  const close = async (room: Room) => {
    if (armed !== room.id) {
      setArmed(room.id);
      window.setTimeout(() => setArmed((cur) => (cur === room.id ? null : cur)), 4000);
      return;
    }
    setArmed(null);
    // Optimistic on both lists: a deleted document will not come back from a
    // re-read either way.
    setMine((prev) => prev?.filter((r) => r.id !== room.id) ?? null);
    setRooms((prev) => prev?.filter((r) => r.id !== room.id) ?? null);
    try {
      await deleteRoom(room.id);
      toast('Room closed');
    } catch {
      toast('Could not close that room', { tone: 'error' });
      if (user) listMyRooms(user.uid).then(setMine).catch(() => {});
    }
  };

  const join = async () => {
    const clean = code.trim().toUpperCase();
    if (clean.length !== 6) { toast('Room codes are six characters'); return; }
    setJoining(true);
    try {
      const room = await findRoomByCode(clean);
      if (!room) { toast('No room with that code', { tone: 'error' }); return; }
      router.push(`/rooms/${room.id}`);
    } catch {
      toast('Could not look that up', { tone: 'error' });
    } finally {
      setJoining(false);
    }
  };

  /** Accepts a full YouTube/PRISM URL or a bare video id. */
  const create = async () => {
    if (!user) { router.push('/signin?next=/rooms'); return; }
    const id = extractVideoId(url);
    if (!id) { toast('Paste a YouTube link or a video id', { tone: 'error' }); return; }

    setCreating(true);
    try {
      const res = await fetch(`/api/videos?ids=${id}`);
      const data = (await res.json()) as { items?: Video[] };
      const video = data.items?.[0];
      if (!video) { toast('Could not find that video', { tone: 'error' }); return; }

      const roomId = await createRoom(
        { uid: user.uid, name: user.displayName ?? 'Host', photo: user.photoURL },
        video,
      );
      router.push(`/rooms/${roomId}`);
    } catch {
      toast('Could not open a room', { tone: 'error' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Together"
        title="Watch parties"
        lede="One host, one clock. Share six characters and everybody is on the same frame — with chat pinned to the second it was sent at."
      />

      <section className="gutter-wide pb-12">
        <div className="grid gap-4 lg:grid-cols-2">
          {/* ------------------------------ join ---------------------------- */}
          <div className="rounded-2xl border border-line p-6">
            <p className="eyebrow mb-3">Have a code?</p>
            <h2 className="text-[17px] font-medium text-cream">Join a room</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Six characters, no vowels and no look-alike digits — so it survives
              being read aloud over a call.
            </p>
            <div className="mt-5 flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                onKeyDown={(e) => e.key === 'Enter' && join()}
                placeholder="XKT4PQ"
                aria-label="Room code"
                className="h-11 w-40 rounded-xl border border-line bg-ink-850 px-4 text-center font-mono text-[17px] font-semibold tracking-[0.24em] text-cream outline-none transition-colors placeholder:text-faint placeholder:tracking-[0.24em] focus:border-flare/60"
              />
              <Button onClick={join} loading={joining} size="lg" className="flex-1">
                <DoorOpen className="h-4 w-4" /> Join
              </Button>
            </div>
          </div>

          {/* ----------------------------- create --------------------------- */}
          <div className="rounded-2xl border border-line p-6">
            <p className="eyebrow mb-3">Start one</p>
            <h2 className="text-[17px] font-medium text-cream">Open a room</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Paste a YouTube link, or open a room straight from any watch page
              with <span className="text-cream-dim">Watch together</span>.
            </p>
            <div className="mt-5 flex gap-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()}
                placeholder="https://youtube.com/watch?v=…"
                aria-label="Video link"
                className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-ink-850 px-3.5 text-[13.5px] text-cream outline-none transition-colors placeholder:text-faint focus:border-flare/60"
              />
              <Button onClick={create} loading={creating} size="lg" className="shrink-0">
                <Plus className="h-4 w-4" /> Open
              </Button>
            </div>
            {!user && (
              <p className="mt-3 text-[12px] text-faint">
                <Link href="/signin?next=/rooms" className="text-flare underline underline-offset-4">Sign in</Link> to host.
              </p>
            )}
          </div>
        </div>
      </section>

      {user && <RoomInvites uid={user.uid} />}

      {/* ------------------- your rooms · your people --------------------- */}
      {user && (
        <section className="gutter-wide pb-12">
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
            <div className="rounded-2xl border border-line p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[15px] font-medium text-cream">Your rooms</h2>
                {mine && <span className="font-mono text-[11px] text-faint tnum">{mine.length}</span>}
              </div>

              {mine === null && (
                <div className="grid place-items-center py-8"><Loader2 className="h-4 w-4 animate-spin text-flare" /></div>
              )}

              {mine?.length === 0 && (
                <p className="mt-3 rounded-xl border border-dashed border-line px-3.5 py-4 text-[12.5px] leading-relaxed text-muted">
                  You haven’t opened one yet. Rooms you host stay here so you can
                  hand the link out again — or close them for good.
                </p>
              )}

              <ul className="mt-2 space-y-1">
                <AnimatePresence initial={false}>
                  {mine?.map((room) => (
                    <motion.li
                      key={room.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 12, height: 0, marginTop: 0 }}
                      transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
                      className="group flex items-center gap-3 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-cream/[0.04]"
                    >
                      <Link href={`/rooms/${room.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="relative aspect-video w-20 shrink-0 overflow-hidden rounded-lg bg-ink-800">
                          <Thumbnail src={room.videoThumbnail} alt="" sizes="80px" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="clamp-1 text-[13px] text-cream-dim">{room.videoTitle}</p>
                          <p className="mt-0.5 flex items-center gap-2 font-mono text-[10.5px] text-faint">
                            <span className="tracking-[0.16em] text-muted">{room.code}</span>
                            <span>·</span>
                            <span>{Object.keys(room.members ?? {}).length} in</span>
                            <span>·</span>
                            <span>{timeAgo(room.updatedAt)}</span>
                          </p>
                        </div>
                      </Link>

                      <button
                        onClick={() => close(room)}
                        aria-label={armed === room.id ? `Confirm closing ${room.title}` : `Close ${room.title}`}
                        className={cn(
                          'shrink-0 rounded-lg px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-[background-color,color,opacity,transform] duration-200 active:scale-95',
                          armed === room.id
                            ? 'bg-flare/15 text-flare opacity-100'
                            : 'text-muted opacity-0 hover:bg-cream/10 hover:text-cream focus-visible:opacity-100 group-hover:opacity-100',
                        )}
                      >
                        {armed === room.id ? 'Sure?' : <Trash2 className="h-4 w-4" />}
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </div>

            {profile && <FriendsPanel profile={profile} />}
          </div>
        </section>
      )}

      {/* ------------------------------- live ----------------------------- */}
      <section className="gutter-wide pb-10">
        <div className="mb-6 flex items-baseline gap-3">
          <h2 className="text-[15px] font-medium text-cream">Rooms open now</h2>
          {rooms && <span className="font-mono text-[11px] text-faint tnum">{rooms.length}</span>}
        </div>

        {rooms === null && (
          <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-flare" /></div>
        )}

        {rooms?.length === 0 && (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="No rooms open"
            body={configured
              ? 'Be the first — paste a link above, or hit Watch together on any video.'
              : 'Watch parties need Firebase credentials on this deployment.'}
            action={<ButtonLink href="/trending" variant="outline" size="sm">Find something to watch</ButtonLink>}
          />
        )}

        {rooms && rooms.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {rooms.map((room, i) => {
              const members = Object.values(room.members ?? {});
              return (
                <motion.div
                  key={room.id}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.55, delay: Math.min(i, 8) * 0.05, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Link
                    href={`/rooms/${room.id}`}
                    data-cursor="Join"
                    className="group block overflow-hidden rounded-2xl border border-line transition-[border-color] duration-400 hover:border-line-strong"
                  >
                    <div className="relative aspect-video bg-ink-800">
                      <Thumbnail src={room.videoThumbnail} alt="" sizes="(max-width:768px) 100vw, 25vw"
                        className="transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]" />
                      <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 to-transparent" />
                      {room.playing && (
                        <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md bg-live px-1.5 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-wider text-white">
                          <span className="h-1.5 w-1.5 rounded-full bg-white" /> Playing
                        </span>
                      )}
                      <span className="absolute right-3 top-3 rounded-md bg-ink-950/85 px-2 py-1 font-mono text-[11px] font-semibold tracking-[0.16em] text-cream backdrop-blur-sm">
                        {room.code}
                      </span>
                    </div>

                    <div className="p-4">
                      <h3 className="clamp-2 text-[13.5px] font-medium leading-snug text-cream">{room.videoTitle}</h3>
                      <p className="mt-2 truncate text-[12px] text-muted">{room.title}</p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="flex -space-x-2">
                          {members.slice(0, 4).map((m, j) => (
                            <Avatar key={j} src={m.photo} name={m.name} size={22} className="ring-2 ring-ink-950" />
                          ))}
                          {members.length > 4 && (
                            <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-ink-700 font-mono text-[9px] text-cream-dim ring-2 ring-ink-950">
                              +{members.length - 4}
                            </span>
                          )}
                        </div>
                        <span className="flex items-center gap-1 font-mono text-[10.5px] text-faint">
                          {timeAgo(room.updatedAt)}
                          <ArrowRight className="h-3 w-3 transition-transform duration-300 group-hover:translate-x-0.5" />
                        </span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

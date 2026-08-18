'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bookmark, BookmarkCheck, Check, Clock3, Link2, ListPlus, Plus, Share2,
  ThumbsUp, Users,
} from 'lucide-react';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  addToPlaylist, createPlaylist, isInCollection, isSubscribed, listPlaylists,
  toggleInCollection, toggleSubscription, createRoom,
} from '@/lib/db';
import { compactNumber, formatDuration, subscriberLabel } from '@/lib/format';
import { usePlayer } from '@/lib/store';
import { cn } from '@/lib/cn';
import { toast } from '@/lib/store';
import type { Channel, Playlist, Video } from '@/lib/types';
import { useRouter } from 'next/navigation';

export function WatchActions({ video, channel }: { video: Video; channel: Channel | null }) {
  const { user } = useAuth();
  const router = useRouter();

  // Offering a timestamped link only makes sense while this video is the one
  // actually playing, and only once it is far enough in to be worth pointing at.
  const position = usePlayer((s) => s.position);
  const isCurrent = usePlayer((s) => s.video?.id === video.id);

  const [flags, setFlags] = useState({ liked: false, saved: false, subscribed: false });
  const [copied, setCopied] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reflect existing state on load so the buttons are never lying.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    Promise.all([
      isInCollection(user.uid, 'likes', video.id),
      isInCollection(user.uid, 'saved', video.id),
      video.channelId ? isSubscribed(user.uid, video.channelId) : Promise.resolve(false),
    ])
      .then(([l, s, sub]) => { if (alive) setFlags({ liked: l, saved: s, subscribed: sub }); })
      .catch(() => { /* rules or offline — buttons stay in their default state */ });
    return () => { alive = false; };
  }, [user, video.id, video.channelId]);

  // Signed-out viewers always see the neutral state, whatever was cached.
  const { liked, saved, subscribed } = user ? flags : { liked: false, saved: false, subscribed: false };
  const setFlag = <K extends 'liked' | 'saved' | 'subscribed'>(key: K, value: boolean | ((p: boolean) => boolean)) =>
    setFlags((f) => ({ ...f, [key]: typeof value === 'function' ? value(f[key]) : value }));
  const setLiked = (v: boolean | ((p: boolean) => boolean)) => setFlag('liked', v);
  const setSaved = (v: boolean | ((p: boolean) => boolean)) => setFlag('saved', v);
  const setSubscribed = (v: boolean | ((p: boolean) => boolean)) => setFlag('subscribed', v);

  const requireAuth = (): boolean => {
    if (user) return true;
    toast('Sign in to keep a library', { action: { label: 'Sign in', run: () => router.push('/signin') } });
    return false;
  };

  const like = async () => {
    if (!requireAuth()) return;
    setLiked((v) => !v); // optimistic
    try { setLiked(await toggleInCollection(user!.uid, 'likes', video)); }
    catch { setLiked((v) => !v); toast('Could not save that', { tone: 'error' }); }
  };

  const save = async () => {
    if (!requireAuth()) return;
    setSaved((v) => !v);
    try {
      const now = await toggleInCollection(user!.uid, 'saved', video);
      setSaved(now);
      toast(now ? 'Saved to Watch Later' : 'Removed from Watch Later', { tone: 'success' });
    } catch { setSaved((v) => !v); toast('Could not save that', { tone: 'error' }); }
  };

  const subscribe = async () => {
    if (!requireAuth() || !channel) return;
    setSubscribed((v) => !v);
    try {
      setSubscribed(await toggleSubscription(user!.uid, { id: channel.id, title: channel.title, avatar: channel.avatar }));
    } catch { setSubscribed((v) => !v); toast('Could not update subscription', { tone: 'error' }); }
  };

  /** `atSecond` produces a link that opens at that moment — the watch page
   *  parses `?t=` and it takes precedence over the viewer's own saved
   *  position, which is what someone sharing a specific moment expects. */
  const share = async (atSecond?: number) => {
    const base = `${window.location.origin}/watch?v=${video.id}`;
    const url = atSecond && atSecond > 0 ? `${base}&t=${Math.floor(atSecond)}` : base;
    setShareOpen(false);
    try {
      if (navigator.share) { await navigator.share({ title: video.title, url }); return; }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast(atSecond ? `Link copied at ${formatDuration(atSecond)}` : 'Link copied', { tone: 'success' });
    } catch { /* dismissed, or clipboard blocked */ }
  };

  const startRoom = async () => {
    if (!requireAuth()) return;
    setBusy(true);
    try {
      const id = await createRoom(
        { uid: user!.uid, name: user!.displayName ?? 'Host', photo: user!.photoURL },
        video,
      );
      router.push(`/rooms/${id}`);
    } catch {
      toast('Could not open a room', { tone: 'error' });
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Channel */}
      {channel && (
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link href={`/channel/${channel.id}`} className="shrink-0 transition-transform duration-300 hover:scale-105">
            <Avatar src={channel.avatar} name={channel.title} size={42} />
          </Link>
          <div className="min-w-0">
            <Link href={`/channel/${channel.id}`} className="block truncate text-[14.5px] font-medium text-cream transition-colors hover:text-white">
              {channel.title}
            </Link>
            <p className="truncate font-mono text-[11px] text-faint tnum">
              {subscriberLabel(channel.subscriberCount) || `${compactNumber(channel.videoCount)} videos`}
            </p>
          </div>
          <Button
            onClick={subscribe}
            variant={subscribed ? 'secondary' : 'primary'}
            size="sm"
            className="ml-1 shrink-0 rounded-full px-4"
          >
            {subscribed ? <><Check className="h-3.5 w-3.5" /> Following</> : 'Follow'}
          </Button>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Pill onClick={like} active={liked} label={liked ? 'Liked' : 'Like'}>
          <ThumbsUp className={cn('h-4 w-4', liked && 'fill-current')} />
          <span className="tnum">{compactNumber((video.likeCount ?? 0) + (liked ? 1 : 0))}</span>
        </Pill>

        <Pill onClick={save} active={saved} label={saved ? 'Saved' : 'Watch later'}>
          {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
          <span className="hidden sm:inline">{saved ? 'Saved' : 'Later'}</span>
        </Pill>

        <div className="relative">
          <Pill onClick={() => (requireAuth() ? setPickerOpen((v) => !v) : null)} label="Add to playlist">
            <ListPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Playlist</span>
          </Pill>
          <AnimatePresence>
            {pickerOpen && user && (
              <PlaylistPicker video={video} uid={user.uid} onClose={() => setPickerOpen(false)} />
            )}
          </AnimatePresence>
        </div>

        <div className="relative">
          <Pill
            onClick={() => (isCurrent && position > 3 ? setShareOpen((v) => !v) : share())}
            label="Share"
            active={copied}
          >
            {copied ? <Check className="h-4 w-4" /> : navigatorHasShare() ? <Share2 className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Share'}</span>
          </Pill>

          <AnimatePresence>
            {shareOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShareOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute bottom-11 left-0 z-20 w-56 overflow-hidden rounded-xl border border-line-strong chrome p-1 shadow-float"
                >
                  <button
                    onClick={() => share()}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-cream-dim transition-colors hover:bg-cream/[0.07] hover:text-cream"
                  >
                    <Link2 className="h-3.5 w-3.5 shrink-0" /> Link to the video
                  </button>
                  <button
                    onClick={() => share(position)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-cream-dim transition-colors hover:bg-cream/[0.07] hover:text-cream"
                  >
                    <Clock3 className="h-3.5 w-3.5 shrink-0" />
                    <span>Starts at <span className="font-mono text-flare tnum">{formatDuration(position)}</span></span>
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <Pill onClick={startRoom} label="Watch together" disabled={busy}>
          <Users className="h-4 w-4" />
          <span className="hidden md:inline">Watch together</span>
        </Pill>
      </div>
    </div>
  );
}

function navigatorHasShare() {
  return typeof navigator !== 'undefined' && Boolean(navigator.share);
}

function Pill({
  children, onClick, active, label, disabled,
}: {
  children: React.ReactNode; onClick(): void; active?: boolean; label: string; disabled?: boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium',
        'transition-[background-color,border-color,color] duration-250',
        active
          ? 'border-flare/40 bg-flare/12 text-flare'
          : 'border-line text-cream-dim hover:border-line-strong hover:bg-cream/[0.05] hover:text-cream',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      {children}
    </motion.button>
  );
}

function PlaylistPicker({ video, uid, onClose }: { video: Video; uid: string; onClose(): void }) {
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');

  useEffect(() => {
    listPlaylists(uid).then(setPlaylists).catch(() => setPlaylists([]));
  }, [uid]);

  const add = async (playlistId: string, name: string) => {
    try {
      await addToPlaylist(playlistId, video);
      toast(`Added to ${name}`, { tone: 'success' });
      onClose();
    } catch { toast('Could not add to that playlist', { tone: 'error' }); }
  };

  const create = async () => {
    const name = title.trim();
    if (!name) return;
    try {
      const id = await createPlaylist(uid, { title: name });
      await addToPlaylist(id, video);
      toast(`Created “${name}”`, { tone: 'success' });
      onClose();
    } catch { toast('Could not create that playlist', { tone: 'error' }); }
  };

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="absolute bottom-11 left-0 z-20 w-64 overflow-hidden rounded-xl border border-line-strong chrome shadow-float"
      >
        <p className="eyebrow border-b border-line px-3.5 py-2.5">Save to playlist</p>

        <div className="max-h-52 overflow-y-auto p-1.5">
          {playlists === null && <p className="px-2.5 py-3 text-[12.5px] text-faint">Loading…</p>}
          {playlists?.length === 0 && !creating && (
            <p className="px-2.5 py-3 text-[12.5px] text-faint">No playlists yet.</p>
          )}
          {playlists?.map((p) => (
            <button
              key={p.id}
              onClick={() => add(p.id, p.title)}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-cream-dim transition-colors hover:bg-cream/[0.06] hover:text-cream"
            >
              <span className="truncate">{p.title}</span>
              <span className="shrink-0 font-mono text-[10.5px] text-faint tnum">{p.videoIds.length}</span>
            </button>
          ))}
        </div>

        <div className="border-t border-line p-1.5">
          {creating ? (
            <div className="flex gap-1.5 p-1">
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()}
                placeholder="Playlist name"
                maxLength={60}
                className="h-8 flex-1 rounded-lg border border-line bg-ink-800 px-2.5 text-[12.5px] text-cream outline-none placeholder:text-faint focus:border-flare/50"
              />
              <button onClick={create} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cream text-ink-950 transition-colors hover:bg-white">
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-cream-dim transition-colors hover:bg-cream/[0.06] hover:text-cream"
            >
              <Plus className="h-3.5 w-3.5" /> New playlist
            </button>
          )}
        </div>
      </motion.div>
    </>
  );
}

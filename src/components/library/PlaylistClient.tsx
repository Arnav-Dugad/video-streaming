'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft, Check, Globe, Link2, ListVideo, Loader2, Lock, Play, Trash2, X,
} from 'lucide-react';

import { useAuth } from '@/components/providers/AuthProvider';
import { getPlaylist, removeFromPlaylist, updatePlaylist } from '@/lib/db';
import { isFirebaseConfigured } from '@/lib/firebase';
import { EmptyState } from '@/components/ui/PageHeader';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Thumbnail } from '@/components/ui/Thumbnail';
import { GridSkeleton } from '@/components/ui/Skeleton';
import { formatDuration, pluralise, timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';
import { toast, usePlayer } from '@/lib/store';
import type { Playlist, Video } from '@/lib/types';

/* ==========================================================================
   A playlist as a page.

   Visibility is enforced by the Firestore rules, not here — a private
   playlist simply fails to read for anyone but its owner, and that failure is
   what produces the "not available" state. The UI never decides who may see
   what; it only renders what the database was willing to return.
   ========================================================================== */

const VISIBILITIES = [
  { value: 'private' as const, label: 'Private', icon: Lock, hint: 'Only you' },
  { value: 'unlisted' as const, label: 'Unlisted', icon: Link2, hint: 'Anyone with the link' },
  { value: 'public' as const, label: 'Public', icon: Globe, hint: 'Anyone' },
];

export function PlaylistClient({ playlistId }: { playlistId: string }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [playlist, setPlaylist] = useState<Playlist | null | undefined>(
    isFirebaseConfigured ? undefined : null,
  );
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = usePlayer((s) => s.load);

  /* ------------------------------ fetch --------------------------------- */

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    let alive = true;
    getPlaylist(playlistId)
      .then((p) => alive && setPlaylist(p))
      .catch(() => alive && setPlaylist(null));
    return () => { alive = false; };
  }, [playlistId, user]);

  useEffect(() => {
    if (!playlist) return;
    const controller = new AbortController();
    if (playlist.videoIds.length === 0) {
      // Deferred so this is not a synchronous setState inside the effect body,
      // which would cascade a second render before the first has painted.
      queueMicrotask(() => !controller.signal.aborted && setVideos([]));
      return () => controller.abort();
    }
    // Playlists store ids only; the metadata comes from the API in one batch.
    fetch(`/api/videos?ids=${playlist.videoIds.slice(0, 50).join(',')}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d: { items?: Video[] }) => setVideos(d.items ?? []))
      .catch(() => setVideos([]));
    return () => controller.abort();
  }, [playlist]);

  /* ----------------------------- actions -------------------------------- */

  const isOwner = Boolean(user && playlist && playlist.ownerUid === user.uid);

  const setVisibility = async (visibility: Playlist['visibility']) => {
    if (!playlist || !isOwner) return;
    const previous = playlist.visibility;
    setPlaylist({ ...playlist, visibility });
    setSaving(true);
    try {
      await updatePlaylist(playlist.id, { visibility });
    } catch {
      setPlaylist({ ...playlist, visibility: previous });
      toast('Could not change visibility', { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (videoId: string) => {
    if (!playlist || !isOwner) return;
    setVideos((rows) => rows?.filter((v) => v.id !== videoId) ?? null);
    setPlaylist({ ...playlist, videoIds: playlist.videoIds.filter((id) => id !== videoId) });
    try {
      await removeFromPlaylist(playlist.id, videoId);
    } catch {
      toast('Could not remove that', { tone: 'error' });
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast(
        playlist?.visibility === 'private'
          ? 'Link copied — but this playlist is private, so nobody else can open it yet'
          : 'Link copied',
        { tone: playlist?.visibility === 'private' ? 'neutral' : 'success' },
      );
    } catch { toast('Could not copy the link', { tone: 'error' }); }
  };

  /** Queues the whole playlist behind the first video. */
  const playAll = () => {
    if (!videos || videos.length === 0) return;
    const [first, ...rest] = videos;
    load(first, { queue: rest });
    router.push(`/watch?v=${first.id}`);
  };

  /* ------------------------------ states -------------------------------- */

  if (!isFirebaseConfigured) {
    return (
      <div className="gutter-wide py-20">
        <EmptyState
          title="Playlists need Firebase"
          body="This deployment has no Firebase credentials, so playlists are switched off."
          action={<ButtonLink href="/browse" variant="outline" size="sm">Keep browsing</ButtonLink>}
        />
      </div>
    );
  }

  if (loading || playlist === undefined) {
    return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="h-5 w-5 animate-spin text-flare" /></div>;
  }

  if (playlist === null) {
    return (
      <div className="gutter-wide py-20">
        <EmptyState
          icon={<ListVideo className="h-6 w-6" />}
          title="This playlist is not available"
          body={user
            ? 'It was deleted, or it is private and belongs to someone else.'
            : 'It may be private. If it is yours, sign in to open it.'}
          action={
            user
              ? <ButtonLink href="/library?tab=playlists" size="sm">Your playlists</ButtonLink>
              : <ButtonLink href={`/signin?next=/playlist/${playlistId}`} size="sm">Sign in</ButtonLink>
          }
        />
      </div>
    );
  }

  const totalSeconds = (videos ?? []).reduce((sum, v) => sum + (v.durationSeconds ?? 0), 0);

  return (
    <div className="gutter-wide py-8">
      <Link
        href="/library?tab=playlists"
        className="group mb-7 inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-cream"
      >
        <ArrowLeft className="h-3 w-3 transition-transform duration-300 group-hover:-translate-x-1" />
        Playlists
      </Link>

      <div className="grid gap-8 lg:grid-cols-[22rem_1fr] lg:gap-12">
        {/* ----------------------------- header --------------------------- */}
        <header className="lg:sticky lg:top-24 lg:self-start">
          <div className="grid aspect-video grid-cols-2 gap-1 overflow-hidden rounded-2xl bg-ink-800">
            {(playlist.covers.length > 0 ? playlist.covers : ['', '', '', '']).slice(0, 4).map((cover, i) => (
              <span key={i} className="relative overflow-hidden bg-ink-850">
                {cover && <Thumbnail src={cover} alt="" sizes="200px" reveal={false} />}
              </span>
            ))}
          </div>

          <h1 className="display mt-5 text-[clamp(1.7rem,3.4vw,2.4rem)] text-cream">{playlist.title}</h1>
          {playlist.description && (
            <p className="mt-3 text-[13.5px] leading-relaxed text-muted">{playlist.description}</p>
          )}

          <p className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[11px] text-faint tnum">
            <span>{pluralise(playlist.videoIds.length, 'video')}</span>
            {totalSeconds > 0 && (<><span className="text-faint/50">·</span><span>{formatDuration(totalSeconds)} total</span></>)}
            <span className="text-faint/50">·</span>
            <span>updated {timeAgo(playlist.updatedAt)}</span>
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={playAll} size="md" disabled={!videos || videos.length === 0}>
              <Play className="h-4 w-4 fill-current" /> Play all
            </Button>
            <Button onClick={copyLink} variant="outline" size="md">
              {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
              {copied ? 'Copied' : 'Share'}
            </Button>
          </div>

          {isOwner && (
            <div className="mt-7">
              <p className="eyebrow mb-2.5">Who can open this</p>
              <div className="flex flex-wrap gap-1.5">
                {VISIBILITIES.map((v) => {
                  const on = playlist.visibility === v.value;
                  return (
                    <button
                      key={v.value}
                      onClick={() => setVisibility(v.value)}
                      disabled={saving}
                      aria-pressed={on}
                      title={v.hint}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] transition-[background-color,border-color,color] duration-250',
                        on
                          ? 'border-flare/45 bg-flare/12 text-flare'
                          : 'border-line text-cream-dim hover:border-line-strong hover:text-cream',
                      )}
                    >
                      <v.icon className="h-3.5 w-3.5" /> {v.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
                {VISIBILITIES.find((v) => v.value === playlist.visibility)?.hint} can open this link.
              </p>
            </div>
          )}
        </header>

        {/* ------------------------------ items ---------------------------- */}
        <section>
          {videos === null && <GridSkeleton count={4} />}

          {videos?.length === 0 && (
            <EmptyState
              icon={<ListVideo className="h-6 w-6" />}
              title="Nothing in here yet"
              body={isOwner
                ? 'Use Playlist on any watch page to add something.'
                : 'The owner has not added anything to this playlist.'}
              action={isOwner ? <ButtonLink href="/browse" variant="outline" size="sm">Find something</ButtonLink> : undefined}
            />
          )}

          {videos && videos.length > 0 && (
            <ol className="space-y-1">
              <AnimatePresence mode="popLayout">
                {videos.map((v, i) => (
                  <motion.li key={v.id} layout exit={{ opacity: 0, x: -24, transition: { duration: 0.22 } }}>
                    <div className="group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-ink-800/60">
                      <span className="w-6 shrink-0 text-center font-mono text-[11px] text-faint tnum">{i + 1}</span>
                      <Link href={`/watch?v=${v.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-ink-800 sm:w-40">
                          <Thumbnail src={v.thumbnail} alt="" sizes="180px" reveal={false} />
                          {v.durationSeconds ? (
                            <span className="absolute bottom-1 right-1 rounded bg-ink-950/85 px-1 py-px font-mono text-[10px] text-cream tnum">
                              {formatDuration(v.durationSeconds)}
                            </span>
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="clamp-2 block text-[13.5px] font-medium leading-snug text-cream">{v.title}</span>
                          <span className="mt-1 block truncate text-[12px] text-muted">{v.channelTitle}</span>
                        </span>
                      </Link>
                      {isOwner && (
                        <button
                          onClick={() => remove(v.id)}
                          aria-label={`Remove ${v.title}`}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-faint opacity-0 transition-[opacity,color] hover:text-flare group-hover:opacity-100"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

export { Trash2 };

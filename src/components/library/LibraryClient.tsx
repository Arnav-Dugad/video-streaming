'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bookmark, Clock, Heart, ListVideo, Plus, Trash2, Users2, X,
} from 'lucide-react';

import { useAuth } from '@/components/providers/AuthProvider';
import {
  clearHistory, createPlaylist, deletePlaylist, getHistory, listCollection,
  listPlaylists, listSubscriptions, removeFromHistory, type Subscription,
} from '@/lib/db';
import type { HistoryEntry, Playlist, SavedVideo } from '@/lib/types';
import { PageHeader, EmptyState } from '@/components/ui/PageHeader';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Thumbnail } from '@/components/ui/Thumbnail';
import { Avatar } from '@/components/ui/Avatar';
import { GridSkeleton } from '@/components/ui/Skeleton';
import { formatDuration, timeAgo, pluralise } from '@/lib/format';
import { cn } from '@/lib/cn';
import { toast } from '@/lib/store';
import { YouTubeSubscriptions } from './YouTubeSubscriptions';

/* ==========================================================================
   Library.

   Five tabs, one per Firestore collection. Tab state lives in the URL so a
   given tab is linkable and Back works — the header menu links straight to
   ?tab=history, and it has to land there.
   ========================================================================== */

const TABS = [
  { id: 'saved', label: 'Watch later', icon: Bookmark },
  { id: 'liked', label: 'Liked', icon: Heart },
  { id: 'history', label: 'History', icon: Clock },
  { id: 'playlists', label: 'Playlists', icon: ListVideo },
  { id: 'following', label: 'Following', icon: Users2 },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function LibraryClient() {
  const { user, profile, loading, configured } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const requested = params.get('tab') as TabId | null;
  const tab: TabId = TABS.some((t) => t.id === requested) ? requested! : 'saved';

  const [saved, setSaved] = useState<SavedVideo[] | null>(null);
  const [liked, setLiked] = useState<SavedVideo[] | null>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [following, setFollowing] = useState<Subscription[] | null>(null);

  // Bumping this re-runs the fetch effect. Cheaper and less error-prone than
  // hand-rolling a refetch function that duplicates the effect's body.
  const [reloadToken, setReloadToken] = useState(0);
  const load = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    Promise.all([
      listCollection(user.uid, 'saved').catch(() => []),
      listCollection(user.uid, 'likes').catch(() => []),
      getHistory(user.uid).catch(() => []),
      listPlaylists(user.uid).catch(() => []),
      listSubscriptions(user.uid).catch(() => []),
    ]).then(([s, l, h, p, f]) => {
      if (!alive) return;
      setSaved(s); setLiked(l); setHistory(h); setPlaylists(p); setFollowing(f);
    });
    return () => { alive = false; };
  }, [user, reloadToken]);

  const counts = useMemo(() => ({
    saved: saved?.length ?? 0,
    liked: liked?.length ?? 0,
    history: history?.length ?? 0,
    playlists: playlists?.length ?? 0,
    following: following?.length ?? 0,
  }), [saved, liked, history, playlists, following]);

  /* --------------------------- gated states ----------------------------- */

  if (loading) return <div className="gutter-wide py-20"><GridSkeleton count={8} /></div>;

  if (!configured) {
    return (
      <>
        <PageHeader eyebrow="Yours" title="Library" />
        <div className="gutter-wide pb-16">
          <EmptyState
            title="Accounts are not configured on this deployment"
            body="The library is backed by Firebase. Add your Firebase credentials to the environment to switch it on — browsing, search and playback all work without it."
            action={<ButtonLink href="/browse" variant="outline" size="sm">Keep browsing</ButtonLink>}
          />
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <PageHeader eyebrow="Yours" title="Library" lede="Sign in and everything you save, like and half-watch shows up here." />
        <div className="gutter-wide pb-16">
          <EmptyState
            icon={<Bookmark className="h-6 w-6" />}
            title="You are not signed in"
            body="Your library follows you across devices — watch positions, playlists, followed channels and all."
            action={
              <div className="flex gap-2.5">
                <ButtonLink href="/signin?next=/library" size="sm">Sign in</ButtonLink>
                <ButtonLink href="/signup?next=/library" variant="outline" size="sm">Create account</ButtonLink>
              </div>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={`@${profile?.handle ?? user.uid.slice(0, 8)}`}
        title="Library"
        lede="Everything you saved, liked, half-finished and organised — synced to your account."
      />

      <div className="gutter-wide sticky top-16 z-40 bg-ink-950/85 py-3 backdrop-blur-xl sm:top-[68px]">
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto" role="tablist">
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => router.replace(t.id === 'saved' ? '/library' : `/library?tab=${t.id}`, { scroll: false })}
                className={cn(
                  'relative flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-medium transition-colors duration-300',
                  active ? 'text-ink-950' : 'text-cream-dim hover:text-cream',
                )}
              >
                {active && (
                  <motion.span layoutId="library-tab" className="absolute inset-0 -z-10 rounded-full bg-cream"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
                )}
                {!active && <span className="absolute inset-0 -z-10 rounded-full border border-line" />}
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
                <span className={cn('font-mono text-[10px] tnum', active ? 'text-ink-950/55' : 'text-faint')}>
                  {counts[t.id]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <section className="gutter-wide py-8">
        {tab === 'saved' && (
          <SavedGrid
            items={saved}
            emptyTitle="Nothing saved yet"
            emptyBody="Hover any video and hit the bookmark, or use Watch later on a watch page."
          />
        )}

        {tab === 'liked' && (
          <SavedGrid
            items={liked}
            emptyTitle="No likes yet"
            emptyBody="Liking a video keeps a permanent copy of it here — a bookmark you never have to organise."
          />
        )}

        {tab === 'history' && (
          <HistoryList
            items={history}
            onRemove={async (id) => {
              setHistory((rows) => rows?.filter((r) => r.videoId !== id) ?? null);
              try { await removeFromHistory(user.uid, id); } catch { toast('Could not remove that', { tone: 'error' }); load(); }
            }}
            onClear={async () => {
              const previous = history;
              setHistory([]);
              try { await clearHistory(user.uid); toast('History cleared', { tone: 'success' }); }
              catch { setHistory(previous ?? null); toast('Could not clear history', { tone: 'error' }); }
            }}
          />
        )}

        {tab === 'playlists' && (
          <Playlists
            items={playlists}
            onCreate={async (title) => {
              try { await createPlaylist(user.uid, { title }); load(); toast(`Created “${title}”`, { tone: 'success' }); }
              catch { toast('Could not create that playlist', { tone: 'error' }); }
            }}
            onDelete={async (id) => {
              setPlaylists((rows) => rows?.filter((p) => p.id !== id) ?? null);
              try { await deletePlaylist(id); } catch { toast('Could not delete that', { tone: 'error' }); load(); }
            }}
          />
        )}

        {tab === 'following' && (
          <>
            <Following items={following} />
            {following !== null && (
              <YouTubeSubscriptions uid={user.uid} alreadyFollowing={following} onImported={load} />
            )}
          </>
        )}
      </section>
    </>
  );
}

/* -------------------------------- panels -------------------------------- */

function SavedGrid({ items, emptyTitle, emptyBody }: { items: SavedVideo[] | null; emptyTitle: string; emptyBody: string }) {
  if (items === null) return <GridSkeleton count={8} />;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Bookmark className="h-6 w-6" />}
        title={emptyTitle}
        body={emptyBody}
        action={<ButtonLink href="/browse" variant="outline" size="sm">Find something</ButtonLink>}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {items.map((v, i) => (
        <motion.article
          key={v.videoId}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: Math.min(i, 8) * 0.04, ease: [0.16, 1, 0.3, 1] }}
          className="group"
        >
          <Link href={`/watch?v=${v.videoId}`} data-cursor="Watch">
            <div className="relative aspect-video overflow-hidden rounded-card bg-ink-800 ring-1 ring-inset ring-cream/[0.06]">
              <Thumbnail src={v.thumbnail} alt={v.title} sizes="(max-width:768px) 100vw, 25vw"
                className="transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]" />
              {v.durationSeconds > 0 && (
                <span className="absolute bottom-2 right-2 rounded-md bg-ink-950/85 px-1.5 py-[3px] font-mono text-[10.5px] text-cream backdrop-blur-sm tnum">
                  {formatDuration(v.durationSeconds)}
                </span>
              )}
            </div>
            <h3 className="clamp-2 mt-3 text-[13.5px] font-medium leading-snug text-cream">{v.title}</h3>
          </Link>
          <p className="mt-1 truncate text-[12px] text-muted">{v.channelTitle}</p>
          <p className="mt-0.5 font-mono text-[10.5px] text-faint">Saved {timeAgo(v.savedAt)}</p>
        </motion.article>
      ))}
    </div>
  );
}

function HistoryList({
  items, onRemove, onClear,
}: { items: HistoryEntry[] | null; onRemove(id: string): void; onClear(): void }) {
  if (items === null) return <GridSkeleton count={6} />;
  if (items.length === 0) {
    return <EmptyState icon={<Clock className="h-6 w-6" />} title="No history yet" body="Watch something and it lands here, with the exact second you stopped at." />;
  }

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="font-mono text-[11px] text-faint tnum">{items.length} entries</p>
        <button onClick={onClear} className="inline-flex items-center gap-1.5 text-[12.5px] text-muted transition-colors hover:text-flare">
          <Trash2 className="h-3.5 w-3.5" /> Clear all
        </button>
      </div>

      <ul className="max-w-4xl space-y-1">
        <AnimatePresence mode="popLayout">
          {items.map((h) => {
            const pct = h.durationSeconds > 0 ? Math.min(100, (h.progress / h.durationSeconds) * 100) : 0;
            return (
              <motion.li key={h.videoId} layout exit={{ opacity: 0, x: -24, transition: { duration: 0.22 } }}>
                <div className="group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-ink-800/60">
                  <Link href={`/watch?v=${h.videoId}&t=${Math.floor(h.progress)}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-ink-800 sm:w-40">
                      <Thumbnail src={h.thumbnail} alt="" sizes="180px" reveal={false} />
                      <span className="absolute inset-x-0 bottom-0 h-[3px] bg-cream/20">
                        <span className="block h-full bg-flare" style={{ width: `${pct}%` }} />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="clamp-2 block text-[13.5px] font-medium leading-snug text-cream">{h.title}</span>
                      <span className="mt-1 block truncate text-[12px] text-muted">{h.channelTitle}</span>
                      <span className="mt-0.5 block font-mono text-[10.5px] text-faint tnum">
                        {h.completed ? 'Finished' : `${formatDuration(h.progress)} of ${formatDuration(h.durationSeconds)}`}
                        {' · '}{timeAgo(h.watchedAt)}
                      </span>
                    </span>
                  </Link>
                  <button
                    onClick={() => onRemove(h.videoId)}
                    aria-label="Remove from history"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-faint opacity-0 transition-[opacity,color] hover:text-flare group-hover:opacity-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </>
  );
}

function Playlists({
  items, onCreate, onDelete,
}: { items: Playlist[] | null; onCreate(title: string): void; onDelete(id: string): void }) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');

  if (items === null) return <GridSkeleton count={4} />;

  const submit = () => {
    const name = title.trim();
    if (!name) return;
    onCreate(name);
    setTitle('');
    setCreating(false);
  };

  return (
    <>
      <div className="mb-6">
        {creating ? (
          <div className="flex max-w-sm gap-2">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setCreating(false); }}
              placeholder="Playlist name"
              maxLength={60}
              className="h-10 flex-1 rounded-xl border border-line bg-ink-850 px-3.5 text-[14px] text-cream outline-none placeholder:text-faint focus:border-flare/60"
            />
            <Button onClick={submit} size="md">Create</Button>
            <Button onClick={() => setCreating(false)} variant="ghost" size="md">Cancel</Button>
          </div>
        ) : (
          <Button onClick={() => setCreating(true)} variant="outline" size="sm">
            <Plus className="h-3.5 w-3.5" /> New playlist
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<ListVideo className="h-6 w-6" />} title="No playlists yet" body="Playlists are the one part of a library worth curating by hand." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {items.map((p) => (
            <article key={p.id} className="group relative overflow-hidden rounded-2xl border border-line p-4 transition-[border-color] duration-400 hover:border-line-strong">
              <Link href={`/playlist/${p.id}`} data-cursor="Open">
                <div className="mb-4 grid aspect-video grid-cols-2 gap-1 overflow-hidden rounded-xl bg-ink-800">
                  {(p.covers.length > 0 ? p.covers : ['', '', '', '']).slice(0, 4).map((cover, i) => (
                    <span key={i} className="relative overflow-hidden bg-ink-850">
                      {cover && <Thumbnail src={cover} alt="" sizes="150px" reveal={false} />}
                    </span>
                  ))}
                </div>
                <h3 className="truncate text-[14px] font-medium text-cream">{p.title}</h3>
              </Link>
              <p className="mt-1 font-mono text-[11px] text-faint tnum">
                {pluralise(p.videoIds.length, 'video')} · {p.visibility}
              </p>
              <button
                onClick={() => onDelete(p.id)}
                aria-label={`Delete ${p.title}`}
                className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg bg-ink-950/70 text-faint opacity-0 backdrop-blur-sm transition-[opacity,color] hover:text-flare group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function Following({ items }: { items: Subscription[] | null }) {
  if (items === null) return <GridSkeleton count={6} />;
  if (items.length === 0) {
    return <EmptyState icon={<Users2 className="h-6 w-6" />} title="Not following anyone yet" body="Follow a channel and it shows up here for one-tap access." />;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {items.map((s) => (
        <Link
          key={s.channelId}
          href={`/channel/${s.channelId}`}
          className="flex items-center gap-3 rounded-xl border border-line p-3.5 transition-[border-color,background-color] duration-300 hover:border-line-strong hover:bg-cream/[0.03]"
        >
          <Avatar src={s.avatar} name={s.channelTitle} size={44} />
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-medium text-cream">{s.channelTitle}</p>
            <p className="font-mono text-[10.5px] text-faint">Following since {timeAgo(s.subscribedAt)}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

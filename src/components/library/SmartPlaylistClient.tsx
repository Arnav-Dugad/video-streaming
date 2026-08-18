'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, RefreshCw, Settings2, Sparkles, Trash2 } from 'lucide-react';

import { useAuth } from '@/components/providers/AuthProvider';
import {
  deleteSmartPlaylist, getHistory, getSmartPlaylist, listSubscriptions,
  updateSmartPlaylist, type Subscription,
} from '@/lib/db';
import { isFirebaseConfigured } from '@/lib/firebase';
import { SmartRuleEditor } from './SmartRuleEditor';
import { VideoGrid } from '@/components/video/VideoGrid';
import { PlaylistPlayAll } from '@/components/video/PlaylistPlayAll';
import { EmptyState } from '@/components/ui/PageHeader';
import { Button, ButtonLink } from '@/components/ui/Button';
import { GridSkeleton } from '@/components/ui/Skeleton';
import { RevealText } from '@/components/ui/Reveal';
import { toast } from '@/lib/store';
import { pluralise } from '@/lib/format';
import type { SmartPlaylist, SmartRule, Video } from '@/lib/types';

/* ==========================================================================
   A smart playlist, resolved live.

   Nothing is stored but the rule, so the contents are whatever matches right
   now. `excludeWatched` is applied here rather than server-side: it needs the
   viewer's own history, which a shared cacheable route has no business reading.
   ========================================================================== */

export function SmartPlaylistClient({ smartId }: { smartId: string }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [playlist, setPlaylist] = useState<SmartPlaylist | null | undefined>(
    isFirebaseConfigured ? undefined : null,
  );
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [following, setFollowing] = useState<Subscription[]>([]);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftRule, setDraftRule] = useState<SmartRule | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    let alive = true;
    getSmartPlaylist(smartId)
      .then((p) => { if (alive) { setPlaylist(p); if (p) { setDraftTitle(p.title); setDraftRule(p.rule); } } })
      .catch(() => alive && setPlaylist(null));
    return () => { alive = false; };
  }, [smartId]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    Promise.all([listSubscriptions(user.uid).catch(() => []), getHistory(user.uid, 300).catch(() => [])])
      .then(([subs, history]) => {
        if (!alive) return;
        setFollowing(subs);
        setWatched(new Set(history.filter((h) => h.completed).map((h) => h.videoId)));
      });
    return () => { alive = false; };
  }, [user]);

  /* Bumping this re-runs the resolve effect. Calling a resolve() helper from
     an effect instead would setState synchronously inside it and cascade a
     second render before the first had painted. */
  const [resolveToken, setResolveToken] = useState(0);
  const resolve = useCallback(() => setResolveToken((t) => t + 1), []);

  useEffect(() => {
    if (!playlist) return;
    const controller = new AbortController();
    let alive = true;

    fetch('/api/smart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule: playlist.rule }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data: { items?: Video[]; error?: string }) => {
        if (!alive) return;
        setVideos(data.items ?? []);
        setRefreshing(false);
        if (data.error) toast('Could not resolve every part of this rule', { tone: 'error' });
      })
      .catch((err: Error) => {
        if (!alive || err.name === 'AbortError') return;
        setVideos([]);
        setRefreshing(false);
        toast('Could not refresh this playlist', { tone: 'error' });
      });

    return () => { alive = false; controller.abort(); };
  }, [playlist, resolveToken]);

  const isOwner = Boolean(user && playlist && playlist.ownerUid === user.uid);

  const save = async () => {
    if (!playlist || !draftRule) return;
    try {
      await updateSmartPlaylist(playlist.id, { title: draftTitle.trim() || 'Smart playlist', rule: draftRule });
      const next = { ...playlist, title: draftTitle.trim() || 'Smart playlist', rule: draftRule };
      setPlaylist(next);
      setEditing(false);
      toast('Rule saved', { tone: 'success' });
    } catch { toast('Could not save that rule', { tone: 'error' }); }
  };

  const remove = async () => {
    if (!playlist) return;
    try {
      await deleteSmartPlaylist(playlist.id);
      router.push('/library?tab=playlists');
    } catch { toast('Could not delete that', { tone: 'error' }); }
  };

  /* ------------------------------- states -------------------------------- */

  if (!isFirebaseConfigured) {
    return (
      <div className="gutter-wide py-20">
        <EmptyState
          title="Smart playlists need Firebase"
          body="The rule is stored in Firestore; the videos are resolved live from the YouTube API."
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
          icon={<Sparkles className="h-6 w-6" />}
          title="This smart playlist is not available"
          body="It was deleted, or it belongs to someone else."
          action={<ButtonLink href="/library?tab=playlists" size="sm">Your playlists</ButtonLink>}
        />
      </div>
    );
  }

  const shown = playlist.rule.excludeWatched
    ? (videos ?? []).filter((v) => !watched.has(v.id))
    : videos ?? [];

  const summary = [
    playlist.rule.channelNames.length > 0
      ? `${pluralise(playlist.rule.channelNames.length, 'channel')}`
      : playlist.rule.query ? `matching “${playlist.rule.query}”` : 'everything',
    playlist.rule.maxSeconds ? `under ${Math.round(playlist.rule.maxSeconds / 60)} min` : null,
    playlist.rule.minSeconds && !playlist.rule.maxSeconds ? `over ${Math.round(playlist.rule.minSeconds / 60)} min` : null,
    playlist.rule.publishedWithinDays ? `from the last ${playlist.rule.publishedWithinDays} days` : null,
    playlist.rule.excludeWatched ? 'excluding what you finished' : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="gutter-wide py-8">
      <Link
        href="/library?tab=playlists"
        className="group mb-7 inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-cream"
      >
        <ArrowLeft className="h-3 w-3 transition-transform duration-300 group-hover:-translate-x-1" />
        Playlists
      </Link>

      <header className="mb-8">
        <p className="eyebrow mb-3 flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" /> Smart playlist · rebuilt every visit
        </p>
        <h1 className="display text-[clamp(2rem,4.6vw,3.2rem)] text-cream">
          <RevealText text={playlist.title} />
        </h1>
        <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-muted">{summary}</p>

        <div className="mt-6 flex flex-wrap gap-2">
          <PlaylistPlayAll videos={shown} />
          <Button onClick={() => { setRefreshing(true); resolve(); }} variant="outline" size="md" loading={refreshing}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          {isOwner && (
            <>
              <Button onClick={() => setEditing((v) => !v)} variant={editing ? 'secondary' : 'ghost'} size="md">
                <Settings2 className="h-4 w-4" /> {editing ? 'Close editor' : 'Edit rule'}
              </Button>
              <Button onClick={remove} variant="ghost" size="md" className="text-muted hover:text-flare">
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </header>

      {editing && draftRule && (
        <section className="mb-10 rounded-2xl border border-line bg-ink-850/60 p-5 sm:p-6">
          <SmartRuleEditor
            title={draftTitle}
            rule={draftRule}
            following={following}
            onTitle={setDraftTitle}
            onRule={setDraftRule}
          />
          <div className="mt-7 flex gap-2">
            <Button onClick={save} size="md">Save rule</Button>
            <Button
              onClick={() => { setDraftTitle(playlist.title); setDraftRule(playlist.rule); setEditing(false); }}
              variant="ghost"
              size="md"
            >
              Discard
            </Button>
          </div>
        </section>
      )}

      {videos === null ? (
        <GridSkeleton count={8} />
      ) : (
        <>
          <p className="mb-5 font-mono text-[11px] text-faint tnum">
            {shown.length} {shown.length === 1 ? 'video' : 'videos'} match right now
          </p>
          <VideoGrid
            videos={shown}
            emptyState={
              <EmptyState
                icon={<Sparkles className="h-6 w-6" />}
                title="Nothing matches this rule right now"
                body={isOwner
                  ? 'Loosen the length or date filters, or add another channel.'
                  : 'The rule is too narrow for anything currently published.'}
                action={isOwner
                  ? <Button onClick={() => setEditing(true)} variant="outline" size="sm">Edit the rule</Button>
                  : undefined}
              />
            }
          />
        </>
      )}
    </div>
  );
}

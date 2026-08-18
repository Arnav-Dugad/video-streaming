'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CirclePlay, Download, Loader2 } from 'lucide-react';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { toggleSubscription, type Subscription } from '@/lib/db';
import { toast } from '@/lib/store';

/* ==========================================================================
   The viewer's real YouTube subscriptions.

   Distinct from PRISM's own follow list, which is Firestore-backed and needs
   no Google account. This reads the real thing and offers to copy it across,
   so a new account does not start empty.
   ========================================================================== */

interface YTSub {
  channelId: string;
  channelTitle: string;
  avatar: string;
}

export function YouTubeSubscriptions({
  uid, alreadyFollowing, onImported,
}: { uid: string; alreadyFollowing: Subscription[]; onImported(): void }) {
  const [subs, setSubs] = useState<YTSub[] | null>(null);
  const [available, setAvailable] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let alive = true;

    fetch('/api/youtube/me')
      .then((r) => r.json())
      .then((d: { connected?: boolean }) => {
        if (!alive || !d.connected) { setSubs([]); return; }
        setAvailable(true);
        return fetch('/api/youtube/subscriptions')
          .then((r) => r.json())
          .then((s: { items?: YTSub[] }) => alive && setSubs(s.items ?? []));
      })
      .catch(() => alive && setSubs([]));

    return () => { alive = false; };
  }, []);

  if (!available || subs === null) {
    return available
      ? <div className="flex items-center gap-2 py-6 text-[13px] text-faint"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading your subscriptions…</div>
      : null;
  }

  if (subs.length === 0) return null;

  const known = new Set(alreadyFollowing.map((f) => f.channelId));
  const missing = subs.filter((s) => !known.has(s.channelId));

  const importAll = async () => {
    setImporting(true);
    let added = 0;
    // Sequential on purpose: fifty parallel writes would trip Firestore's
    // per-client write limits and fail most of the batch.
    for (const sub of missing) {
      try {
        await toggleSubscription(uid, { id: sub.channelId, title: sub.channelTitle, avatar: sub.avatar });
        added += 1;
      } catch { /* keep going — a partial import is still useful */ }
    }
    setImporting(false);
    onImported();
    toast(
      added === missing.length
        ? `Imported ${added} ${added === 1 ? 'channel' : 'channels'}`
        : `Imported ${added} of ${missing.length} — the rest can be retried`,
      { tone: added > 0 ? 'success' : 'error' },
    );
  };

  return (
    <section className="mt-10 border-t border-line pt-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2 flex items-center gap-1.5">
            <CirclePlay className="h-3 w-3" /> On YouTube
          </p>
          <h3 className="text-[15px] font-medium text-cream">
            {subs.length} {subs.length === 1 ? 'subscription' : 'subscriptions'}
          </h3>
          <p className="mt-1 text-[12.5px] text-muted">
            {missing.length > 0
              ? `${missing.length} of these are not in your PRISM library yet.`
              : 'All of these are already in your PRISM library.'}
          </p>
        </div>
        {missing.length > 0 && (
          <Button onClick={importAll} loading={importing} variant="outline" size="sm">
            <Download className="h-3.5 w-3.5" /> Import {missing.length}
          </Button>
        )}
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {subs.map((s) => (
          <Link
            key={s.channelId}
            href={`/channel/${s.channelId}`}
            className="flex items-center gap-3 rounded-xl border border-line p-3.5 transition-[border-color,background-color] duration-300 hover:border-line-strong hover:bg-cream/[0.03]"
          >
            <Avatar src={s.avatar} name={s.channelTitle} size={40} />
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-medium text-cream">{s.channelTitle}</p>
              <p className="font-mono text-[10.5px] text-faint">
                {known.has(s.channelId) ? 'In your library' : 'Not imported'}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

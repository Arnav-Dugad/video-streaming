'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart3, Loader2 } from 'lucide-react';

import { useAuth } from '@/components/providers/AuthProvider';
import { getHistory } from '@/lib/db';
import { isFirebaseConfigured } from '@/lib/firebase';
import { buildInsights, humanDuration } from '@/lib/insights';
import { PageHeader, EmptyState } from '@/components/ui/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { Thumbnail } from '@/components/ui/Thumbnail';
import { StatTile } from './chart-kit';
import { ActivityHeatmap, HourHistogram, LengthSplit, TopChannels } from './Charts';
import { Reveal } from '@/components/ui/Reveal';
import { formatDate, formatDuration, compactNumber } from '@/lib/format';
import type { HistoryEntry } from '@/lib/types';

/* ==========================================================================
   Watch insights.

   Everything on this page comes out of the history the app was already
   writing — no new collection, no extra tracking. The one caveat is stated on
   the page rather than buried: history keeps the furthest position reached
   per video, not a session log, so "time watched" is a sum of furthest
   positions. Exact for a normal linear watch, generous for a video someone
   scrubbed to the end of.
   ========================================================================== */

export function InsightsClient() {
  const { user, loading, configured } = useAuth();
  const [history, setHistory] = useState<HistoryEntry[] | null>(
    isFirebaseConfigured ? null : [],
  );

  useEffect(() => {
    if (!user) return;
    let alive = true;
    // 400 covers well over a year for most people and still fits one read.
    getHistory(user.uid, 400)
      .then((rows) => alive && setHistory(rows))
      .catch(() => alive && setHistory([]));
    return () => { alive = false; };
  }, [user]);

  const insights = useMemo(() => buildInsights(history ?? []), [history]);

  if (!configured) {
    return (
      <>
        <PageHeader eyebrow="Yours" title="Your year in watching" />
        <div className="gutter-wide pb-16">
          <EmptyState
            title="Insights need Firebase"
            body="They are computed from your watch history, which lives in Firestore."
            action={<ButtonLink href="/browse" variant="outline" size="sm">Keep browsing</ButtonLink>}
          />
        </div>
      </>
    );
  }

  if (loading || (user && history === null)) {
    return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="h-5 w-5 animate-spin text-flare" /></div>;
  }

  if (!user) {
    return (
      <>
        <PageHeader eyebrow="Yours" title="Your year in watching" lede="Sign in and PRISM will show you what you actually watched." />
        <div className="gutter-wide pb-16">
          <EmptyState
            icon={<BarChart3 className="h-6 w-6" />}
            title="You are not signed in"
            body="Insights are built from your own history, so they need an account."
            action={
              <div className="flex gap-2.5">
                <ButtonLink href="/signin?next=/insights" size="sm">Sign in</ButtonLink>
                <ButtonLink href="/signup?next=/insights" variant="outline" size="sm">Create account</ButtonLink>
              </div>
            }
          />
        </div>
      </>
    );
  }

  if (!insights.hasData) {
    return (
      <>
        <PageHeader eyebrow="Yours" title="Your year in watching" />
        <div className="gutter-wide pb-16">
          <EmptyState
            icon={<BarChart3 className="h-6 w-6" />}
            title="Nothing to measure yet"
            body="Watch a few things and this page fills in — hours, channels, the times of day you actually watch, and how far you get through what you start."
            action={<ButtonLink href="/trending" size="sm">Find something</ButtonLink>}
          />
        </div>
      </>
    );
  }

  const finishRate = Math.round(insights.completionRate * 100);

  return (
    <>
      <PageHeader
        eyebrow={insights.firstWatchedAt ? `Since ${formatDate(insights.firstWatchedAt)}` : 'Yours'}
        title="Your year in watching"
        lede={`${humanDuration(insights.totalSeconds)} across ${compactNumber(insights.videosStarted)} videos and ${compactNumber(insights.distinctChannels)} channels. Nobody else can see this page.`}
      />

      <div className="gutter-wide space-y-5 pb-16">
        {/* KPI row — stat tiles, not a bar chart of four numbers. */}
        <Reveal>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Time watched"
              value={humanDuration(insights.totalSeconds)}
              countTo={insights.totalSeconds}
              format={humanDuration}
              hint={`About ${Math.max(1, Math.round(insights.totalSeconds / 3600 / 24 * 10) / 10)} full days of footage`}
            />
            <StatTile
              label="Videos started"
              value={compactNumber(insights.videosStarted)}
              countTo={insights.videosStarted}
              format={(n) => compactNumber(Math.round(n))}
              hint={`${compactNumber(insights.videosFinished)} watched to the end`}
            />
            <StatTile
              label="Finish rate"
              value={`${finishRate}%`}
              countTo={finishRate}
              format={(n) => `${Math.round(n)}%`}
              hint={finishRate >= 60
                ? 'You mostly finish what you start.'
                : 'You sample widely and finish selectively.'}
            />
            <StatTile
              label="Current streak"
              value={`${insights.currentStreak} ${insights.currentStreak === 1 ? 'day' : 'days'}`}
              countTo={insights.currentStreak}
              format={(n) => `${Math.round(n)} ${Math.round(n) === 1 ? 'day' : 'days'}`}
              hint={`Longest run: ${insights.longestStreak} ${insights.longestStreak === 1 ? 'day' : 'days'}`}
            />
          </div>
        </Reveal>

        <Reveal delay={0.06}>
          <ActivityHeatmap days={insights.days} />
        </Reveal>

        <div className="grid gap-5 lg:grid-cols-2">
          <Reveal delay={0.1}><TopChannels channels={insights.channels} /></Reveal>
          <div className="space-y-5">
            <Reveal delay={0.14}><HourHistogram hours={insights.hours} peakHour={insights.peakHour} /></Reveal>
            <Reveal delay={0.18}><LengthSplit lengths={insights.lengths} /></Reveal>
          </div>
        </div>

        {/* Two concrete artefacts — a page of aggregates benefits from
            something you can actually click. */}
        <div className="grid gap-5 sm:grid-cols-2">
          {insights.longest && (
            <Reveal delay={0.2}>
              <article className="rounded-2xl border border-line bg-ink-850/60 p-5 sm:p-6">
                <p className="eyebrow mb-4">Longest thing you opened</p>
                <Link href={`/watch?v=${insights.longest.videoId}`} className="group flex gap-4">
                  <span className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-ink-800">
                    <Thumbnail src={insights.longest.thumbnail} alt="" sizes="160px" reveal={false} />
                  </span>
                  <span className="min-w-0">
                    <span className="clamp-2 block text-[13.5px] font-medium leading-snug text-cream">
                      {insights.longest.title}
                    </span>
                    <span className="mt-1 block truncate text-[12px] text-muted">{insights.longest.channelTitle}</span>
                    <span className="mt-1 block font-mono text-[11px] text-faint tnum">
                      {formatDuration(insights.longest.durationSeconds)}
                    </span>
                  </span>
                </Link>
              </article>
            </Reveal>
          )}

          {insights.busiestDay && (
            <Reveal delay={0.24}>
              <article className="rounded-2xl border border-line bg-ink-850/60 p-5 sm:p-6">
                <p className="eyebrow mb-4">Your biggest day</p>
                <p className="text-[clamp(1.5rem,3vw,2rem)] font-semibold leading-none tracking-[-0.02em] text-cream">
                  {humanDuration(insights.busiestDay.seconds)}
                </p>
                <p className="mt-2.5 text-[13px] text-muted">
                  on {formatDate(insights.busiestDay.date)}, across{' '}
                  {insights.busiestDay.videos} {insights.busiestDay.videos === 1 ? 'video' : 'videos'}
                </p>
              </article>
            </Reveal>
          )}
        </div>

        <p className="max-w-2xl pt-2 text-[11.5px] leading-relaxed text-faint">
          Time watched is the sum of the furthest position you reached in each video,
          which is what your history stores. That is exact for a video watched
          straight through, and generous for one you scrubbed to the end of. Nothing
          here is sent anywhere — it is computed in your browser from your own
          history, and you can clear it at any time from{' '}
          <Link href="/library?tab=history" className="text-cream-dim underline decoration-line-strong underline-offset-4 transition-colors hover:text-cream">
            your library
          </Link>.
        </p>
      </div>
    </>
  );
}

import type { Metadata } from 'next';
import { SearchX } from 'lucide-react';

import {
  searchChannels, searchPlaylists, searchVideos, type SearchOptions,
} from '@/lib/youtube';
import { PageHeader, EmptyState } from '@/components/ui/PageHeader';
import { FilterChips } from '@/components/video/FilterChips';
import { VideoGrid } from '@/components/video/VideoGrid';
import { LoadMore } from '@/components/video/LoadMore';
import { ChannelCard, PlaylistCard } from '@/components/video/ChannelCard';
import { ButtonLink } from '@/components/ui/Button';
import { compactNumber } from '@/lib/format';
import type { Channel, PlaylistSummary, Video } from '@/lib/types';

export const revalidate = 600;

type SearchParams = Promise<{
  q?: string; type?: string; order?: string; duration?: string;
  when?: string; hd?: string; cc?: string;
}>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { q } = await searchParams;
  return {
    title: q ? `“${q}”` : 'Search',
    description: q ? `Results for “${q}” on PRISM.` : 'Search the catalogue.',
    robots: { index: false, follow: true },
  };
}

const TYPES = [
  { value: 'all', label: 'Everything' },
  { value: 'video', label: 'Videos' },
  { value: 'channel', label: 'Channels' },
  { value: 'playlist', label: 'Playlists' },
];

const ORDERS = [
  { value: 'relevance', label: 'Most relevant' },
  { value: 'viewCount', label: 'Most viewed' },
  { value: 'date', label: 'Newest' },
  { value: 'rating', label: 'Best rated' },
];

const DURATIONS = [
  { value: 'any', label: 'Any length' },
  { value: 'short', label: 'Under 4 min' },
  { value: 'medium', label: '4–20 min' },
  { value: 'long', label: 'Over 20 min' },
];

const WHEN = [
  { value: 'any', label: 'Any time' },
  { value: 'day', label: 'Past 24 hours' },
  { value: 'week', label: 'Past week' },
  { value: 'month', label: 'Past month' },
  { value: 'year', label: 'Past year' },
];

const FEATURES = [
  { value: 'any', label: 'Any quality' },
  { value: 'hd', label: 'HD only' },
  { value: '4k', label: '4K only' },
];

const CAPTIONS = [
  { value: 'any', label: 'Captions: any' },
  { value: 'closedCaption', label: 'With captions' },
];

const WINDOW_MS: Record<string, number> = {
  day: 86_400_000,
  week: 604_800_000,
  month: 2_592_000_000,
  year: 31_536_000_000,
};

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = params.q?.trim() ?? '';

  const pick = (list: { value: string }[], value: string | undefined, fallback: string) =>
    list.some((o) => o.value === value) ? value! : fallback;

  const type = pick(TYPES, params.type, 'all');
  const order = pick(ORDERS, params.order, 'relevance');
  const duration = pick(DURATIONS, params.duration, 'any');
  const when = pick(WHEN, params.when, 'any');
  const hd = pick(FEATURES, params.hd, 'any');
  const cc = pick(CAPTIONS, params.cc, 'any');

  if (!q) {
    return (
      <>
        <PageHeader eyebrow="Search" title="What are you after?" lede="Press ⌘K anywhere to search, or start from a category." />
        <div className="gutter-wide pb-16">
          <EmptyState
            icon={<SearchX className="h-6 w-6" />}
            title="No query yet"
            body="Search runs against the whole YouTube catalogue — videos, channels and playlists alike."
            action={<ButtonLink href="/browse" variant="outline" size="sm">Browse instead</ButtonLink>}
          />
        </div>
      </>
    );
  }

  // Server component: this render happens per request, so reading the clock
  // here is exactly right — the "past week" window has to be relative to now.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const publishedAfter = when !== 'any' ? new Date(now - WINDOW_MS[when]).toISOString() : undefined;

  const videoOptions: SearchOptions = {
    q,
    maxResults: 24,
    order: order as SearchOptions['order'],
    videoDuration: duration as SearchOptions['videoDuration'],
    publishedAfter,
    videoDefinition: hd === 'any' ? undefined : 'high',
    videoCaption: cc === 'any' ? undefined : 'closedCaption',
  };

  // Only fetch the sections actually being shown. "Everything" shows a small
  // slice of each; a specific tab gets a full page of that one kind.
  const wantsVideos = type === 'all' || type === 'video';
  const wantsChannels = type === 'all' || type === 'channel';
  const wantsPlaylists = type === 'all' || type === 'playlist';

  const [videoPage, channelPage, playlistPage] = await Promise.all([
    wantsVideos
      ? searchVideos({ ...videoOptions, maxResults: type === 'video' ? 24 : 12 })
          .catch(() => ({ items: [] as Video[], nextPageToken: undefined, totalResults: 0 }))
      : Promise.resolve({ items: [] as Video[], nextPageToken: undefined, totalResults: 0 }),
    wantsChannels
      ? searchChannels(q, undefined, type === 'channel' ? 20 : 4).catch(() => ({ items: [] as Channel[] }))
      : Promise.resolve({ items: [] as Channel[] }),
    wantsPlaylists
      ? searchPlaylists(q, undefined, type === 'playlist' ? 24 : 8).catch(() => ({ items: [] as PlaylistSummary[] }))
      : Promise.resolve({ items: [] as PlaylistSummary[] }),
  ]);

  const href = (patch: Partial<Record<'type' | 'order' | 'duration' | 'when' | 'hd' | 'cc', string>>) => {
    const sp = new URLSearchParams({ q });
    const next = { type, order, duration, when, hd, cc, ...patch };
    if (next.type !== 'all') sp.set('type', next.type);
    if (next.order !== 'relevance') sp.set('order', next.order);
    if (next.duration !== 'any') sp.set('duration', next.duration);
    if (next.when !== 'any') sp.set('when', next.when);
    if (next.hd !== 'any') sp.set('hd', next.hd);
    if (next.cc !== 'any') sp.set('cc', next.cc);
    return `/search?${sp}`;
  };

  const withHref = <T extends { value: string }>(list: T[], key: 'type' | 'order' | 'duration' | 'when' | 'hd' | 'cc') =>
    list.map((o) => ({ ...o, href: href({ [key]: o.value }) }));

  const loadMoreParams: Record<string, string> = { q, limit: '24', order };
  if (duration !== 'any') loadMoreParams.duration = duration;
  if (publishedAfter) loadMoreParams.after = publishedAfter;
  if (hd !== 'any') loadMoreParams.definition = 'high';
  if (cc !== 'any') loadMoreParams.caption = 'closedCaption';

  const nothing =
    videoPage.items.length === 0 && channelPage.items.length === 0 && playlistPage.items.length === 0;

  return (
    <>
      <PageHeader
        eyebrow={videoPage.totalResults ? `${compactNumber(videoPage.totalResults)} results` : 'Search'}
        title={q}
      />

      <div className="gutter-wide space-y-2.5 pb-7">
        <FilterChips options={withHref(TYPES, 'type')} active={type} label="Kind" />
        {type !== 'channel' && type !== 'playlist' && (
          <>
            <FilterChips options={withHref(ORDERS, 'order')} active={order} label="Sort" />
            <FilterChips options={withHref(DURATIONS, 'duration')} active={duration} label="Length" />
            <FilterChips options={withHref(WHEN, 'when')} active={when} label="Uploaded" />
            <FilterChips options={withHref(FEATURES, 'hd')} active={hd} label="Quality" />
            <FilterChips options={withHref(CAPTIONS, 'cc')} active={cc} label="Captions" />
          </>
        )}
      </div>

      <div className="gutter-wide space-y-12 pb-6">
        {nothing && (
          <EmptyState
            icon={<SearchX className="h-6 w-6" />}
            title={`Nothing matched “${q}”`}
            body="Try fewer words, or loosen the filters — length, quality and upload date all narrow results hard."
            action={<ButtonLink href={`/search?q=${encodeURIComponent(q)}`} variant="outline" size="sm">Clear filters</ButtonLink>}
          />
        )}

        {channelPage.items.length > 0 && (
          <section>
            {type === 'all' && <h2 className="eyebrow mb-4">Channels</h2>}
            <div className="space-y-3">
              {channelPage.items.map((c, i) => <ChannelCard key={c.id} channel={c} index={i} />)}
            </div>
            {type === 'all' && channelPage.items.length >= 4 && (
              <a href={href({ type: 'channel' })} className="mt-4 inline-block text-[13px] text-muted transition-colors hover:text-cream">
                All channels for “{q}” →
              </a>
            )}
          </section>
        )}

        {videoPage.items.length > 0 && (
          <section>
            {type === 'all' && <h2 className="eyebrow mb-4">Videos</h2>}
            <VideoGrid videos={videoPage.items} />
            {type === 'video' && <LoadMore initialToken={videoPage.nextPageToken} params={loadMoreParams} />}
          </section>
        )}

        {playlistPage.items.length > 0 && (
          <section>
            {type === 'all' && <h2 className="eyebrow mb-4">Playlists</h2>}
            <div className="grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {playlistPage.items.map((p, i) => <PlaylistCard key={p.id} playlist={p} index={i} />)}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

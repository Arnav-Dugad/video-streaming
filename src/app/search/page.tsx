import type { Metadata } from 'next';
import { SearchX } from 'lucide-react';

import { searchVideos, type SearchOptions } from '@/lib/youtube';
import { PageHeader, EmptyState } from '@/components/ui/PageHeader';
import { FilterChips } from '@/components/video/FilterChips';
import { VideoGrid } from '@/components/video/VideoGrid';
import { LoadMore } from '@/components/video/LoadMore';
import { ButtonLink } from '@/components/ui/Button';
import { compactNumber } from '@/lib/format';

export const revalidate = 600;

type SearchParams = Promise<{ q?: string; order?: string; duration?: string; when?: string }>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { q } = await searchParams;
  return {
    title: q ? `“${q}”` : 'Search',
    description: q ? `Results for “${q}” on PRISM.` : 'Search the catalogue.',
    robots: { index: false, follow: true },
  };
}

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

const WINDOW_MS: Record<string, number> = {
  day: 86_400_000,
  week: 604_800_000,
  month: 2_592_000_000,
  year: 31_536_000_000,
};

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = params.q?.trim() ?? '';
  const order = ORDERS.some((o) => o.value === params.order) ? params.order! : 'relevance';
  const duration = DURATIONS.some((d) => d.value === params.duration) ? params.duration! : 'any';
  const when = WHEN.some((w) => w.value === params.when) ? params.when! : 'any';

  if (!q) {
    return (
      <>
        <PageHeader eyebrow="Search" title="What are you after?" lede="Press ⌘K anywhere to search, or start from a category." />
        <div className="gutter-wide pb-16">
          <EmptyState
            icon={<SearchX className="h-6 w-6" />}
            title="No query yet"
            body="Search runs against the whole YouTube catalogue — titles, channels, descriptions and tags."
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
  const publishedAfter = when !== 'any'
    ? new Date(now - WINDOW_MS[when]).toISOString()
    : undefined;

  const options: SearchOptions = {
    q,
    maxResults: 24,
    order: order as SearchOptions['order'],
    videoDuration: duration as SearchOptions['videoDuration'],
    publishedAfter,
  };

  const page = await searchVideos(options).catch(() => ({ items: [], nextPageToken: undefined, totalResults: 0 }));

  const href = (o: string, d: string, w: string) => {
    const sp = new URLSearchParams({ q });
    if (o !== 'relevance') sp.set('order', o);
    if (d !== 'any') sp.set('duration', d);
    if (w !== 'any') sp.set('when', w);
    return `/search?${sp}`;
  };

  const orderOptions = ORDERS.map((o) => ({ ...o, href: href(o.value, duration, when) }));
  const durationOptions = DURATIONS.map((d) => ({ ...d, href: href(order, d.value, when) }));
  const whenOptions = WHEN.map((w) => ({ ...w, href: href(order, duration, w.value) }));

  const loadMoreParams: Record<string, string> = { q, limit: '24', order };
  if (duration !== 'any') loadMoreParams.duration = duration;
  if (publishedAfter) loadMoreParams.after = publishedAfter;

  return (
    <>
      <PageHeader
        eyebrow={page.totalResults ? `${compactNumber(page.totalResults)} results` : 'Search'}
        title={q}
      />

      <div className="gutter-wide space-y-2.5 pb-7">
        <FilterChips options={orderOptions} active={order} label="Sort" />
        <FilterChips options={durationOptions} active={duration} label="Length" />
        <FilterChips options={whenOptions} active={when} label="Uploaded" />
      </div>

      <section className="gutter-wide pb-6">
        <VideoGrid
          videos={page.items}
          emptyState={
            <EmptyState
              icon={<SearchX className="h-6 w-6" />}
              title={`Nothing matched “${q}”`}
              body="Try fewer words, or loosen the filters — length and upload date narrow results hard."
              action={<ButtonLink href={`/search?q=${encodeURIComponent(q)}`} variant="outline" size="sm">Clear filters</ButtonLink>}
            />
          }
        />

        {page.items.length > 0 && (
          <LoadMore initialToken={page.nextPageToken} params={loadMoreParams} />
        )}
      </section>
    </>
  );
}

import type { Metadata } from 'next';
import { Flame } from 'lucide-react';

import { getTrending, STATIC_CATEGORIES } from '@/lib/youtube';
import { PageHeader, EmptyState } from '@/components/ui/PageHeader';
import { FilterChips } from '@/components/video/FilterChips';
import { VideoCard } from '@/components/video/VideoCard';
import { Stagger, StaggerItem } from '@/components/ui/Reveal';
import { compactNumber, formatDuration, timeAgo } from '@/lib/format';
import { Thumbnail } from '@/components/ui/Thumbnail';
import Link from 'next/link';

export const revalidate = 1800;

export const metadata: Metadata = {
  title: 'Trending',
  description: 'The chart, ranked. What the world is watching right now, by region and by category.',
};

const REGIONS = [
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'IN', label: 'India' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
  { value: 'BR', label: 'Brazil' },
  { value: 'JP', label: 'Japan' },
  { value: 'KR', label: 'South Korea' },
];

const CATEGORIES = [{ value: 'all', label: 'All' }, ...STATIC_CATEGORIES.map((c) => ({ value: c.id, label: c.title }))];

/** Builds a /trending URL, omitting the defaults so the canonical view stays
 *  at a bare `/trending`. */
function trendingHref(region: string, category: string): string {
  const q = new URLSearchParams();
  if (region !== 'US') q.set('region', region);
  if (category !== 'all') q.set('category', category);
  const s = q.toString();
  return s ? `/trending?${s}` : '/trending';
}

type SearchParams = Promise<{ region?: string; category?: string }>;

export default async function TrendingPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const region = REGIONS.some((r) => r.value === params.region) ? params.region! : 'US';
  const category = params.category && CATEGORIES.some((c) => c.value === params.category) ? params.category : 'all';

  const videos = await getTrending(region, category === 'all' ? undefined : category, 50).catch(() => []);
  const [lead, ...rest] = videos;

  const regionOptions = REGIONS.map((r) => ({ ...r, href: trendingHref(r.value, category) }));
  const categoryOptions = CATEGORIES.map((c) => ({ ...c, href: trendingHref(region, c.value) }));

  return (
    <>
      <PageHeader
        eyebrow="The chart"
        title="Trending now"
        lede="Pulled straight from YouTube's most-popular chart, ranked and refreshed every half hour."
      />

      <div className="gutter-wide space-y-3 pb-6">
        <FilterChips options={regionOptions} active={region} label="Region" />
        <FilterChips options={categoryOptions} active={category} label="Category" />
      </div>

      {videos.length === 0 ? (
        <div className="gutter-wide py-8">
          <EmptyState
            icon={<Flame className="h-6 w-6" />}
            title="The chart is empty for this combination"
            body="Not every region publishes a chart for every category. Try All, or a different region."
          />
        </div>
      ) : (
        <section className="gutter-wide pb-10">
          {/* #1 gets the editorial treatment. Ranking only means something if
              the top of the list looks different from the rest of it. */}
          {lead && (
            <Link
              href={`/watch?v=${lead.id}`}
              data-cursor="Watch"
              className="group mb-10 grid gap-6 overflow-hidden rounded-2xl border border-line p-4 transition-[border-color] duration-500 hover:border-line-strong sm:p-5 lg:grid-cols-[1.5fr_1fr] lg:items-center"
            >
              <div className="relative aspect-video overflow-hidden rounded-xl bg-ink-800">
                <Thumbnail
                  src={lead.thumbnailHq || lead.thumbnail}
                  alt={lead.title}
                  priority
                  sizes="(max-width: 1024px) 100vw, 60vw"
                  className="transition-transform duration-[1100ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
                />
                <span className="absolute bottom-3 right-3 rounded-md bg-ink-950/85 px-2 py-1 font-mono text-[11px] text-cream backdrop-blur-sm tnum">
                  {formatDuration(lead.durationSeconds)}
                </span>
              </div>

              <div className="lg:pl-2">
                <div className="flex items-center gap-3">
                  <span className="font-display text-[3.5rem] leading-none text-flare">1</span>
                  <span className="eyebrow">Number one · {REGIONS.find((r) => r.value === region)?.label}</span>
                </div>
                <h2 className="display mt-4 text-[clamp(1.5rem,3vw,2.25rem)] text-cream">{lead.title}</h2>
                <p className="mt-3 text-[13px] text-muted">{lead.channelTitle}</p>
                <p className="mt-1.5 font-mono text-[11.5px] text-faint tnum">
                  {compactNumber(lead.viewCount)} views · {timeAgo(lead.publishedAt)}
                </p>
                <p className="clamp-2 mt-4 max-w-md text-[13px] leading-relaxed text-cream-dim/80">
                  {lead.description.split('\n')[0]}
                </p>
              </div>
            </Link>
          )}

          <Stagger className="grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {rest.map((v, i) => (
              <StaggerItem key={v.id}>
                <VideoCard video={v} rank={i + 2} priority={i < 3} />
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      )}
    </>
  );
}

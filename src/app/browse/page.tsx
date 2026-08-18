import type { Metadata } from 'next';
import { Compass } from 'lucide-react';

import { getTrending, searchVideos, STATIC_CATEGORIES } from '@/lib/youtube';
import { PageHeader, EmptyState } from '@/components/ui/PageHeader';
import { FilterChips } from '@/components/video/FilterChips';
import { VideoGrid } from '@/components/video/VideoGrid';
import { ButtonLink } from '@/components/ui/Button';
import type { Video } from '@/lib/types';

export const revalidate = 1800;

export const metadata: Metadata = {
  title: 'Browse',
  description: 'Move through the catalogue by category — music, technology, film, sport and everything between.',
};

const OPTIONS = [
  { value: 'all', label: 'Everything', href: '/browse' },
  ...STATIC_CATEGORIES.map((c) => ({ value: c.id, label: c.title, href: `/browse?category=${c.id}` })),
];

type SearchParams = Promise<{ category?: string }>;

export default async function BrowsePage({ searchParams }: { searchParams: SearchParams }) {
  const { category } = await searchParams;
  const active = category && OPTIONS.some((o) => o.value === category) ? category : 'all';

  let videos: Video[] = [];
  try {
    videos = active === 'all'
      ? await getTrending('US', undefined, 40)
      : await getTrending('US', active, 40);

    // Some categories return almost nothing from the mostPopular chart.
    // Fall back to a search on the category name so the page is never bare.
    if (videos.length < 8 && active !== 'all') {
      const name = STATIC_CATEGORIES.find((c) => c.id === active)?.title ?? '';
      const page = await searchVideos({ q: name, maxResults: 32, order: 'viewCount' });
      const seen = new Set(videos.map((v) => v.id));
      videos = [...videos, ...page.items.filter((v) => !seen.has(v.id))];
    }
  } catch {
    videos = [];
  }

  const label = OPTIONS.find((o) => o.value === active)?.label ?? 'Everything';

  return (
    <>
      <PageHeader
        eyebrow="Discover"
        title="Browse the catalogue"
        lede="Fourteen categories, ranked by what is actually being watched right now. Pick a lane and start pulling threads."
      />

      <div className="gutter-wide sticky top-16 z-40 -mx-px bg-ink-950/85 py-3 backdrop-blur-xl sm:top-[68px]">
        <FilterChips options={OPTIONS} active={active} label="Category" />
      </div>

      <section className="gutter-wide py-8">
        <div className="mb-6 flex items-baseline gap-3">
          <h2 className="text-[15px] font-medium text-cream">{label}</h2>
          <span className="font-mono text-[11px] text-faint tnum">{videos.length} videos</span>
        </div>

        <VideoGrid
          videos={videos}
          emptyState={
            <EmptyState
              icon={<Compass className="h-6 w-6" />}
              title="Nothing to show for this category"
              body="The trending chart for this category came back empty. Try another lane, or search for something specific."
              action={<ButtonLink href="/browse" variant="outline" size="sm">Back to everything</ButtonLink>}
            />
          }
        />
      </section>
    </>
  );
}

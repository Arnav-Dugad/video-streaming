import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { COLLECTIONS, collectionBySlug } from '@/lib/collections';
import { searchVideos } from '@/lib/youtube';
import { VideoGrid } from '@/components/video/VideoGrid';
import { EmptyState } from '@/components/ui/PageHeader';
import { Reveal, RevealText } from '@/components/ui/Reveal';

export const revalidate = 3600;

/** All eight are known at build time, so pre-render them. */
export function generateStaticParams() {
  return COLLECTIONS.map((c) => ({ slug: c.slug }));
}

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const c = collectionBySlug(slug);
  if (!c) return { title: 'Collection not found' };
  return { title: c.title, description: c.blurb };
}

export default async function CollectionPage({ params }: { params: Params }) {
  const { slug } = await params;
  const collection = collectionBySlug(slug);
  if (!collection) notFound();

  const page = await searchVideos({
    q: collection.query,
    maxResults: 32,
    videoDuration: collection.duration ?? 'any',
    order: collection.order ?? 'relevance',
  }).catch(() => ({ items: [] }));

  return (
    <>
      <header className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              `radial-gradient(70% 90% at 15% 0%, hsl(${collection.hue} 62% 44% / 0.26), transparent 62%),` +
              `radial-gradient(50% 70% at 90% 10%, hsl(${(collection.hue + 40) % 360} 55% 46% / 0.14), transparent 60%)`,
          }}
        />

        <div className="gutter-wide pb-12 pt-10 sm:pt-14">
          <Link
            href="/collections"
            className="group mb-8 inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-cream"
          >
            <ArrowLeft className="h-3 w-3 transition-transform duration-300 group-hover:-translate-x-1" />
            All collections
          </Link>

          <p className="eyebrow mb-4">{collection.curator}</p>
          <h1 className="display max-w-4xl text-[clamp(2.4rem,6vw,4.5rem)] text-cream">
            <RevealText text={collection.title} />
          </h1>

          <Reveal delay={0.14}>
            <p className="mt-7 max-w-2xl text-[15px] leading-[1.75] text-cream-dim/85">
              {collection.intro}
            </p>
          </Reveal>

          <Reveal delay={0.2}>
            <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-faint tnum">
              <span>{page.items.length} videos</span>
              <span className="text-faint/50">·</span>
              <span>
                {collection.duration === 'long' ? 'Over 20 minutes each'
                  : collection.duration === 'short' ? 'Under 4 minutes each'
                  : collection.duration === 'medium' ? '4–20 minutes each'
                  : 'Any length'}
              </span>
            </p>
          </Reveal>
        </div>
      </header>

      <section className="gutter-wide pb-10">
        <VideoGrid
          videos={page.items}
          emptyState={
            <EmptyState
              title="This collection came back empty"
              body="The underlying search returned nothing this time. It refreshes hourly — try again shortly."
            />
          }
        />
      </section>
    </>
  );
}

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import {
  isTopicSlug, structuralBySlug, titleCase, topicFromSlug, topicHue,
  type Collection,
} from '@/lib/collections';
import { resolveCollection } from '@/lib/collections.server';
import { VideoGrid } from '@/components/video/VideoGrid';
import { EmptyState } from '@/components/ui/PageHeader';
import { Reveal, RevealText } from '@/components/ui/Reveal';

export const revalidate = 3600;

type Params = Promise<{ slug: string }>;

/**
 * Collections are rules, so a slug resolves to one without any stored state —
 * which is what lets the topic half be generated fresh each hour without
 * needing `generateStaticParams` to have known about it at build time.
 */
function fromSlug(slug: string): Collection | null {
  const structural = structuralBySlug(slug);
  if (structural) return structural;

  if (isTopicSlug(slug)) {
    const topic = topicFromSlug(slug);
    if (!topic || topic.length > 40) return null;
    return {
      slug,
      kind: 'topic',
      title: titleCase(topic),
      blurb: `Everything currently tagged ${topic}.`,
      intro:
        `This collection exists because enough creators are publishing about ${topic} at the same time for it to ` +
        `surface on the trending chart. It was not chosen by anyone, and it will disappear when the subject cools off.`,
      hue: topicHue(topic),
      rule: { query: topic },
    };
  }

  return null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const collection = fromSlug(slug);
  if (!collection) return { title: 'Collection not found' };
  return { title: collection.title, description: collection.blurb };
}

export default async function CollectionPage({ params }: { params: Params }) {
  const { slug } = await params;
  const collection = fromSlug(slug);
  if (!collection) notFound();

  const videos = await resolveCollection(collection, 32);

  const lengthNote =
    collection.rule.duration === 'long' ? 'Over 20 minutes each'
      : collection.rule.duration === 'short' ? 'Under 4 minutes each'
      : collection.rule.duration === 'medium' ? '4–20 minutes each'
      : collection.rule.withinHours ? `Uploaded in the last ${collection.rule.withinHours} hours`
      : collection.rule.order === 'viewCount' ? 'Ranked by view count'
      : 'Any length';

  return (
    <>
      <header className="relative isolate overflow-hidden">
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

          <p className="eyebrow mb-4">
            {collection.kind === 'topic' ? 'Trending topic' : 'Standing rule'}
          </p>
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
              <span>{videos.length} videos</span>
              <span className="text-faint/50">·</span>
              <span>{lengthNote}</span>
            </p>
          </Reveal>
        </div>
      </header>

      <section className="gutter-wide pb-10">
        <VideoGrid
          videos={videos}
          emptyState={
            <EmptyState
              title="This collection came back empty"
              body="The rule behind it returned nothing this time. It re-runs hourly — try again shortly."
            />
          }
        />
      </section>
    </>
  );
}

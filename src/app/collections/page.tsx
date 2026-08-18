import type { Metadata } from 'next';

import { buildCollections } from '@/lib/collections.server';
import { PageHeader } from '@/components/ui/PageHeader';
import { CollectionCards } from '@/components/home/CollectionCards';

/** Rebuilt hourly — the topic half of the set is only as current as the
 *  trending chart it was derived from. */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Collections',
  description:
    'Four standing rules over the catalogue, plus whatever subjects the trending chart is currently clustered around.',
};

export default async function CollectionsPage() {
  const collections = await buildCollections(8);
  const topics = collections.filter((c) => c.kind === 'topic');

  return (
    <>
      <PageHeader
        eyebrow="Assembled, not curated"
        title="Collections"
        lede={
          topics.length > 0
            ? `Four standing rules over the catalogue, plus ${topics.length} subjects discovered by counting what the trending chart is tagged with. Nobody wrote the second half — it changes when the internet does.`
            : 'Four standing rules over the catalogue. Topic collections appear here once the trending chart is reachable.'
        }
      />
      <CollectionCards collections={collections} showHeader={false} />
    </>
  );
}

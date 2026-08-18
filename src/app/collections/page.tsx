import type { Metadata } from 'next';
import { COLLECTIONS } from '@/lib/collections';
import { PageHeader } from '@/components/ui/PageHeader';
import { CollectionCards } from '@/components/home/CollectionCards';

export const metadata: Metadata = {
  title: 'Collections',
  description: 'Hand-built runs through the catalogue — long reads, quiet hours, first principles and more.',
};

export default function CollectionsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Curated"
        title="Collections"
        lede="Eight standing runs through the catalogue, each one a query with a point of view attached. No ranking signal decided what belongs in them."
      />
      <CollectionCards limit={COLLECTIONS.length} showHeader={false} />
    </>
  );
}

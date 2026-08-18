import type { Metadata } from 'next';
import { Suspense } from 'react';

import { getVideosByIds } from '@/lib/youtube';
import { CompareClient } from '@/components/compare/CompareClient';
import { GridSkeleton } from '@/components/ui/Skeleton';

export const revalidate = 1800;

export const metadata: Metadata = {
  title: 'Compare',
  description: 'Two videos side by side — locked together or free, with an adjustable offset.',
};

type SearchParams = Promise<{ a?: string; b?: string }>;

const ID = /^[\w-]{6,20}$/;

export default async function ComparePage({ searchParams }: { searchParams: SearchParams }) {
  const { a, b } = await searchParams;

  // Resolved server-side so the page opens with real titles rather than
  // flashing two empty frames while the client fetches them.
  const ids = [a, b].filter((id): id is string => Boolean(id) && ID.test(id!));
  const videos = ids.length > 0 ? await getVideosByIds(ids).catch(() => []) : [];

  return (
    <Suspense fallback={<div className="gutter-wide py-16"><GridSkeleton count={2} /></div>}>
      <CompareClient
        initialA={videos.find((v) => v.id === a) ?? null}
        initialB={videos.find((v) => v.id === b) ?? null}
      />
    </Suspense>
  );
}

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LibraryClient } from '@/components/library/LibraryClient';
import { GridSkeleton } from '@/components/ui/Skeleton';

export const metadata: Metadata = {
  title: 'Library',
  description: 'Everything you saved, liked, watched and organised.',
  robots: { index: false, follow: false },
};

export default function LibraryPage() {
  return (
    <Suspense fallback={<div className="gutter-wide py-16"><GridSkeleton count={8} /></div>}>
      <LibraryClient />
    </Suspense>
  );
}

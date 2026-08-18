import type { Metadata } from 'next';

import { ButtonLink } from '@/components/ui/Button';
import { PrismMark } from '@/components/layout/Logo';
import { OfflineRetry } from '@/components/layout/OfflineRetry';

export const metadata: Metadata = {
  title: 'Offline',
  robots: { index: false, follow: false },
};

/** Served by the service worker when a navigation fails and nothing matching
 *  is cached. Static by necessity — it has to render with no network. */
export default function OfflinePage() {
  return (
    <div className="grid min-h-[70svh] place-items-center px-6">
      <div className="max-w-md text-center">
        <PrismMark className="mx-auto h-9 w-9 text-cream/40" />
        <p className="eyebrow mt-8">No connection</p>
        <h1 className="display mt-4 text-[clamp(2rem,5vw,3rem)] text-cream">
          You have gone dark.
        </h1>
        <p className="mt-5 text-[14px] leading-relaxed text-muted">
          PRISM streams from YouTube, so it needs a connection to play anything.
          Pages you have already opened are still readable from the cache.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <OfflineRetry />
          <ButtonLink href="/library" variant="outline" size="md">Your library</ButtonLink>
        </div>
      </div>
    </div>
  );
}

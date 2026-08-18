'use client';

import { useEffect } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { PrismMark } from '@/components/layout/Logo';

export default function ErrorBoundary({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface the digest so a production trace can be matched to a report.
    console.error('[prism] render error', error);
  }, [error]);

  return (
    <div className="grid min-h-[70svh] place-items-center px-6">
      <div className="max-w-md text-center">
        <PrismMark className="mx-auto h-9 w-9 text-flare/60" />
        <p className="eyebrow mt-8">Something broke</p>
        <h1 className="display mt-4 text-[clamp(2rem,5vw,3rem)] text-cream">
          That did not render.
        </h1>
        <p className="mt-5 text-[14px] leading-relaxed text-muted">
          The page hit an unexpected error. Trying again usually clears it — if it
          does not, the API it depends on may be rate limited.
        </p>
        {error.digest && (
          <p className="mt-4 font-mono text-[10.5px] text-faint">Reference: {error.digest}</p>
        )}
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Button onClick={reset} size="md">Try again</Button>
          <ButtonLink href="/" variant="outline" size="md">Back to home</ButtonLink>
        </div>
      </div>
    </div>
  );
}

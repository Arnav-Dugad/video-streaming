'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/cn';

/* ==========================================================================
   YouTube thumbnail.

   Two things here are deliberate and were both bugs before:

   1. `unoptimized`. These are already-optimised JPEGs on Google's CDN with
      excellent cache headers. Routing them through Vercel's image optimiser
      bought nothing, added a hop, and — the real problem — burned the Hobby
      plan's 1,000-unique-source-images allowance almost immediately on a site
      whose whole job is showing thumbnails. Once that allowance is spent the
      optimiser errors, every `onError` fires, and the grid fills with
      placeholders. Serving them straight from i.ytimg.com removes the limit
      entirely and is faster.

   2. The fallback element is absolutely positioned. It used to be a plain
      div, so when an image did fail it collapsed to the size of its icon and
      sat in the top-left corner of the frame instead of filling it.

   `maxresdefault.jpg` only exists for videos uploaded above 1080p; for the
   rest YouTube answers with a 120x90 grey placeholder and a *200* status, so
   `onError` alone cannot catch it. Now that the bytes reach the browser
   unresized, `naturalWidth` is the source's real width and that check works.
   ========================================================================== */

const CHAIN = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault'] as const;

function variantsFor(src: string): string[] {
  const m = /\/vi\/([\w-]{6,})\//.exec(src);
  if (!m) return [src];
  const id = m[1];
  const requested = CHAIN.findIndex((c) => src.includes(c));
  const start = requested >= 0 ? requested : 0;
  // Always keep at least one step to fall back to.
  const rest = CHAIN.slice(start);
  return (rest.length > 0 ? rest : [CHAIN[CHAIN.length - 1]]).map(
    (size) => `https://i.ytimg.com/vi/${id}/${size}.jpg`,
  );
}

interface Props {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  /** Renders a subtle scale-in once decoded. */
  reveal?: boolean;
}

export function Thumbnail({
  src, alt, className, sizes = '(max-width: 768px) 100vw, 33vw', priority, reveal = true,
}: Props) {
  const [state, setState] = useState({ src, step: 0, loaded: false, failed: false });

  // Reset while rendering when the source changes, rather than in an effect —
  // React's documented pattern for derived state, and it avoids painting one
  // frame of the previous image's load state against a new src.
  if (state.src !== src) setState({ src, step: 0, loaded: false, failed: false });

  const { step, loaded, failed } = state.src === src
    ? state
    : { step: 0, loaded: false, failed: false };

  const chain = variantsFor(src);
  const current = chain[Math.min(step, chain.length - 1)];

  const stepDown = () => {
    setState((s) =>
      s.step < chain.length - 1
        ? { ...s, step: s.step + 1, loaded: false }
        : { ...s, failed: true },
    );
  };

  if (!src || failed) {
    return (
      <div
        className={cn('absolute inset-0 grid place-items-center bg-ink-800', className)}
        aria-label={alt}
        role="img"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-7 w-7 text-ink-500"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          aria-hidden
        >
          <rect x="2" y="4" width="20" height="16" rx="3" />
          <path d="m10 9 5 3-5 3V9Z" fill="currentColor" stroke="none" />
        </svg>
      </div>
    );
  }

  return (
    <>
      {!loaded && <div className="absolute inset-0 skeleton" aria-hidden />}
      <Image
        key={current}
        src={current}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        // See the note at the top: never route these through the optimiser.
        unoptimized
        className={cn(
          'object-cover transition-[opacity,transform,filter] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]',
          reveal && !loaded && 'scale-[1.04] opacity-0 blur-md',
          loaded && 'scale-100 opacity-100 blur-0',
          !reveal && !loaded && 'opacity-100',
          className,
        )}
        onError={stepDown}
        onLoad={(e) => {
          const img = e.currentTarget;
          // The bytes are unresized now, so this is the source's true width.
          // YouTube's "no maxres available" placeholder is exactly 120x90.
          if (img.naturalWidth > 0 && img.naturalWidth <= 121 && step < chain.length - 1) {
            stepDown();
            return;
          }
          setState((s) => (s.loaded ? s : { ...s, loaded: true }));
        }}
      />
    </>
  );
}

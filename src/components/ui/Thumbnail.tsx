'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/cn';

/* ==========================================================================
   Thumbnail with a resolution fallback chain.

   `maxresdefault.jpg` only exists for videos uploaded above 1080p. For
   everything else YouTube returns a 120×90 grey placeholder with a 200 status
   — so an `onError` handler alone won't catch it. We check `naturalWidth` on
   load and step down the chain when the image comes back suspiciously small.
   ========================================================================== */

const CHAIN = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault'] as const;

function variantsFor(src: string): string[] {
  const m = /\/vi\/([\w-]{6,})\//.exec(src);
  if (!m) return [src];
  const id = m[1];
  const requested = CHAIN.findIndex((c) => src.includes(c));
  const start = requested >= 0 ? requested : 0;
  return CHAIN.slice(start).map((size) => `https://i.ytimg.com/vi/${id}/${size}.jpg`);
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

export function Thumbnail({ src, alt, className, sizes = '(max-width: 768px) 100vw, 33vw', priority, reveal = true }: Props) {
  const [state, setState] = useState({ src, step: 0, loaded: false, failed: false });

  // Reset while rendering when the source changes, rather than in an effect —
  // this is React's documented pattern for derived state, and it avoids
  // painting one frame of the previous image's load state against a new src.
  if (state.src !== src) setState({ src, step: 0, loaded: false, failed: false });

  const { step, loaded, failed } = state.src === src ? state : { step: 0, loaded: false, failed: false };
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
      <div className={cn('grid place-items-center bg-ink-800', className)} aria-label={alt} role="img">
        <svg viewBox="0 0 24 24" className="h-7 w-7 text-ink-500" fill="none" stroke="currentColor" strokeWidth="1.4">
          <rect x="2" y="4" width="20" height="16" rx="3" />
          <path d="m10 9 5 3-5 3V9Z" fill="currentColor" stroke="none" />
        </svg>
      </div>
    );
  }

  return (
    <>
      {!loaded && <div className={cn('absolute inset-0 skeleton', className)} aria-hidden />}
      <Image
        key={current}
        src={current}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        unoptimized={step > 0}
        className={cn(
          'object-cover transition-[opacity,transform,filter] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]',
          reveal && !loaded && 'scale-[1.04] opacity-0 blur-md',
          loaded && 'scale-100 opacity-100 blur-0',
          className,
        )}
        onError={stepDown}
        onLoad={(e) => {
          const img = e.currentTarget;
          // YouTube's "missing maxres" placeholder is exactly 120×90.
          if (img.naturalWidth > 0 && img.naturalWidth <= 121 && step < chain.length - 1) {
            stepDown();
            return;
          }
          setState((s) => ({ ...s, loaded: true }));
        }}
      />
    </>
  );
}

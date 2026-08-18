'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { hueFrom, initials } from '@/lib/format';

interface Props {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
  /** Vermilion ring — marks the signed-in user and live room hosts. */
  ring?: boolean;
}

/** Falls back to a deterministic monogram: the same person is always the same
 *  colour, everywhere in the app, with no network request. */
export function Avatar({ src, name, size = 36, className, ring }: Props) {
  const [broken, setBroken] = useState(false);
  const hue = hueFrom(name ?? 'anon');
  const showImage = Boolean(src) && !broken;

  return (
    <span
      className={cn(
        'relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full',
        ring && 'ring-2 ring-flare ring-offset-2 ring-offset-ink-950',
        className,
      )}
      style={{
        width: size,
        height: size,
        background: showImage
          ? undefined
          : `linear-gradient(145deg, hsl(${hue} 42% 34%), hsl(${(hue + 38) % 360} 46% 20%))`,
      }}
    >
      {showImage ? (
        <Image
          src={src!}
          alt={name ?? ''}
          width={size}
          height={size}
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
          unoptimized
        />
      ) : (
        <span
          className="font-mono font-semibold leading-none text-cream/90 select-none"
          style={{ fontSize: Math.max(9, size * 0.36) }}
        >
          {initials(name)}
        </span>
      )}
    </span>
  );
}

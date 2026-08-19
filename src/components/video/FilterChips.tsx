'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';

/** Every option carries its own href. Server components render these, and a
 *  callback prop cannot cross that boundary — the href has to be data. */
export interface ChipOption { value: string; label: string; href: string }

/** Filters are links, not buttons, so every filtered view is a real URL you
 *  can share, bookmark and go Back out of. */
export function FilterChips({
  options, active, label, className,
}: {
  options: ChipOption[];
  active: string;
  label: string;
  className?: string;
}) {
  return (
    <div
      // The right-hand mask is the only cue that the row scrolls; without it
      // a clipped chip reads as a rendering mistake rather than an invitation.
      className={cn('no-scrollbar edge-fade-r flex gap-2 overflow-x-auto pr-8', className)}
      role="group"
      aria-label={label}
    >
      {options.map((opt) => {
        const isActive = opt.value === active;
        return (
          <Link
            key={opt.value}
            href={opt.href}
            scroll={false}
            aria-current={isActive ? 'true' : undefined}
            className={cn(
              'relative isolate shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium whitespace-nowrap',
              'transition-colors duration-300',
              isActive ? 'text-ink-950' : 'text-cream-dim hover:text-cream',
            )}
          >
            {isActive && (
              <motion.span
                layoutId={`chip-${label}`}
                className="absolute inset-0 -z-10 rounded-full bg-cream"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            {!isActive && <span className="absolute inset-0 -z-10 rounded-full border border-line" />}
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}

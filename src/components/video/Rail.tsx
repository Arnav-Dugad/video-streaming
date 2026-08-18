'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';

import { cn } from '@/lib/cn';

/* ==========================================================================
   Horizontal rail.

   Native scroll with snap points — not a JS carousel — so trackpads, touch,
   shift+wheel and keyboard all behave the way the platform already does.
   The arrows page by one viewport width and disable themselves at the ends,
   and the edge mask only fades the side that actually has more content.
   ========================================================================== */

interface Props {
  title: ReactNode;
  eyebrow?: string;
  href?: string;
  hrefLabel?: string;
  children: ReactNode;
  className?: string;
  /** Renders the count next to the title, e.g. "24 videos". */
  meta?: string;
}

export function Rail({ title, eyebrow, href, hrefLabel = 'See all', children, className, meta }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [overflows, setOverflows] = useState(false);

  const sync = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setOverflows(max > 8);
    setAtStart(el.scrollLeft <= 8);
    setAtEnd(el.scrollLeft >= max - 8);
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', sync); ro.disconnect(); };
  }, [sync, children]);

  const page = (dir: -1 | 1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth * 0.88), behavior: 'smooth' });
  };

  return (
    <section className={cn('relative', className)}>
      <header className="gutter mb-5 flex items-end justify-between gap-6">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
          <div className="flex items-baseline gap-3">
            <h2 className="display text-[clamp(1.5rem,3vw,2.15rem)] text-cream">{title}</h2>
            {meta && <span className="font-mono text-[11px] text-faint tnum">{meta}</span>}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {href && (
            <Link
              href={href}
              className="group hidden items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-cream sm:inline-flex"
            >
              {hrefLabel}
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          )}
          {overflows && (
            <div className="hidden items-center gap-1 md:flex">
              <PageButton dir={-1} disabled={atStart} onClick={() => page(-1)} />
              <PageButton dir={1} disabled={atEnd} onClick={() => page(1)} />
            </div>
          )}
        </div>
      </header>

      <div
        ref={scroller}
        className={cn(
          'no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth gutter pb-2',
          // Fade only the edge that has more content behind it.
          overflows && !atEnd && atStart && 'edge-fade-r',
          overflows && !atEnd && !atStart && 'edge-fade-x',
        )}
        // Rails are scroll regions; give keyboard users a way in.
        tabIndex={0}
        role="group"
        aria-label={typeof title === 'string' ? title : undefined}
      >
        {children}
      </div>
    </section>
  );
}

function PageButton({ dir, disabled, onClick }: { dir: -1 | 1; disabled: boolean; onClick(): void }) {
  const Icon = dir === -1 ? ChevronLeft : ChevronRight;
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === -1 ? 'Scroll left' : 'Scroll right'}
      whileTap={{ scale: 0.88 }}
      className={cn(
        'grid h-8 w-8 place-items-center rounded-full border border-line-strong text-cream-dim',
        'transition-[opacity,background-color,color] duration-300',
        'hover:bg-cream/10 hover:text-cream',
        disabled && 'pointer-events-none opacity-25',
      )}
    >
      <Icon className="h-4 w-4" />
    </motion.button>
  );
}

/** Standard rail item width. Keeps every rail on the same rhythm. */
export function RailItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('w-[clamp(15rem,26vw,20.5rem)] shrink-0 snap-start', className)}>
      {children}
    </div>
  );
}

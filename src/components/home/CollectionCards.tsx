'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';

import { COLLECTIONS } from '@/lib/collections';
import { Tilt } from '@/components/ui/Magnetic';
import { Reveal } from '@/components/ui/Reveal';
import { cn } from '@/lib/cn';

export function CollectionCards({ limit = 4, showHeader = true }: { limit?: number; showHeader?: boolean }) {
  const items = COLLECTIONS.slice(0, limit);

  return (
    <section className="gutter-wide py-10 sm:py-16">
      {showHeader && (
        <Reveal className="mb-9 flex items-end justify-between gap-6">
          <div>
            <p className="eyebrow mb-2.5">Curated</p>
            <h2 className="display text-[clamp(1.9rem,4vw,3rem)] text-cream">Collections</h2>
          </div>
          <Link
            href="/collections"
            className="group hidden items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-cream sm:inline-flex"
          >
            All collections
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </Reveal>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((c, i) => (
          <motion.div
            key={c.slug}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.7, delay: i * 0.07, ease: [0.16, 1, 0.3, 1] }}
          >
            <Tilt className="h-full">
              <Link
                href={`/collections/${c.slug}`}
                data-cursor="Open"
                className={cn(
                  'group relative flex h-full min-h-[16rem] flex-col justify-between overflow-hidden rounded-2xl',
                  'border border-line p-6 transition-[border-color] duration-500 hover:border-line-strong',
                )}
              >
                <span
                  aria-hidden
                  className="absolute inset-0 -z-10 opacity-45 transition-opacity duration-700 group-hover:opacity-90"
                  style={{
                    background:
                      `radial-gradient(130% 110% at 12% 8%, hsl(${c.hue} 62% 44% / 0.30), transparent 58%),` +
                      `linear-gradient(180deg, transparent 40%, hsl(${c.hue} 40% 12% / 0.55) 100%)`,
                  }}
                />
                {/* Fine rule pattern — texture without imagery. */}
                <span
                  aria-hidden
                  className="absolute inset-0 -z-10 opacity-[0.055]"
                  style={{
                    backgroundImage: 'repeating-linear-gradient(115deg, #fff 0 1px, transparent 1px 9px)',
                  }}
                />

                <div>
                  <p className="eyebrow">{c.curator}</p>
                  <h3 className="display mt-3 text-[1.6rem] leading-[1.05] text-cream">{c.title}</h3>
                </div>

                <div>
                  <p className="clamp-3 text-[13px] leading-relaxed text-cream-dim/80">{c.blurb}</p>
                  <span className="mt-5 inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-cream">
                    Open
                    <ArrowRight className="h-3 w-3 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>
            </Tilt>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

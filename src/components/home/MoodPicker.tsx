'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';

import { MOODS } from '@/lib/collections';
import { Reveal } from '@/components/ui/Reveal';

/* ==========================================================================
   Mood entry point.

   Recommendation engines answer "what is like the last thing you watched".
   They cannot answer "what do I want right now", because you have not told
   them. This asks. Each chip is a hand-written query, not a genre tag.
   ========================================================================== */

export function MoodPicker() {
  const router = useRouter();

  return (
    <section className="gutter-wide py-16 sm:py-24">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-16">
        <Reveal>
          <p className="eyebrow mb-3">Start from feeling</p>
          <h2 className="display text-[clamp(1.9rem,4vw,3rem)] text-cream">
            Not sure what you want?
          </h2>
          <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-muted">
            An algorithm can only guess from what you watched last. Tell it what
            kind of evening you are actually having instead.
          </p>
        </Reveal>

        <div className="flex flex-wrap gap-2.5 lg:pt-2">
          {MOODS.map((mood, i) => (
            <motion.button
              key={mood.label}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.55, delay: i * 0.045, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => router.push(`/search?q=${encodeURIComponent(mood.query)}`)}
              className="group relative overflow-hidden rounded-xl border border-line px-5 py-3.5 text-left transition-[border-color] duration-300 hover:border-line-strong"
              style={{ ['--h' as string]: mood.hue }}
            >
              {/* Wash tinted by the mood's own hue — the only per-item colour
                  in the app, and it never touches text. */}
              <span
                className="absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                style={{
                  background: `radial-gradient(120% 140% at 0% 100%, hsl(${mood.hue} 70% 52% / 0.20), transparent 65%)`,
                }}
              />
              <span className="flex items-center gap-2.5 text-[14px] text-cream-dim transition-colors duration-300 group-hover:text-cream">
                {mood.label}
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 -translate-x-1 opacity-0 transition-[transform,opacity] duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  );
}

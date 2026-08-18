'use client';

import { motion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';
import { RevealText } from '@/components/ui/Reveal';

const PILLARS = [
  {
    n: '01',
    title: 'Playback that follows you',
    body:
      'Leave the watch page and the video docks into the corner and keeps going. Come back and it flies into place, still playing, still at the same second. Nothing reloads, ever.',
  },
  {
    n: '02',
    title: 'A library that remembers',
    body:
      'Every video keeps its own position. Continue Watching is not a feed of things you finished — it is only the ones you actually stopped in the middle of.',
  },
  {
    n: '03',
    title: 'Watch together, in sync',
    body:
      'Open a room, share six characters, and everyone is on the same frame. The host scrubs, the room scrubs. Chat is pinned to timestamps, so a reaction stays attached to the moment.',
  },
  {
    n: '04',
    title: 'Keyboard first',
    body:
      'Command palette on ⌘K, full transport controls on the keys you already know, and a scrubber that segments itself when a video has chapters.',
  },
];

/** Editorial section between rails. Sticky heading on the left, pillars
 *  scrolling past on the right — the layout a print feature would use. */
export function Manifesto() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const lineScale = useTransform(scrollYProgress, [0.1, 0.85], [0, 1]);

  return (
    <section ref={ref} className="gutter-wide border-t border-line py-20 sm:py-28">
      <div className="grid gap-14 lg:grid-cols-[minmax(0,24rem)_1fr] lg:gap-20">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <p className="eyebrow mb-4">Why it is built this way</p>
          <h2 className="display text-[clamp(2rem,4.4vw,3.4rem)] text-cream">
            <RevealText text="Streaming, without the friction nobody agreed to." />
          </h2>
          <div className="mt-8 h-px w-full origin-left bg-line">
            <motion.div style={{ scaleX: lineScale }} className="h-px origin-left bg-flare" />
          </div>
        </div>

        <div className="space-y-px">
          {PILLARS.map((p, i) => (
            <motion.article
              key={p.n}
              initial={{ opacity: 0, y: 26 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.75, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
              className="group grid grid-cols-[auto_1fr] gap-6 border-t border-line py-8 first:border-t-0 first:pt-0 sm:gap-10"
            >
              <span className="font-mono text-[11px] text-faint transition-colors duration-500 group-hover:text-flare tnum">
                {p.n}
              </span>
              <div>
                <h3 className="text-[1.1rem] font-medium tracking-[-0.01em] text-cream">{p.title}</h3>
                <p className="mt-3 max-w-xl text-[14px] leading-[1.7] text-muted">{p.body}</p>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

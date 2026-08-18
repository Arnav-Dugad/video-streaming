'use client';

import { motion, useInView, type Variants } from 'motion/react';
import { useRef, type ReactNode } from 'react';

/* ==========================================================================
   Scroll reveal.

   One shared curve for the entire app so nothing feels like it came from a
   different site. Movement is deliberately small (14px) — large slide-ins read
   as a template. `once` is true because re-animating on scroll-back is the
   single most common way a portfolio site announces itself as a portfolio site.
   ========================================================================== */

const EASE = [0.16, 1, 0.3, 1] as const;

interface Props {
  children: ReactNode;
  delay?: number;
  /** Distance in px. Negative values reveal downward. */
  y?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article' | 'header';
  /** A fraction, or 'some' / 'all'. Use 'some' for anything taller than the
   *  viewport — a fraction of a very tall element may never be reached. */
  amount?: number | 'some' | 'all';
}

export function Reveal({ children, delay = 0, y = 14, className, as = 'div', amount = 'some' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount, margin: '0px 0px -8% 0px' });
  // The union of motion element types has an unusable intersected ref type;
  // the runtime component is correct, only the ref signature needs narrowing.
  const Tag = motion[as] as typeof motion.div;

  return (
    <Tag
      ref={ref}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.72, delay, ease: EASE }}
      className={className}
    >
      {children}
    </Tag>
  );
}

/* Stagger container and item are two separate named exports rather than
   `Stagger` with an attached `.Item`. A server component importing a client
   component receives a client *reference*, not the function itself, so any
   property hung off it reads back as undefined — which React reports as the
   deeply unhelpful "Element type is invalid". Two plain exports cross the
   boundary correctly. */
const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

export function Stagger({
  children, className, amount = 'some',
}: { children: ReactNode; className?: string; amount?: number | 'some' | 'all' }) {
  const ref = useRef<HTMLDivElement>(null);
  // 'some' — not a fraction. A results grid is thousands of pixels tall, so a
  // fractional threshold like 0.15 needs ~600px of it on screen before it
  // fires; below the fold that never happens and the whole grid stays at
  // opacity 0. Any part entering the viewport is the correct trigger here.
  const inView = useInView(ref, { once: true, amount });

  return (
    <motion.div
      ref={ref}
      variants={containerVariants}
      initial="hidden"
      animate={inView ? 'show' : 'hidden'}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={itemVariants} className={className}>
      {children}
    </motion.div>
  );
}

/** Word-by-word headline reveal with a mask, so letters rise out of nothing
 *  rather than fading in place. */
export function RevealText({
  text, className, delay = 0, wordClassName,
}: { text: string; className?: string; delay?: number; wordClassName?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const words = text.split(' ');

  return (
    <span ref={ref} className={className}>
      {words.map((word, i) => (
        <span key={`${word}-${i}`} className="inline-block overflow-hidden align-bottom pb-[0.12em] -mb-[0.12em]">
          <motion.span
            className={`inline-block ${wordClassName ?? ''}`}
            initial={{ y: '110%' }}
            animate={inView ? { y: '0%' } : undefined}
            transition={{ duration: 0.9, delay: delay + i * 0.055, ease: EASE }}
          >
            {word}
            {i < words.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

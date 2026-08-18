'use client';

import { motion, useScroll, useSpring } from 'motion/react';

/** A one-pixel spectral rule that fills as you read. The only place the full
 *  brand spectrum appears — everywhere else it is a single vermilion. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 240, damping: 34, restDelta: 0.001 });

  return (
    <motion.div
      aria-hidden
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[95] h-px origin-left bg-gradient-to-r from-flare via-flare-soft to-halo"
    />
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';

import { usePrefersReducedMotion } from './useMediaQuery';

/* ==========================================================================
   Count a number up to its value once it comes into view.

   Driven by requestAnimationFrame against wall-clock time rather than a fixed
   per-frame increment, so the duration is the same on a 60Hz and a 144Hz
   display instead of finishing twice as fast on the latter.

   Reduced motion gets the final value immediately — a number ticking upward
   is exactly the kind of movement that setting is asking to be spared.
   ========================================================================== */

const EASE_OUT_EXPO = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

export function useCountUp(target: number, duration = 1100) {
  const reduced = usePrefersReducedMotion();
  const [counted, setCounted] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  // Derived rather than pushed through state: reduced-motion users want the
  // final value, and writing it from an effect would cascade a second render.
  const value = reduced ? target : counted;

  useEffect(() => {
    if (reduced) return;

    const el = ref.current;
    if (!el) return;

    const run = () => {
      if (started.current) return;
      started.current = true;
      const from = performance.now();
      let frame = 0;

      const tick = (now: number) => {
        const t = Math.min(1, (now - from) / duration);
        setCounted(target * EASE_OUT_EXPO(t));
        if (t < 1) frame = requestAnimationFrame(tick);
      };

      frame = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(frame);
    };

    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) { run(); io.disconnect(); } },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [target, duration, reduced]);

  return { ref, value };
}

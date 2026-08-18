'use client';

import { AnimatePresence, motion, useMotionValue, useSpring } from 'motion/react';
import { useEffect, useState } from 'react';
import { usePrefersReducedMotion, useIsTouch } from '@/hooks/useMediaQuery';

/* ==========================================================================
   Cursor companion.

   Not a cursor *replacement* — the native cursor stays visible, because hiding
   it breaks text selection affordances and accessibility. This is a lagging
   ring that grows over interactive targets and can carry a one-word label
   (elements opt in with `data-cursor="Play"`). Disabled entirely on touch and
   for reduced-motion users.
   ========================================================================== */

export function Cursor() {
  const reduced = usePrefersReducedMotion();
  const touch = useIsTouch();

  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const sx = useSpring(x, { stiffness: 900, damping: 46, mass: 0.32 });
  const sy = useSpring(y, { stiffness: 900, damping: 46, mass: 0.32 });

  const [hovering, setHovering] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    if (reduced || touch) return;

    const onMove = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      if (!visible) setVisible(true);

      const el = (e.target as HTMLElement)?.closest<HTMLElement>(
        '[data-cursor], a, button, [role="button"], input, textarea, select',
      );
      setHovering(Boolean(el));
      setLabel(el?.dataset.cursor ?? null);
    };

    const onLeave = () => setVisible(false);
    const onDown = () => setPressed(true);
    const onUp = () => setPressed(false);

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
    };
  }, [reduced, touch, visible, x, y]);

  if (reduced || touch) return null;

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[9998] mix-blend-difference"
      style={{ x: sx, y: sy }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-cream/70"
        animate={{
          width: label ? 62 : hovering ? 38 : 22,
          height: label ? 62 : hovering ? 38 : 22,
          backgroundColor: hovering ? 'rgba(244,241,234,0.10)' : 'rgba(244,241,234,0)',
          scale: pressed ? 0.82 : 1,
        }}
        transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.5 }}
      >
        <AnimatePresence>
          {label && (
            <motion.span
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.16 }}
              className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-cream"
            >
              {label}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

'use client';

import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { useRef, type ReactNode } from 'react';
import { usePrefersReducedMotion, useIsTouch } from '@/hooks/useMediaQuery';

/* ==========================================================================
   Magnetic hover.

   The element leans toward the cursor by a fraction of the offset from its
   own centre, damped by a spring. Strength is capped so it never detaches
   from its hit area — the classic failure mode where the visual and the
   clickable region drift apart.
   ========================================================================== */

interface Props {
  children: ReactNode;
  /** 0–1. Fraction of cursor offset the element travels. */
  strength?: number;
  className?: string;
  /** Inner content counter-moves slightly for a parallax feel. */
  parallax?: boolean;
}

export function Magnetic({ children, strength = 0.28, className, parallax = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const touch = useIsTouch();

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 22, mass: 0.5 });
  const sy = useSpring(y, { stiffness: 260, damping: 22, mass: 0.5 });

  const ix = useTransform(sx, (v) => v * -0.35);
  const iy = useTransform(sy, (v) => v * -0.35);

  const disabled = reduced || touch;

  return (
    <motion.div
      ref={ref}
      className={className}
      style={disabled ? undefined : { x: sx, y: sy }}
      onPointerMove={(e) => {
        if (disabled || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const cap = Math.min(r.width, r.height) * 0.4;
        x.set(Math.max(-cap, Math.min(cap, dx * strength)));
        y.set(Math.max(-cap, Math.min(cap, dy * strength)));
      }}
      onPointerLeave={() => { x.set(0); y.set(0); }}
    >
      {parallax && !disabled ? <motion.span style={{ x: ix, y: iy, display: 'block' }}>{children}</motion.span> : children}
    </motion.div>
  );
}

/** Card tilt on a 3D plane. Used sparingly — collection covers only. */
export function Tilt({ children, className, max = 7 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const touch = useIsTouch();

  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rx = useSpring(useTransform(py, [0, 1], [max, -max]), { stiffness: 200, damping: 20 });
  const ry = useSpring(useTransform(px, [0, 1], [-max, max]), { stiffness: 200, damping: 20 });

  if (reduced || touch) return <div className={className}>{children}</div>;

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900, transformStyle: 'preserve-3d' }}
      onPointerMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        px.set((e.clientX - r.left) / r.width);
        py.set((e.clientY - r.top) / r.height);
      }}
      onPointerLeave={() => { px.set(0.5); py.set(0.5); }}
    >
      {children}
    </motion.div>
  );
}

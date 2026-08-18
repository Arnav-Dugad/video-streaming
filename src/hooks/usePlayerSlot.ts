'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePlayer, type Rect } from '@/lib/store';

/* ==========================================================================
   Publishes the position of an inline player slot to the player store.

   Measured on every scroll and resize through rAF, and through a
   ResizeObserver for layout changes that don't fire either (fonts loading,
   a sidebar collapsing, the description expanding). Writes are diffed to
   sub-pixel tolerance so the store isn't churned 60 times a second.
   ========================================================================== */

const EPSILON = 0.5;

function differs(a: Rect | null, b: Rect): boolean {
  if (!a) return true;
  return (
    Math.abs(a.top - b.top) > EPSILON ||
    Math.abs(a.left - b.left) > EPSILON ||
    Math.abs(a.width - b.width) > EPSILON ||
    Math.abs(a.height - b.height) > EPSILON
  );
}

export function usePlayerSlot<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const frame = useRef<number | null>(null);
  const last = useRef<Rect | null>(null);
  const setSlot = usePlayer((s) => s.setSlot);

  const measure = useCallback(() => {
    frame.current = null;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const next: Rect = { top: r.top, left: r.left, width: r.width, height: r.height };
    if (differs(last.current, next)) {
      last.current = next;
      setSlot(next);
    }
  }, [setSlot]);

  const schedule = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(measure);
  }, [measure]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    measure();

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    ro.observe(document.documentElement);

    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      ro.disconnect();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      last.current = null;
      // Releasing the slot is what sends the player to the dock.
      setSlot(null);
    };
  }, [measure, schedule, setSlot]);

  return ref;
}

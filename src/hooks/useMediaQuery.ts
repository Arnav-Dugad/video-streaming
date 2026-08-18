'use client';

import { useCallback, useSyncExternalStore } from 'react';

/* ==========================================================================
   Media queries as an external store.

   `useSyncExternalStore` is the correct primitive here: the match state lives
   outside React, the server snapshot is explicit, and there is no effect
   writing state on mount — so the first client render is already correct
   instead of correcting itself a frame later.
   ========================================================================== */

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  // Server render assumes "no match": desktop-first hover behaviour and full
  // motion, both of which are corrected on hydration if wrong.
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export const useIsMobile = () => useMediaQuery('(max-width: 767px)');
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
export const usePrefersReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)');
/** Coarse pointer => no hover previews, bigger hit targets. */
export const useIsTouch = () => useMediaQuery('(hover: none), (pointer: coarse)');

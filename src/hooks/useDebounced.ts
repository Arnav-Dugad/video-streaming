'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Fires `fn` at most once per `ms`, always trailing so the final call lands. */
export function useThrottledCallback<A extends unknown[]>(fn: (...args: A) => void, ms = 200) {
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(fn);

  useEffect(() => { latest.current = fn; }, [fn]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return useCallback(
    (...args: A) => {
      const now = Date.now();
      const wait = ms - (now - last.current);
      if (wait <= 0) {
        last.current = now;
        latest.current(...args);
        return;
      }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        last.current = Date.now();
        latest.current(...args);
      }, wait);
    },
    [ms],
  );
}

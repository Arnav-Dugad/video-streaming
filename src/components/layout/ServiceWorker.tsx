'use client';

import { useEffect } from 'react';

/* ==========================================================================
   Service worker registration.

   Development is excluded deliberately: the dev server serves unhashed,
   constantly changing chunks, and caching those produces a stale app that
   survives restarts and is genuinely confusing to debug.

   Registration is also deferred until the page has loaded, so it never
   competes with the first render for bandwidth.
   ========================================================================== */

export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
        // A failed registration must never surface to the viewer — everything
        // still works, it just is not installable or offline-capable.
        console.warn('[sw] registration failed', err);
      });
    };

    if (document.readyState === 'complete') register();
    else {
      window.addEventListener('load', register, { once: true });
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return null;
}

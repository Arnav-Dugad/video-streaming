/* =============================================================================
   PRISM service worker

   Deliberately conservative. A service worker is the one thing that can break
   an app permanently for a returning visitor — a bad cache entry outlives the
   deploy that fixed it — so the rules here are narrow on purpose:

     · /api/ is never touched. It carries auth state and per-user data, and a
       cached response would be somebody else's.
     · Only GET is ever cached.
     · Cross-origin requests pass straight through, except YouTube thumbnails,
       which are immutable and safe to reuse.
     · Navigations are network-first, so a deploy is picked up immediately and
       the cache is only a fallback for being offline.
     · Hashed build assets are cache-first, because their URL changes whenever
       their content does.
     · The worker never calls skipWaiting on its own. Taking over mid-session
       would swap the code under a running page; it activates on the next
       visit, or when the page explicitly asks.
   ========================================================================== */

const VERSION = 'v1';
const SHELL_CACHE = `prism-shell-${VERSION}`;
const PAGE_CACHE = `prism-pages-${VERSION}`;
const IMAGE_CACHE = `prism-images-${VERSION}`;
const STATIC_CACHE = `prism-static-${VERSION}`;

const CURRENT = [SHELL_CACHE, PAGE_CACHE, IMAGE_CACHE, STATIC_CACHE];

/** Only things that exist at a fixed URL and never change shape. */
const SHELL = ['/offline', '/icon.svg', '/icon-192.png', '/manifest.webmanifest'];

const MAX_PAGES = 40;
const MAX_IMAGES = 120;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // addAll rejects the whole install if any single URL 404s, which would
      // leave the worker permanently uninstallable.
      Promise.allSettled(SHELL.map((url) => cache.add(url))),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('prism-') && !CURRENT.includes(k))
            .map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

/** The page can ask for an update to apply now, e.g. behind a "reload" prompt. */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  // Request order is insertion order, so the oldest are at the front.
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch { return; }

  const sameOrigin = url.origin === self.location.origin;

  // Never cache anything that carries auth or per-user state.
  if (sameOrigin && url.pathname.startsWith('/api/')) return;

  // YouTube thumbnails: content-addressed and immutable.
  if (!sameOrigin) {
    if (url.hostname === 'i.ytimg.com' || url.hostname === 'img.youtube.com') {
      event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE, MAX_IMAGES));
    }
    return;
  }

  // Hashed build output — the URL changes whenever the bytes do.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Optimised images are keyed by source, width and quality.
  if (url.pathname.startsWith('/_next/image')) {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE, MAX_IMAGES));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
  }
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(cacheName)).put(request, response.clone());
    return response;
  } catch (err) {
    // No cache and no network: let the browser render its own error rather
    // than returning something that looks like a successful empty response.
    throw err;
  }
}

async function staleWhileRevalidate(request, cacheName, max) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      // Opaque responses have status 0; caching them silently fills the quota.
      if (response.ok) {
        cache.put(request, response.clone()).then(() => trim(cacheName, max));
      }
      return response;
    })
    .catch(() => null);

  return cached ?? (await network) ?? Response.error();
}

async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(PAGE_CACHE);
      cache.put(request, response.clone()).then(() => trim(PAGE_CACHE, MAX_PAGES));
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offline = await caches.match('/offline');
    if (offline) return offline;
    return new Response('You are offline.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

/**
 * Mistvale's service worker.
 *
 * It exists for two reasons and deliberately not for a third.
 *
 * 1. **Installability.** A browser will not offer "install" without one holding a `fetch`
 *    handler, and the brief wants Mistvale installable at EA (UI_UX §mobile).
 * 2. **A second visit that starts instantly**, and a real page rather than the browser's
 *    dinosaur when the network is gone.
 *
 * What it is **not** is an offline game. Mistvale is server-authoritative — the client
 * never computes an outcome, a roll or a timer — so a cached API response would be a lie
 * about the state of an account, and one that a player could act on. `/api` is therefore
 * never touched here, under any strategy, and that is the rule this file is most careful
 * about.
 *
 * Written as plain JS in `public/` rather than through a bundler plugin: it needs no build
 * step, it caches by *pattern* rather than by a generated file list, and a service worker
 * that a deploy can leave stale is worse than no service worker at all.
 */

// Bump to evict everything from a previous release. The hashed assets make that mostly
// unnecessary, but the document cache is keyed on a URL that never changes.
const VERSION = 'mistvale-v1';
const DOCUMENTS = `${VERSION}-documents`;
const ASSETS = `${VERSION}-assets`;

self.addEventListener('install', (event) => {
  // Take over as soon as the new worker is ready. A player who has just been served new
  // JavaScript should not keep an old worker deciding what it may see.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => !name.startsWith(VERSION)).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The server is the source of truth. Never cache it, never serve it from a cache, and
  // never let a stale answer reach a screen that will act on it.
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/admin')) return;

  // Vite emits content-hashed filenames under /assets, so a URL there names one immutable
  // file for ever. Cache-first is safe and is what makes a second visit instant.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }

  // Everything else — the document, icons, sprites, the manifest — goes to the network
  // first so a deploy is picked up on the next load, with the cache as the offline
  // fallback rather than as the default.
  event.respondWith(networkFirst(request, DOCUMENTS));
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    // Opaque and error responses are not worth keeping: serving a cached 502 later would
    // turn a moment's outage into a permanent one.
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(request);
    if (hit) return hit;
    // A navigation with nothing cached is the only case left, and the shell is the most
    // useful thing to hand back: it can at least say the server cannot be reached.
    if (request.mode === 'navigate') {
      const shell = await cache.match('/');
      if (shell) return shell;
    }
    throw error;
  }
}
